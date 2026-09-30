// Detailed melee hit geometry shares the seeded, posed mobgen figures with MobActorMeshes. FIGURE_BOXES below
// remains only for the optional blocky renderer; it is deliberately not used by the hit test.

import type { Bone } from '@mobgen/core/body.ts';
import { type Mat3, mulMM, rotY, transpose } from '@mobgen/core/math.ts';
import { boneTransforms, type Pose as MobPose } from '@mobgen/core/pose.ts';
import { attackPose, LUNGE_GRAB } from '@mobgen/mob/attack.ts';
import { severedBoneSet } from '@mobgen/mob/dismember.ts';
import { footRestExtents, type GaitClock, type WalkActor, walkPose } from '@mobgen/mob/gait.ts';
import type { HumanoidParams } from '@mobgen/mob/humanoid.ts';
import { idlePose } from '@mobgen/mob/idle.ts';
import { type BoneVoxelBox, type ShamblerHitRegion, shamblerFigure } from '@mobgen/mob/shamblerFigure.ts';
import type { Vec3 } from './coords.ts';

export type FigurePart = 'body' | 'head' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
export interface FigureBox {
  size: [number, number, number];
  at: [number, number, number];
}
export const FIGURE_BOXES: Readonly<Record<FigurePart, FigureBox>> = {
  body: { size: [0.42, 0.78, 0.28], at: [0, 1.02, 0] },
  head: { size: [0.3, 0.32, 0.3], at: [0, 1.58, 0] },
  leftArm: { size: [0.15, 0.68, 0.16], at: [-0.225, 1.02, 0] },
  rightArm: { size: [0.15, 0.68, 0.16], at: [0.225, 1.02, 0] },
  leftLeg: { size: [0.18, 0.62, 0.2], at: [-0.12, 0.62, 0] },
  rightLeg: { size: [0.18, 0.62, 0.2], at: [0.12, 0.62, 0] },
};
export type ZombieRegion = ShamblerHitRegion;
export type ZombieRegions = Record<ZombieRegion, number>;

