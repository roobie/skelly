import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Assembly, PartDef, Resolved } from '@skelly/engine/assembly/schema.ts';
import { applyDir, applyPoint, length, normalize, sub, type Vec3 } from '@skelly/engine/foundation/math.ts';
import { localSolidBounds } from '@skelly/engine/shapes/geometry.ts';
import type { ModelParts, NeutralModel } from '@skelly/thing-core/schema';
import { type DrawnGeometry, drawnGeometry } from '@skelly/thing-export/drawn.ts';
import type {
  AppearanceContext,
  GlbAssetIdentity,
  GlbExportError,
  GlbExportResult,
  VoxelGrains,
} from '@skelly/thing-export/exportTypes.ts';
import { partNodeName, partVoxelGrain } from '@skelly/thing-export/glb.ts';
import { calibreSlug } from '../ammo/calibreSlug.ts';
import type { Cartridge } from '../ammo/cartridge.ts';
import { resolveGunAction } from './actionDescription.ts';
import { GUN_ANCHORS } from './anchorData.ts';
import { type AnchorSelectionError, GUN_ANCHOR_POLICY, type SelectedAnchors, selectGunAnchors } from './anchors.ts';
import {
  type AttachmentCompatibilityPair,
  attachmentCompatibility,
  attachmentCompatibilityPairs,
} from './attachmentCompatibility.ts';
import {
  type AttachmentMetadata,
  type AttachmentSlotMetadata,
  attachmentMetadata,
  attachmentMountSlot,
  attachmentSlots,
  withAttachmentInstanceAppearances,
} from './attachments.ts';
import { boltCalibreIssue, isBoltAssembly, withBoltCalibre } from './boltCartridge.ts';
import type { CycleMode, CycleTimeline } from './cycle.ts';
import { gunDomain } from './domain.ts';
import { eulerXyzDegrees, gripTurn, toFileAxes } from './exportFrame.ts';
import { exportGunGeometry as exportGlb } from './glbWriter.ts';
import { internalMagazineCapacity } from './internalMagazine.ts';
import { getOptic } from './optics.ts';
import { GUN_PALETTE } from './palette.ts';
import { BUILT_IN_FRONT_POST } from './parts.ts';
import { gunModelParts, type PartItems, PartMassError } from './physical.ts';
import { type RevolverMetadata, revolverMetadata } from './revolverExport.ts';
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
  readonly turn?: { readonly pivot: Vec3; readonly axis: Vec3; readonly angleRadians: number };
}

