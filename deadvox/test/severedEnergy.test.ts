import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { angularVelocity, type RigidBody } from '../src/core/rigidBody.ts';
import { makeScale } from '../src/core/scale.ts';
import { posedRegionHitDistance, posedShamblerRegionBoxes, type ZombieRegion } from '../src/core/zombieRegions.ts';
import { type HitImpulse, ZombieSystem } from '../src/core/zombies.ts';
import { PLAYER, physicsFor } from '../src/game/player.ts';
import { MobActorMeshes } from '../src/render/mobActors.ts';

const BLOCK = 0.5;
const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const SHAMBLER = registry.zombies.get('shambler')!;
const BAT = registry.items.get('baseball_bat')!.weapon!.melee!;
const HEALTHY_REGIONS = { head: 1000, torso: 1000, leftArm: 1000, rightArm: 1000, leftLeg: 1000, rightLeg: 1000 };
const senses = (isSolid: (x: number, y: number, z: number) => boolean) => ({
  isSolid,
  blockSize: BLOCK,
  physics: physicsFor(makeScale(BLOCK)),
  jumpSpeed: PLAYER.jump,
  player: () => ({
    pos: [100, 2, 100] as Vec3,
    facing: [0, 0, -1] as Vec3,
    movement: 'still' as const,
    lit: false,
    lightSeenFrom: 40,
  }),
  hour: () => 12,
  hurtPlayer: () => undefined,
});

type CutMode = 'region' | 'rolled' | 'head';
interface AppliedPoint {
  readonly body: RigidBody;
  readonly point: Vec3;
}
interface Harness {
  readonly id: number;
  readonly zombieSeed: number;
  readonly figureSeed: number;
  readonly system: ZombieSystem;
  readonly renderer: MobActorMeshes;
  readonly body: RigidBody | undefined;
  readonly originOffsetY: number;
  readonly appliedPoints: readonly AppliedPoint[];
  readonly initialEnergy: number;
  readonly launchOmega: number;
  readonly missedRandomPart: boolean;
  readonly severedPart: string;
  readonly targetRayHitsRegion: boolean;
  readonly swingHit: number | undefined;
  readonly touchedFloor: () => boolean;
  readonly resetFloorContact: () => void;
}

const kineticEnergy = (body: RigidBody): number => {
  const omega = angularVelocity(body);
  const spinEnergy = 0.5 * body.angularMomentum.reduce((sum, value, axis) => sum + value * omega[axis]!, 0);
  const linearEnergy = 0.5 * body.mass * body.velocity.reduce((sum, value) => sum + value * value, 0);
  return linearEnergy + spinEnergy;
};
const totalEnergy = (body: RigidBody, originOffsetY: number): number =>
  kineticEnergy(body) + body.mass * 9.8 * (body.center[1] + originOffsetY);
const rotated = (q: RigidBody['orientation'], v: Vec3): Vec3 => {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  return [
    (1 - 2 * (y * y + z * z)) * vx + 2 * (x * y - z * w) * vy + 2 * (x * z + y * w) * vz,
    2 * (x * y + z * w) * vx + (1 - 2 * (x * x + z * z)) * vy + 2 * (y * z - x * w) * vz,
    2 * (x * z - y * w) * vx + 2 * (y * z + x * w) * vy + (1 - 2 * (x * x + y * y)) * vz,
  ];
};
const impactPointIsInside = ({ body, point }: AppliedPoint): boolean => {
  const local = rotated(
    [-body.orientation[0], -body.orientation[1], -body.orientation[2], body.orientation[3]],
    [point[0] - body.center[0], point[1] - body.center[1], point[2] - body.center[2]],
  );
  const halfExtents = [0, 0, 0];
  for (const corner of body.corners) {
    for (let axis = 0; axis < 3; axis++) {
      halfExtents[axis] = Math.max(halfExtents[axis]!, Math.abs(corner[axis]!));
    }
  }
  return local.every((coordinate, axis) => Math.abs(coordinate) <= halfExtents[axis]! + 1e-9);
};

