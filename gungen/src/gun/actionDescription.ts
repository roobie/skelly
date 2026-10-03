// Gun-owned discovery and coupling. Consumers choose a presentation mode, not instance names.
import { partNodeName } from '../core/glb.ts';
import { applyDir, applyPoint, sub, type Transform, type Vec3 } from '../core/math.ts';
import type { Resolved } from '../core/resolve.ts';
import type { PartDef } from '../core/schema.ts';
import { type CycleMode, type CycleMotion, cycleMotion, pumpCycleMotion } from './cycle.ts';
import { localEjectionPoint } from './ejection.ts';

export interface ActionPart {
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
  readonly kind: 'ar' | 'ak' | 'pump';
  readonly carrier: ActionPart;
  readonly parts: Readonly<Record<string, ActionPart>>;
  readonly receiverId: string;
  readonly ejection?: Vec3;
  /** Pump has a hand timeline only; automatic actions additionally have a fire timeline. */
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
  const pairing = { ar: ['handle', 'ar-charging-handle'], ak: undefined, pump: ['forend', 'forend'] }[kind];
  if (pairing) {
    const entry = [...resolved.defs].find(([, def]) => def.family === pairing[1]);
    const mover = entry && actionPart(resolved, entry[0], ['hand']);
    if (mover) {
      parts[pairing[0]!] = mover;
    }
  }
  return parts;
};

export const resolveGunAction = (resolved: Resolved): ResolvedGunAction | undefined => {
  const entry = [...resolved.defs].find(([, def]) => def.family === 'bolt-carrier');
  if (!entry) {
    return undefined;
  }
  const [id] = entry;
  const kind = resolved.params.get(id)?.pattern?.value;
  if (kind !== 'ar' && kind !== 'ak' && kind !== 'pump') {
    return undefined;
  }
  const carrier = actionPart(resolved, id, kind === 'pump' ? ['hand'] : ['fire', 'hand']);
  const receiverId = carrierReceiver(resolved, id);
  const receiver = receiverId && resolved.defs.get(receiverId);
  const placed = receiverId && resolved.placed.get(receiverId);
  if (!(carrier && receiverId && receiver && placed)) {
    return undefined;
  }
  const local = localEjectionPoint(receiver);
  return {
    kind,
    carrier,
    parts: coupledParts(resolved, kind, carrier),
    receiverId,
    ...(local ? { ejection: applyPoint(placed, local) } : {}),
    cycle:
      kind === 'pump'
        ? pumpCycleMotion(carrier.def.motion!, resolved.domain.units.metresPerUnit)
        : cycleMotion(kind, carrier.def.motion!, resolved.domain.units.metresPerUnit),
  };
};

export const actionOpenOffsets = (action: ResolvedGunAction | undefined): ReadonlyMap<string, Vec3> =>
  new Map(action?.kind === 'pump' ? Object.values(action.parts).map((part) => [part.id, part.travel]) : []);
