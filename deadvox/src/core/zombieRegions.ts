// Detailed melee hit geometry shares the seeded, posed mobgen figures with MobActorMeshes. FIGURE_BOXES below
// remains only for the optional blocky renderer; it is deliberately not used by the hit test.

import type { Mat3 } from '@mobgen/core/math.ts';
import { mulMM, transpose } from '@mobgen/core/math.ts';
import type { boneTransforms } from '@mobgen/core/pose.ts';
import { type BoneVoxelBox, shamblerFigure } from '@mobgen/mob/shamblerFigure.ts';
import type { AmalgamFigure } from './amalgamFigure.ts';
import type { ZombieHitRegion, ZombieRegion } from './schema.ts';
import { ZOMBIE_REGION_NAMES } from './zombieRegionNames.ts';

export type { ZombieHitRegion, ZombieRegion, ZombieRegions } from './schema.ts';

import type { Vec3 } from './coords.ts';
import { posedShambler, type ShamblerPoseInput } from './zombiePose.ts';

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

type PoseFigure = ReturnType<typeof shamblerFigure> | AmalgamFigure;
const voxelSummaries = new Map<string, ReadonlyMap<string, BoneVoxelSummary>>();
const voxelSummaryFor = (key: string, figure: PoseFigure): ReadonlyMap<string, BoneVoxelSummary> => {
  let summary = voxelSummaries.get(key);
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
    voxelSummaries.set(key, summary);
  }
  return summary;
};

interface PoseBoxContext {
  readonly transforms: ReturnType<typeof boneTransforms>;
  readonly figure: PoseFigure;
  readonly voxelSummaries: ReadonlyMap<string, BoneVoxelSummary>;
  readonly hidden: ReadonlySet<string>;
  readonly yaw: Mat3;
  readonly position: Vec3;
  readonly blockSize: number;
  readonly geometryScale: number;
}

const makePosedBoneBox = (
  region: ZombieHitRegion,
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
  const localCenter = applyR(
    transform.r,
    box.center.map((coordinate) => coordinate * context.geometryScale),
  );
  const centered = [
    transform.t[0] * context.geometryScale + localCenter[0],
    transform.t[1] * context.geometryScale + localCenter[1],
    transform.t[2] * context.geometryScale + localCenter[2],
  ] as const;
  const worldOffset = applyR(context.yaw, centered);
  let bottomY: number | undefined;
  let topY: number | undefined;
  const voxelCenters = context.figure.voxelCentersByBone.get(box.bone) ?? [];
  const summary = context.voxelSummaries.get(box.bone)!;
  if (region === 'head' || region.endsWith('.head')) {
    bottomY = Number.POSITIVE_INFINITY;
    topY = Number.NEGATIVE_INFINITY;
  }
  for (const point of voxelCenters) {
    const posedPoint = applyR(transform.r, point);
    const y =
      context.position[1] +
      (transform.t[1] * context.geometryScale + posedPoint[1] * context.geometryScale) / context.blockSize;
    if (region === 'head' || region.endsWith('.head')) {
      bottomY = Math.min(bottomY!, y);
      topY = Math.max(topY!, y);
    }
  }
  if (region === 'head' || region.endsWith('.head')) {
    const margin = ((context.figure.realized.voxels.size / 2) * context.geometryScale) / context.blockSize;
    bottomY! -= margin;
    topY! += margin;
  }
  const posedCentroid = applyR(
    transform.r,
    summary.centroid.map((coordinate) => coordinate * context.geometryScale),
  );
  const worldCentroid = applyR(context.yaw, [
    transform.t[0] * context.geometryScale + posedCentroid[0],
    transform.t[1] * context.geometryScale + posedCentroid[1],
    transform.t[2] * context.geometryScale + posedCentroid[2],
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
    halfSize: box.halfSize.map((extent) => extent * context.geometryScale) as Vec3,
    voxelCentroid,
    voxelCount: summary.count,
  };
};

const poseContextFor = (input: ShamblerPoseInput): PoseBoxContext => {
  const posed = posedShambler(input);
  return {
    transforms: posed.transforms,
    figure: posed.figure,
    voxelSummaries: voxelSummaryFor(`${input.model ?? 'shambler'}:${input.seed}`, posed.figure),
    hidden: posed.hidden,
    yaw: posed.yaw,
    position: posed.position,
    blockSize: posed.blockSize,
    geometryScale: 'scale' in posed.figure && typeof posed.figure.scale === 'number' ? posed.figure.scale : 1,
  };
};

const regionBoxesForContext = (context: PoseBoxContext): Readonly<Record<string, readonly PosedBoneBox[]>> => {
  const boxesByRegion = context.figure.boxes as Readonly<Record<string, readonly BoneVoxelBox[]>>;
  return Object.fromEntries(
    Object.entries(boxesByRegion).map(([region, boxes]) => [
      region,
      boxes.flatMap((box) => {
        const posed = makePosedBoneBox(region as ZombieHitRegion, box, context);
        return posed ? [posed] : [];
      }),
    ]),
  );
};

/** All manifest-region boxes for one actor pose, including amalgam member IDs. */
const posedAllRegionBoxes = (input: ShamblerPoseInput): Readonly<Record<string, readonly PosedBoneBox[]>> =>
  regionBoxesForContext(poseContextFor(input));

/** Bone boxes for one shambler-compatible pose. The caller builds them once per nearby zombie. */
export const posedShamblerRegionBoxes = (
  input: ShamblerPoseInput,
): Readonly<Record<ZombieRegion, readonly PosedBoneBox[]>> => {
  const all = posedAllRegionBoxes(input);
  return Object.fromEntries(ZOMBIE_REGION_NAMES.map((region) => [region, all[region] ?? []])) as Readonly<
    Record<ZombieRegion, readonly PosedBoneBox[]>
  >;
};

/** Manifest-region boxes from the same posed transforms used by the living actor renderer. */
export const posedAmalgamRegionBoxes = (
  input: ShamblerPoseInput,
): Readonly<Record<string, readonly PosedBoneBox[]>> => {
  const context = poseContextFor(input);
  if (input.model !== 'amalgam' || !('manifest' in context.figure)) {
    throw new Error('Amalgam region boxes require an amalgam pose input');
  }
  return regionBoxesForContext(context);
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

/** First surface of an actual, posed, unsevered voxel bone box, in block units, and the box it lies on. */
export const posedRegionHit = (
  boxes: readonly PosedBoneBox[],
  origin: Vec3,
  direction: Vec3,
  blockSize: number,
): { readonly distance: number; readonly box: PosedBoneBox } | undefined => {
  let nearest: { distance: number; box: PosedBoneBox } | undefined;
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
    if (hit !== undefined && (nearest === undefined || hit < nearest.distance)) {
      nearest = { distance: hit, box };
    }
  }
  return nearest;
};

/** First surface of an actual, posed, unsevered voxel bone box, in block units. */
export const posedRegionHitDistance = (
  boxes: readonly PosedBoneBox[],
  origin: Vec3,
  direction: Vec3,
  blockSize: number,
): number | undefined => posedRegionHit(boxes, origin, direction, blockSize)?.distance;

/** Return each unposed box in the chosen figure (exposed for proof and renderer parity tests). */
export const shamblerRegionBoxes = (seed: number): Readonly<Record<ZombieRegion, readonly BoneVoxelBox[]>> =>
  shamblerFigure(seed).boxes;
