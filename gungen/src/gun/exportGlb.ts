import { calibreSlug } from '../ammo/calibreSlug.ts';
import type { Cartridge } from '../ammo/cartridge.ts';
import type { AppearanceContext, GlbAssetIdentity, GlbExportError, GlbExportResult } from '../core/design.ts';
import { localSolidBounds } from '../core/geometry.ts';
import { exportGlb, partNodeName } from '../core/glb.ts';
import { applyDir, applyPoint, length, normalize, sub, type Vec3 } from '../core/math.ts';
import { type Resolved, resolve } from '../core/resolve.ts';
import type { Assembly, PartDef } from '../core/schema.ts';
import { resolveGunAction } from './actionDescription.ts';
import { GUN_ANCHORS } from './anchorData.ts';
import { type AnchorSelectionError, GUN_ANCHOR_POLICY, type SelectedAnchors, selectGunAnchors } from './anchors.ts';
import {
  type AttachmentMetadata,
  type AttachmentSlotMetadata,
  attachmentMetadata,
  attachmentSlots,
} from './attachments.ts';
import type { CycleMode, CycleTimeline } from './cycle.ts';
import { gunDomain } from './domain.ts';
import { eulerXyzDegrees, gripTurn, toFileAxes } from './exportFrame.ts';
import type { MountKind } from './mounts.ts';
import { getOptic } from './optics.ts';
import { GUN_PALETTE } from './palette.ts';
import { tubeMagazineCapacity } from './tubeCapacity.ts';

export type DeadvoxModelFile = `assets/models/${string}.glb`;

interface ActionPartMetadata {
  /** Exact glTF node name; the existing part node carries its geometry as a separate mesh. */
  readonly node: string;
  /** Unit travel direction in model coordinates. */
  readonly axis: Vec3;
  /** Carrier stroke length in metres. */
  readonly strokeMetres: number;
  /** Shared timelines this node follows; other modes leave it at home. */
  readonly modes: readonly CycleMode[];
}

interface CycleMetadata {
  readonly durationSimSeconds: number;
  readonly rearwardSimSeconds: number;
  readonly dwellSimSeconds: number;
  readonly forwardSimSeconds: number;
}

interface GunActionMetadata {
  readonly parts: Readonly<Record<string, ActionPartMetadata>>;
  readonly fire?: CycleMetadata;
  readonly hand: CycleMetadata;
  /** Stroke fraction at which the case leaves. */
  readonly ejectAt: number;
  /** Unit ejection direction in model coordinates. */
  readonly ejectDirection: Vec3;
  readonly holdOpen: boolean;
  readonly roundsPerSimMinute?: number;
}

export interface DeadvoxModelEntry {
  readonly id: string;
  readonly file: DeadvoxModelFile;
  readonly grip?: { readonly at: Vec3; readonly turn: Vec3 };
  readonly anchors?: Readonly<Record<string, Vec3>>;
  /** The model-derived eye point and sight axis used to align the player view. */
  readonly sight?: {
    readonly kind: 'iron' | 'optic';
    readonly eye: Vec3;
    readonly direction: Vec3;
    readonly up: Vec3;
    readonly eyeReliefMetres: number;
    readonly ocularDiameterMetres?: number;
  };
  /** Unit barrel direction in the same local model frame as anchors. */
  readonly muzzleDirection?: Vec3;
  /** Exact id from gungen/cartridges/, not a slug or display designation. */
  readonly calibre?: string;
  /** Present on magazine entries; one local pose per round slot, top to bottom. */
  readonly capacity?: number;
  /** Integral tube capacity in shells; unlike a detached box magazine, no round-pose column. */
  readonly tube?: { readonly capacity: number };
  readonly rounds?: readonly { readonly at: Vec3; readonly tilt: number }[];
  readonly action?: GunActionMetadata;
  /** Metadata for an attachment exported as its own item model. */
  readonly attachment?: AttachmentMetadata;
  /** Default mods fitted by the template, with data for deadvox to consume. */
  readonly attachments?: readonly (AttachmentMetadata & { readonly node: string; readonly mountedAt: string })[];
  /** Authored mount interfaces; fitted occupancy is linked by attachment `mountedAt` IDs. */
  readonly attachmentSlots?: readonly AttachmentSlotMetadata[];
  /** Fitted, replaceable item slots whose baked geometry is present in the gun GLB. */
  readonly slots?: { readonly magazine?: { readonly node: string; readonly at: Vec3; readonly turn: Vec3 } };
}

export interface GunDeadvoxModelEntry extends DeadvoxModelEntry {
  readonly grip: { readonly at: Vec3; readonly turn: Vec3 };
}

