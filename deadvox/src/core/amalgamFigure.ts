import { generateValid } from '@mobgen/core/generate.ts';
import { worldPosition } from '@mobgen/core/voxelize.ts';
import { amalgamManifest } from '@mobgen/mob/amalgam.ts';
import { amalgamTemplate } from '@mobgen/mob/amalgamTemplate.ts';
import type { BoneVoxelBox } from '@mobgen/mob/shamblerFigure.ts';

export type AmalgamRealized = NonNullable<ReturnType<typeof generateValid>>['realized'];
export type AmalgamManifest = ReturnType<typeof amalgamManifest>;

export interface AmalgamFigure {
  readonly seed: number;
  readonly genome: NonNullable<ReturnType<typeof generateValid>>['genome'];
  readonly realized: AmalgamRealized;
  readonly manifest: AmalgamManifest;
  readonly boxes: Readonly<Record<string, readonly BoneVoxelBox[]>>;
  readonly voxelCentersByBone: ReadonlyMap<string, readonly (readonly [number, number, number])[]>;
  /** Rest-pose bounds include voxel faces, in the generated body's metre coordinates. */
  readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
  /** Moves the generated mesh to a ground-based origin centered on its horizontal bounds. */
  readonly originOffset: readonly [number, number, number];
}

interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

export const AMALGAM_FIGURE_SEED = 1;

const cache = new Map<number, AmalgamFigure>();

export interface AmalgamCollisionEnvelope {
  readonly halfWidth: number;
  readonly halfDepth: number;
  readonly height: number;
}

/** Axis-aligned collision extents are the realized voxel bounds translated to a ground-based origin. */
export const amalgamCollisionEnvelope = (figure: AmalgamFigure, blockSize: number): AmalgamCollisionEnvelope => {
  if (!(Number.isFinite(blockSize) && blockSize > 0)) {
    throw new Error(`Invalid amalgam block size ${blockSize}`);
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

/** Realizes and caches one gameplay amalgam from the persistent seed. */
export const amalgamFigure = (seed: number): AmalgamFigure => {
  const cached = cache.get(seed);
  if (cached) {
    return cached;
  }
  if (!Number.isSafeInteger(seed)) {
    throw new Error(`Invalid amalgam figure seed ${seed}`);
  }
  const generated = generateValid(amalgamTemplate, seed);
  if (!generated) {
    throw new Error(`No valid amalgam realization from seed ${seed}`);
  }
  const { realized } = generated;
  const manifest = amalgamManifest(realized.body, realized.voxels);
  const byBone = new Map<string, Bounds>();
  const voxelCentersByBone = new Map<string, [number, number, number][]>();
  const totalBounds: Bounds = {
    min: [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
    max: [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
  };
  const { voxels, body } = realized;
  for (let k = 0; k < voxels.dims[2]; k++) {
    for (let j = 0; j < voxels.dims[1]; j++) {
      for (let i = 0; i < voxels.dims[0]; i++) {
        const owner = voxels.owner[i + j * voxels.dims[0] + k * voxels.dims[0] * voxels.dims[1]]! - 1;
        if (owner < 0) {
          continue;
        }
        const bone = body.bones[owner]!;
        const point = worldPosition(voxels, i, j, k) as [number, number, number];
        const centers = voxelCentersByBone.get(bone.id) ?? [];
        centers.push(point);
        voxelCentersByBone.set(bone.id, centers);
        const current = byBone.get(bone.id) ?? { min: [...point] as [number, number, number], max: [...point] as [number, number, number] };
        for (let axis = 0; axis < 3; axis++) {
          current.min[axis] = Math.min(current.min[axis]!, point[axis]!);
          current.max[axis] = Math.max(current.max[axis]!, point[axis]!);
          totalBounds.min[axis] = Math.min(totalBounds.min[axis]!, point[axis]! - voxels.size / 2);
          totalBounds.max[axis] = Math.max(totalBounds.max[axis]!, point[axis]! + voxels.size / 2);
        }
        byBone.set(bone.id, current);
      }
    }
  }
  const margin = voxels.size / 2 + 0.001;
  const boxes = Object.fromEntries(
    manifest.regions.map((region) => [
      region.id,
      region.boneIds.flatMap((bone) => {
        const limits = byBone.get(bone);
        if (!limits) {
          return [];
        }
        return [
          {
            bone,
            center: limits.min.map((value, axis) => (value + limits.max[axis]!) / 2) as [number, number, number],
            halfSize: limits.min.map((value, axis) => (limits.max[axis]! - value) / 2 + margin) as [number, number, number],
          },
        ];
      }),
    ]),
  );
  const centerX = (totalBounds.min[0] + totalBounds.max[0]) / 2;
  const centerZ = (totalBounds.min[2] + totalBounds.max[2]) / 2;
  const figure: AmalgamFigure = {
    seed,
    genome: generated.genome,
    realized,
    manifest,
    boxes,
    voxelCentersByBone,
    bounds: { min: totalBounds.min, max: totalBounds.max },
    originOffset: [-centerX, -totalBounds.min[1], -centerZ],
  };
  cache.set(seed, figure);
  return figure;
};