interface CycleMetadata {
  readonly durationSimSeconds: number;
  readonly rearwardSimSeconds: number;
  readonly dwellSimSeconds: number;
  readonly forwardSimSeconds: number;
  readonly unlockSimSeconds?: number;
  readonly lockSimSeconds?: number;
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

export interface DeadvoxModelEntry extends NeutralModel {
  readonly gun: GunModelFields;
}

export interface GunModelFields {
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
  /** Exact id from cartridges/, not a slug or display designation. */
  readonly calibre?: string;
  /** Present on magazine entries; one local pose per round slot, top to bottom. */
  readonly capacity?: number;
  /** Integral capacity; unlike a detached box magazine, no round-pose column. */
  readonly internalMagazine?: { readonly capacity: number };
  readonly rounds?: readonly { readonly at: Vec3; readonly tilt: number }[];
  readonly action?: GunActionMetadata;
  readonly revolver?: RevolverMetadata;
  /** Metadata for an attachment exported as its own item model. */
  readonly attachment?: AttachmentMetadata;
  /** Default mods fitted by the template, with data for deadvox to consume. */
  readonly attachments?: readonly (AttachmentMetadata & { readonly node: string; readonly mountedAt: string })[];
  /** Authored mount interfaces; fitted occupancy is linked by attachment `mountedAt` IDs. */
  readonly attachmentSlots?: readonly AttachmentSlotMetadata[];
  /** Complete gungen-certified standalone attachment allowlist for each mount slot. */
  readonly compatibility?: Readonly<Record<string, readonly string[]>>;
  /** Complete canonical allowlist of compatible pairs of single-fit choices. */
  readonly compatibilityPairs?: readonly AttachmentCompatibilityPair[];
  /** Fitted, replaceable item slots whose baked geometry is present in the gun GLB. */
  readonly slots?: { readonly magazine?: { readonly node: string; readonly at: Vec3; readonly turn: Vec3 } };
}

export interface GunDeadvoxModelEntry extends DeadvoxModelEntry {
  readonly parts: ModelParts;
  readonly grip: { readonly at: Vec3; readonly turn: Vec3 };
}

export interface GunExportMetadata {
  /** Cartridge loaded by this design; its id becomes the exact Deadvox `calibre` value. */
  readonly cartridge?: Cartridge;
}

const voxelGrainsOf = ({
  voxelGrain,
  voxelDetailGrain,
}: {
  [Key in keyof VoxelGrains]-?: VoxelGrains[Key] | undefined;
}): Partial<VoxelGrains> => ({
  ...(voxelGrain === undefined ? {} : { voxelGrain }),
  ...(voxelDetailGrain === undefined ? {} : { voxelDetailGrain }),
});

interface GunExportOptions extends GunExportMetadata, Partial<VoxelGrains> {
  /** Geometry-only callers skip the slot solver; CLI model exports explicitly request its certificate. */
  readonly includeAttachmentCompatibility?: boolean;
  readonly excludedAttachments?: readonly string[];
  readonly items?: PartItems;
}

interface GunModelEntryOptions extends GunExportMetadata {
  readonly handling?: GunActionExport;
  readonly internalCapacity?: number;
}

export type GunAssetIdentity = GlbAssetIdentity;

export type GunExportResult =
  | { readonly ok: true; readonly glb: Uint8Array; readonly modelEntry: GunDeadvoxModelEntry }
  | {
      readonly ok: false;
      readonly error: GlbExportError | AnchorSelectionError | { readonly code: 'part-mass'; readonly message: string };
    };

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
  ...(cycle.unlockSeconds === undefined ? {} : { unlockSimSeconds: cycle.unlockSeconds }),
  ...(cycle.lockSeconds === undefined ? {} : { lockSimSeconds: cycle.lockSeconds }),
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
        // A turn without unlock and lock phases, such as the SMG handle's notch, is a held state, not a cycle step.
        ...(part.def.motion?.turn &&
        part.modes.every((mode) => cycle[mode]?.unlockSeconds !== undefined && cycle[mode]?.lockSeconds !== undefined)
          ? {
              turn: {
                pivot: modelPoint(
                  applyPoint(part.placed, part.def.motion.turn.pivot),
                  resolved.domain.units.metresPerUnit,
                ),
                axis: toFileAxes(applyDir(part.placed, part.def.motion.turn.axis)),
                angleRadians: part.def.motion.turn.angleRadians,
              },
            }
          : {}),
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
  let eyeReliefU = optic?.eyeReliefU ?? axis.referenceDistanceU;
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

const magazineSlotData = (resolved: Resolved): NonNullable<GunModelFields['slots']>['magazine'] | undefined => {
  const [partId, instance] =
    Object.entries(resolved.assembly.parts).find(([, part]) => part.family === 'magazine') ?? [];
  const transform = partId && resolved.placed.get(partId);
  if (!(partId && instance && transform) || resolved.params.get(partId)?.integral?.value === 'yes') {
    return undefined;
  }
  return {
    node: partNodeName(partId, instance.family),
    at: modelPoint(transform.t, resolved.domain.units.metresPerUnit),
    turn: eulerXyzDegrees(transform.r),
  };
};

interface GlbSightJson {
  readonly nodes: { translation?: Vec3; rotation?: unknown; mesh?: number; extras?: { part?: string } }[];
  // biome-ignore lint/style/useNamingConvention: glTF attribute semantics are upper case
  readonly meshes: { primitives: { attributes: { POSITION: number }; indices: number }[] }[];
  readonly accessors: { bufferView: number; byteOffset?: number; count: number }[];
  readonly bufferViews: { byteOffset?: number }[];
}

/** Model-metre ranges, one per axis, that a drawn face is read over; an absent axis is unbounded. */
type Column = Readonly<Partial<Record<0 | 1 | 2, readonly [number, number]>>>;

/**
 * The model-file triangles drawn by the part `partId`, or by every unrotated part without one, as a turned part draws no
 * faces square to the axes.
 */
function* drawnTriangles(glb: Uint8Array, partId?: string): Generator<readonly [Vec3, Vec3, Vec3]> {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))) as GlbSightJson;
  const nodes = json.nodes.filter((node) =>
    partId === undefined ? node.rotation === undefined : node.extras?.part === partId,
  );
  if (nodes.some(({ rotation }) => rotation !== undefined)) {
    throw new Error(`Sight part ${partId} needs an unrotated mesh to give its drawn top`);
  }
  const binStart = 20 + jsonLength + 8;
  const startOf = (accessor: GlbSightJson['accessors'][number]) =>
    binStart + (json.bufferViews[accessor.bufferView]!.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  for (const node of nodes) {
    const shift = node.translation ?? [0, 0, 0];
    for (const { attributes, indices } of node.mesh === undefined ? [] : json.meshes[node.mesh]!.primitives) {
      const positions = startOf(json.accessors[attributes.POSITION]!);
      const coordinate = (vertex: number, along: number) =>
        view.getFloat32(positions + vertex * 12 + along * 4, true) + shift[along]!;
      const point = (vertex: number): Vec3 => [coordinate(vertex, 0), coordinate(vertex, 1), coordinate(vertex, 2)];
      const index = json.accessors[indices]!;
      const indexStart = startOf(index);
      for (let corner = 0; corner + 2 < index.count; corner += 3) {
        yield [0, 1, 2].map((k) => point(view.getUint32(indexStart + (corner + k) * 4, true))) as [Vec3, Vec3, Vec3];
      }
    }
  }
}