export const ZOMBIE_REGION_NAMES: readonly ZombieRegion[] = [
  'head',
  'torso',
  'leftArm',
  'rightArm',
  'leftLeg',
  'rightLeg',
];
export const ZOMBIE_REGION_PART: Readonly<Record<ZombieRegion, FigurePart>> = {
  head: 'head',
  torso: 'body',
  leftArm: 'leftArm',
  rightArm: 'rightArm',
  leftLeg: 'leftLeg',
  rightLeg: 'rightLeg',
};
export const FIGURE_PARTS: readonly FigurePart[] = ['body', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

const rayBoxEntry = (origin: Vec3, direction: Vec3, halfSize: readonly number[]): number | undefined => {
  let near = Number.NEGATIVE_INFINITY;
  let far = Number.POSITIVE_INFINITY;
  for (let axis = 0; axis < 3; axis++) {
    const d = direction[axis]!;
    const o = origin[axis]!;
    const half = halfSize[axis]!;
    if (Math.abs(d) < 1e-12) {
      if (o < -half || o > half) {
        return undefined;
      }
      continue;
    }
    const first = (-half - o) / d;
    const second = (half - o) / d;
    near = Math.max(near, Math.min(first, second));
    far = Math.min(far, Math.max(first, second));
    if (near > far) {
      return undefined;
    }
  }
  return far < 0 ? undefined : Math.max(near, 0);
};

const applyR = (r: readonly number[], p: readonly number[]): Vec3 => [
  r[0]! * p[0]! + r[1]! * p[1]! + r[2]! * p[2]!,
  r[3]! * p[0]! + r[4]! * p[1]! + r[5]! * p[2]!,
  r[6]! * p[0]! + r[7]! * p[1]! + r[8]! * p[2]!,
];

export interface ZombieHitPoseInput {
  readonly seed: number;
  readonly position: Vec3;
  readonly facing: Vec3;
  readonly headYaw: number;
  readonly gaitPhase: number;
  readonly speed: number;
  readonly chasing: boolean;
  readonly attackWindup: number;
  readonly attackWindupSeconds: number;
  readonly severed: readonly string[];
  readonly region: ZombieRegion;
  readonly blockSize: number;
}

const actorFor = (seed: number): { actor: WalkActor; bones: readonly Bone[] } => {
  const { realized, genome } = shamblerFigure(seed);
  const extents = footRestExtents(realized.body.bones, realized.voxels);
  const actor: WalkActor = {
    bones: realized.body.bones,
    extents,
    params: genome.params as HumanoidParams,
    seed,
  };
  return { actor, bones: realized.body.bones };
};
const actors = new Map<number, ReturnType<typeof actorFor>>();
const actorForSeed = (seed: number): ReturnType<typeof actorFor> => {
  let actor = actors.get(seed);
  if (!actor) {
    actor = actorFor(seed);
    actors.set(seed, actor);
  }
  return actor;
};

export interface PosedBoneBox {
  readonly bone: string;
  /** Actual posed head-voxel vertical bounds; trims empty corners of rotated head boxes on horizontal rays. */
  readonly bottomY?: number;
  readonly topY?: number;
  /** World centre/orientation in block coordinates; half-size remains metres. */
  readonly center: Vec3;
  readonly rotation: Mat3;
  readonly halfSize: Vec3;
  /** Centroid of the drawn voxels owned by this bone, in block coordinates. */
  readonly voxelCentroid: Vec3;
  readonly voxelCount: number;
}

interface BoneVoxelSummary {
  readonly centroid: Vec3;
  readonly count: number;
}

const voxelSummaries = new Map<number, ReadonlyMap<string, BoneVoxelSummary>>();
const voxelSummaryFor = (
  seed: number,
  figure: ReturnType<typeof shamblerFigure>,
): ReadonlyMap<string, BoneVoxelSummary> => {
  let summary = voxelSummaries.get(seed);
  if (!summary) {
    summary = new Map(
      [...figure.voxelCentersByBone].map(([bone, centers]) => [
        bone,
        {
          centroid: centers
            .reduce<Vec3>((sum, point) => [sum[0] + point[0], sum[1] + point[1], sum[2] + point[2]], [0, 0, 0])
            .map((coordinate) => coordinate / centers.length) as Vec3,
          count: centers.length,
        },
      ]),
    );
    voxelSummaries.set(seed, summary);
  }
  return summary;
};

interface PoseBoxContext {
  readonly transforms: ReturnType<typeof boneTransforms>;
  readonly figure: ReturnType<typeof shamblerFigure>;
  readonly voxelSummaries: ReadonlyMap<string, BoneVoxelSummary>;
  readonly hidden: ReadonlySet<string>;
  readonly yaw: Mat3;
  readonly position: Vec3;
  readonly blockSize: number;
}

const makePosedBoneBox = (
  region: ZombieRegion,
  box: BoneVoxelBox,
  context: PoseBoxContext,
): PosedBoneBox | undefined => {
  if (context.hidden.has(box.bone)) {
    return undefined;
  }
  const transform = context.transforms.get(box.bone);
  if (!transform) {
    return undefined;
  }
  const localCenter = applyR(transform.r, box.center);
  const centered = [
    transform.t[0] + localCenter[0],
    transform.t[1] + localCenter[1],
    transform.t[2] + localCenter[2],
  ] as const;
  const worldOffset = applyR(context.yaw, centered);
  let bottomY: number | undefined;
  let topY: number | undefined;
  const voxelCenters = context.figure.voxelCentersByBone.get(box.bone) ?? [];
  const summary = context.voxelSummaries.get(box.bone)!;
  if (region === 'head') {
    bottomY = Number.POSITIVE_INFINITY;
    topY = Number.NEGATIVE_INFINITY;
  }
  for (const point of voxelCenters) {
    const posedPoint = applyR(transform.r, point);
    const y = context.position[1] + (transform.t[1] + posedPoint[1]) / context.blockSize;
    if (region === 'head') {
      bottomY = Math.min(bottomY!, y);
      topY = Math.max(topY!, y);
    }
  }
  if (region === 'head') {
    const margin = (context.figure.realized.voxels.size / 2 + 0.001) / context.blockSize;
    bottomY! -= margin;
    topY! += margin;
  }
  const posedCentroid = applyR(transform.r, summary.centroid);
  const worldCentroid = applyR(context.yaw, [
    transform.t[0] + posedCentroid[0],
    transform.t[1] + posedCentroid[1],
    transform.t[2] + posedCentroid[2],
  ]);
  const voxelCentroid: Vec3 = [
    context.position[0] + worldCentroid[0] / context.blockSize,
    context.position[1] + worldCentroid[1] / context.blockSize,
    context.position[2] + worldCentroid[2] / context.blockSize,
  ];
  return {
    bone: box.bone,
    ...(bottomY === undefined || topY === undefined ? {} : { bottomY, topY }),
    center: [
      context.position[0] + worldOffset[0] / context.blockSize,
      context.position[1] + worldOffset[1] / context.blockSize,
      context.position[2] + worldOffset[2] / context.blockSize,
    ],
    rotation: mulMM(context.yaw, transform.r),
    halfSize: [...box.halfSize] as Vec3,
    voxelCentroid,
    voxelCount: summary.count,
  };
};

type ShamblerPoseInput = Omit<ZombieHitPoseInput, 'region'>;

const poseContextFor = (input: ShamblerPoseInput): PoseBoxContext => {
  const {
    seed,
    position,
    facing,
    headYaw,
    gaitPhase,
    speed,
    chasing,
    attackWindup,
    attackWindupSeconds,
    severed,
    blockSize,
  } = input;
  const { actor, bones } = actorForSeed(seed);
  const phase = ((gaitPhase % Math.PI) + Math.PI) % Math.PI;
  const clock: GaitClock = { stepIndex: Math.floor(gaitPhase / Math.PI), progress: phase / Math.PI };
  const stance = chasing || attackWindup > 0 ? 'aggravated' : 'slack';
  const walk = walkPose(actor, clock, speed, { idle: idlePose(actor, stance, 0) });
  const attackStart = Math.max(0, LUNGE_GRAB.hitTime - attackWindupSeconds);
  const attackTime = attackWindup > 0 ? attackStart + attackWindupSeconds - attackWindup : undefined;
  const basePose: MobPose = attackTime === undefined ? walk : attackPose(actor, LUNGE_GRAB, attackTime, walk);
  const pose: MobPose =
    headYaw === 0
      ? basePose
      : {
          ...basePose,
          rotations: {
            ...basePose.rotations,
            head: mulMM(basePose.rotations.head ?? [1, 0, 0, 0, 1, 0, 0, 0, 1], rotY(headYaw)),
          },
        };
  const figure = shamblerFigure(seed);
  return {
    transforms: boneTransforms(bones, pose),
    figure,
    voxelSummaries: voxelSummaryFor(seed, figure),
    hidden: severedBoneSet(bones, severed),
    yaw: rotY(Math.atan2(-facing[0], -facing[2])),
    position,
    blockSize,
  };
};

/** Bone boxes for one swing pose. The caller builds them once per nearby zombie, then tests every region. */
export const posedShamblerRegionBoxes = (
  input: ShamblerPoseInput,
): Readonly<Record<ZombieRegion, readonly PosedBoneBox[]>> => {
  const context = poseContextFor(input);
  const worldBoxes = (region: ZombieRegion, boxes: readonly BoneVoxelBox[]): PosedBoneBox[] =>
    boxes.flatMap((box) => {
      const posedBox = makePosedBoneBox(region, box, context);
      return posedBox ? [posedBox] : [];
    });
  return Object.fromEntries(
    ZOMBIE_REGION_NAMES.map((region) => [region, worldBoxes(region, context.figure.boxes[region])]),
  ) as unknown as Record<ZombieRegion, readonly PosedBoneBox[]>;
};

/** Actual posed voxel centres owned by the requested bones (for visible-hit-point proofs/tools). */
export const posedShamblerBoneVoxelCenters = (
  input: ShamblerPoseInput,
  bones: readonly string[],
): readonly { readonly bone: string; readonly center: Vec3 }[] => {
  const context = poseContextFor(input);
  return bones.flatMap((bone) => {
    if (context.hidden.has(bone)) {
      return [];
    }
    const transform = context.transforms.get(bone);
    if (!transform) {
      return [];
    }
    const centers = context.figure.voxelCentersByBone.get(bone) ?? [];
    return centers.map((center) => {
      const posed = applyR(transform.r, center);
      const world = applyR(context.yaw, [
        transform.t[0] + posed[0],
        transform.t[1] + posed[1],
        transform.t[2] + posed[2],
      ]);
      return {
        bone,
        center: [
          context.position[0] + world[0] / context.blockSize,
          context.position[1] + world[1] / context.blockSize,
          context.position[2] + world[2] / context.blockSize,
        ] as Vec3,
      };
    });
  });
};

/** First surface of an actual, posed, unsevered voxel bone box, in block units. */
export const posedRegionHitDistance = (
  boxes: readonly PosedBoneBox[],
  origin: Vec3,
  direction: Vec3,
  blockSize: number,
): number | undefined => {
  let nearest = Number.POSITIVE_INFINITY;
  for (const box of boxes) {
    if (
      Math.abs(direction[1]) < 1e-12 &&
      box.bottomY !== undefined &&
      (origin[1] < box.bottomY || origin[1] > box.topY!)
    ) {
      continue;
    }
    const inverse = transpose(box.rotation);
    const localOrigin = applyR(inverse, [
      origin[0] - box.center[0],
      origin[1] - box.center[1],
      origin[2] - box.center[2],
    ]);
    const localDirection = applyR(inverse, direction);
    const hit = rayBoxEntry(
      localOrigin,
      localDirection,
      box.halfSize.map((size) => size / blockSize),
    );
    if (hit !== undefined) {
      nearest = Math.min(nearest, hit);
    }
  }
  return Number.isFinite(nearest) ? nearest : undefined;
};

/** Return each unposed box in the chosen figure (exposed for proof and renderer parity tests). */
export const shamblerRegionBoxes = (seed: number): Readonly<Record<ZombieRegion, readonly BoneVoxelBox[]>> =>
  shamblerFigure(seed).boxes;
