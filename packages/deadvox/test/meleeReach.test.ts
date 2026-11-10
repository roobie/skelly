import { describe, expect, it } from 'vitest';
import { actorPoseInputFor } from '../src/core/actorPose.ts';
import {
  type HumanoidHitRegion,
  posedActorBoneVoxelCenters,
  posedHumanoidRegionBoxes,
  posedRegionHitDistance,
} from '../src/core/actorRegions.ts';
import { PLAYER_ARM_REACH_M } from '../src/core/actorState.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { PLAYER, physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

const registry = baseRegistry();
const FIGURES = stackActorFigureFiles(registry);
const runtimeWeapon = <T extends { cooldownSimSeconds: number }>(weapon: T) => ({
  ...weapon,
  cooldown: weapon.cooldownSimSeconds,
});
const BLOCK_SIZE = makeScale(0.5).blockSize;
const FLOOR = (_x: number, y: number) => y === 0;
const FIGURE_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const weapons = [
  ...[...registry.items.values()].flatMap((item) =>
    item.weapon?.melee ? [{ name: item.id, ...runtimeWeapon(item.weapon.melee) }] : [],
  ),
  { name: 'fists', ...FISTS_MELEE },
].sort((a, b) => a.reach - b.reach || a.name.localeCompare(b.name));
const poses = [
  { name: 'standing', mode: 'idle' as const, speed: 0, gaitPhase: 0, attackWindup: 0 },
  { name: 'walking', mode: 'chase' as const, speed: 0.7, gaitPhase: 0.8, attackWindup: 0 },
  { name: 'mid-lunge', mode: 'chase' as const, speed: 0.7, gaitPhase: 0.8, attackWindup: 0.15 },
];
const playerEye: Vec3 = [0, (BLOCK_SIZE + PLAYER.eye) / BLOCK_SIZE, 0];

const makeSystem = (seed: number, pose: (typeof poses)[number], distanceMetres: number) => {
  const system = new ActorSystem({
    player: () => ({
      pos: [0, playerEye[1] - PLAYER.eye / BLOCK_SIZE, 0],
      facing: [1, 0, 0],
      movement: 'still',
      lit: false,
      lightSeenFrom: 40,
      eyeHeightMetres: 1.3,
    }),
    isSolid: FLOOR,
    isOpaque: FLOOR,
    dayPhase: () => dayStateAtHour(12),
    blockSize: BLOCK_SIZE,
    physics: physicsFor(makeScale(0.5)),
    tuning: TEST_SENSE_TUNING,
    actorFigureFiles: FIGURES,
    hurtPlayer: () => undefined,
  });
  const id = system.add(registry.actors.get('shambler')!, [distanceMetres / BLOCK_SIZE, 1, 0], [-1, 0, 0]);
  const actor = system.store.get(id)!;
  actor.figureSeed = seed;
  actor.agent!.mode = pose.mode;
  actor.chaseStance = actor.agent!.mode === 'chase';
  actor.horizontalSpeed = pose.speed;
  actor.gaitPhase = pose.gaitPhase;
  actor.attackWindup = pose.attackWindup;
  actor.attackWait =
    pose.attackWindup > 0
      ? actor.type.attack!.cooldownSimSeconds - (actor.type.attack!.windupSimSeconds - pose.attackWindup)
      : 0;
  return { system, id, actor };
};

const poseInput = (actor: ReturnType<typeof makeSystem>['actor']) =>
  actorPoseInputFor(actor, 1, { blockSize: BLOCK_SIZE, actorFigureFiles: FIGURES });

