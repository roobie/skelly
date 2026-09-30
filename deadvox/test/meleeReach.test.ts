import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import {
  posedRegionHitDistance,
  posedShamblerBoneVoxelCenters,
  posedShamblerRegionBoxes,
  type ZombieRegion,
} from '../src/core/zombieRegions.ts';
import { FISTS_MELEE, PLAYER_ARM_REACH_M, ZombieSystem } from '../src/core/zombies.ts';
import { PLAYER, physicsFor } from '../src/game/player.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const BLOCK_SIZE = makeScale(0.5).blockSize;
const FLOOR = (_x: number, y: number) => y === 0;
const FIGURE_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const weapons = [
  ...[...registry.items.values()].flatMap((item) => (item.weapon ? [{ name: item.id, ...item.weapon.melee }] : [])),
  { name: 'fists', ...FISTS_MELEE },
].sort((a, b) => a.reach - b.reach || a.name.localeCompare(b.name));
const poses = [
  { name: 'standing', mode: 'idle' as const, speed: 0, gaitPhase: 0, attackWindup: 0 },
  { name: 'walking', mode: 'chase' as const, speed: 0.7, gaitPhase: 0.8, attackWindup: 0 },
  { name: 'mid-lunge', mode: 'chase' as const, speed: 0.7, gaitPhase: 0.8, attackWindup: 0.15 },
];
const playerEye: Vec3 = [0, (BLOCK_SIZE + PLAYER.eye) / BLOCK_SIZE, 0];

const makeSystem = (seed: number, pose: (typeof poses)[number], distanceMetres: number) => {
  const system = new ZombieSystem({
    player: () => ({
      pos: [0, playerEye[1] - PLAYER.eye / BLOCK_SIZE, 0],
      facing: [1, 0, 0],
      movement: 'still',
      lit: false,
      lightSeenFrom: 40,
    }),
    isSolid: FLOOR,
    hour: () => 12,
    blockSize: BLOCK_SIZE,
    physics: physicsFor(makeScale(0.5)),
    jumpSpeed: PLAYER.jump,
    hurtPlayer: () => undefined,
  });
  const id = system.add(registry.zombies.get('shambler')!, [distanceMetres / BLOCK_SIZE, 1, 0], [1, 0, 0]);
  const zombie = system.store.get(id)!;
  zombie.figureSeed = seed;
  zombie.mode = pose.mode;
  zombie.horizontalSpeed = pose.speed;
  zombie.gaitPhase = pose.gaitPhase;
  zombie.attackWindup = pose.attackWindup;
  return { system, id, zombie };
};

const poseInput = (zombie: ReturnType<typeof makeSystem>['zombie']) => ({
  seed: zombie.figureSeed,
  position: zombie.body.pos,
  facing: zombie.facing,
  headYaw: zombie.headYaw,
  gaitPhase: zombie.gaitPhase,
  speed: zombie.horizontalSpeed,
  chasing: zombie.mode === 'chase',
  attackWindup: zombie.attackWindup,
  attackWindupSeconds: zombie.type.attack.windup,
  severed: zombie.severed,
  blockSize: BLOCK_SIZE,
});

const regionCentroid = (zombie: ReturnType<typeof makeSystem>['zombie'], region: ZombieRegion): Vec3 => {
  const boxes = posedShamblerRegionBoxes(poseInput(zombie))[region].filter((box) => {
    if (region === 'head') {
      return true;
    }
    return box.bone === 'chest';
  });
  const count = boxes.reduce((sum, box) => sum + box.voxelCount, 0);
  return boxes
    .reduce<Vec3>(
      (sum, box) => [
        sum[0] + box.voxelCentroid[0] * box.voxelCount,
        sum[1] + box.voxelCentroid[1] * box.voxelCount,
        sum[2] + box.voxelCentroid[2] * box.voxelCount,
      ],
      [0, 0, 0],
    )
    .map((coordinate) => coordinate / count) as Vec3;
};

const normalized = (direction: Vec3): Vec3 => {
  const length = Math.hypot(...direction);
  return direction.map((coordinate) => coordinate / length) as Vec3;
};

const visibleTorsoVoxel = (zombie: ReturnType<typeof makeSystem>['zombie']): Vec3 | undefined => {
  const input = poseInput(zombie);
  const boxes = posedShamblerRegionBoxes(input);
  const candidates = (bones: readonly string[]) =>
    posedShamblerBoneVoxelCenters(input, bones)
      .map(({ center }) => ({
        center,
        distance: Math.hypot(...center.map((coordinate, axis) => coordinate - playerEye[axis]!)),
      }))
      .sort((a, b) => a.distance - b.distance)
      .find(({ center }) => {
        const direction = normalized(center.map((coordinate, axis) => coordinate - playerEye[axis]!) as Vec3);
        let nearestRegion: ZombieRegion | undefined;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const region of Object.keys(boxes) as ZombieRegion[]) {
          const distance = posedRegionHitDistance(boxes[region], playerEye, direction, BLOCK_SIZE);
          if (distance !== undefined && distance < nearestDistance) {
            nearestDistance = distance;
            nearestRegion = region;
          }
        }
        return nearestRegion === 'torso';
      })?.center;
  return candidates(['chest', 'spine']) ?? candidates(['pelvis']);
};

