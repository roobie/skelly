import type { BodyRegion } from '../core/body.ts';
import { generateValid, planOf } from '../core/generate.ts';
import { consumableTemplate } from '../core/template.ts';
import { worldPosition } from '../core/voxelize.ts';
import { regionSeverableParts } from './dismember.ts';
// Side effect: registers the shipped archetypes so `consumableTemplate` can resolve them.
import './templates.ts';
// Side effect: registers the acid body plan and template beside the shipped archetypes.
import './acidTemplate.ts';

export type ShamblerHitRegion = BodyRegion;
export interface BoneVoxelBox {
  readonly bone: string;
  /** Centre and half-size in the bone's rest frame, metres. The half-size includes half a voxel + 1 mm. */
  readonly center: readonly [number, number, number];
  readonly halfSize: readonly [number, number, number];
}
export interface ShamblerFigure {
  readonly seed: number;
  readonly genome: NonNullable<ReturnType<typeof generateValid>>['genome'];
  readonly realized: NonNullable<ReturnType<typeof generateValid>>['realized'];
  readonly boxes: Readonly<Record<ShamblerHitRegion, readonly BoneVoxelBox[]>>;
  /** Per region, the parts a cut may start at, parents first; empty where the dispositions allow none. */
  readonly severableParts: Readonly<Record<ShamblerHitRegion, readonly string[]>>;
  /** Rest-frame voxel centres by owner bone; also used to reject empty upper corners of posed head OBBs. */
  readonly voxelCentersByBone: ReadonlyMap<string, readonly (readonly [number, number, number])[]>;
}

interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}
const cache = new Map<string, ShamblerFigure>();

const includeOwnedVoxel = (
  bone: string,
  point: readonly number[],
  limits: Map<string, Bounds>,
  voxelCentersByBone: Map<string, [number, number, number][]>,
) => {
  const center = [...point] as [number, number, number];
  const centers = voxelCentersByBone.get(bone) ?? [];
  centers.push(center);
  voxelCentersByBone.set(bone, centers);
  const bounds = limits.get(bone);
  if (!bounds) {
    limits.set(bone, { min: center, max: [...center] });
    return;
  }
  for (let axis = 0; axis < 3; axis++) {
    bounds.min[axis] = Math.min(bounds.min[axis]!, point[axis]!);
    bounds.max[axis] = Math.max(bounds.max[axis]!, point[axis]!);
  }
};

const findBoneVoxelData = (realized: ShamblerFigure['realized']) => {
  const limits = new Map<string, Bounds>();
  const voxelCentersByBone = new Map<string, [number, number, number][]>();
  const { voxels, body } = realized;
  for (let k = 0; k < voxels.dims[2]; k++) {
    for (let j = 0; j < voxels.dims[1]; j++) {
      for (let i = 0; i < voxels.dims[0]; i++) {
        const owner = voxels.owner[i + j * voxels.dims[0] + k * voxels.dims[0] * voxels.dims[1]]! - 1;
        if (owner >= 0) {
          const bone = body.bones[owner]!.id;
          includeOwnedVoxel(bone, worldPosition(voxels, i, j, k), limits, voxelCentersByBone);
        }
      }
    }
  }
  return { limits, voxelCentersByBone };
};

const buildRegionBoxes = (
  regionBones: Readonly<Record<ShamblerHitRegion, readonly string[]>>,
  limits: ReadonlyMap<string, Bounds>,
  margin: number,
) =>
  Object.fromEntries(
    Object.entries(regionBones).map(([region, bones]) => [
      region,
      bones.flatMap((bone) => {
        const bounds = limits.get(bone);
        if (!bounds) {
          return [];
        }
        return [
          {
            bone,
            center: bounds.min.map((v, axis) => (v + bounds.max[axis]!) / 2) as [number, number, number],
            halfSize: bounds.min.map((v, axis) => (bounds.max[axis]! - v) / 2 + margin) as [number, number, number],
          },
        ];
      }),
    ]),
  ) as unknown as Record<ShamblerHitRegion, readonly BoneVoxelBox[]>;

/** Realizes a seeded mobgen template once; model and input seed are the persistent selection key. */
export const zombieFigure = (model: string, seed: number): ShamblerFigure => {
  const key = `${model}:${seed}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  // A consumer refuses a comparison-only template here, so a model kept only for side-by-side checks
  // cannot be spawned or exported even if a caller asks for it by name.
  const template = consumableTemplate(model);
  const generated = generateValid(template, seed);
  if (!generated || (model === 'shambler' && generated.seed !== seed)) {
    throw new Error(`Zombie figure ${model} seed ${seed} is not valid`);
  }
  const { regionBones } = planOf(template.bodyPlan);
  if (!regionBones) {
    throw new Error(`Body plan ${template.bodyPlan} has no hit regions`);
  }
  const { limits, voxelCentersByBone } = findBoneVoxelData(generated.realized);
  const boxes = buildRegionBoxes(regionBones, limits, generated.realized.voxels.size / 2 + 0.001);
  const figure: ShamblerFigure = {
    seed,
    genome: generated.genome,
    realized: generated.realized,
    boxes,
    severableParts: regionSeverableParts(generated.realized.body.bones, regionBones),
    voxelCentersByBone,
  };
  cache.set(key, figure);
  return figure;
};

/** Exact shambler seeds remain the known-valid baseline used by its fixtures and renderer. */
export const shamblerFigure = (seed: number): ShamblerFigure => zombieFigure('shambler', seed);