/**
 * The furthest face along `axis` that the drawn meshes in the model file turn that way, so voxelized metadata reports
 * what the file actually draws. With a column, only faces over it count, which keeps a post's top from being read off
 * the guard ears beside it. A column range on `axis` itself bounds where the face may lie, which keeps a post's top
 * from being read off a hood ring over it.
 */
const drawnFaceMetres = (glb: Uint8Array, axis: 0 | 1 | 2, column: Column = {}, partId?: string) => {
  const [u, v] = (
    [
      [1, 2],
      [2, 0],
      [0, 1],
    ] as const
  )[axis];
  const over = (values: readonly number[], range: Column[0]) =>
    range === undefined || (Math.min(...values) < range[1] && Math.max(...values) > range[0]);
  const bound = column[axis];
  let far = Number.NEGATIVE_INFINITY;
  for (const [a, b, c] of drawnTriangles(glb, partId)) {
    const facing = (b[u] - a[u]) * (c[v] - a[v]) - (b[v] - a[v]) * (c[u] - a[u]) > 0;
    if (
      facing &&
      a[axis] === b[axis] &&
      b[axis] === c[axis] &&
      (bound === undefined || (a[axis] >= bound[0] && a[axis] <= bound[1])) &&
      over([a[u], b[u], c[u]], column[u]) &&
      over([a[v], b[v], c[v]], column[v])
    ) {
      far = Math.max(far, a[axis]);
    }
  }
  return Number.isFinite(far) ? round6(far) : undefined;
};

/** The voxelized file a sight line is read off, and the grains it was sampled at. */
interface VoxelFile {
  readonly glb: Uint8Array;
  readonly grains: VoxelGrains;
}

const drawnTopOrThrow = (file: VoxelFile, partId: string, column?: Column): number => {
  const top = drawnFaceMetres(file.glb, 1, column, partId);
  if (top === undefined) {
    throw new Error(`Sight part ${partId} draws no top to aim along`);
  }
  return top;
};

const frontSightPost = (resolved: Resolved) => {
  const id = Object.entries(resolved.assembly.parts).find(
    ([partId, part]) =>
      part.family.includes('front-sight') && resolved.defs.get(partId)?.solids.some((solid) => solid.id === 'post'),
  )?.[0];
  const transform = id && resolved.placed.get(id);
  const def = id ? resolved.defs.get(id) : undefined;
  const axis = def?.axes.find(({ kind }) => kind === 'sight');
  const post = def?.solids.find((candidate) => candidate.id === 'post');
  if (!(id && transform && axis && post)) {
    throw new Error('A rear sight needs a front-sight post to define its aim line');
  }
  const [low, high] = localSolidBounds(post);
  return {
    id,
    tip: applyPoint(transform, axis.origin),
    postHalfWidthMetres: ((high[2] - low[2]) / 2) * resolved.domain.units.metresPerUnit,
  };
};

