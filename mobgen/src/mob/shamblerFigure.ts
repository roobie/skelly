import { generateValid } from '../core/generate.ts';
import { worldPosition } from '../core/voxelize.ts';
import { TEMPLATES } from './templates.ts';

/** Explicit, known-valid seeds shared by the simulation and detailed renderer. */
export const SHAMBLER_FIGURE_SEEDS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8] as const);

export type ShamblerHitRegion = 'head' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
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
  /** Rest-frame voxel centres by owner bone; also used to reject empty upper corners of posed head OBBs. */
  readonly voxelCentersByBone: ReadonlyMap<string, readonly (readonly [number, number, number])[]>;
}

const REGION_BONES: Readonly<Record<ShamblerHitRegion, readonly string[]>> = {
  head: ['head', 'jaw'],
  torso: ['pelvis', 'spine', 'chest', 'neck'],
  leftArm: ['upperArm.L', 'forearm.L', 'hand.L'],
  rightArm: ['upperArm.R', 'forearm.R', 'hand.R'],
  leftLeg: ['thigh.L', 'shin.L', 'foot.L'],
  rightLeg: ['thigh.R', 'shin.R', 'foot.R'],
};

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

const buildRegionBoxes = (limits: ReadonlyMap<string, Bounds>, margin: number) =>
  Object.fromEntries(
    Object.entries(REGION_BONES).map(([region, bones]) => [
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
  if (!(SHAMBLER_FIGURE_SEEDS as readonly number[]).includes(seed)) {
    throw new Error(`Unknown zombie figure seed ${seed}`);
  }
  const template = TEMPLATES.find((candidate) => candidate.name === model);
  if (!template) {
    throw new Error(`Unknown zombie mobgen model "${model}"`);
  }
  const generated = generateValid(template, seed);
  if (!generated || (model === 'shambler' && generated.seed !== seed)) {
    throw new Error(`Zombie figure ${model} seed ${seed} is not valid`);
  }
  const { limits, voxelCentersByBone } = findBoneVoxelData(generated.realized);
  const boxes = buildRegionBoxes(limits, generated.realized.voxels.size / 2 + 0.001);
  const figure: ShamblerFigure = {
    seed,
    genome: generated.genome,
    realized: generated.realized,
    boxes,
    voxelCentersByBone,
  };
  cache.set(key, figure);
  return figure;
};

/** Exact shambler seeds remain the known-valid baseline used by its fixtures and renderer. */
export const shamblerFigure = (seed: number): ShamblerFigure => zombieFigure('shambler', seed);
