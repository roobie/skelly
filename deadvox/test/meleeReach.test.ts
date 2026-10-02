import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { zombiePoseInputFor } from '../src/core/zombiePose.ts';
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
  const id = system.add(registry.zombies.get('shambler')!, [distanceMetres / BLOCK_SIZE, 1, 0], [-1, 0, 0]);
  const zombie = system.store.get(id)!;
  zombie.figureSeed = seed;
  zombie.mode = pose.mode;
  zombie.horizontalSpeed = pose.speed;
  zombie.gaitPhase = pose.gaitPhase;
  zombie.attackWindup = pose.attackWindup;
  zombie.attackWait =
    pose.attackWindup > 0 ? zombie.type.attack.cooldown - (zombie.type.attack.windup - pose.attackWindup) : 0;
  return { system, id, zombie };
};

const poseInput = (zombie: ReturnType<typeof makeSystem>['zombie']) => zombiePoseInputFor(zombie, 1, BLOCK_SIZE);

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

const visibleVoxel = (
  zombie: ReturnType<typeof makeSystem>['zombie'],
  bones: readonly string[],
  expectedRegion: ZombieRegion,
): Vec3 | undefined => {
  const input = poseInput(zombie);
  const boxes = posedShamblerRegionBoxes(input);
  return posedShamblerBoneVoxelCenters(input, bones)
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
      return nearestRegion === expectedRegion;
    })?.center;
};

const visibleTorsoVoxel = (zombie: ReturnType<typeof makeSystem>['zombie']): Vec3 | undefined =>
  visibleVoxel(zombie, ['chest', 'spine', 'pelvis'], 'torso');

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
  const hit = system.swing(playerEye, direction, weapon);
  if (hit !== id || zombie.regions[region] >= before[region]) {
    return false;
  }
  return (Object.keys(before) as ZombieRegion[]).every(
    (other) => other === region || zombie.regions[other] === before[other],
  );
};