const regionCentroid = (actor: ReturnType<typeof makeSystem>['actor'], region: HumanoidHitRegion): Vec3 => {
  const boxes = posedHumanoidRegionBoxes(poseInput(actor))[region].filter((box) => {
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
  actor: ReturnType<typeof makeSystem>['actor'],
  bones: readonly string[],
  expectedRegion: HumanoidHitRegion,
): Vec3 | undefined => {
  const input = poseInput(actor);
  const boxes = posedHumanoidRegionBoxes(input);
  return posedActorBoneVoxelCenters(input, bones)
    .map(({ center }) => ({
      center,
      distance: Math.hypot(...center.map((coordinate, axis) => coordinate - playerEye[axis]!)),
    }))
    .sort((a, b) => a.distance - b.distance)
    .find(({ center }) => {
      const direction = normalized(center.map((coordinate, axis) => coordinate - playerEye[axis]!) as Vec3);
      let nearestRegion: HumanoidHitRegion | undefined;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (const region of Object.keys(boxes) as HumanoidHitRegion[]) {
        const distance = posedRegionHitDistance(boxes[region], playerEye, direction, BLOCK_SIZE);
        if (distance !== undefined && distance < nearestDistance) {
          nearestDistance = distance;
          nearestRegion = region;
        }
      }
      return nearestRegion === expectedRegion;
    })?.center;
};

const visibleTorsoVoxel = (actor: ReturnType<typeof makeSystem>['actor']): Vec3 | undefined =>
  visibleVoxel(actor, ['chest', 'spine', 'pelvis'], 'torso');

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
  region: HumanoidHitRegion;
  target: Vec3;
  weapon: (typeof weapons)[number];
}): boolean => {
  const { system, id, actor } = makeSystem(seed, pose, distance);
  const direction = target.map((coordinate, axis) => coordinate - playerEye[axis]!) as Vec3;
  const before = { ...actor.regions };
  const hit = system.swing(playerEye, direction, weapon);
  if (hit !== id || actor.regions[region]! >= before[region]!) {
    return false;
  }
  return (Object.keys(before) as HumanoidHitRegion[]).every(
    (other) => other === region || actor.regions[other] === before[other],
  );
};

const swingAtReachDistance = (
  seed: number,
  pose: (typeof poses)[number],
  weapon: (typeof weapons)[number],
  distanceMetres: number,
): boolean => {
  const { system, id, actor } = makeSystem(seed, pose, 1.08);
  const target = visibleTorsoVoxel(actor);
  if (!target) {
    return false;
  }
  const direction = normalized(target.map((coordinate, axis) => coordinate - playerEye[axis]!) as Vec3);
  const aim = system.aimAt(playerEye, direction, weapon);
  if (aim?.region !== 'torso') {
    return false;
  }
  const offset = (distanceMetres - aim.distanceMetres) / BLOCK_SIZE;
  const origin = playerEye.map((coordinate, axis) => coordinate - direction[axis]! * offset) as Vec3;
  const before = actor.regions.torso!;
  return system.swing(origin, direction, weapon) === id && actor.regions.torso! < before;
};