const zombieTypeForCut = (mode: CutMode) => {
  const regions = { ...SHAMBLER.regions };
  if (mode === 'rolled') {
    Object.assign(regions, HEALTHY_REGIONS);
  }
  if (mode === 'region') {
    regions.leftArm = 1;
  }
  if (mode === 'head') {
    regions.head = 1;
  }
  return {
    ...SHAMBLER,
    regions,
    dismember: { chance: mode === 'rolled' ? 1 : 0, headOnKillChance: mode === 'head' ? 1 : 0 },
  };
};
const targetForCut = (mode: CutMode): { region: ZombieRegion; bone: string; direction: Vec3; distanceM: number } => {
  switch (mode) {
    case 'rolled':
      return { region: 'torso', bone: 'chest', direction: [0, 0.2, -0.979_795_897_1], distanceM: 0.9 };
    case 'region':
      return { region: 'leftArm', bone: 'forearm.L', direction: [0, 0, -1], distanceM: 0.45 };
    case 'head':
      return { region: 'head', bone: 'head', direction: [0, 0, -1], distanceM: 0.45 };
    default:
      throw new Error(`Unknown cut mode: ${mode satisfies never}`);
  }
};

const createSeveredHit = (zombieSeed: number, mode: CutMode): Harness => {
  let touchedFloor = false;
  const isSolid = (_x: number, y: number, _z: number): boolean => {
    if (y !== -1) {
      return false;
    }
    touchedFloor = true;
    return true;
  };
  const renderer = new MobActorMeshes(BLOCK, 16);
  renderer.setWorld(isSolid, BLOCK);
  const appliedPoints: AppliedPoint[] = [];
  const instrumentedRenderer = renderer as unknown as {
    applyDebrisHit: (body: RigidBody, center: Vec3, originOffsetY: number, hit: HitImpulse) => Vec3;
  };
  const originalApplyDebrisHit = instrumentedRenderer.applyDebrisHit.bind(renderer);
  instrumentedRenderer.applyDebrisHit = (rigidBody, center, spawnOriginOffsetY, hit) => {
    const point = originalApplyDebrisHit(rigidBody, center, spawnOriginOffsetY, hit);
    appliedPoints.push({ body: rigidBody, point });
    return point;
  };
  const system = new ZombieSystem({
    ...senses(isSolid),
    seed: zombieSeed,
    onSever: (entityId, sourceZombie, severedPart, hit) =>
      renderer.zombieSevered(entityId, severedPart, hit, sourceZombie),
    onDeath: (entityId, sourceZombie) => renderer.zombieDied(entityId, sourceZombie),
  });
  const position: Vec3 = mode === 'rolled' ? [4, 1, 4] : [zombieSeed * 4, 2, 0];
  const id = system.add(zombieTypeForCut(mode), position, [0, 0, -1]);
  const zombie = system.store.get(id)!;
  renderer.sync(system.store, 0, 1);
  const beforeBoxes = posedShamblerRegionBoxes({
    seed: zombie.figureSeed,
    position: zombie.body.pos,
    facing: zombie.facing,
    headYaw: zombie.headYaw,
    gaitPhase: zombie.gaitPhase,
    speed: zombie.horizontalSpeed,
    chasing: false,
    attackWindup: 0,
    attackWindupSeconds: zombie.type.attack.windup,
    severed: [],
    blockSize: BLOCK,
  });
  const target = targetForCut(mode);
  const targetBox = beforeBoxes[target.region].find((box) => box.bone === target.bone)!;
  const rayDistanceBlocks = target.distanceM / BLOCK;
  const origin: Vec3 = [
    targetBox.center[0] - target.direction[0] * rayDistanceBlocks,
    targetBox.center[1] - target.direction[1] * rayDistanceBlocks,
    targetBox.center[2] - target.direction[2] * rayDistanceBlocks,
  ];
  const targetRayHitsRegion =
    posedRegionHitDistance(beforeBoxes[target.region], origin, target.direction, BLOCK) !== undefined;
  let part: string;
  let swingHit: number | undefined;
  if (mode === 'rolled') {
    swingHit = system.swing(origin, target.direction, BAT);
    part = zombie.severed[0] ?? '';
  } else {
    part = mode === 'region' ? 'upperArm.L' : 'head';
    const hit: HitImpulse = { point: targetBox.center, direction: target.direction, impulse: BAT.impulse! };
    renderer.zombieSevered(id, part, hit, zombie);
  }
  const partBox = Object.values(beforeBoxes)
    .flat()
    .find((box) => box.bone === part);
  const missedRandomPart =
    mode === 'rolled' &&
    partBox !== undefined &&
    posedRegionHitDistance([partBox], origin, target.direction, BLOCK) === undefined;
  const { debris } = renderer as unknown as { debris: Map<string, { body: RigidBody; originOffsetY: number }> };
  const [launch] = [...debris.values()];
  const body = launch?.body;
  const originOffsetY = launch?.originOffsetY ?? 0;
  return {
    id,
    zombieSeed,
    figureSeed: zombie.figureSeed,
    system,
    renderer,
    body,
    originOffsetY,
    appliedPoints,
    initialEnergy: body ? totalEnergy(body, originOffsetY) : 0,
    launchOmega: body ? Math.hypot(...angularVelocity(body)) : 0,
    missedRandomPart,
    severedPart: part,
    targetRayHitsRegion,
    swingHit,
    touchedFloor: () => touchedFloor,
    resetFloorContact: () => {
      touchedFloor = false;
    },
  };
};

