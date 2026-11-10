import { describe, expect, it } from 'vitest';
import type { ActorPoseInput } from '../../engine/src/core/actorPose.ts';
import {
  posedActorBoneVoxelCenters,
  posedFusedMassRegionBoxes,
  posedHumanoidRegionBoxes,
  posedRegionHitDistance,
} from '../../engine/src/core/actorRegions.ts';
import { HUMANOID_REGION_NAMES } from '../../engine/src/core/humanoidRegionNames.ts';
import { type ActorDef, actorFigure } from '../../engine/src/content.ts';
import {
  FUSED_MASS_FIGURE_SEED,
  figureVariantOf,
  fusedMassTypeOf,
  type HumanoidHitRegion,
  type Vec3 as MobVec3,
  transpose,
} from '../../engine/src/pose.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';

type Vec3 = [number, number, number];
const BLOCK = 0.5;
const registry = baseRegistry();
const SHAMBLER = registry.actors.get('shambler')!;
const FIGURES = stackActorFigureFiles(registry);
// Fixture seeds: these cases test geometry, not which seeds the content authors.
const SHAMBLER_FIGURE_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const REGION_BONES: Record<HumanoidHitRegion, readonly string[]> = {
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

/** One actor pose: its region boxes and the rendered voxels they must cover, from the same pose input. */
const posed = (seed: number, testPose: PoseCase, type: ActorDef = SHAMBLER) => {
  const figure = actorFigure(FIGURES, type, seed);
  const input: ActorPoseInput = {
    model: figureVariantOf(type),
    seed,
    figure,
    position: [0, 0, 0],
    facing: [0, 0, -1],
    headYaw: 0,
    gaitPhase: testPose.gaitPhase,
    speed: testPose.speed,
    chasing: testPose.chasing,
    attackWindup: testPose.attackWindup,
    attackWindupSeconds: 0.8,
    severed: [],
    blockSize: BLOCK,
  };
  return { seed, figure, input, boxes: posedHumanoidRegionBoxes(input) };
};

/** Posed rendered voxel centres owned by the bones, in block coordinates. */
const voxelPoints = (posedFigure: ReturnType<typeof posed>, ...bones: readonly string[]): Vec3[] =>
  posedActorBoneVoxelCenters(posedFigure.input, bones).map(({ center }) => [...center]);

const voxelCentroid = (posedFigure: ReturnType<typeof posed>, bones: readonly string[]): Vec3 => {
  const points = voxelPoints(posedFigure, ...bones);
  if (points.length === 0) {
    throw new Error(`No voxels for seed ${posedFigure.seed} in bones ${bones.join(',')}`);
  }
  const sum = points.reduce((total, point) => add(total, point), [0, 0, 0]);
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
};

const nearestRegion = (
  boxes: ReturnType<typeof posed>['boxes'],
  origin: Vec3,
  direction: Vec3,
): HumanoidHitRegion | undefined => {
  const hits = HUMANOID_REGION_NAMES.flatMap((region) => {
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

const posedBoxErrors = (figure: ReturnType<typeof posed>, box: (typeof figure.boxes)[HumanoidHitRegion][number]) => {
  const errors: string[] = [];
  const inverse = transpose(box.rotation);
  const allowance = 1e-6;
  for (const point of voxelPoints(figure, box.bone)) {
    const local = mul(inverse, sub(point, box.center));
    for (let axis = 0; axis < 3; axis++) {
      if (Math.abs(local[axis]!) > box.halfSize[axis]! / BLOCK + allowance) {
        errors.push(`${figure.seed}/${box.bone}/axis-${axis}`);
      }
    }
  }
  return errors;
};

const hitTargetCases = SHAMBLER_FIGURE_SEEDS.map((seed, index) => ({
  seed,
  testPose: POSES[(index * 3) % POSES.length]!,
}));

describe('posed shambler hit regions', () => {
  it('targets each rendered region and misses above the head across a seed/pose covering set', () => {
    for (const { seed, testPose } of hitTargetCases) {
      const figure = posed(seed, testPose);
      const head = voxelCentroid(figure, REGION_BONES.head);
      const headRay = rayAt(head);
      expect(nearestRegion(figure.boxes, headRay.origin, headRay.direction), `${seed} ${testPose.name} head`).toBe(
        'head',
      );

      const headPoints = voxelPoints(figure, ...REGION_BONES.head);
      const highest = headPoints.reduce((current, point) => (point[1] > current[1] ? point : current));
      const above: Vec3 = [
        highest[0],
        highest[1] + (figure.figure.body.voxelSize / 2 + 0.05) / BLOCK,
        highest[2] - 1.5 / BLOCK,
      ];
      expect(
        HUMANOID_REGION_NAMES.every(
          (region) => posedRegionHitDistance(figure.boxes[region], above, [0, 0, 1], BLOCK) === undefined,
        ),
        `${seed} ${testPose.name} 5 cm above head`,
      ).toBe(true);

      const targets: readonly [HumanoidHitRegion, string][] = [
        ['torso', 'chest'],
        ['leftArm', 'forearm.L'],
        ['rightArm', 'forearm.R'],
        ['leftLeg', 'shin.L'],
        ['rightLeg', 'shin.R'],
      ];
      for (const [region, bone] of targets) {
        const target = voxelCentroid(figure, region === 'torso' ? REGION_BONES.torso : [bone]);
        const ray = rayAt(target, region === 'torso');
        expect(nearestRegion(figure.boxes, ray.origin, ray.direction), `${seed} ${testPose.name} ${bone}`).toBe(region);
      }
    }
  });

  it('keeps every posed acid-body bone box around its rendered voxel centres', () => {
    const acid = [...registry.actors.values()].find((type) => type.model === 'acid')!;
    expect(acid).toBeDefined();
    for (const [index, seed] of SHAMBLER_FIGURE_SEEDS.slice(0, 4).entries()) {
      const testPose = POSES[index % POSES.length]!;
      const figure = posed(seed, testPose, acid);
      const boxes = Object.values(figure.boxes).flat();
      expect(boxes.length, `${seed} ${testPose.name}`).toBeGreaterThan(0);
      expect(
        boxes.flatMap((box) => posedBoxErrors(figure, box)),
        `${seed} ${testPose.name}`,
      ).toEqual([]);
    }
  });

  it('removes severed bones from their hit region without hiding the rest of the arm', () => {
    const present = posedHumanoidRegionBoxes({
      seed: 1,
      figure: actorFigure(FIGURES, SHAMBLER, 1),
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
    const severed = posedHumanoidRegionBoxes({
      seed: 1,
      figure: actorFigure(FIGURES, SHAMBLER, 1),
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

describe('posed voxel centres of a scaled body', () => {
  it("places each bone's voxel centres around its box's voxel centroid on a body drawn at non-unit scale", () => {
    const amalgam = fusedMassTypeOf(registry.actors)!;
    const figure = actorFigure(FIGURES, amalgam, FUSED_MASS_FIGURE_SEED);
    expect(figure.body.scale).not.toBe(1);
    // Off the world origin and turned, so scaling about the wrong point or before yaw shows.
    const input: ActorPoseInput = {
      model: 'fused-mass',
      seed: FUSED_MASS_FIGURE_SEED,
      figure,
      position: [7, 3, -11],
      facing: normalize([1, 0, -2]),
      headYaw: 0,
      gaitPhase: 0,
      speed: 0,
      chasing: false,
      attackWindup: 0,
      attackWindupSeconds: 0,
      severed: [],
      blockSize: BLOCK,
    };
    const boxes = Object.values(posedFusedMassRegionBoxes(input)).flat();
    expect(boxes.length).toBeGreaterThan(0);
    for (const box of boxes) {
      const centres = posedActorBoneVoxelCenters(input, [box.bone]);
      expect(centres.length, box.bone).toBe(box.voxelCount);
      const sum = centres.reduce<Vec3>((total, { center }) => add(total, center), [0, 0, 0]);
      for (let axis = 0; axis < 3; axis++) {
        expect(sum[axis]! / centres.length, `${box.bone} axis ${axis}`).toBeCloseTo(box.voxelCentroid[axis]!, 6);
      }
    }
  });
});
