import { mulMV, rotY } from './boneMath.ts';
import { type Bone, bodySkeleton } from './bones.ts';
import { severedBoneSet } from './boneTree.ts';
import type { Vec3 } from './coords.ts';
import type { ActorBody } from './schema/actors.ts';

type FusedMassBody = {
  readonly [K in 'manifest' | 'boxes' | 'bounds']: NonNullable<ActorBody[K]>;
};

/** The rest voxel grid as a dense owner array: each cell holds its bone index plus one, or zero when empty. */
export interface FusedMassGrid {
  readonly size: number;
  readonly origin: Vec3;
  readonly dims: readonly [number, number, number];
  readonly owner: Uint8Array;
}

/** A fused-mass body decoded for the simulation and renderer; every field but the grid is the body's own. */
export interface FusedMassFigure {
  readonly scale: number;
  readonly bones: readonly Bone[];
  readonly manifest: FusedMassBody['manifest'];
  readonly boxes: FusedMassBody['boxes'];
  /** Rest-pose bounds include voxel faces, in Deadvox metres after the authored body scale. */
  readonly bounds: FusedMassBody['bounds'];
  /** Moves the mesh to a ground-based origin centered on its horizontal bounds. */
  readonly originOffset: Vec3;
  /** A point inside the core's voxels, in unscaled figure space: the tentacle's root. */
  readonly coreInteriorPoint: Vec3;
  /** That point at rest pose, in metres from the ground origin, facing -z (see `fusedMassStrikeOrigin`). */
  readonly restStrikeOrigin: Vec3;
  readonly grid: FusedMassGrid;
}

/** The fused mass's one figure seed: every amalgam draws the same body. */
export const FUSED_MASS_FIGURE_SEED = 1;

/** Decodes a fused-mass body once, rebuilding the dense owner grid from its sparse `cells`. */
export const fusedMassFigureOf = (body: ActorBody): FusedMassFigure => {
  const { manifest, boxes, bounds, originOffset, coreInteriorPoint, restStrikeOrigin, cells } = body;
  if (!(manifest && boxes && bounds && originOffset && coreInteriorPoint && restStrikeOrigin && cells)) {
    throw new Error(`Actor body ${body.type}.${body.seed} is not a fused-mass body`);
  }
  const owner = new Uint8Array(cells.dims[0] * cells.dims[1] * cells.dims[2]);
  for (const [index, bone] of cells.filled) {
    owner[index] = bone;
  }
  return {
    scale: body.scale,
    bones: bodySkeleton(body),
    manifest,
    boxes,
    bounds,
    originOffset,
    coreInteriorPoint,
    restStrikeOrigin,
    grid: { size: cells.size, origin: cells.origin, dims: cells.dims, owner },
  };
};

/**
 * Where the fused mass's tentacle strike starts, in metres from its ground origin: the core's interior point at
 * rest pose, turned to `facing`. The simulation's attack line and the rendered tentacle both start there; the
 * render poses the core first, so the two part only during a hit flinch.
 */
export const fusedMassStrikeOrigin = (figure: Pick<FusedMassFigure, 'restStrikeOrigin'>, facing: Vec3): Vec3 => {
  const [x, y, z] = mulMV(rotY((Math.atan2(-facing[0], -facing[2]) * 180) / Math.PI), figure.restStrikeOrigin);
  return [x, y, z];
};

/** The bones that severing `severed` (manifest part ids) hides: each part's root bone and all below it. */
export const fusedMassSeveredBones = (figure: FusedMassFigure, severed: readonly string[]): ReadonlySet<string> => {
  const partRoots = new Map(figure.manifest.parts.map((part) => [part.id, part.rootBone]));
  return severedBoneSet(
    figure.bones,
    severed.map((part) => partRoots.get(part) ?? part),
  );
};

export interface FusedMassCollisionEnvelope {
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly height: number;
}

/** Axis-aligned collision extents are the rest voxel bounds translated to a ground-based origin. */
export const fusedMassCollisionEnvelope = (
  figure: Pick<FusedMassFigure, 'bounds' | 'originOffset'>,
  blockSize: number,
): FusedMassCollisionEnvelope => {
  if (!(Number.isFinite(blockSize) && blockSize > 0)) {
    throw new Error(`Invalid fused-mass block size ${blockSize}`);
  }
  const { bounds, originOffset } = figure;
  return {
    halfWidth:
      Math.max(Math.abs(bounds.min[0] + originOffset[0]), Math.abs(bounds.max[0] + originOffset[0])) / blockSize,
    halfDepth:
      Math.max(Math.abs(bounds.min[2] + originOffset[2]), Math.abs(bounds.max[2] + originOffset[2])) / blockSize,
    height: (bounds.max[1] - bounds.min[1]) / blockSize,
  };
};

/** The content type realized as the fused-mass model, chosen by its model rather than its id. */
export const fusedMassTypeOf = <T extends { readonly model: string }>(actors: ReadonlyMap<string, T>): T | undefined =>
  [...actors.values()].find((type) => type.model === 'fused-mass');