/**
 * A front post built into another part, such as a barrel, in model metres: its authored bounds and the part that draws
 * it. A built-in rear sight has no front-sight part to aim at, so it aims at this post.
 */
const builtInFrontPost = (resolved: Resolved) =>
  [...resolved.defs].flatMap(([id, def]) => {
    const post = def.solids.find((solid) => solid.id === BUILT_IN_FRONT_POST);
    const transform = resolved.placed.get(id);
    if (!(post && transform)) {
      return [];
    }
    const corners = localSolidBounds(post).map((corner) =>
      modelPoint(applyPoint(transform, corner), resolved.domain.units.metresPerUnit),
    );
    const low = [0, 1, 2].map((axis) => Math.min(...corners.map((corner) => corner[axis]!))) as unknown as Vec3;
    const high = [0, 1, 2].map((axis) => Math.max(...corners.map((corner) => corner[axis]!))) as unknown as Vec3;
    return [{ id, low, high }];
  })[0];

/**
 * The model-metre range along the file's z axis of the sight's authored solids that reach its sight axis's height.
 * A rear sight's notch lies between them, so the top the eye lines up with is read over them, not over the notch.
 * An aperture's eye sits inside its hole, where no solid tops out, so the walls that cross its height bound it.
 */
const leafSpan = (resolved: Resolved, sight: { readonly id: string }): readonly [number, number] => {
  const def = resolved.defs.get(sight.id)!;
  const transform = resolved.placed.get(sight.id)!;
  const { metresPerUnit } = resolved.domain.units;
  const [, top] = def.axes.find(({ kind }) => kind === 'sight')!.origin;
  const bounds = def.solids.map((solid) => localSolidBounds(solid));
  const toppedOut = bounds.filter(([, high]) => Math.abs(high[1] - top) < 1e-6);
  const leaves = toppedOut.length > 0 ? toppedOut : bounds.filter(([low, high]) => low[1] < top && high[1] > top);
  const zs = leaves.flatMap(([low, high]) =>
    [low[0], high[0]].flatMap((px) =>
      [low[1], high[1]].flatMap((py) =>
        [low[2], high[2]].map((pz) => toFileAxes(applyPoint(transform, [px, py, pz]))[2] * metresPerUnit),
      ),
    ),
  );
  if (zs.length === 0) {
    throw new Error(`Sight part ${sight.id} has no solid at its sight axis's height`);
  }
  return [Math.min(...zs), Math.max(...zs)];
};

/**
 * How far apart the drawn faces are that bound a sight's line on each side, read in the voxel row centred at `row`, or 0
 * when the line runs through drawn material or has a face on one side only.
 */
const drawnWidthAtRow = (file: VoxelFile, partId: string, eye: Vec3, row: number): number => {
  let left = Number.NEGATIVE_INFINITY;
  let right = Number.POSITIVE_INFINITY;
  for (const [a, b, c] of drawnTriangles(file.glb, partId)) {
    const over = (axis: 0 | 1, at: number) =>
      Math.min(a[axis], b[axis], c[axis]) < at && Math.max(a[axis], b[axis], c[axis]) > at;
    if (!(a[2] === b[2] && b[2] === c[2] && over(0, eye[0]) && over(1, row))) {
      continue;
    }
    const towardsPlusZ = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0;
    if (towardsPlusZ && a[2] <= eye[2]) {
      left = Math.max(left, a[2]);
    } else if (!towardsPlusZ && a[2] >= eye[2]) {
      right = Math.min(right, a[2]);
    }
  }
  return Number.isFinite(left) && Number.isFinite(right) ? right - left : 0;
};

/**
 * The vertical span of the closed hole that the sight line runs through in the drawn part: the highest ceiling face with
 * material above it and a floor face below it over the line. An open notch has no ceiling, so it gives none.
 */
