// Gun-owned discovery and coupling. Consumers choose a presentation mode, not instance names.

import type { PartDef, Resolved } from '@skelly/engine/assembly/schema.ts';
import {
  applyDir,
  applyPoint,
  invert,
  length,
  sub,
  type Transform,
  type Vec3,
} from '@skelly/engine/foundation/math.ts';
import { partNodeName } from '@skelly/thing-export/glb.ts';
import { AR_CYCLIC_RPM } from './arFrames.ts';
import { COMPACT_SMG_PROPORTIONS } from './compactSmgProportions.ts';
import {
  boltCycleMotion,
  type CycleMode,
  type CycleMotion,
  cycleMotion,
  type GunAction,
  pumpCycleMotion,
} from './cycle.ts';
import { localEjectionPoint } from './ejection.ts';

interface ActionPart {
  readonly id: string;
  readonly node: string;
  readonly def: PartDef;
  readonly placed: Transform;
  readonly axis: Vec3;
  readonly travel: Vec3;
  /** References the shared action timelines; absent modes keep this node at home. */
  readonly modes: readonly CycleMode[];
}

export interface ResolvedGunAction {
  readonly kind: GunAction | 'pump' | 'bolt';
  readonly carrier: ActionPart;
  readonly parts: Readonly<Record<string, ActionPart>>;
  readonly receiverId: string;
  readonly ejection?: Vec3;
  /** Self-loading actions additionally have a fire timeline. */
  readonly cycle: CycleMotion;
}

const actionPart = (resolved: Resolved, id: string, modes: readonly CycleMode[]): ActionPart | undefined => {
  const def = resolved.defs.get(id);
  const placed = resolved.placed.get(id);
  const family = resolved.assembly.parts[id]?.family;
  if (!(def?.motion && placed && family)) {
    return undefined;
  }
  return {
    id,
    node: partNodeName(id, family),
    def,
    placed,
    axis: applyDir(placed, def.motion.axis),
    travel: applyDir(placed, sub(def.motion.end, def.motion.start)),
    modes,
  };
};

const carrierReceiver = (resolved: Resolved, id: string): string | undefined => {
  const connection = resolved.connections.find(
    ({ from, to }) => (from.part === id && from.port.id === 'mount') || (to.part === id && to.port.id === 'mount'),
  );
  return connection && (connection.from.part === id ? connection.to.part : connection.from.part);
};

const coupledParts = (
  resolved: Resolved,
  kind: ResolvedGunAction['kind'],
  carrier: ActionPart,
): Record<string, ActionPart> => {
  const parts: Record<string, ActionPart> = { carrier };
  if (kind === 'bolt') {
    for (const family of ['bolt-handle-arm', 'bolt-handle-knob']) {
      const entry = Object.entries(resolved.assembly.parts).find(([, part]) => part.family === family);
      const mover = entry && actionPart(resolved, entry[0], ['hand']);
      if (mover) {
        parts[family === 'bolt-handle-arm' ? 'arm' : 'knob'] = mover;
      }
    }
  }
  const pairing = {
    ar: ['handle', 'ar-charging-handle'],
    ak: undefined,
    // The forward handle is non-reciprocating: it moves by hand only, never with a shot.
    smg: ['handle', 'smg-handle'],
    pump: ['forend', 'forend'],
    bolt: undefined,
    slide: undefined,
  }[kind];
  if (pairing) {
    const entry = [...resolved.defs].find(([, def]) => def.family === pairing[1]);
    const mover = entry && actionPart(resolved, entry[0], ['hand']);
    if (mover) {
      parts[pairing[0]!] = mover;
    }
  }
  return parts;
};

/** An AR fires at its frame's cyclic rate; other actions keep their profile's. */
const frameCyclicRpm = (resolved: Resolved, kind: GunAction, receiverId: string): number | undefined => {
  const frameId = kind === 'ar' ? resolved.params.get(receiverId)?.actionFrame?.value : undefined;
  return frameId === undefined ? undefined : AR_CYCLIC_RPM[frameId];
};

const isActionKind = (kind: unknown): kind is ResolvedGunAction['kind'] =>
  kind === 'ar' || kind === 'ak' || kind === 'smg' || kind === 'pump' || kind === 'bolt' || kind === 'slide';

export const resolveGunAction = (resolved: Resolved): ResolvedGunAction | undefined => {
  const entry = [...resolved.defs].find(([, def]) => ['bolt-carrier', 'slide'].includes(def.family));
  if (!entry) {
    return undefined;
  }
  const [id] = entry;
  const kind = entry[1].family === 'slide' ? 'slide' : resolved.params.get(id)?.pattern?.value;
  if (!isActionKind(kind)) {
    return undefined;
  }
  const carrier = actionPart(resolved, id, ['pump', 'bolt'].includes(kind) ? ['hand'] : ['fire', 'hand']);
  const receiverId = kind === 'slide' ? id : carrierReceiver(resolved, id);
  const receiver = receiverId && resolved.defs.get(receiverId);
  const placed = receiverId && resolved.placed.get(receiverId);
  if (!(carrier && receiverId && receiver && placed)) {
    return undefined;
  }
  const local = localEjectionPoint(receiver);
  const port = receiver.keepOuts.find(({ id: volumeId }) => volumeId === 'ejection');
  const carrierHome = applyPoint(invert(placed), carrier.placed.t);
  const boltEjectAt = port ? (carrierHome[0] - (port.box.center[0] - port.box.half[0])) / length(carrier.travel) : 0;
  const parts = coupledParts(resolved, kind, carrier);
  // A turning hand-only handle on an automatic action is a notch hold, such as the SMG's.
  const handNotch = Object.values(parts).some(({ def, modes }) => def.motion?.turn && !modes.includes('fire'));
  const notchTurnSeconds = handNotch ? COMPACT_SMG_PROPORTIONS.chargingHandle.notchTurnSeconds : undefined;
  let cycle: CycleMotion;
  if (kind === 'bolt') {
    cycle = boltCycleMotion(carrier.def.motion!, resolved.domain.units.metresPerUnit, boltEjectAt);
  } else if (kind === 'pump') {
    cycle = pumpCycleMotion(carrier.def.motion!, resolved.domain.units.metresPerUnit);
  } else {
    cycle = cycleMotion(kind, carrier.def.motion!, resolved.domain.units.metresPerUnit, {
      rpm: frameCyclicRpm(resolved, kind, receiverId),
      notchTurnSeconds,
    });
  }
  return {
    kind,
    carrier,
    parts,
    receiverId,
    ...(local ? { ejection: applyPoint(placed, local) } : {}),
    cycle,
  };
};

export const actionOpenOffsets = (action: ResolvedGunAction | undefined): ReadonlyMap<string, Vec3> =>
  new Map(action?.kind === 'pump' ? Object.values(action.parts).map((part) => [part.id, part.travel]) : []);