const swingAt = ({
  seed,
  pose,
  distance,
  region,
  target,
  weapon,
}: {
  seed: number;
  pose: (typeof poses)[number];
  distance: number;
  region: ZombieRegion;
  target: Vec3;
  weapon: (typeof weapons)[number];
}): boolean => {
  const { system, id, zombie } = makeSystem(seed, pose, distance);
  const direction = target.map((coordinate, axis) => coordinate - playerEye[axis]!) as Vec3;
  const before = { ...zombie.regions };
  if (system.swing(playerEye, direction, weapon) !== id || zombie.regions[region] >= before[region]) {
    return false;
  }
  return (Object.keys(before) as ZombieRegion[]).every(
    (other) => other === region || zombie.regions[other] === before[other],
  );
};

describe('player melee reach at shambler attack distance', () => {
  it('reaches the posed head centroid and nearest visible torso voxel for every weapon, seed, and attack distance', () => {
    const shamblerReach = registry.zombies.get('shambler')!.attack.reach;
    const attackDistances = [shamblerReach * 0.9, shamblerReach];
    const scenarios = FIGURE_SEEDS.flatMap((seed) =>
      poses.flatMap((pose) =>
        attackDistances.map((distance) => {
          const { zombie } = makeSystem(seed, pose, distance);
          return {
            seed,
            pose,
            distance,
            head: regionCentroid(zombie, 'head'),
            torso: visibleTorsoVoxel(zombie),
          };
        }),
      ),
    );
    const fullyOccluded = scenarios
      .filter(({ torso }) => torso === undefined)
      .map(({ seed, pose, distance }) => `seed ${seed} ${pose.name} ${distance.toFixed(2)} m`);
    const hittable = scenarios.filter((scenario) => scenario.torso !== undefined);
    const misses = weapons.flatMap((weapon) =>
      hittable.flatMap(({ seed, pose, distance, head, torso }) =>
        (['head', 'torso'] as const)
          .filter(
            (region) =>
              !swingAt({
                seed,
                pose,
                distance,
                region,
                target: region === 'head' ? head : torso!,
                weapon,
              }),
          )
          .map((region) => `${weapon.name} ${region} ${distance.toFixed(2)} seed ${seed} ${pose.name}`),
      ),
    );
    expect(fullyOccluded, 'torso voxels fully occluded from the player eye').toEqual([]);
    expect(misses, 'visible posed head/torso reach matrix; first failure identifies the case').toEqual([]);
  });

  it('keeps the first-intersected arm in front of the chest when aiming at the chest centroid', () => {
    const { system, id, zombie } = makeSystem(1, poses[0]!, 1.08);
    const target = regionCentroid(zombie, 'torso');
    const before = { ...zombie.regions };
    const direction = target.map((coordinate, axis) => coordinate - playerEye[axis]!) as Vec3;
    expect(system.swing(playerEye, direction, FISTS_MELEE)).toBe(id);
    expect(zombie.regions.leftArm).toBeLessThan(before.leftArm);
    expect(zombie.regions.torso).toBe(before.torso);
  });

  it('measures progressively farther chest reach in the preserved weapon order', () => {
    const standing = poses[0]!;
    const seed = 1;
    const distances = weapons.map((weapon) => {
      let farthest = 0;
      for (let centimetres = 10; centimetres <= 500; centimetres++) {
        const distance = centimetres / 100;
        const { zombie } = makeSystem(seed, standing, distance);
        const target = visibleTorsoVoxel(zombie);
        if (target && swingAt({ seed, pose: standing, distance, region: 'torso', target, weapon })) {
          farthest = distance;
        }
      }
      return { name: weapon.name, farthest };
    });
    const farthestByName = Object.fromEntries(distances.map(({ name, farthest }) => [name, farthest]));
    expect(farthestByName.fists).toBeLessThan(farthestByName.kitchen_knife!);
    expect(farthestByName.kitchen_knife).toBeLessThan(farthestByName.hammer!);
    expect(farthestByName.hammer).toBeLessThan(farthestByName.crowbar!);
    expect(farthestByName.crowbar).toBe(farthestByName.steel_pipe);
    expect(farthestByName.steel_pipe).toBeLessThan(farthestByName.baseball_bat!);
    expect(distances).toEqual([
      { name: 'fists', farthest: 1.42 },
      { name: 'kitchen_knife', farthest: 1.57 },
      { name: 'hammer', farthest: 1.73 },
      { name: 'crowbar', farthest: 1.93 },
      { name: 'steel_pipe', farthest: 1.93 },
      { name: 'baseball_bat', farthest: 2.13 },
    ]);
  });

  it('defines weapon reach beyond the hand and retains the specified ordering', () => {
    expect(weapons.map(({ name }) => name)).toEqual([
      'fists',
      'kitchen_knife',
      'hammer',
      'crowbar',
      'steel_pipe',
      'baseball_bat',
    ]);
    expect(PLAYER_ARM_REACH_M).toBe(1.2);
    const reaches = Object.fromEntries(weapons.map(({ name, reach }) => [name, reach]));
    expect(reaches.fists).toBeCloseTo(0.1);
    expect(reaches.kitchen_knife).toBeLessThan(reaches.hammer!);
    expect(reaches.hammer).toBeLessThan(reaches.crowbar!);
    expect(reaches.crowbar).toBe(reaches.steel_pipe);
    expect(reaches.steel_pipe).toBeLessThan(reaches.baseball_bat!);
  });
});