const drawnApertureSpan = (file: VoxelFile, partId: string, eye: Vec3): readonly [number, number] | undefined => {
  const ceilings: number[] = [];
  const floors: number[] = [];
  for (const [a, b, c] of drawnTriangles(file.glb, partId)) {
    const over = (axis: 0 | 2, at: number) =>
      Math.min(a[axis], b[axis], c[axis]) < at && Math.max(a[axis], b[axis], c[axis]) > at;
    if (!(a[1] === b[1] && b[1] === c[1] && over(0, eye[0]) && over(2, eye[2]))) {
      continue;
    }
    const towardsPlusY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0;
    (towardsPlusY ? floors : ceilings).push(a[1]);
  }
  const ceiling = Math.max(...ceilings.filter((y) => floors.some((above) => above > y) && floors.some((f) => f < y)));
  if (!Number.isFinite(ceiling)) {
    return undefined;
  }
  return [Math.max(...floors.filter((y) => y < ceiling)), ceiling];
};

/**
 * A rear sight is aimed through its notch or its closed aperture, so the voxels must leave it open: at least one voxel
 * of the gun grain wide. A gap one voxel wide or narrower of its own grain can fill, and the player would line up the
 * top of a solid block. An open notch is read at the drawn top; where the top row is solid across the line, the eye
 * drops to the centre of the closed aperture on the line and the width is read across the hole. Returns the eye.
 */
const openSightGapOrThrow = (file: VoxelFile, resolved: Resolved, partId: string, topEye: Vec3): Vec3 => {
  const grain = partVoxelGrain(resolved.defs.get(partId)!, file.grains);
  const notch = drawnWidthAtRow(file, partId, topEye, topEye[1] - grain / 2);
  const wide = (width: number) => width >= file.grains.voxelGrain - 1e-6;
  if (wide(notch)) {
    return topEye;
  }
  const span = drawnApertureSpan(file, partId, topEye);
  if (span !== undefined) {
    const centre = round6((span[0] + span[1]) / 2);
    const eye: Vec3 = [topEye[0], centre, topEye[2]];
    // A quarter grain below the centre lies inside a voxel row whether the centre is mid-row or on a row boundary.
    const aperture = drawnWidthAtRow(file, partId, eye, centre - grain / 4);
    if (wide(aperture) && wide(span[1] - span[0])) {
      return eye;
    }
  }
  throw new Error(
    `Sight part ${partId} draws its notch ${round6(notch)} m wide on the sight line, under the ${file.grains.voxelGrain} m gun grain`,
  );
};

/**
 * An iron sight's line as the voxelized file draws it, in model metres, because voxels move the tops the player lines
 * up. A rear sight aims from its own top to the front post's top, through its drawn notch; the post is read within
 * twice its own width of the bore plane, which holds its top voxel column wherever the sampler put it and leaves the
 * guard ears out. A bead sets the eye height to its top and keeps its level line. Any other iron datum, such as a
 * revolver's frame or a receiver's drum aperture, takes the top of its leaves, which the line also runs between, then
 * drops into the aperture where that top is closed. It keeps its direction unless the gun has a built-in front post:
 * then it aims at the post's drawn top, read no higher than one voxel over its authored top so a hood ring above it
 * stays out.
 */
