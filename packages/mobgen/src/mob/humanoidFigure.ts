import type { BodyRegion } from '../core/body.ts';
import { generateValid, planOf } from '../core/generate.ts';
import { consumableTemplate } from '../core/template.ts';
import { voxelCentersByBone } from '../core/voxelize.ts';
import { regionSeverableParts } from './dismember.ts';
// Side effect: registers the shipped archetypes so `consumableTemplate` can resolve them.
import './templates.ts';
// Side effect: registers the acid body plan and template beside the shipped archetypes.
import './acidTemplate.ts';

export type HumanoidHitRegion = BodyRegion;
export interface BoneVoxelBox {
  readonly bone: string;
  /** Centre and half-size in the bone's rest frame, metres. The half-size includes half a voxel + 1 mm. */
  readonly center: readonly [number, number, number];
  readonly halfSize: readonly [number, number, number];
}
export interface HumanoidFigure {
  readonly seed: number;
  readonly genome: NonNullable<ReturnType<typeof generateValid>>['genome'];
  readonly realized: NonNullable<ReturnType<typeof generateValid>>['realized'];
  readonly boxes: Readonly<Record<HumanoidHitRegion, readonly BoneVoxelBox[]>>;
  /** Per region, the parts a cut may start at, parents first; empty where the dispositions allow none. */
  readonly severableParts: Readonly<Record<HumanoidHitRegion, readonly string[]>>;
  /** Rest-frame voxel centres by owner bone; also used to reject empty upper corners of posed head OBBs. */
  readonly voxelCentersByBone: ReadonlyMap<string, readonly (readonly [number, number, number])[]>;
}

interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}
const cache = new Map<string, HumanoidFigure>();

const centerBounds = (centers: readonly (readonly [number, number, number])[]): Bounds => {
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (const center of centers) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis]!, center[axis]!);
      max[axis] = Math.max(max[axis]!, center[axis]!);
    }
  }
  return { min, max };
};

const findBoneVoxelData = (realized: HumanoidFigure['realized']) => {
  const centersByBone = voxelCentersByBone(realized.voxels, realized.body.bones);
  const limits = new Map([...centersByBone].map(([bone, centers]) => [bone, centerBounds(centers)]));
  return { limits, voxelCentersByBone: centersByBone };
};

const buildRegionBoxes = (
  regionBones: Readonly<Record<HumanoidHitRegion, readonly string[]>>,
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
  ) as unknown as Record<HumanoidHitRegion, readonly BoneVoxelBox[]>;

/** Realizes a seeded mobgen template once; model and input seed are the persistent selection key. */
export const templateFigure = (model: string, seed: number): HumanoidFigure => {
  const key = `${model}:${seed}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  // A consumer refuses a comparison-only template here, so a model kept only for side-by-side checks
  // cannot be spawned or exported even if a caller asks for it by name.
  const template = consumableTemplate(model);
  // A seed must be valid itself: falling through to the next valid seed would draw it as that seed's body.
  const generated = generateValid(template, seed, { maxAttempts: 1 });
  if (!generated) {
    throw new Error(`Actor figure ${model} seed ${seed} is not valid`);
  }
  const { regionBones } = planOf(template.bodyPlan);
  if (!regionBones) {
    throw new Error(`Body plan ${template.bodyPlan} has no hit regions`);
  }
  const { limits, voxelCentersByBone } = findBoneVoxelData(generated.realized);
  const boxes = buildRegionBoxes(regionBones, limits, generated.realized.voxels.size / 2 + 0.001);
  const figure: HumanoidFigure = {
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

/** Exact seeds are the known-valid baseline for fixtures and the renderer, so no seed substitution is allowed. */
export const humanoidFigure = (seed: number): HumanoidFigure => templateFigure('humanoid', seed);