export interface GunExportMetadata {
  /** Cartridge loaded by this design; its id becomes the exact Deadvox `calibre` value. */
  readonly cartridge?: Cartridge;
}

interface GunModelEntryOptions extends GunExportMetadata {
  readonly handling?: GunActionExport;
  readonly tubeCapacity?: number;
}

export type GunAssetIdentity = GlbAssetIdentity;

export type GunExportResult =
  | { readonly ok: true; readonly glb: Uint8Array; readonly modelEntry: GunDeadvoxModelEntry }
  | { readonly ok: false; readonly error: GlbExportError | AnchorSelectionError };

const round6 = (value: number): number => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
};

const modelPoint = (point: Vec3, metresPerUnit: number): Vec3 => {
  const [x, y, z] = toFileAxes(point);
  return [round6(x * metresPerUnit), round6(y * metresPerUnit), round6(z * metresPerUnit)];
};

interface GunActionExport {
  readonly ejection: Vec3;
  readonly action: GunActionMetadata;
}

const cycleMetadata = (cycle: CycleTimeline): CycleMetadata => ({
  durationSimSeconds: cycle.durationSeconds,
  rearwardSimSeconds: cycle.rearwardSeconds,
  dwellSimSeconds: cycle.dwellSeconds,
  forwardSimSeconds: cycle.forwardSeconds,
});

const buildActionExport = (resolved: Resolved): GunActionExport | undefined => {
  const description = resolveGunAction(resolved);
  const cycle = description?.cycle;
  if (!(description?.ejection && cycle)) {
    return undefined;
  }
  const parts = Object.fromEntries(
    Object.entries(description.parts).map(([role, part]) => [
      role,
      {
        node: part.node,
        axis: toFileAxes(part.axis),
        strokeMetres: round6(length(part.travel) * resolved.domain.units.metresPerUnit),
        modes: part.modes,
      },
    ]),
  );
  return {
    ejection: description.ejection,
    action: {
      parts,
      ...(cycle.fire ? { fire: cycleMetadata(cycle.fire) } : {}),
      hand: cycleMetadata(cycle.hand),
      ejectAt: cycle.ejectAt,
      ejectDirection: cycle.ejectDirection,
      holdOpen: cycle.holdOpenOnEmpty,
      ...(cycle.rpm === undefined ? {} : { roundsPerSimMinute: cycle.rpm }),
    },
  };
};

const frontBeadSightLine = (
  resolved: Resolved,
  beadTop: Vec3,
): { readonly direction: Vec3; readonly eyeReliefU: number } => {
  const receiverId = Object.entries(resolved.assembly.parts).find(([, part]) => part.family === 'receiver')?.[0];
  const receiver = receiverId && resolved.defs.get(receiverId);
  const receiverTransform = receiverId && resolved.placed.get(receiverId);
  if (!(receiver && receiverTransform)) {
    throw new Error('Front bead sight needs a receiver to derive its eye line');
  }
  const bounds = receiver.solids.map(localSolidBounds);
  const minimumX = Math.min(...bounds.map(([minimum]) => minimum[0]));
  const maximumX = Math.max(...bounds.map(([, maximum]) => maximum[0]));
  const maximumY = Math.max(...bounds.map(([, maximum]) => maximum[1]));
  const minimumZ = Math.min(...bounds.map(([minimum]) => minimum[2]));
  const maximumZ = Math.max(...bounds.map(([, maximum]) => maximum[2]));
  const receiverTop = applyPoint(receiverTransform, [(minimumX + maximumX) / 2, maximumY, (minimumZ + maximumZ) / 2]);
  const eyePoint: Vec3 = [receiverTop[0], beadTop[1], receiverTop[2]];
  const eyeToBead = sub(beadTop, eyePoint);
  if (!(eyePoint[0] < beadTop[0] && eyePoint[1] > receiverTop[1] && length(eyeToBead) > 0)) {
    throw new Error('Front bead must sit forward of and above the receiver top');
  }
  return { direction: normalize(eyeToBead), eyeReliefU: length(eyeToBead) };
};