const drawnIronSightLine = (
  file: VoxelFile,
  resolved: Resolved,
  sight: { readonly id: string; readonly eye: Vec3; readonly direction: Vec3 },
): { readonly eye: Vec3; readonly direction: Vec3 } => {
  const { family } = resolved.assembly.parts[sight.id]!;
  const { metresPerUnit } = resolved.domain.units;
  const [x, , z] = sight.eye;
  if (family.includes('rear-sight')) {
    const front = frontSightPost(resolved);
    const tip = modelPoint(front.tip, metresPerUnit);
    const band = 2 * front.postHalfWidthMetres;
    const eye = openSightGapOrThrow(file, resolved, sight.id, [x, drawnTopOrThrow(file, sight.id), z]);
    const frontTop = drawnTopOrThrow(file, front.id, { 2: [tip[2] - band, tip[2] + band] });
    return { eye, direction: normalize([tip[0] - eye[0], frontTop - eye[1], tip[2] - eye[2]]) };
  }
  if (family === 'front-sight-bead') {
    return { eye: [x, drawnTopOrThrow(file, sight.id), z], direction: sight.direction };
  }
  const half = partVoxelGrain(resolved.defs.get(sight.id)!, file.grains) / 2;
  const top = drawnTopOrThrow(file, sight.id, { 0: [x - half, x + half], 2: leafSpan(resolved, sight) });
  const eye = openSightGapOrThrow(file, resolved, sight.id, [x, top, z]);
  const post = builtInFrontPost(resolved);
  if (post === undefined) {
    return { eye, direction: sight.direction };
  }
  const grain = partVoxelGrain(resolved.defs.get(post.id)!, file.grains);
  // As for a front-sight part's post, twice its width holds its top voxel column wherever the sampler put it.
  const centreZ = (post.low[2] + post.high[2]) / 2;
  const band = post.high[2] - post.low[2];
  const postTop = drawnTopOrThrow(file, post.id, {
    0: [post.low[0], post.high[0]],
    1: [post.low[1], post.high[1] + grain],
    2: [centreZ - band, centreZ + band],
  });
  // The eye lines up with the tip's edge on the post's rear face.
  const aim: Vec3 = [post.low[0], postTop, centreZ];
  return { eye, direction: normalize(sub(aim, eye)) };
};

// Wider than any bore, so the muzzle's front ring lies over it, and narrower than the gap to the sights above it.
const MUZZLE_COLUMN_METRES = 0.012;

/**
 * The muzzle on the front face the voxelized file draws around the bore axis, because the drawn barrel ends up to a
 * voxel off the smooth tip. Every gun file runs its barrel along +x.
 */
const drawnMuzzle = (file: VoxelFile, muzzle: Vec3): Vec3 => {
  const [, y, z] = muzzle;
  const column = {
    1: [y - MUZZLE_COLUMN_METRES, y + MUZZLE_COLUMN_METRES],
    2: [z - MUZZLE_COLUMN_METRES, z + MUZZLE_COLUMN_METRES],
  } as const;
  const front = drawnFaceMetres(file.glb, 0, column);
  if (front === undefined) {
    throw new Error('The voxelized gun draws no muzzle face around its bore axis');
  }
  return [front, y, z];
};

/**
 * The support anchor on the lowest face the forend part's drawn meshes reach, because a support hand carries the gun
 * under the forend as the file draws it, and a hand-copied height would drift at the next re-export.
 */
const drawnSupport = (file: VoxelFile, partId: string, support: Vec3): Vec3 => {
  let low = Number.POSITIVE_INFINITY;
  for (const [a, b, c] of drawnTriangles(file.glb, partId)) {
    low = Math.min(low, a[1], b[1], c[1]);
  }
  if (!Number.isFinite(low)) {
    throw new Error(`Support part ${partId} draws no underside`);
  }
  return [support[0], round6(low), support[2]];
};

const voxelFileOf = (
  glb: Uint8Array,
  {
    voxelGrain,
    voxelDetailGrain,
  }: { readonly voxelGrain?: number | undefined; readonly voxelDetailGrain?: number | undefined },
): VoxelFile | undefined =>
  voxelGrain === undefined
    ? undefined
    : { glb, grains: { voxelGrain, ...(voxelDetailGrain === undefined ? {} : { voxelDetailGrain }) } };

/** The entry's anchors with the muzzle moved onto the drawn front and the support onto the drawn forend underside. */
const drawnAnchors = (
  anchors: GunDeadvoxModelEntry['anchors'],
  file: VoxelFile | undefined,
  supportPart: string | undefined,
) =>
  file && anchors
    ? {
        anchors: {
          ...anchors,
          ...(anchors.muzzle ? { muzzle: drawnMuzzle(file, anchors.muzzle) } : {}),
          ...(anchors.support && supportPart ? { support: drawnSupport(file, supportPart, anchors.support) } : {}),
        },
      }
    : {};

