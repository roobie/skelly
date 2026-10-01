import { type Vec3 as MobVec3, transpose } from '@mobgen/core/math.ts';
import { boneTransforms, type Pose } from '@mobgen/core/pose.ts';
import { cellIndex, worldPosition } from '@mobgen/core/voxelize.ts';
import { attackPose, LUNGE_GRAB } from '@mobgen/mob/attack.ts';
import { footRestExtents, type GaitClock, type WalkActor, walkPose } from '@mobgen/mob/gait.ts';
import type { HumanoidParams } from '@mobgen/mob/humanoid.ts';
import { idlePose } from '@mobgen/mob/idle.ts';
import { SHAMBLER_FIGURE_SEEDS, shamblerFigure } from '@mobgen/mob/shamblerFigure.ts';
import { describe, expect, it } from 'vitest';
import {
  posedRegionHitDistance,
  posedShamblerRegionBoxes,
  ZOMBIE_REGION_NAMES,
  type ZombieRegion,
} from '../src/core/zombieRegions.ts';

type Vec3 = [number, number, number];
const BLOCK = 0.5;
const REGION_BONES: Record<ZombieRegion, readonly string[]> = {
  head: ['head', 'jaw'],
  torso: ['pelvis', 'spine', 'chest', 'neck'],
  leftArm: ['upperArm.L', 'forearm.L', 'hand.L'],
  rightArm: ['upperArm.R', 'forearm.R', 'hand.R'],
  leftLeg: ['thigh.L', 'shin.L', 'foot.L'],
  rightLeg: ['thigh.R', 'shin.R', 'foot.R'],
};
interface PoseCase {
  readonly name: string;
  readonly speed: number;
  readonly gaitPhase: number;
  readonly chasing: boolean;
  readonly attackWindup: number;
}
const POSES: readonly PoseCase[] = [
  { name: 'standing', speed: 0, gaitPhase: 0, chasing: false, attackWindup: 0 },
  { name: 'walking phase 0', speed: 1, gaitPhase: 0, chasing: true, attackWindup: 0 },
  { name: 'walking phase 1', speed: 1, gaitPhase: Math.PI / 2, chasing: true, attackWindup: 0 },
  { name: 'mid-lunge', speed: 1, gaitPhase: Math.PI / 2, chasing: true, attackWindup: 0.2 },
];
const normalize = (v: MobVec3): Vec3 => {
  const n = Math.hypot(...v);
  return n === 0 ? [0, 0, 0] : [v[0] / n, v[1] / n, v[2] / n];
};
const mul = (r: readonly number[], p: readonly number[]): Vec3 => [
  r[0]! * p[0]! + r[1]! * p[1]! + r[2]! * p[2]!,
  r[3]! * p[0]! + r[4]! * p[1]! + r[5]! * p[2]!,
  r[6]! * p[0]! + r[7]! * p[1]! + r[8]! * p[2]!,
];
const add = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
const sub = (a: readonly number[], b: readonly number[]): Vec3 => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];

const posed = (seed: number, testPose: PoseCase) => {
  const figure = shamblerFigure(seed);
  const { realized, genome } = figure;
  const { body, voxels } = realized;
  const { bones } = body;
  const extents = footRestExtents(bones, voxels);
  const actor: WalkActor = { bones, extents, params: genome.params as HumanoidParams, seed };
  const { gaitPhase } = testPose;
  const clock: GaitClock = {
    stepIndex: Math.floor(gaitPhase / Math.PI),
    progress: (gaitPhase % Math.PI) / Math.PI,
  };
  const stance = testPose.chasing || testPose.attackWindup > 0 ? 'aggravated' : 'slack';
  const walk = walkPose(actor, clock, testPose.speed, { idle: idlePose(actor, stance, 0) });
  const time =
    testPose.attackWindup > 0 ? Math.max(0, LUNGE_GRAB.hitTime - 0.8) + 0.8 - testPose.attackWindup : undefined;
  const pose: Pose = time === undefined ? walk : attackPose(actor, LUNGE_GRAB, time, walk);
  const transforms = boneTransforms(bones, pose);
  const boxes = posedShamblerRegionBoxes({
    seed,
    position: [0, 0, 0],
    facing: [0, 0, -1],
    headYaw: 0,
    gaitPhase,
    speed: testPose.speed,
    chasing: testPose.chasing,
    attackWindup: testPose.attackWindup,
    attackWindupSeconds: 0.8,
    severed: [],
    blockSize: BLOCK,
  });
  return { figure, bones, pose, transforms, boxes };
};