describe('player melee reach at shambler attack distance', () => {
  it('provides a pure aim query that agrees with swing for the posed head, chest, arm, and above-head rays', () => {
    const weapon = runtimeWeapon(registry.items.get('baseball_bat')!.weapon!.melee!);
    const rays = [
      { name: 'head', target: (actor: ReturnType<typeof makeSystem>['actor']) => regionCentroid(actor, 'head') },
      { name: 'chest', target: (actor: ReturnType<typeof makeSystem>['actor']) => visibleTorsoVoxel(actor)! },
      { name: 'arm', target: (actor: ReturnType<typeof makeSystem>['actor']) => regionCentroid(actor, 'leftArm') },
      {
        name: 'above-head',
        target: (actor: ReturnType<typeof makeSystem>['actor']) => {
          const head = regionCentroid(actor, 'head');
          return [head[0], head[1] + 1, head[2]] as Vec3;
        },
      },
    ];
    const cases = FIGURE_SEEDS.flatMap((seed) =>
      [poses[0]!, poses[2]!].flatMap((pose) =>
        rays.map((ray) => {
          const { system, id, actor } = makeSystem(seed, pose, 1.08);
          const target = ray.target(actor);
          const direction = target.map((coordinate, axis) => coordinate - playerEye[axis]!) as Vec3;
          const before = system.snapshotState();
          const aim = system.aimAt(playerEye, direction, weapon);
          expect(system.snapshotState(), `${ray.name} query mutates simulation state`).toEqual(before);
          const { system: swingSystem, id: swingId, actor: swingActor } = makeSystem(seed, pose, 1.08);
          const beforeHealth = { ...swingActor.regions };
          const swingResult = swingSystem.swing(playerEye, direction, weapon);
          const changed = (Object.keys(beforeHealth) as HumanoidHitRegion[]).find(
            (region) => swingActor.regions[region]! < beforeHealth[region]!,
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
    const weapon = runtimeWeapon(registry.items.get('baseball_bat')!.weapon!.melee!);
    const { system, actor } = makeSystem(1, poses[0]!, 3.5);
    const target = regionCentroid(actor, 'head');
    const direction = target.map((coordinate, axis) => coordinate - playerEye[axis]!) as Vec3;
    const before = system.snapshotState();
    const aim = system.aimAt(playerEye, direction, weapon);
    expect(aim?.region).toBe('head');
    expect(aim?.inReach).toBe(false);
    expect(aim?.distanceMetres).toBeGreaterThan(aim?.reachMetres ?? Number.POSITIVE_INFINITY);
    expect(system.swing(playerEye, direction, weapon)).toBeUndefined();
    expect(system.snapshotState()).toEqual(before);
  });

  it('reaches visible posed head and torso voxels over every pair of weapon, seed, pose and attack distance', () => {
    const shamblerReach = registry.actors.get('shambler')!.attack!.reach;
    const attackDistances = [shamblerReach * 0.9, shamblerReach];
    // A covering array: every weapon meets every seed, and the pose and distance follow the weapon and seed indices
    // so that every pair of any two factors occurs. Weapons and seeds must each outnumber the poses and distances.
    expect(weapons.length).toBeGreaterThanOrEqual(poses.length);
    expect(FIGURE_SEEDS.length).toBeGreaterThanOrEqual(poses.length * attackDistances.length);
    const scenarios = weapons.flatMap((weapon, weaponIndex) =>
      FIGURE_SEEDS.map((seed, seedIndex) => {
        const pose = poses[(weaponIndex + seedIndex) % poses.length]!;
        const distance = attackDistances[(weaponIndex + seedIndex) % attackDistances.length]!;
        const { actor } = makeSystem(seed, pose, distance);
        return {
          weapon,
          seed,
          pose,
          distance,
          head: regionCentroid(actor, 'head'),
          torso: visibleTorsoVoxel(actor),
        };
      }),
    );
    const fullyOccluded = scenarios
      .filter(({ torso }) => torso === undefined)
      .map(({ seed, pose, distance }) => `seed ${seed} ${pose.name} ${distance.toFixed(2)} m`);
    const hittable = scenarios.filter((scenario) => scenario.torso !== undefined);
    const misses = hittable.flatMap(({ weapon, seed, pose, distance, head, torso }) =>
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
    );
    expect(fullyOccluded, 'torso voxels fully occluded from the player eye').toEqual([]);
    expect(misses, 'visible posed head/torso reach matrix; first failure identifies the case').toEqual([]);
  });

  it('keeps the first-intersected arm in front of the torso on an occluded ray', () => {
    const { system, id, actor } = makeSystem(1, poses[0]!, 1.08);
    const input = poseInput(actor);
    const torsoCandidates = posedActorBoneVoxelCenters(input, ['chest', 'spine', 'pelvis']);
    const target = torsoCandidates.find(({ center }) => {
      const direction = normalized(center.map((coordinate, axis) => coordinate - playerEye[axis]!) as Vec3);
      return ['leftArm', 'rightArm'].includes(system.aimAt(playerEye, direction, FISTS_MELEE)?.region ?? '');
    });
    expect(target, 'find a torso voxel occluded by an arm').toBeDefined();
    const direction = normalized(target!.center.map((coordinate, axis) => coordinate - playerEye[axis]!) as Vec3);
    const before = { ...actor.regions };
    const aim = system.aimAt(playerEye, direction, FISTS_MELEE);
    expect(['leftArm', 'rightArm']).toContain(aim?.region);
    expect(system.swing(playerEye, direction, FISTS_MELEE)).toBe(id);
    expect(actor.regions[aim!.region]!).toBeLessThan(before[aim!.region]!);
    expect(actor.regions.torso).toBe(before.torso);
  });

  it('hits on both sides of every weapon reach edge', () => {
    const reaches = [...new Set(weapons.map(({ reach }) => reach))].sort((a, b) => a - b);
    expect(reaches.length).toBeGreaterThan(1);
    const delta = Math.min(...reaches.slice(1).map((reach, index) => reach - reaches[index]!)) / 2;
    const standing = poses[0]!;
    const seed = 1;

    for (const weapon of weapons) {
      const edge = PLAYER_ARM_REACH_M + weapon.reach;
      expect(swingAtReachDistance(seed, standing, weapon, edge - delta), `${weapon.name} just inside edge`).toBe(true);
      expect(swingAtReachDistance(seed, standing, weapon, edge + delta), `${weapon.name} just outside edge`).toBe(
        false,
      );
    }
  });
});