const sightMetadata = (resolved: Resolved, voxel?: VoxelFile): GunModelFields['sight'] => {
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
  const toModel = (point: Vec3): Vec3 => modelPoint(point, resolved.domain.units.metresPerUnit);
  const toModelDirection = (vector: Vec3): Vec3 => normalize(toFileAxes(vector));
  let direction = chosenDirection;
  if (sightKind === 'iron' && resolved.assembly.parts[sightId]!.family === 'ak-rear-sight') {
    const front = frontSightPost(resolved);
    direction = normalize([front.tip[0] - eye[0], front.tip[1] - eye[1], front.tip[2] - eye[2]]);
  }
  // An optic's line is its optical axis, which the drawn tube does not define, so only iron sights read the file.
  const drawn =
    voxel && sightKind === 'iron'
      ? drawnIronSightLine(voxel, resolved, { id: sightId, eye: toModel(eye), direction: toModelDirection(direction) })
      : { eye: toModel(eye), direction: toModelDirection(direction) };
  const { eye: modelEye, direction: modelDirection } = drawn;
  const upAxis = toModelDirection(applyDir(resolved.placed.get(sightId)!, [0, 1, 0]));
  const upDot = upAxis[0] * modelDirection[0] + upAxis[1] * modelDirection[1] + upAxis[2] * modelDirection[2];
  const up = normalize([
    upAxis[0] - modelDirection[0] * upDot,
    upAxis[1] - modelDirection[1] * upDot,
    upAxis[2] - modelDirection[2] * upDot,
  ]);
  return {
    kind: sightKind,
    eye: modelEye,
    direction: modelDirection,
    up,
    eyeReliefMetres: round6(eyeReliefMetres),
    ...(ocularDiameterMetres === undefined ? {} : { ocularDiameterMetres: round6(ocularDiameterMetres) }),
  };
};

export const createGunModelEntry = ({
  asset,
  parts,
  anchors,
  metresPerUnit,
  options = {},
  sight,
  drawn,
}: {
  asset: GunAssetIdentity;
  parts: ModelParts;
  anchors: SelectedAnchors;
  metresPerUnit: number;
  options?: GunModelEntryOptions;
  sight?: GunModelFields['sight'];
  /** Moves a point onto the drawn model; the muzzle is left for `drawnMuzzle`, which reads it off the file. */
  drawn?: DrawnGeometry;
}): GunDeadvoxModelEntry => {
  const { handling } = options;
  const calibre = options.cartridge?.id;
  if (calibre !== undefined) {
    calibreSlug(calibre);
  }
  const onModel = (point: Vec3): Vec3 => modelPoint(drawn ? drawn.point(point) : point, metresPerUnit);
  const others = Object.entries(anchors.others)
    .filter(([name]) => name !== 'magwell')
    .map(([name, frame]): [string, Vec3] => [
      name,
      name === 'muzzle' ? modelPoint(frame.position, metresPerUnit) : onModel(frame.position),
    ]);
  return {
    id: asset.id,
    file: asset.file as DeadvoxModelFile,
    parts,
    grip: { at: onModel(anchors.hold.position), turn: gripTurn() },
    ...(others.length > 0 || handling
      ? {
          anchors: {
            ...Object.fromEntries(others),
            ...(handling ? { ejection: onModel(handling.ejection) } : {}),
          },
        }
      : {}),
    gun: {
      ...(sight ? { sight } : {}),
      ...(anchors.others.muzzle ? { muzzleDirection: normalize(toFileAxes(anchors.others.muzzle.forward)) } : {}),
      ...(calibre === undefined ? {} : { calibre }),
      ...(handling ? { action: handling.action } : {}),
      ...(options.internalCapacity === undefined ? {} : { internalMagazine: { capacity: options.internalCapacity } }),
    },
  };
};

const integralCapacity = (resolved: Resolved, cartridge: Cartridge | undefined): number | undefined => {
  if (!cartridge) {
    return undefined;
  }
  return cartridge.kind === 'shotshell'
    ? tubeMagazineCapacity(resolved, cartridge)
    : internalMagazineCapacity(resolved, cartridge);
};

const boltMetadataIssue = (assembly: Assembly, cartridge: Cartridge | undefined): string | undefined =>
  cartridge && isBoltAssembly(assembly) ? boltCalibreIssue(cartridge.id) : undefined;

