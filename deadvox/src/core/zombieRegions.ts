import type { Vec3 } from './coords.ts';

export type FigurePart = 'body' | 'head' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
export type ZombieRegion = 'head' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
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

export interface FigureBox {
  /** Metres, in local figure space. */
  size: [number, number, number];
  /** Centre in metres, except leg positions which mark the hip pivot. */
  at: [number, number, number];
}

export const FIGURE_PARTS: readonly FigurePart[] = ['body', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];

/** Shared rigid-figure geometry: render meshes and melee hit boxes use these same dimensions. */
export const FIGURE_BOXES: Readonly<Record<FigurePart, FigureBox>> = {
  body: { size: [0.42, 0.78, 0.28], at: [0, 1.02, 0] },
  head: { size: [0.3, 0.32, 0.3], at: [0, 1.58, 0] },
  leftArm: { size: [0.15, 0.68, 0.16], at: [-0.225, 1.02, 0] },
  rightArm: { size: [0.15, 0.68, 0.16], at: [0.225, 1.02, 0] },
  leftLeg: { size: [0.18, 0.62, 0.2], at: [-0.12, 0.62, 0] },
  rightLeg: { size: [0.18, 0.62, 0.2], at: [0.12, 0.62, 0] },
};

interface HitPose {
  position: Vec3;
  facing: Vec3;
  headYaw: number;
  gaitPhase: number;
  moving: boolean;
}

const rotateFigurePoint = (x: number, z: number, yaw: number): [number, number] => [
  x * Math.cos(yaw) + z * Math.sin(yaw),
  -x * Math.sin(yaw) + z * Math.cos(yaw),
];

const rayBoxEntry = (origin: Vec3, direction: Vec3, halfSize: Vec3): number | undefined => {
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

/** Distance in block units to the rendered rigid region's first surface, if the ray intersects it. */
export const zombieRegionHitDistance = ({
  origin,
  direction,
  pose,
  region,
  blockSize,
}: {
  origin: Vec3;
  direction: Vec3;
  pose: HitPose;
  region: ZombieRegion;
  blockSize: number;
}): number | undefined => {
  const part = ZOMBIE_REGION_PART[region];
  const box = FIGURE_BOXES[part];
  const bodyYaw = Math.atan2(-pose.facing[0], -pose.facing[2]);
  const leg = region === 'leftLeg' || region === 'rightLeg';
  const stride = leg && pose.moving ? (region === 'leftLeg' ? 1 : -1) * Math.sin(pose.gaitPhase) * 0.22 : 0;
  const localY = box.at[1] - (leg ? (Math.cos(stride) * box.size[1]) / 2 : 0);
  const localZ = box.at[2] - (leg ? (Math.sin(stride) * box.size[1]) / 2 : 0);
  const [offsetX, offsetZ] = rotateFigurePoint(box.at[0], localZ, bodyYaw);
  const center: Vec3 = [
    pose.position[0] + offsetX / blockSize,
    pose.position[1] + localY / blockSize,
    pose.position[2] + offsetZ / blockSize,
  ];
  const yaw = bodyYaw + (region === 'head' ? pose.headYaw : 0);
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const relative: Vec3 = [origin[0] - center[0], origin[1] - center[1], origin[2] - center[2]];
  const localOrigin: Vec3 = [
    relative[0] * cosYaw - relative[2] * sinYaw,
    relative[1],
    relative[0] * sinYaw + relative[2] * cosYaw,
  ];
  const localDirection: Vec3 = [
    direction[0] * cosYaw - direction[2] * sinYaw,
    direction[1],
    direction[0] * sinYaw + direction[2] * cosYaw,
  ];
  if (leg) {
    const cosStride = Math.cos(stride);
    const sinStride = Math.sin(stride);
    const [, y, z] = localOrigin;
    localOrigin[1] = cosStride * y + sinStride * z;
    localOrigin[2] = -sinStride * y + cosStride * z;
    const [, dy, dz] = localDirection;
    localDirection[1] = cosStride * dy + sinStride * dz;
    localDirection[2] = -sinStride * dy + cosStride * dz;
  }
  return rayBoxEntry(localOrigin, localDirection, [
    box.size[0] / (2 * blockSize),
    box.size[1] / (2 * blockSize),
    box.size[2] / (2 * blockSize),
  ]);
};