const voxelCentroid = (seed: number, posedFigure: ReturnType<typeof posed>, boneIds: readonly string[]): Vec3 => {
  const { voxels } = posedFigure.figure.realized;
  const boneIndex = new Map(posedFigure.bones.map((bone, i) => [bone.id, i]));
  const wanted = new Set(boneIds.map((bone) => boneIndex.get(bone)).filter((i): i is number => i !== undefined));
  let sum: Vec3 = [0, 0, 0];
  let count = 0;
  for (let k = 0; k < voxels.dims[2]; k++) {
    for (let j = 0; j < voxels.dims[1]; j++) {
      for (let i = 0; i < voxels.dims[0]; i++) {
        const owner = voxels.owner[cellIndex(voxels.dims, i, j, k)]! - 1;
        if (!wanted.has(owner)) {
          continue;
        }
        const bone = posedFigure.bones[owner]!;
        const t = posedFigure.transforms.get(bone.id)!;
        const local = worldPosition(voxels, i, j, k);
        const p = add(t.t, mul(t.r, local));
        const point: Vec3 = [p[0] / BLOCK, p[1] / BLOCK, p[2] / BLOCK];
        sum = add(sum, point);
        count += 1;
      }
    }
  }
  if (!count) {
    throw new Error(`No voxels for seed ${seed} in bones ${boneIds.join(',')}`);
  }
  return [sum[0] / count, sum[1] / count, sum[2] / count];
};

const nearestRegion = (
  boxes: ReturnType<typeof posed>['boxes'],
  origin: Vec3,
  direction: Vec3,
): ZombieRegion | undefined => {
  const hits = ZOMBIE_REGION_NAMES.flatMap((region) => {
    const distance = posedRegionHitDistance(boxes[region], origin, direction, BLOCK);
    return distance === undefined ? [] : [{ region, distance }];
  }).sort((a, b) => a.distance - b.distance);
  return hits[0]?.region;
};

const rayAt = (target: Vec3, fromBack = false): { origin: Vec3; direction: Vec3 } => {
  const origin: Vec3 = fromBack
    ? [target[0], target[1], target[2] + 1.5 / BLOCK]
    : [target[0], target[1], target[2] - 1.5 / BLOCK];
  return { origin, direction: normalize(sub(target, origin)) };
};

const voxelPoints = (posedFigure: ReturnType<typeof posed>, boneId: string) => {
  const { voxels } = posedFigure.figure.realized;
  const boneIndex = posedFigure.bones.findIndex((bone) => bone.id === boneId);
  const points: Vec3[] = [];
  for (let k = 0; k < voxels.dims[2]; k++) {
    for (let j = 0; j < voxels.dims[1]; j++) {
      for (let i = 0; i < voxels.dims[0]; i++) {
        if (voxels.owner[cellIndex(voxels.dims, i, j, k)]! - 1 !== boneIndex) {
          continue;
        }
        const bone = posedFigure.bones[boneIndex]!;
        const t = posedFigure.transforms.get(bone.id)!;
        const local = worldPosition(voxels, i, j, k);
        const p = add(t.t, mul(t.r, local));
        points.push([p[0] / BLOCK, p[1] / BLOCK, p[2] / BLOCK]);
      }
    }
  }
  return points;
};