describe('player melee reach at shambler attack distance', () => {
  it('provides a pure aim query that agrees with swing for the posed head, chest, arm, and above-head rays', () => {
    const weapon = registry.items.get('baseball_bat')!.weapon!.melee!;
    const rays = [
      { name: 'head', target: (zombie: ReturnType<typeof makeSystem>['zombie']) => regionCentroid(zombie, 'head') },
      { name: 'chest', target: (zombie: ReturnType<typeof makeSystem>['zombie']) => visibleTorsoVoxel(zombie)! },
      { name: 'arm', target: (zombie: ReturnType<typeof makeSystem>['zombie']) => regionCentroid(zombie, 'leftArm') },
      {
        name: 'above-head',
        target: (zombie: ReturnType<typeof makeSystem>['zombie']) => {
          const head = regionCentroid(zombie, 'head');
          return [head[0], head[1] + 1, head[2]] as Vec3;
        },
      },
    ];
    const cases = FIGURE_SEEDS.flatMap((seed) =>
      [poses[0]!, poses[2]!].flatMap((pose) =>
        rays.map((ray) => {
          const { system, id, zombie } = makeSystem(seed, pose, 1.08);
          const target = ray.target(zombie);
          const direction = target.map((coordinate, axis) => coordinate - playerEye[axis]!) as Vec3;
          const before = system.snapshotState();
          const aim = system.aimAt(playerEye, direction, weapon);
          expect(system.snapshotState(), `${ray.name} query mutates simulation state`).toEqual(before);
          const { system: swingSystem, id: swingId, zombie: swingZombie } = makeSystem(seed, pose, 1.08);
          const beforeHealth = { ...swingZombie.regions };
          const swingResult = swingSystem.swing(playerEye, direction, weapon);
          const changed = (Object.keys(beforeHealth) as ZombieRegion[]).find(
            (region) => swingZombie.regions[region] < beforeHealth[region],
          );
          expect(aim?.inReach ? [aim.id, aim.region] : undefined, `${ray.name} seed ${seed} ${pose.name}`).toEqual(
            changed === undefined ? undefined : [swingId, changed],
          );
          expect(swingResult, `${ray.name} should hit entity ${id} only when aim is in reach`).toBe(
            aim?.inReach ? id : undefined,
          );
          return aim;
        }),
      ),
    );
    expect(cases.every((aim) => aim === undefined || aim.distanceMetres >= 0)).toBe(true);
  });

  it('reports the nearest visible posed region beyond reach without changing state', () => {
    const weapon = registry.items.get('baseball_bat')!.weapon!.melee!;
    const { system, zombie } = makeSystem(1, poses[0]!, 3.5);
    const target = regionCentroid(zombie, 'head');
    const direction = target.map((coordinate, axis) => coordinate - playerEye[axis]!) as Vec3;
    const before = system.snapshotState();
    const aim = system.aimAt(playerEye, direction, weapon);
    expect(aim?.region).toBe('head');
    expect(aim?.inReach).toBe(false);
    expect(aim?.distanceMetres).toBeGreaterThan(aim?.reachMetres ?? Number.POSITIVE_INFINITY);
    expect(system.swing(playerEye, direction, weapon)).toBeUndefined();
    expect(system.snapshotState()).toEqual(before);
  });

  it('reaches visible posed head and torso voxels for every weapon, seed, and attack distance', () => {
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
                target: region === 'head' ? head! : torso!,
                weapon,
              }),
          )
          .map((region) => `${weapon.name} ${region} ${distance.toFixed(2)} seed ${seed} ${pose.name}`),
      ),
    );
    expect(fullyOccluded, 'torso voxels fully occluded from the player eye').toEqual([]);
    expect(misses, 'visible posed head/torso reach matrix; first failure identifies the case').toEqual([]);
  });

  it('keeps the first-intersected arm in front of the torso on an occluded ray', () => {
    const { system, id, zombie } = makeSystem(1, poses[0]!, 1.08);
    const input = poseInput(zombie);
    const torsoCandidates = posedShamblerBoneVoxelCenters(input, ['chest', 'spine', 'pelvis']);
    const target = torsoCandidates.find(({ center }) => {
      const direction = normalized(center.map((coordinate, axis) => coordinate - playerEye[axis]!) as Vec3);
      return ['leftArm', 'rightArm'].includes(system.aimAt(playerEye, direction, FISTS_MELEE)?.region ?? '');
    });
    expect(target, 'find a torso voxel occluded by an arm').toBeDefined();
    const direction = normalized(target!.center.map((coordinate, axis) => coordinate - playerEye[axis]!) as Vec3);
    const before = { ...zombie.regions };
    const aim = system.aimAt(playerEye, direction, FISTS_MELEE);
    expect(['leftArm', 'rightArm']).toContain(aim?.region);
    expect(system.swing(playerEye, direction, FISTS_MELEE)).toBe(id);
    expect(zombie.regions[aim!.region]).toBeLessThan(before[aim!.region]);
    expect(zombie.regions.torso).toBe(before.torso);
  });

  // This ~4k-simulation sweep takes about 1.8 s alone and 5.4 s under the full worker pool; allow ~5x solo time.
  it('measures progressively farther chest reach in the preserved weapon order', { timeout: 10_000 }, () => {
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
    expect(farthestByName.kitchen_knife).toBeLessThan(farthestByName.kabar!);
    expect(farthestByName.kabar).toBeLessThan(farthestByName.hammer!);
    expect(farthestByName.hammer).toBeLessThan(farthestByName.machete!);
    expect(farthestByName.machete).toBeLessThan(farthestByName.crowbar!);
    expect(farthestByName.crowbar).toBe(farthestByName.steel_pipe);
    expect(farthestByName.steel_pipe).toBeLessThan(farthestByName.baseball_bat!);
    expect(distances).toEqual([
      { name: 'fists', farthest: 1.47 },
      { name: 'kitchen_knife', farthest: 1.62 },
      { name: 'kabar', farthest: 1.63 },
      { name: 'hammer', farthest: 1.73 },
      { name: 'machete', farthest: 1.78 },
      { name: 'crowbar', farthest: 1.93 },
      { name: 'steel_pipe', farthest: 1.93 },
      { name: 'baseball_bat', farthest: 2.14 },
    ]);
  });

  it('defines weapon reach beyond the hand and retains the specified ordering', () => {
    expect(weapons.map(({ name }) => name)).toEqual([
      'fists',
      'kitchen_knife',
      'kabar',
      'hammer',
      'machete',
      'crowbar',
      'steel_pipe',
      'baseball_bat',
    ]);
    expect(PLAYER_ARM_REACH_M).toBe(1.2);
    const reaches = Object.fromEntries(weapons.map(({ name, reach }) => [name, reach]));
    expect(reaches.fists).toBeCloseTo(0.1);
    expect(reaches.kabar).toBeGreaterThan(reaches.kitchen_knife!);
    expect(reaches.kabar).toBeLessThan(reaches.hammer!);
    expect(reaches.hammer).toBeLessThan(reaches.machete!);
    expect(reaches.machete).toBeLessThan(reaches.crowbar!);
    expect(reaches.crowbar).toBe(reaches.steel_pipe);
    expect(reaches.steel_pipe).toBeLessThan(reaches.baseball_bat!);
  });
});