interface SightCandidate {
  id: string;
  priority: number;
  kind: 'optic' | 'iron';
  eye: Vec3;
  direction: Vec3;
  eyeReliefMetres: number;
  ocularDiameterMetres?: number;
}
const sightCandidate = (resolved: Resolved, id: string, part: PartDef): SightCandidate | undefined => {
  const axis = part.axes.find(({ kind }) => kind === 'sight');
  const transform = resolved.placed.get(id);
  if (!(axis && transform)) {
    return undefined;
  }
  const { family } = resolved.assembly.parts[id]!;
  const params = resolved.params.get(id);
  const optic = family === 'sight' ? getOptic(params?.type?.value, params?.mountSection?.value) : undefined;
  const eyeLocal = optic ? ([optic.ocularX, optic.opticalAxisY, 0] as Vec3) : axis.origin;
  const eye = applyPoint(transform, eyeLocal);
  let direction = normalize(applyDir(transform, axis.dir));
  let eyeReliefU = optic?.eyeReliefU ?? axis.eyeReliefU;
  if (family === 'front-sight-bead') {
    ({ direction, eyeReliefU } = frontBeadSightLine(resolved, eye));
  }
  if (eyeReliefU === undefined) {
    throw new Error(`Sight part ${id} needs exported eye relief`);
  }
  let priority = 3;
  if (optic) {
    priority = 0;
  } else if (family.includes('rear-sight')) {
    priority = 1;
  } else if (family.includes('front-sight')) {
    priority = 2;
  }
  return {
    id,
    priority,
    kind: optic ? 'optic' : 'iron',
    eye,
    direction,
    eyeReliefMetres: eyeReliefU * resolved.domain.units.metresPerUnit,
    ...(optic ? { ocularDiameterMetres: optic.ocularOpeningDiameterU * resolved.domain.units.metresPerUnit } : {}),
  };
};

const attachmentMountSlot = (resolved: Resolved, partId: string, mount: MountKind): string | undefined => {
  for (const { conn, from, to } of resolved.connections) {
    if (from.part === partId) {
      if (from.port.gender === 'male' && from.port.mount === mount && to.port.gender === 'female') {
        return `${to.part}.${to.port.id}.0`;
      }
      continue;
    }
    if (to.part === partId && to.port.gender === 'male' && to.port.mount === mount && from.port.gender === 'female') {
      return `${from.part}.${from.port.id}.${conn.slot ?? 0}`;
    }
  }
  return undefined;
};

const attachmentData = (resolved: Resolved): (AttachmentMetadata & { node: string; mountedAt: string })[] =>
  [...resolved.defs.entries()].flatMap(([partId, definition]) => {
    const instance = resolved.assembly.parts[partId];
    if (!instance) {
      return [];
    }
    const params = resolved.params.get(partId);
    const metadata = attachmentMetadata(
      instance.family,
      params && Object.fromEntries(Object.entries(params).map(([name, value]) => [name, value.value])),
      resolved.domain.units.metresPerUnit,
      definition,
    );
    if (!metadata) {
      return [];
    }
    const mountedAt = attachmentMountSlot(resolved, partId, metadata.mount);
    if (!mountedAt) {
      return [];
    }
    return [
      {
        ...metadata,
        node: partNodeName(partId, instance.family),
        mountedAt,
      },
    ];
  });

const magazineSlotData = (resolved: Resolved): NonNullable<DeadvoxModelEntry['slots']>['magazine'] | undefined => {
  const [partId, instance] =
    Object.entries(resolved.assembly.parts).find(([, part]) => part.family === 'magazine') ?? [];
  const transform = partId && resolved.placed.get(partId);
  if (!(partId && instance && transform)) {
    return undefined;
  }
  return {
    node: partNodeName(partId, instance.family),
    at: modelPoint(transform.t, resolved.domain.units.metresPerUnit),
    turn: eulerXyzDegrees(transform.r),
  };
};

const sightMetadata = (resolved: Resolved): GunDeadvoxModelEntry['sight'] => {
  const candidates = [...resolved.defs.entries()].flatMap(([id, part]) => {
    const candidate = sightCandidate(resolved, id, part);
    return candidate ? [candidate] : [];
  });
  const [chosen] = candidates.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  if (!chosen) {
    return undefined;
  }
  const {
    id: sightId,
    kind: sightKind,
    eye,
    direction: chosenDirection,
    eyeReliefMetres,
    ocularDiameterMetres,
  } = chosen;
  let direction = chosenDirection;
  if (sightKind === 'iron' && resolved.assembly.parts[sightId]!.family === 'ak-rear-sight') {
    const frontId = Object.entries(resolved.assembly.parts).find(([, part]) => part.family === 'front-sight')?.[0];
    const frontTransform = frontId && resolved.placed.get(frontId);
    const frontSight = frontId ? resolved.defs.get(frontId) : undefined;
    const frontAxis = frontSight?.axes.find(({ kind }) => kind === 'sight');
    if (!(frontTransform && frontAxis)) {
      throw new Error('AK rear sight needs a front-sight post to define its aim line');
    }
    const postTip = applyPoint(frontTransform, frontAxis.origin);
    direction = normalize([postTip[0] - eye[0], postTip[1] - eye[1], postTip[2] - eye[2]]);
  }
  const upAxis = normalize(applyDir(resolved.placed.get(sightId)!, [0, 1, 0]));
  const upDot = upAxis[0] * direction[0] + upAxis[1] * direction[1] + upAxis[2] * direction[2];
  const up = normalize([
    upAxis[0] - direction[0] * upDot,
    upAxis[1] - direction[1] * upDot,
    upAxis[2] - direction[2] * upDot,
  ]);
  const toModel = (point: Vec3): Vec3 => modelPoint(point, resolved.domain.units.metresPerUnit);
  const toModelDirection = (vector: Vec3): Vec3 => normalize(toFileAxes(vector));
  return {
    kind: sightKind,
    eye: toModel(eye),
    direction: toModelDirection(direction),
    up: toModelDirection(up),
    eyeReliefMetres: round6(eyeReliefMetres),
    ...(ocularDiameterMetres === undefined ? {} : { ocularDiameterMetres: round6(ocularDiameterMetres) }),
  };
};