const bodyPhysicalData = (
  resolved: Resolved,
  fitted: readonly { readonly node: string }[],
  magazine: { readonly node: string } | undefined,
  { drawn, items }: { readonly drawn: DrawnGeometry; readonly items: PartItems },
) => {
  const replaceableNodes = new Set([...fitted.map(({ node }) => node), ...(magazine ? [magazine.node] : [])]);
  try {
    return { ok: true as const, parts: gunModelParts(resolved, replaceableNodes, { items, drawn }) };
  } catch (error) {
    if (!(error instanceof PartMassError)) {
      throw error;
    }
    return { ok: false as const, error: { code: 'part-mass' as const, message: error.message } };
  }
};

const attachmentCertificates = (
  assembly: Assembly,
  slots: readonly AttachmentSlotMetadata[],
  excluded: readonly string[],
) => {
  const compatibility = attachmentCompatibility(assembly, slots, gunDomain, excluded);
  return { compatibility, compatibilityPairs: attachmentCompatibilityPairs(assembly, slots, compatibility) };
};

/**
 * Exports a gun assembly: core writes the GLB, then this adapter selects gun anchors and builds the Deadvox entry.
 * Structural anchors are emitted independently of optional cartridge metadata.
 */
export const exportGunGlb = (
  assembly: Assembly,
  asset: GunAssetIdentity,
  appearance: AppearanceContext,
  options: GunExportOptions = {},
): GunExportResult => {
  const {
    includeAttachmentCompatibility = false,
    excludedAttachments = [],
    items = {},
    voxelGrain,
    voxelDetailGrain,
    ...metadata
  } = options;
  const message = boltMetadataIssue(assembly, metadata.cartridge);
  if (message) {
    return { ok: false, error: { code: 'structure-issues', issues: [{ rule: 'structure', message, parts: [] }] } };
  }
  const resolved = withAttachmentInstanceAppearances(
    resolve(withBoltCalibre(assembly, metadata.cartridge?.id), gunDomain),
  );
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
  const result: GlbExportResult = exportGlb({
    resolved,
    palette: GUN_PALETTE,
    appearance,
    asset,
    ...voxelGrainsOf({ voxelGrain, voxelDetailGrain }),
  });
  if (!result.ok) {
    return result;
  }
  const voxelFile = voxelFileOf(result.glb, { voxelGrain, voxelDetailGrain });
  const handling = buildActionExport(resolved);
  const internalCapacity = integralCapacity(resolved, metadata.cartridge);
  const {
    units: { metresPerUnit },
  } = resolved.domain;
  const fittedAttachments = attachmentData(resolved);
  const magazine = magazineSlotData(resolved);
  const drawn = drawnGeometry(resolved, voxelGrainsOf({ voxelGrain, voxelDetailGrain }));
  const physical = bodyPhysicalData(resolved, fittedAttachments, magazine, { drawn, items });
  if (!physical.ok) {
    return physical;
  }
  const modelEntry = createGunModelEntry({
    asset,
    parts: physical.parts,
    anchors,
    metresPerUnit,
    drawn,
    options: {
      ...metadata,
      ...(handling ? { handling } : {}),
      ...(internalCapacity === undefined ? {} : { internalCapacity }),
    },
    sight: sightMetadata(resolved, voxelFile),
  });
  const attachmentSlotsData = attachmentSlots(resolved).map(({ position, direction, up, ...slot }) => ({
    ...slot,
    position: modelPoint(position, metresPerUnit),
    direction: normalize(toFileAxes(direction)),
    up: normalize(toFileAxes(up)),
  }));
  const revolver = revolverMetadata(resolved, metadata.cartridge);
  const certificates = includeAttachmentCompatibility
    ? attachmentCertificates(assembly, attachmentSlotsData, excludedAttachments)
    : {};
  return {
    ...result,
    modelEntry: {
      ...modelEntry,
      ...drawnAnchors(modelEntry.anchors, voxelFile, anchors.supportPart),
      gun: {
        ...modelEntry.gun,
        ...(revolver ? { revolver } : {}),
        attachments: fittedAttachments,
        attachmentSlots: attachmentSlotsData,
        ...certificates,
        ...(magazine ? { slots: { magazine } } : {}),
      },
    },
  };
};