const bounceApexesAndFreeFlightEnergyRise = (harness: Harness) => {
  const { body, renderer, system, originOffsetY } = harness;
  if (!body) {
    return { apexes: [], maxFreeFlightRise: 0, asleep: false, finalEnergy: 0 };
  }
  let previousEnergy = totalEnergy(body, originOffsetY);
  let previousContact = harness.touchedFloor();
  let [, previousVerticalSpeed] = body.velocity;
  let maxFreeFlightRise = 0;
  const apexes: number[] = [];
  for (let frame = 0; frame < 1200 && !body.asleep; frame++) {
    harness.resetFloorContact();
    renderer.sync(system.store, 1 / 120, 1);
    const energy = totalEnergy(body, originOffsetY);
    const lowestCornerY = body.center[1] + Math.min(...body.corners.map((corner) => corner[1]));
    const contact = harness.touchedFloor() || lowestCornerY <= 0.002;
    if (!(previousContact || contact)) {
      maxFreeFlightRise = Math.max(maxFreeFlightRise, energy - previousEnergy);
    }
    if (previousVerticalSpeed > 0 && body.velocity[1] <= 0) {
      apexes.push(body.center[1] + originOffsetY);
    }
    previousEnergy = energy;
    previousContact = contact;
    [, previousVerticalSpeed] = body.velocity;
  }
  return { apexes, maxFreeFlightRise, asleep: body.asleep, finalEnergy: totalEnergy(body, originOffsetY) };
};

describe('severed limb energy', () => {
  it('clamps application points inside region, random-roll, and head-cut debris', () => {
    const reports = [createSeveredHit(31, 'region'), createSeveredHit(37, 'rolled'), createSeveredHit(41, 'head')];
    try {
      for (const report of reports) {
        expect(report.appliedPoints).toHaveLength(1);
        expect(impactPointIsInside(report.appliedPoints[0]!)).toBe(true);
        expect(Math.hypot(...angularVelocity(report.body!))).toBeLessThanOrEqual(20.000_001);
      }
    } finally {
      for (const report of reports) {
        report.renderer.dispose();
      }
    }
  });

  it('caps real bat launches and dissipates each bounce across five zombie seeds', () => {
    const reports = [3, 11, 19, 23, 29].map((seed) => createSeveredHit(seed, 'rolled'));
    try {
      expect(reports.some(({ missedRandomPart }) => missedRandomPart)).toBe(true);
      for (const report of reports) {
        expect(report.targetRayHitsRegion).toBe(true);
        expect(report.swingHit).toBe(report.id);
        expect(report.body).toBeDefined();
        expect(Math.hypot(...angularVelocity(report.body!))).toBeLessThanOrEqual(20.000_001);
        expect(report.appliedPoints).toHaveLength(1);
        expect(impactPointIsInside(report.appliedPoints[0]!)).toBe(true);
        const result = bounceApexesAndFreeFlightEnergyRise(report);
        expect(result.maxFreeFlightRise).toBeLessThanOrEqual(report.initialEnergy * 0.005);
        expect(result.apexes.length, JSON.stringify({ seed: report.zombieSeed, ...result })).toBeGreaterThan(0);
        expect(
          result.apexes.every((height, index) => index === 0 || height < result.apexes[index - 1]!),
          JSON.stringify({ seed: report.zombieSeed, part: report.severedPart, apexes: result.apexes }),
        ).toBe(true);
        expect(result.asleep).toBe(true);
        expect(result.finalEnergy).toBeLessThan(report.initialEnergy);
      }
    } finally {
      for (const report of reports) {
        report.renderer.dispose();
      }
    }
  });
});