export const createGunModelEntry = ({
  asset,
  anchors,
  metresPerUnit,
  options = {},
  sight,
}: {
  asset: GunAssetIdentity;
  anchors: SelectedAnchors;
  metresPerUnit: number;
  options?: GunModelEntryOptions;
  sight?: GunDeadvoxModelEntry['sight'];
}): GunDeadvoxModelEntry => {
  const { handling } = options;
  const calibre = options.cartridge?.id;
  if (calibre !== undefined) {
    calibreSlug(calibre);
  }
  const others = Object.entries(anchors.others)
    .filter(([name]) => name !== 'magwell')
    .map(([name, frame]): [string, Vec3] => [name, modelPoint(frame.position, metresPerUnit)]);
  return {
    id: asset.id,
    file: asset.file as DeadvoxModelFile,
    grip: { at: modelPoint(anchors.hold.position, metresPerUnit), turn: gripTurn() },
    ...(sight ? { sight } : {}),
    ...(anchors.others.muzzle ? { muzzleDirection: normalize(toFileAxes(anchors.others.muzzle.forward)) } : {}),
    ...(others.length > 0 || handling
      ? {
          anchors: {
            ...Object.fromEntries(others),
            ...(handling ? { ejection: modelPoint(handling.ejection, metresPerUnit) } : {}),
          },
        }
      : {}),
    ...(calibre === undefined ? {} : { calibre }),
    ...(handling ? { action: handling.action } : {}),
    ...(options.tubeCapacity === undefined ? {} : { tube: { capacity: options.tubeCapacity } }),
  };
};

/**
 * Exports a gun assembly: core writes the GLB, then this adapter selects gun anchors and builds the Deadvox entry.
 * Structural anchors are emitted independently of optional cartridge metadata.
 */
export const exportGunGlb = (
  assembly: Assembly,
  asset: GunAssetIdentity,
  appearance: AppearanceContext,
  metadata: GunExportMetadata = {},
): GunExportResult => {
  const resolved = resolve(assembly, gunDomain);
  // Broken assemblies get the core writer's structure report before anchor selection.
  if (resolved.issues.length > 0 || resolved.placed.size < Object.keys(assembly.parts).length) {
    const probe = exportGlb({ resolved, palette: GUN_PALETTE, appearance, asset });
    if (!probe.ok) {
      return probe;
    }
  }
  const anchors = selectGunAnchors(resolved, GUN_ANCHORS, GUN_ANCHOR_POLICY);
  if ('code' in anchors) {
    return { ok: false, error: anchors };
  }
  const result: GlbExportResult = exportGlb({ resolved, palette: GUN_PALETTE, appearance, asset });
  if (!result.ok) {
    return result;
  }
  const handling = buildActionExport(resolved);
  const tubeCapacity =
    metadata.cartridge?.kind === 'shotshell' ? tubeMagazineCapacity(resolved, metadata.cartridge) : undefined;
  const {
    units: { metresPerUnit },
  } = resolved.domain;
  const modelEntry = createGunModelEntry({
    asset,
    anchors,
    metresPerUnit,
    options: {
      ...metadata,
      ...(handling ? { handling } : {}),
      ...(tubeCapacity === undefined ? {} : { tubeCapacity }),
    },
    sight: sightMetadata(resolved),
  });
  const attachmentSlotsData = attachmentSlots(resolved).map(({ position, direction, up, ...slot }) => ({
    ...slot,
    position: modelPoint(position, metresPerUnit),
    direction: normalize(toFileAxes(direction)),
    up: normalize(toFileAxes(up)),
  }));
  const magazine = magazineSlotData(resolved);
  return {
    ...result,
    modelEntry: {
      ...modelEntry,
      attachments: attachmentData(resolved),
      attachmentSlots: attachmentSlotsData,
      ...(magazine ? { slots: { magazine } } : {}),
    },
  };
};