const posedBoxErrors = (figure: ReturnType<typeof posed>, box: (typeof figure.boxes)[ZombieRegion][number]) => {
  const errors: string[] = [];
  const inverse = transpose(box.rotation);
  const allowance = 1e-6;
  for (const point of voxelPoints(figure, box.bone)) {
    const local = mul(inverse, sub(point, box.center));
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(local[axis]!) > box.halfSize[axis]! / BLOCK + allowance) {
        errors.push(`${figure.figure.seed}/${box.bone}/axis-${axis}`);
      }
    }
  }
  return errors;
};

describe('posed shambler hit regions', () => {
  it('targets the rendered head, misses 5 cm above it, and targets chest/forearm/shin across every seed and pose', () => {
    for (const seed of SHAMBLER_FIGURE_SEEDS) {
      for (const testPose of POSES) {
        const figure = posed(seed, testPose);
        const head = voxelCentroid(seed, figure, REGION_BONES.head);
        const headRay = rayAt(head);
        expect(nearestRegion(figure.boxes, headRay.origin, headRay.direction), `${seed} ${testPose.name} head`).toBe(
          'head',
        );

        const headPoints = voxelPoints(figure, 'head').concat(voxelPoints(figure, 'jaw'));
        const highest = headPoints.reduce((current, point) => (point[1] > current[1] ? point : current));
        const above: Vec3 = [
          highest[0],
          highest[1] + (figure.figure.realized.voxels.size / 2 + 0.05) / BLOCK,
          highest[2] - 1.5 / BLOCK,
        ];
        expect(
          ZOMBIE_REGION_NAMES.every(
            (region) => posedRegionHitDistance(figure.boxes[region], above, [0, 0, 1], BLOCK) === undefined,
          ),
          `${seed} ${testPose.name} 5 cm above head`,
        ).toBe(true);

        const targets: readonly [ZombieRegion, string][] = [
          ['torso', 'chest'],
          ['leftArm', 'forearm.L'],
          ['rightArm', 'forearm.R'],
          ['leftLeg', 'shin.L'],
          ['rightLeg', 'shin.R'],
        ];
        for (const [region, bone] of targets) {
          const target = voxelCentroid(seed, figure, region === 'torso' ? REGION_BONES.torso : [bone]);
          const ray = rayAt(target, region === 'torso');
          expect(nearestRegion(figure.boxes, ray.origin, ray.direction), `${seed} ${testPose.name} ${bone}`).toBe(
            region,
          );
        }
      }
    }
  });

  it('removes severed bones from their hit region without hiding the rest of the arm', () => {
    const present = posedShamblerRegionBoxes({
      seed: 1,
      position: [0, 0, 0],
      facing: [0, 0, -1],
      headYaw: 0,
      gaitPhase: 0,
      speed: 0,
      chasing: false,
      attackWindup: 0,
      attackWindupSeconds: 0.8,
      severed: [],
      blockSize: BLOCK,
    });
    const severed = posedShamblerRegionBoxes({
      seed: 1,
      position: [0, 0, 0],
      facing: [0, 0, -1],
      headYaw: 0,
      gaitPhase: 0,
      speed: 0,
      chasing: false,
      attackWindup: 0,
      attackWindupSeconds: 0.8,
      severed: ['hand.R'],
      blockSize: BLOCK,
    });
    expect(severed.rightArm.map((box) => box.bone)).not.toContain('hand.R');
    expect(severed.rightArm.map((box) => box.bone)).toContain('forearm.R');
    expect(severed.leftArm.map((box) => box.bone)).toEqual(present.leftArm.map((box) => box.bone));
  });

  it('keeps every posed bone box around its rendered voxel centres, with the specified voxel margin', () => {
    for (const seed of SHAMBLER_FIGURE_SEEDS) {
      for (const testPose of POSES) {
        const figure = posed(seed, testPose);
        const boxes = Object.values(figure.boxes).flat();
        expect(
          boxes.flatMap((box) => posedBoxErrors(figure, box)),
          `${seed} ${testPose.name}`,
        ).toEqual([]);
      }
    }
  });
});
