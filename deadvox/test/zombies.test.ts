import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { InstancedMesh, Matrix4, MeshLambertMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { SECONDS_PER_DAY, SPAWN_TIMES } from '../src/core/clock.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { dayCycleFor, dayPhaseAt } from '../src/core/dayPhase.ts';
import { Hamlet } from '../src/core/hamlet.ts';
import { Inventory } from '../src/core/inventory.ts';
import { lightSenseSourceFor, sunExposedAt, toggleLight } from '../src/core/lights.ts';
import { type Body, bodyOverlapsBlock, stepBody } from '../src/core/physics.ts';
import { Rng } from '../src/core/random.ts';
import { raycast, type SolidAt } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import type { DoorLockDef } from '../src/core/schema.ts';
import { Simulation } from '../src/core/sim.ts';
import type { Site, ZombieSpawn } from '../src/core/site.ts';
import { sunDirection } from '../src/core/sky.ts';
import { gameTimeOfDay, simRate } from '../src/core/time.ts';
import { zombiePoseInputFor } from '../src/core/zombiePose.ts';
import {
  FIGURE_BOXES,
  FIGURE_PARTS,
  posedRegionHitDistance,
  posedShamblerRegionBoxes,
  ZOMBIE_REGION_NAMES,
  type ZombieRegion,
} from '../src/core/zombieRegions.ts';
import { ZombieSpawner } from '../src/core/zombieSpawns.ts';
import {
  ACTIVE_ZOMBIE_RADIUS_METRES,
  FISTS_MELEE,
  type HitImpulse,
  hearPlayer,
  hearVocalNoise,
  type PlayerSense,
  perceivePlayer,
  ZombieSystem,
} from '../src/core/zombies.ts';
import { createPlayerBody, PLAYER, physicsFor, steer } from '../src/game/player.ts';
import { MobActorMeshes, mobFigurePoolSizeThrough } from '../src/render/mobActors.ts';
import { ZombieMeshes } from '../src/render/zombies.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';

const BASE = 'src/content/base';
const SHAMBLER_CPU_BUDGET_MS = 1;
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const DAY_CYCLE = dayCycleFor(registry.dayCycle);
const dayStateAtHour = (hour: number) => dayPhaseAt(DAY_CYCLE, hour * 3600);
const SHAMBLER = registry.zombies.get('shambler')!;
const RUNNER = registry.zombies.get('runner')!;
const CRAWLER = registry.zombies.get('crawler')!;
const runtimeWeapon = <T extends { cooldownSimSeconds: number }>(weapon: T) => ({
  ...weapon,
  cooldown: weapon.cooldownSimSeconds,
});
const speedRates = (wander: number, chase: number) => ({
  wanderMetresPerSimSecond: simRate(wander),
  chaseMetresPerSimSecond: simRate(chase),
});
const SCALE = makeScale(0.5);
const BLOCK_SIZE = SCALE.blockSize;
const PHYSICS = physicsFor(SCALE);
const SENSE_TUNING = TEST_SENSE_TUNING;
const FLOOR: SolidAt = (_x, y) => y === 0;
// biome-ignore lint/complexity/useMaxParams: compact shared fixture maps independent player-sense fields.
const player = (
  pos: Vec3,
  facing: Vec3 = [-1, 0, 0],
  movement: PlayerSense['movement'] = 'still',
  lit = false,
  crouching = false,
): PlayerSense => ({ pos, facing, movement, lit, lightSeenFrom: 40, crouching });
const senses = (
  playerFn: () => PlayerSense,
  isSolid: SolidAt = FLOOR,
  hourFn: () => number = () => 12,
  hurtPlayer: (amount: number, area?: 'head' | 'torso' | 'legs', attacker?: number) => void = () => undefined,
) => ({
  player: playerFn,
  isSolid,
  isOpaque: isSolid,
  dayPhase: () => dayStateAtHour(hourFn()),
  blockSize: BLOCK_SIZE,
  physics: PHYSICS,
  jumpSpeed: PLAYER.jump,
  tuning: SENSE_TUNING,
  hurtPlayer,
});
const sensesWithLocalSun = (
  playerFn: () => PlayerSense,
  hour: number,
  isSunExposedAt: (position: Vec3, hour: number) => boolean,
) => ({ ...senses(playerFn, FLOOR, () => hour), isSunExposedAt: (position: Vec3) => isSunExposedAt(position, hour) });
const run = (system: ZombieSystem, seconds: number, onStep?: () => void) => {
  const frames = Math.ceil(seconds * 60);
  for (let frame = 0; frame < frames; frame++) {
    system.tick(1 / 60);
    onStep?.();
  }
};
const metres = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]) * BLOCK_SIZE;
const boxesOverlap = (a: Body, b: Body): boolean =>
  Math.abs(a.pos[0] - b.pos[0]) < a.halfWidth + b.halfWidth &&
  Math.abs(a.pos[2] - b.pos[2]) < a.halfWidth + b.halfWidth &&
  a.pos[1] < b.pos[1] + b.height &&
  a.pos[1] + a.height > b.pos[1];
const overlapDepthMetres = (a: Body, b: Body): number => {
  if (a.pos[1] >= b.pos[1] + b.height || b.pos[1] >= a.pos[1] + a.height) {
    return 0;
  }
  const overlapX = a.halfWidth + b.halfWidth - Math.abs(a.pos[0] - b.pos[0]);
  const overlapZ = a.halfWidth + b.halfWidth - Math.abs(a.pos[2] - b.pos[2]);
  return Math.max(0, Math.min(overlapX, overlapZ) * BLOCK_SIZE);
};
const normalized = (v: Vec3): Vec3 => {
  const magnitude = Math.hypot(...v);
  return magnitude ? [v[0] / magnitude, v[1] / magnitude, v[2] / magnitude] : [0, 0, 0];
};
const spawnSite = (spawn: ZombieSpawn): Site => ({
  surface: { height: (_x, _z, natural) => natural, top: () => undefined },
  spawn: { pos: [0, 0, 0], yaw: 0 },
  stamp: () => undefined,
  furnitureIn: () => [],
  zombiesIn: () => [spawn],
});
const nearestRegionDistance = (zombie: import('../src/core/zombies.ts').Zombie, origin: Vec3, direction: Vec3) => {
  let nearest = Number.POSITIVE_INFINITY;
  const posed = posedShamblerRegionBoxes(zombiePoseInputFor(zombie, 1, BLOCK_SIZE));
  for (const region of ZOMBIE_REGION_NAMES) {
    if (zombie.regions[region] <= 0) {
      continue;
    }
    const distance = posedRegionHitDistance(posed[region], origin, normalized(direction), BLOCK_SIZE);
    if (distance !== undefined) {
      nearest = Math.min(nearest, distance);
    }
  }
  return nearest;
};
const hitRecordMatches = ({
  hit,
  origin,
  direction,
  distance,
  impulse,
}: {
  hit: HitImpulse | undefined;
  origin: Vec3;
  direction: Vec3;
  distance: number;
  impulse: number;
}): boolean => {
  if (!hit) {
    return false;
  }
  const unitDirection = normalized(direction);
  const expectedPoint = origin.map((coordinate, axis) => coordinate + unitDirection[axis]! * distance);
  return (
    hit.point.every((coordinate, axis) => Math.abs(coordinate - expectedPoint[axis]!) < 1e-10) &&
    hit.direction.every((coordinate, axis) => coordinate === unitDirection[axis]) &&
    hit.impulse === impulse
  );
};
const regionRay = (zombie: import('../src/core/zombies.ts').Zombie, region: ZombieRegion) => {
  const posed = posedShamblerRegionBoxes(zombiePoseInputFor(zombie, 1, BLOCK_SIZE));
  const targetBone: Readonly<Record<ZombieRegion, string>> = {
    head: 'head',
    torso: 'chest',
    leftArm: 'forearm.L',
    rightArm: 'forearm.R',
    leftLeg: 'shin.L',
    rightLeg: 'shin.R',
  };
  const boxes = posed[region];
  const { center } = boxes.find((box) => box.bone === targetBone[region])!;
  const front = [-zombie.facing[0], 0, -zombie.facing[2]] as Vec3;
  if (region === 'head') {
    const origin: Vec3 = [
      center[0] + (front[0] * 0.75) / BLOCK_SIZE,
      center[1] + 1,
      center[2] + (front[2] * 0.75) / BLOCK_SIZE,
    ];
    return { origin, direction: normalized([center[0] - origin[0], center[1] - origin[1], center[2] - origin[2]]) };
  }
  return {
    origin: [center[0] + (front[0] * 0.45) / BLOCK_SIZE, center[1], center[2] + (front[2] * 0.45) / BLOCK_SIZE] as Vec3,
    direction: [-front[0], 0, -front[2]] as Vec3,
  };
};
const bodyHitsSolid = (body: Body, isSolid: SolidAt): boolean => {
  for (let y = Math.floor(body.pos[1]); y < Math.ceil(body.pos[1] + body.height); y++) {
    for (let z = Math.floor(body.pos[2] - body.halfWidth); z < Math.ceil(body.pos[2] + body.halfWidth); z++) {
      for (let x = Math.floor(body.pos[0] - body.halfWidth); x < Math.ceil(body.pos[0] + body.halfWidth); x++) {
        if (isSolid(x, y, z) && bodyOverlapsBlock(body, [x, y, z])) {
          return true;
        }
      }
    }
  }
  return false;
};
const stairTop = (z: number): number => {
  if (z >= 6) {
    return 4;
  }
  if (z >= 5) {
    return 3;
  }
  if (z >= 4) {
    return 2;
  }
  return 1;
};
const terrainUnder = (body: Body): number => {
  let top = 0;
  for (let z = Math.floor(body.pos[2] - body.halfWidth); z <= Math.floor(body.pos[2] + body.halfWidth); z++) {
    for (let x = Math.floor(body.pos[0] - body.halfWidth); x <= Math.floor(body.pos[0] + body.halfWidth); x++) {
      const overlapsColumn =
        body.pos[0] - body.halfWidth < x + 1 &&
        body.pos[0] + body.halfWidth > x &&
        body.pos[2] - body.halfWidth < z + 1 &&
        body.pos[2] + body.halfWidth > z;
      if (overlapsColumn) {
        top = Math.max(top, stairTop(z));
      }
    }
  }
  return top;
};
const bodyTerrainViolations = (body: Body, stairs: SolidAt): string[] => {
  const violations: string[] = [];
  if (bodyHitsSolid(body, stairs)) {
    violations.push(`solid intersection: ${body.pos}`);
  }
  if (body.onGround && Math.abs(body.pos[1] - terrainUnder(body)) > 0.01) {
    violations.push(`feet ${body.pos[1]} != terrain ${terrainUnder(body)} at ${body.pos}`);
  }
  return violations;
};
const stackedBodyViolations = (bodies: readonly Body[]): string[] => {
  const violations: string[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      const overlapsHorizontally =
        Math.abs(a.pos[0] - b.pos[0]) < a.halfWidth + b.halfWidth &&
        Math.abs(a.pos[2] - b.pos[2]) < a.halfWidth + b.halfWidth;
      if (overlapsHorizontally && a.pos[1] > b.pos[1] + b.height + 0.01) {
        violations.push(`body ${i} stacked on ${j}: ${a.pos} / ${b.pos}`);
      }
      if (overlapsHorizontally && b.pos[1] > a.pos[1] + a.height + 0.01) {
        violations.push(`body ${j} stacked on ${i}: ${b.pos} / ${a.pos}`);
      }
    }
  }
  return violations;
};
const terrainBodyViolations = (bodies: readonly Body[], stairs: SolidAt): string[] => [
  ...bodies.flatMap((body) => bodyTerrainViolations(body, stairs)),
  ...stackedBodyViolations(bodies),
];
const runChaserAtWall = (isSolid: SolidAt, seconds: number) => {
  const target = player([12, 1, 0], [-1, 0, 0]);
  const system = new ZombieSystem(senses(() => target, isSolid));
  const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
  const zombie = system.store.get(id)!;
  const states: { mode: string; verticalVelocity: number; onGround: boolean }[] = [];
  let clearOfSolid = true;
  for (let frame = 0; frame < seconds * 60; frame++) {
    system.tick(1 / 60);
    states.push({ mode: zombie.mode, verticalVelocity: zombie.body.vel[1], onGround: zombie.body.onGround });
    clearOfSolid &&= !bodyHitsSolid(zombie.body, isSolid);
  }
  return { states, clearOfSolid };
};
const standing = (position: Vec3, facing: Vec3 = [0, 0, -1]) => {
  const system = new ZombieSystem(senses(() => player([1000, 1, 1000])));
  const id = system.add(SHAMBLER, position, facing);
  const zombie = system.store.get(id)!;
  zombie.body.onGround = true;
  return { system, id, zombie };
};

/** The solid wall is real geometry; the doorway collision comes directly from BlockEntities. */
const makeDoorWorld = (lock?: DoorLockDef) => {
  const entities = new BlockEntities(registry);
  const door = entities.add({
    type: 'wood_door',
    pos: [4, 1, 0],
    size: [2, 4, 1],
    facing: 'n',
    ...(lock ? { lock } : {}),
  })!;
  const solid: SolidAt = (x, y, z) =>
    FLOOR(x, y, z) || ((x === 3 || x === 6) && z === 0 && y >= 1 && y <= 4) || entities.isSolid(x, y, z);
  return { entities, door, solid };
};

const instanceBox = (mesh: import('three').InstancedMesh, index = 0) => {
  const matrix = new Matrix4();
  mesh.getMatrixAt(index, matrix);
  const center = new Vector3().setFromMatrixPosition(matrix);
  const size = new Vector3(matrix.elements[0]!, matrix.elements[1]!, matrix.elements[2]!);
  // Use transformed corners instead of decomposing a rotated instance matrix.
  const points: Vector3[] = [];
  for (const x of [-0.5, 0.5]) {
    for (const y of [-0.5, 0.5]) {
      for (const z of [-0.5, 0.5]) {
        points.push(new Vector3(x, y, z).applyMatrix4(matrix));
      }
    }
  }
  return { center, size, points };
};

describe('melee hit sounds', () => {
  const emittedFor = (weapon: import('../src/core/zombies.ts').MeleeWeapon): { hit: boolean; events: string[] } => {
    const emitted: string[] = [];
    const system = new ZombieSystem({
      ...senses(() => player([100, 2, 0])),
      onSound: (event) => emitted.push(event),
    });
    const id = system.add({ ...SHAMBLER, dismember: { chance: 0, headOnKillChance: 0 } }, [1, 1, 0], [0, 0, -1]);
    const zombie = system.store.get(id)!;
    zombie.modeTimer = 1000;
    const ray = regionRay(zombie, 'torso');
    const hit = system.swing(ray.origin, ray.direction, weapon);
    return {
      hit: hit === id,
      events: emitted.filter((event) => event === 'melee_hit' || event === 'melee_hit_fist'),
    };
  };

  it('emits exactly one fist impact and no weapon impact for a fist hit', () => {
    const result = emittedFor(FISTS_MELEE);
    expect(result.hit).toBe(true);
    expect(result.events).toEqual(['melee_hit_fist']);
  });

  it('emits exactly one weapon impact and no fist impact for a weapon hit', () => {
    const result = emittedFor({ damage: 12, reach: 0.7, cooldown: 1, impulse: 5, type: 'blunt' });
    expect(result.hit).toBe(true);
    expect(result.events).toEqual(['melee_hit']);
  });
});

describe('shambler perception', () => {
  it('uses configured day/night/light/cone/ray bounds and movement hearing bounds', () => {
    // biome-ignore lint/complexity/useMaxParams: compact table-driven test inputs vary independent perception dimensions.
    const sees = (
      at: Vec3,
      hour: number,
      lit = false,
      wall: SolidAt = () => false,
      movement: PlayerSense['movement'] = 'still',
    ) =>
      perceivePlayer({
        zombie: SHAMBLER,
        from: [0, 2, 0],
        facing: [1, 0, 0],
        player: player(at, [-1, 0, 0], movement, lit),
        dayPhase: dayStateAtHour(hour).phase,
        sightBlend: dayStateAtHour(hour).sightBlend,
        blockSize: BLOCK_SIZE,
        isSolid: wall,
        tuning: SENSE_TUNING,
      });
    expect(sees([48, 2, 0], 12)).toBe(true);
    expect(sees([52, 2, 0], 12)).toBe(false);
    expect(sees([18, 2, 0], 23)).toBe(true);
    expect(sees([22, 2, 0], 23)).toBe(false);
    expect(sees([78, 2, 0], 23, true)).toBe(true);
    expect(sees([82, 2, 0], 23, true)).toBe(false);
    expect(sees([78, 2, 0], 23, false)).toBe(false);
    const atAngle = (degrees: number) => {
      const radians = (degrees * Math.PI) / 180;
      return sees([20 * Math.cos(radians), 2, 20 * Math.sin(radians)], 12);
    };
    expect(atAngle(50)).toBe(true);
    expect(atAngle(70)).toBe(false);
    expect(sees([10, 2, 0], 12, false, (x, y, z) => x === 4 && y === 4 && z === 0)).toBe(false);
    const opaque = (x: number, y: number, _z: number) => x === 4 && y === 4;
    const muffledHearingEdge = (movement: 'jog' | 'sprint') =>
      (SHAMBLER.hearingRange[movement] *
        SHAMBLER.hearing *
        SHAMBLER.hearingModel.farMultiplier *
        SENSE_TUNING.wall.hearingRangeScale) /
      BLOCK_SIZE;
    expect(sees([10, 2, 0], 12, false, opaque, 'jogging')).toBe(true);
    expect(sees([muffledHearingEdge('jog') - 1, 2, 0], 12, false, opaque, 'jogging')).toBe(true);
    expect(sees([muffledHearingEdge('jog') + 1, 2, 0], 12, false, opaque, 'jogging')).toBe(false);
    expect(sees([muffledHearingEdge('sprint') - 1, 2, 0], 12, false, opaque, 'sprinting')).toBe(true);
    expect(sees([muffledHearingEdge('sprint') + 1, 2, 0], 12, false, opaque, 'sprinting')).toBe(false);
    const hears = (at: Vec3, movement: PlayerSense['movement'], wall: SolidAt = () => false) =>
      perceivePlayer({
        zombie: { ...SHAMBLER, sight: 1, nightSight: 1 },
        from: [0, 2, 0],
        facing: [1, 0, 0],
        player: player(at, [-1, 0, 0], movement),
        dayPhase: dayStateAtHour(12).phase,
        sightBlend: dayStateAtHour(12).sightBlend,
        blockSize: BLOCK_SIZE,
        isSolid: wall,
        tuning: SENSE_TUNING,
      });
    expect(hears([5, 2, 0], 'walking')).toBe(true);
    expect(hears([7, 2, 0], 'walking')).toBe(true);
    const walkingFarEdge =
      (SHAMBLER.hearingRange.walk * SHAMBLER.hearing * SHAMBLER.hearingModel.farMultiplier) / BLOCK_SIZE;
    expect(hears([walkingFarEdge - 1, 2, 0], 'walking')).toBe(true);
    expect(hears([walkingFarEdge + 1, 2, 0], 'walking')).toBe(false);
    expect(hears([5, 2, 0], 'still')).toBe(false);
  });

  it('makes a moving crouching player harder to hear and see', () => {
    const from: Vec3 = [0, 2, 0];
    const perceives = ({
      distanceMetres,
      hour,
      crouching,
      movement,
      zombie = SHAMBLER,
    }: {
      distanceMetres: number;
      hour: number;
      crouching: boolean;
      movement: PlayerSense['movement'];
      zombie?: typeof SHAMBLER;
    }) =>
      perceivePlayer({
        zombie,
        from,
        facing: [1, 0, 0],
        player: player([distanceMetres / BLOCK_SIZE, 2, 0], [-1, 0, 0], movement, false, crouching),
        dayPhase: dayStateAtHour(hour).phase,
        sightBlend: dayStateAtHour(hour).sightBlend,
        blockSize: BLOCK_SIZE,
        isSolid: FLOOR,
        tuning: SENSE_TUNING,
      });
    const sightDistance = (SHAMBLER.sight * (1 + SENSE_TUNING.crouch.sightRangeScale)) / 2;
    const hearingDistance =
      (SHAMBLER.hearingRange.walk *
        SHAMBLER.hearing *
        SHAMBLER.hearingModel.farMultiplier *
        (1 + SENSE_TUNING.crouch.hearingRangeScale)) /
      2;

    expect(perceives({ distanceMetres: sightDistance, hour: 12, crouching: false, movement: 'still' })).toBe(true);
    expect(perceives({ distanceMetres: sightDistance, hour: 12, crouching: true, movement: 'still' })).toBe(false);
    const hearingOnly = { ...SHAMBLER, sight: 0.01, nightSight: 0.01 };
    expect(
      perceives({
        distanceMetres: hearingDistance,
        hour: 12,
        crouching: false,
        movement: 'walking',
        zombie: hearingOnly,
      }),
    ).toBe(true);
    expect(
      perceives({
        distanceMetres: hearingDistance,
        hour: 12,
        crouching: true,
        movement: 'walking',
        zombie: hearingOnly,
      }),
    ).toBe(false);
  });

  it('uses local daylight exposure for carried-light and lure gates', () => {
    const source = player([0, 0, 0], [-1, 0, 0], 'still', true);
    const baseline = Math.max(SHAMBLER.sight, SHAMBLER.nightSight);
    const distanceMetres = (baseline + source.lightSeenFrom) / 2;
    const playerVisible = (hour: number, sunlit: boolean) =>
      perceivePlayer({
        zombie: SHAMBLER,
        from: [0, 0, 0],
        facing: [1, 0, 0],
        player: { ...source, pos: [distanceMetres / BLOCK_SIZE, 0, 0] },
        dayPhase: dayStateAtHour(hour).phase,
        sightBlend: dayStateAtHour(hour).sightBlend,
        blockSize: BLOCK_SIZE,
        isSolid: FLOOR,
        isSunExposedAt: () => sunlit,
        tuning: SENSE_TUNING,
      });
    expect(playerVisible(12, true)).toBe(false);
    expect(playerVisible(12, false)).toBe(true);
    expect(playerVisible(0, false)).toBe(true);

    const target: Vec3 = [5 / BLOCK_SIZE, 1, 0];
    const lureAt = (hour: number, sunlit: boolean) => {
      const sensed = (): PlayerSense => ({
        ...player([100, 1, 100]),
        lightSources: [{ pos: target, seenFrom: 20, carried: false }],
      });
      const system = new ZombieSystem(sensesWithLocalSun(sensed, hour, () => sunlit));
      const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
      system.tick(1 / 60);
      return system.store.get(id)!.mode;
    };
    const carriedAt = (hour: number, sunlit: boolean) => {
      const sensed = (): PlayerSense => ({
        ...player([100, 1, 100]),
        lightSources: [{ pos: target, seenFrom: 20, carried: true }],
      });
      const system = new ZombieSystem(sensesWithLocalSun(sensed, hour, () => sunlit));
      const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
      system.tick(1 / 60);
      return system.store.get(id)!.mode;
    };
    expect(lureAt(12, true)).toBe('idle');
    expect(lureAt(12, false)).toBe('investigate');
    expect(lureAt(0, false)).toBe('investigate');
    expect(carriedAt(12, true)).toBe('idle');
    expect(carriedAt(12, false)).toBe('investigate');
    expect(carriedAt(0, false)).toBe('investigate');

    const wallShadow: SolidAt = (_x, y, z) => y >= 0 && z === -1;
    const daylightSky = (position: Vec3, hour: number) =>
      sunExposedAt({ position, gameHours: hour, skyTop: 20, isOpaque: wallShadow });
    const sunlitSample: Vec3 = [0.5, 1.15, 0.5];
    expect(
      raycast([sunlitSample[0], sunlitSample[1] + 1e-4, sunlitSample[2]], sunDirection(12), 20, wallShadow),
    ).toBeDefined();
    expect(daylightSky(sunlitSample, 12)).toBe(true);

    const shadowPlayer = perceivePlayer({
      zombie: SHAMBLER,
      from: [0, 0, 0],
      facing: [1, 0, 0],
      player: {
        ...source,
        pos: [distanceMetres / BLOCK_SIZE, 0, 0],
        sunlit: daylightSky([distanceMetres / BLOCK_SIZE, 1.3 / BLOCK_SIZE, 0], 12),
      },
      dayPhase: dayStateAtHour(12).phase,
      sightBlend: dayStateAtHour(12).sightBlend,
      blockSize: BLOCK_SIZE,
      isSolid: FLOOR,
      isSunExposedAt: (position) => daylightSky(position, 12),
      tuning: SENSE_TUNING,
    });
    expect(shadowPlayer).toBe(false);

    const shadowLurePlayer = (): PlayerSense => ({
      ...player([100, 1, 100]),
      lightSources: [{ pos: target, seenFrom: 20, carried: false }],
    });
    const shadowLure = new ZombieSystem(sensesWithLocalSun(shadowLurePlayer, 12, daylightSky));
    const shadowLureId = shadowLure.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    shadowLure.tick(1 / 60);
    expect(shadowLure.store.get(shadowLureId)!.mode).toBe('idle');
  });

  it('keeps crouched light reach in the open but lets a half-wall block the lowered light', () => {
    const { lightSeenFrom } = player([0, 0, 0], [-1, 0, 0], 'still', true);
    const crouchSightRange = lightSeenFrom * SENSE_TUNING.crouch.sightRangeScale;
    const distanceMetres = (crouchSightRange + lightSeenFrom) / 2;
    const distanceBlocks = distanceMetres / BLOCK_SIZE;
    const crouchedEye = PLAYER.eye - SENSE_TUNING.crouch.eyeDropMetres;
    const wallFraction = (1.3 - 0.9) / (1.3 - crouchedEye);
    const wallX = Math.floor(distanceBlocks * wallFraction);
    const isSolid: SolidAt = (x, y) => x === wallX && y >= 0 && y < 2;
    const visible = (crouching: boolean, blocked: boolean) => {
      const eyeHeightMetres = PLAYER.eye - (crouching ? SENSE_TUNING.crouch.eyeDropMetres : 0);
      return perceivePlayer({
        zombie: { ...SHAMBLER, sight: 0.1, nightSight: 0.1 },
        from: [0, 0, 0],
        facing: [1, 0, 0],
        player: {
          ...player([distanceBlocks, 0, 0], [-1, 0, 0], 'still', true, crouching),
          eyeHeightMetres,
          lightHeightMetres: eyeHeightMetres,
        },
        dayPhase: dayStateAtHour(0).phase,
        sightBlend: dayStateAtHour(0).sightBlend,
        blockSize: BLOCK_SIZE,
        isSolid: blocked ? isSolid : () => false,
        tuning: SENSE_TUNING,
      });
    };
    const lowRay: Vec3 = [distanceBlocks, crouchedEye - 1.3, 0];
    expect(raycast([0, 1.3, 0], normalized(lowRay), Math.hypot(...lowRay), isSolid)).toBeDefined();
    expect(distanceMetres).toBeGreaterThan(crouchSightRange);
    expect(distanceMetres).toBeLessThan(lightSeenFrom);
    expect(visible(true, false)).toBe(true);
    expect(visible(false, true)).toBe(true);
    expect(visible(true, true)).toBe(false);
  });
});

describe('shambler scenarios', () => {
  it('beelines to visible lights using the existing investigation target and respects occlusion', () => {
    const sourceRange = 20;
    const targetDistanceMetres = (sourceRange * SENSE_TUNING.light.lureRangeScale) / 2;
    const target: Vec3 = [targetDistanceMetres / BLOCK_SIZE, 1, 0];
    const sensedPlayer = (): PlayerSense => ({
      ...player([100, 1, 100]),
      lightSources: [{ pos: target, seenFrom: sourceRange, carried: false }],
    });
    const open = new ZombieSystem(senses(sensedPlayer, FLOOR, () => 0));
    const id = open.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    open.tick(1 / 60);
    const zombie = open.store.get(id)!;
    expect(zombie.mode).toBe('investigate');
    expect(zombie.lastPerceived).toEqual(target);
    const startingDistance = metres(zombie.body.pos, target);
    run(open, 1);
    expect(metres(zombie.body.pos, target)).toBeLessThan(startingDistance);

    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === Math.floor(target[0] / 2) && y > 0 && y < 4);
    const blocked = new ZombieSystem(senses(sensedPlayer, wall, () => 0));
    const blockedId = blocked.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    blocked.tick(1 / 60);
    expect(blocked.store.get(blockedId)!.mode).toBe('idle');
  });

  it('keeps a dropped light hidden behind a one-block wall while the same light in the open lures', () => {
    const lureMode = (behindWall: boolean): string => {
      const inventory = new Inventory(registry);
      const glowstick = inventory.create('glowstick');
      expect(toggleLight(registry, glowstick, 0)).toBeUndefined();
      expect(inventory.add(glowstick, { kind: 'pile', pos: [7, 1, 0] })).toBe(true);
      const entry = [...inventory.items()].find(({ item }) => item === glowstick)!;
      const source = lightSenseSourceFor({
        registry,
        item: glowstick,
        location: entry.location,
        path: entry.path,
        playerPosition: [100, 1, 100],
        eyeHeightMetres: 1.3,
      });
      if (!source) {
        throw new Error('Dropped glowstick did not create a sense source');
      }
      const sensedPlayer = (): PlayerSense => ({ ...player([100, 1, 100]), lightSources: [source] });
      const isOpaque: SolidAt = (x, y, z) => FLOOR(x, y, z) || (behindWall && x === 6 && y === 1 && z === 0);
      const system = new ZombieSystem({ ...senses(sensedPlayer, isOpaque, () => 0), isOpaque });
      const id = system.add(SHAMBLER, [3.05, 1, 0.5], [1, 0, 0]);
      system.tick(1 / 60);
      return system.store.get(id)!.mode;
    };

    expect(lureMode(false)).toBe('investigate');
    expect(lureMode(true)).toBe('idle');
  });

  it('lets a visible lure complete one search and return without repeating its alert', () => {
    const sourceRange = 20;
    const distanceMetres = (sourceRange * SENSE_TUNING.light.lureRangeScale) / 2;
    const target: Vec3 = [distanceMetres / BLOCK_SIZE, 1, 0];
    const sensed = (): PlayerSense => ({
      ...player([100, 1, 100]),
      lightSources: [{ pos: target, seenFrom: sourceRange, carried: false }],
    });
    const alerts: string[] = [];
    const system = new ZombieSystem({
      ...senses(sensed, FLOOR, () => 0),
      onSound: (event) => {
        if (event === 'shambler_alert') {
          alerts.push(event);
        }
      },
    });
    const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    system.tick(1 / 60);
    let investigating = zombie.mode === 'investigate';
    let investigationEntries = Number(investigating);
    const observed = new Set([zombie.mode]);
    const maxSearch = SHAMBLER.hearingModel.searchSimSeconds.max;
    const roundTripSeconds = (distanceMetres / SHAMBLER.speed.wanderMetresPerSimSecond) * 2;
    const frames = Math.ceil((maxSearch + roundTripSeconds + 10) * 60);
    for (let frame = 1; frame <= frames; frame++) {
      system.tick(1 / 60, frame / 60);
      observed.add(zombie.mode);
      if (zombie.mode === 'investigate' && !investigating) {
        investigationEntries += 1;
      }
      investigating = zombie.mode === 'investigate';
    }

    expect(observed).toContain('search');
    expect(observed).toContain('return');
    expect(investigationEntries).toBe(1);
    expect(alerts).toHaveLength(1);
    expect(zombie.mode).not.toBe('investigate');
  });

  it('alerts when a searching shambler spots the player', () => {
    let sensed: PlayerSense = {
      ...player([100, 1, 100]),
      vocalNoise: { id: 1, pos: [20, 1, 0], radiusMetres: 30, expiresAt: 1 },
    };
    const alerts: string[] = [];
    const type = { ...SHAMBLER, sight: 8, nightSight: 0.01 };
    const system = new ZombieSystem({
      ...senses(
        () => sensed,
        FLOOR,
        () => 12,
      ),
      seed: 113,
      onSound: (event) => {
        if (event === 'shambler_alert') {
          alerts.push(event);
        }
      },
    });
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    system.tick(1 / 20, 0.05);
    expect(zombie.mode).toBe('investigate');

    sensed = player([100, 1, 100]);
    for (let tick = 0; tick < 500 && zombie.mode !== 'search'; tick++) {
      system.tick(1 / 20, 0.1 + tick / 20);
    }
    expect(zombie.mode).toBe('search');
    alerts.length = 0;
    const { facing } = zombie;
    sensed = player(
      [zombie.body.pos[0] + facing[0] * 5, zombie.body.pos[1], zombie.body.pos[2] + facing[2] * 5],
      [-facing[0], 0, -facing[2]],
    );
    system.tick(1 / 20, 30);

    expect(zombie.mode).toBe('chase');
    expect(alerts).toEqual(['shambler_alert']);
  });

  it('chooses a near heard player over a visible light lure', () => {
    const noiseTarget: Vec3 = [4, 1, 0];
    const lightTarget: Vec3 = [8, 1, 0];
    const sensed = (): PlayerSense => ({
      ...player([100, 1, 100]),
      vocalNoise: { id: 1, pos: noiseTarget, radiusMetres: 10, expiresAt: 1 },
      lightSources: [{ pos: lightTarget, seenFrom: 20, carried: false }],
    });
    const system = new ZombieSystem(senses(sensed, FLOOR, () => 0));
    const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);

    system.tick(1 / 60);

    expect(system.store.get(id)!.lastPerceived).toEqual(noiseTarget);
  });

  it('refuses to close a real door on the player or a shambler, then closes with a 1 m clearance', () => {
    const { entities, door } = makeDoorWorld();
    const body = (pos: Vec3) => ({ pos, vel: [0, 0, 0] as Vec3, halfWidth: 0.56, height: 3.4, onGround: true });
    const playerBody = body([5, 1, 0]);
    const safePlayer = body([10, 1, 10]);
    const inDoor = body([5, 1, 0.3]);
    const oneMetreAway = body([5, 1, 3.56]);

    entities.setOpen(door, true);
    expect(entities.closeDoor(door, playerBody, [])).toBe('player');
    expect(door.open).toBe(true);

    expect(entities.closeDoor(door, safePlayer, [inDoor])).toBe('other');
    expect(door.open).toBe(true);

    expect(entities.bodyIntersects(door, oneMetreAway)).toBe(false);
    expect(entities.closeDoor(door, safePlayer, [oneMetreAway])).toBeUndefined();
    expect(door.open).toBe(false);
  });

  it('A: reaches the player through a real open wood_door entity within 20 seconds', () => {
    const { entities, door, solid } = makeDoorWorld();
    entities.setOpen(door, true);
    const target = [5, 1, -6] as Vec3;
    const system = new ZombieSystem(senses(() => player(target, [0, 0, 1]), solid));
    const id = system.add(SHAMBLER, [5, 1, 6], [0, 0, -1]);
    run(system, 20);
    expect(metres(system.store.get(id)!.body.pos, target)).toBeLessThanOrEqual(1.2);
  });

  it('routes three close-spaced shamblers through an open real door with no body jams', () => {
    const { entities, door, solid } = makeDoorWorld();
    entities.setOpen(door, true);
    const playerBody = createPlayerBody(SCALE, 5, 1, -6);
    playerBody.onGround = true;
    const target = { ...player([5, 1, -6], [0, 0, 1]), body: playerBody };
    const system = new ZombieSystem(senses(() => target, solid));
    const ids = [
      system.add(SHAMBLER, [5, 1, 4], [0, 0, -1]),
      system.add(SHAMBLER, [5, 1, 5], [0, 0, -1]),
      system.add(SHAMBLER, [5, 1, 6], [0, 0, -1]),
    ];
    for (let tick = 0; tick < 20 * 20; tick++) {
      system.tick(1 / 20);
      for (const id of ids) {
        const zombie = system.store.get(id)!;
        expect(bodyHitsSolid(zombie.body, solid)).toBe(false);
        expect(boxesOverlap(zombie.body, playerBody)).toBe(false);
      }
    }
    expect(
      ids.every((id) => system.store.get(id)!.body.pos[2] < -2),
      ids.map((id) => `${system.store.get(id)!.mode}:${system.store.get(id)!.body.pos}`).join('; '),
    ).toBe(true);
  });

  it('B: hears the sprinting player but does not breach a closed locked door', () => {
    const { entities, door, solid: doorWorldSolid } = makeDoorWorld({ id: 'test_shed', locked: true });
    const solid: SolidAt = (x, y, z) => doorWorldSolid(x, y, z) || (z === 0 && y >= 1 && y <= 4 && (x < 4 || x > 5));
    entities.setOpen(door, false);
    const target = [5, 1, -0.56] as Vec3;
    let damage = 0;
    let firstMinuteDamage: number | undefined;
    let frames = 0;
    const system = new ZombieSystem(
      senses(
        () => player(target, [0, 0, 1], 'sprinting'),
        solid,
        () => 12,
        (amount) => {
          damage += amount;
        },
      ),
    );
    const id = system.add(SHAMBLER, [5, 1, 6], [0, 0, -1]);
    const positions: Vec3[] = [];
    let awareFrames = 0;
    run(system, 120, () => {
      const zombie = system.store.get(id)!;
      positions.push([...zombie.body.pos]);
      expect(entities.bodyIntersects(door, zombie.body)).toBe(false);
      if (zombie.mode === 'chase' || zombie.mode === 'investigate') {
        awareFrames += 1;
      }
      frames += 1;
      if (frames === 60 * 60) {
        firstMinuteDamage = damage;
      }
    });
    expect(awareFrames).toBeGreaterThan(120 * 60 * 0.9);
    expect(firstMinuteDamage).toBe(0);
    expect(damage).toBe(0);
    expect(positions.every((position) => position[2] > 1)).toBe(true);
  });

  it('still hits through a real open wood_door with a clear chest ray', () => {
    const { entities, door, solid } = makeDoorWorld();
    entities.setOpen(door, true);
    let damage = 0;
    const system = new ZombieSystem(
      senses(
        () => player([5, 1, -0.56]),
        solid,
        () => 12,
        (amount) => {
          damage += amount;
        },
      ),
    );
    system.add(SHAMBLER, [5, 1, 1.56], [0, 0, -1]);
    run(system, SHAMBLER.attack.windupSimSeconds + 0.1);
    expect(damage).toBe(8);
  });

  it('C: reaches the last-perceived point, loses sight, then returns within 3 m in 120 seconds', () => {
    let target = player([10, 1, 0], [1, 0, 0]);
    let wallOn = false;
    const wall: SolidAt = (x, y) => FLOOR(x, y, 0) || (wallOn && x === 12 && y >= 1 && y <= 5);
    const system = new ZombieSystem(senses(() => target, wall));
    const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    system.tick(1 / 60);
    expect(system.store.get(id)!.mode).toBe('chase');
    const lastSeen = [...system.store.get(id)!.lastPerceived!] as Vec3;
    target = player([24, 1, 0], [1, 0, 0]);
    wallOn = true;
    let reached = false;
    for (let frame = 0; frame < 60 * 40; frame++) {
      system.tick(1 / 60);
      if (metres(system.store.get(id)!.body.pos, lastSeen) <= 1) {
        reached = true;
        break;
      }
    }
    expect(reached).toBe(true);
    run(system, 15);
    expect(system.store.get(id)!.mode).not.toBe('chase');
    const chaser = system.store.get(id)!;
    let closestHome = metres(chaser.body.pos, chaser.home);
    for (let frame = 0; frame < 120 * 60; frame++) {
      system.tick(1 / 60);
      closestHome = Math.min(closestHome, metres(chaser.body.pos, chaser.home));
    }
    expect(closestHome).toBeLessThanOrEqual(3);
    expect(metres(chaser.body.pos, chaser.home)).toBeLessThanOrEqual(12.5);
  });

  it('does not start a search at the projection of a sound on another floor', () => {
    const target = player([0, 3, 0], [0, 0, 1], 'sprinting');
    const system = new ZombieSystem({
      ...senses(() => target),
      isOpaque: () => false,
      terrainFloor: () => 1,
    });
    const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    system.tick(1 / 20);
    expect(zombie.mode).toBe('investigate');
    expect(zombie.lastPerceived).toEqual(target.pos);
    expect(zombie.searchAnchor).toBeUndefined();
  });

  it('beelines directly toward an attention target across open ground', () => {
    const type = {
      ...SHAMBLER,
      chaseMotion: { ...SHAMBLER.chaseMotion, swayDegrees: 0, speedMultiplier: { min: 1, max: 1 } },
    };
    const system = new ZombieSystem(senses(() => player([20, 1, 0], [-1, 0, 0])));
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    run(system, 1);
    expect(zombie.mode).toBe('chase');
    expect(zombie.body.pos[0]).toBeGreaterThan(0);
    expect(Math.abs(zombie.body.pos[2])).toBeLessThan(0.1);
  });

  it('slides along an angled wall while a distant target keeps the shambler moving', () => {
    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 5 && y >= 1 && y <= 5);
    const type = {
      ...SHAMBLER,
      speed: { ...SHAMBLER.speed, chaseMetresPerSimSecond: simRate(2) },
      hearingRange: { ...SHAMBLER.hearingRange, sprint: 1000 },
      chaseMotion: { ...SHAMBLER.chaseMotion, swayDegrees: 0, speedMultiplier: { min: 1, max: 1 } },
    };
    const system = new ZombieSystem({
      ...senses(() => player([20, 1, 10], [-1, 0, 0], 'sprinting'), wall),
      isOpaque: () => false,
    });
    const id = system.add(type, [0, 1, 0], [1, 0, 1]);
    const zombie = system.store.get(id)!;
    let alongWall = false;
    for (let tick = 0; tick < 4 * 60; tick++) {
      system.tick(1 / 60);
      if (tick > 20 && zombie.mode === 'chase' && metres(zombie.body.pos, [20, 1, 10]) > type.attack.reach) {
        expect(Math.hypot(zombie.body.vel[0], zombie.body.vel[2])).toBeGreaterThan(0);
      }
      alongWall ||= zombie.body.pos[2] * BLOCK_SIZE > 0.5;
      expect(bodyHitsSolid(zombie.body, wall)).toBe(false);
    }
    expect(alongWall).toBe(true);
    expect(zombie.body.pos[0]).toBeLessThan(5);
  });

  it('keeps moving into a wall head-on with zero chase sway', () => {
    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 4 && y >= 1 && y <= 5);
    const type = {
      ...SHAMBLER,
      speed: { ...SHAMBLER.speed, chaseMetresPerSimSecond: simRate(2) },
      hearingRange: { ...SHAMBLER.hearingRange, sprint: 1000 },
      wander: { ...SHAMBLER.wander, obstacleWanderChance: 0 },
      chaseMotion: {
        ...SHAMBLER.chaseMotion,
        swayDegrees: 0,
        speedMultiplier: { min: 1, max: 1 },
        stumbleChancePerSimSecond: simRate(0),
      },
    };
    for (const seed of [1, 2, 3, 7, 23]) {
      const target = [30, 1, 0] as Vec3;
      const system = new ZombieSystem({
        ...senses(() => player(target, [-1, 0, 0], 'sprinting'), wall),
        isOpaque: () => false,
        seed,
      });
      const id = system.add(type, [0, 1, 0], [1, 0, 0]);
      const zombie = system.store.get(id)!;
      let hitWall = false;
      let checkedPostContactMovement = false;
      for (let tick = 0; tick < 5 * 60; tick++) {
        const wasAtWall = hitWall;
        const before = [...zombie.body.pos] as Vec3;
        system.tick(1 / 60);
        if (wasAtWall && zombie.mode === 'chase' && metres(zombie.body.pos, target) > type.attack.reach) {
          checkedPostContactMovement = true;
          expect(metres(before, zombie.body.pos)).toBeGreaterThan(0.005);
        }
        hitWall ||= zombie.obstacleContact;
        expect(bodyHitsSolid(zombie.body, wall)).toBe(false);
      }
      expect(hitWall).toBe(true);
      expect(checkedPostContactMovement).toBe(true);
    }
  });

  it('does not wander through repeated obstacle contacts while its target stays visible', () => {
    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 4 && y >= 1 && y <= 5 && z >= -2 && z <= 2);
    const target: Vec3 = [30, 1, 0];
    const type = {
      ...SHAMBLER,
      sight: 100,
      sightCone: 180,
      wander: { ...SHAMBLER.wander, obstacleWanderChance: 1 },
      hearingRange: { ...SHAMBLER.hearingRange, sprint: 1000 },
      chaseMotion: { ...SHAMBLER.chaseMotion, swayDegrees: 0, stumbleChancePerSimSecond: simRate(0) },
    };
    for (const seed of [1, 7, 23]) {
      const system = new ZombieSystem({
        ...senses(() => player(target, [-1, 0, 0], 'sprinting'), wall),
        isOpaque: () => false,
        seed,
      });
      const id = system.add(type, [0, 1, 0], [1, 0, 0]);
      const zombie = system.store.get(id)!;
      let sawObstacleContact = false;
      for (let tick = 0; tick < 5 * 60; tick++) {
        system.tick(1 / 60);
        sawObstacleContact ||= zombie.obstacleContact;
        expect(zombie.obstacleWanderRemaining).toBe(0);
      }
      expect(sawObstacleContact).toBe(true);
      expect(zombie.mode).toBe('chase');
    }
  });

  it('still wanders at an obstacle when the same target is unseen', () => {
    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 4 && y >= 1 && y <= 5 && z >= -2 && z <= 2);
    const type = {
      ...SHAMBLER,
      sight: 1,
      nightSight: 1,
      wander: { ...SHAMBLER.wander, obstacleWanderChance: 1 },
      hearingRange: { ...SHAMBLER.hearingRange, sprint: 1000 },
      chaseMotion: { ...SHAMBLER.chaseMotion, swayDegrees: 0, stumbleChancePerSimSecond: simRate(0) },
    };
    const system = new ZombieSystem({
      ...senses(() => player([30, 1, 0], [-1, 0, 0], 'sprinting'), wall),
      isOpaque: () => false,
    });
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    let beganWandering = false;
    for (let tick = 0; tick < 5 * 60 && !beganWandering; tick++) {
      system.tick(1 / 60);
      beganWandering = zombie.obstacleWanderRemaining > 0;
    }
    expect(zombie.mode).toBe('investigate');
    expect(beganWandering).toBe(true);
  });

  it('ends an active wander when its target enters sight', () => {
    let target = player([300, 1, 0], [-1, 0, 0], 'sprinting');
    const type = {
      ...SHAMBLER,
      sight: 100,
      sightCone: 180,
      hearingRange: { ...SHAMBLER.hearingRange, sprint: 1000 },
    };
    const system = new ZombieSystem({
      ...senses(() => target),
      isOpaque: () => false,
    });
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    zombie.obstacleWanderHeading = [0, 0, 1];
    zombie.obstacleWanderRemaining = 3;
    zombie.mode = 'investigate';
    zombie.investigationTier = 'near';
    zombie.lastPerceived = [...target.pos];
    target = player([30, 1, 0], [-1, 0, 0], 'sprinting');

    system.tick(1 / 60);

    expect(zombie.mode).toBe('chase');
    expect(zombie.obstacleWanderRemaining).toBe(0);
    expect(zombie.obstacleWanderHeading).toBeUndefined();
  });

  it('wanders a distance set by type in an open direction, then resumes pursuit', () => {
    const obstacle: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 4 && y >= 1 && y <= 5 && z >= -2 && z <= 2);
    const target: Vec3 = [300, 1, 0];
    const type = {
      ...SHAMBLER,
      speed: { ...SHAMBLER.speed, chaseMetresPerSimSecond: simRate(2) },
      wander: { ...SHAMBLER.wander, obstacleWanderChance: 1 },
      sight: 1,
      nightSight: 1,
      hearingRange: { ...SHAMBLER.hearingRange, sprint: 1000 },
      chaseMotion: {
        ...SHAMBLER.chaseMotion,
        swayDegrees: 0,
        speedMultiplier: { min: 1, max: 1 },
        stumbleChancePerSimSecond: simRate(0),
      },
    };
    const system = new ZombieSystem({
      ...senses(() => player(target, [-1, 0, 0], 'sprinting'), obstacle),
      isOpaque: () => false,
    });
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    let wanderStart: Vec3 | undefined;
    let wanderingHeading: Vec3 | undefined;
    let furthestWanderDistance = 0;
    let xAtWanderEnd: number | undefined;
    for (let tick = 0; tick < 30 * 60; tick++) {
      system.tick(1 / 60);
      expect(bodyHitsSolid(zombie.body, obstacle)).toBe(false);
      if (zombie.obstacleWanderRemaining > 0) {
        wanderStart ??= [...zombie.body.pos];
        wanderingHeading ??= zombie.obstacleWanderHeading;
        furthestWanderDistance = Math.max(furthestWanderDistance, metres(zombie.body.pos, wanderStart));
      } else if (wanderStart) {
        xAtWanderEnd ??= zombie.body.pos[0];
      }
    }
    expect(wanderStart).toBeDefined();
    expect(wanderingHeading).toBeDefined();
    expect(furthestWanderDistance).toBeGreaterThan(0);
    expect(xAtWanderEnd).toBeDefined();
    expect(zombie.body.pos[0]).toBeGreaterThan(xAtWanderEnd!);
    expect(zombie.obstacleWanderRemaining).toBe(0);
    expect(zombie.mode).toBe('investigate');
    expect(zombie.lastPerceived).toEqual(target);
  });

  it('ends a blocked obstacle wander and resumes its attention target', () => {
    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 4 && y >= 1 && y <= 5);
    const type = {
      ...SHAMBLER,
      sight: 1,
      nightSight: 1,
      wander: { ...SHAMBLER.wander, obstacleWanderChance: 0 },
      hearingRange: { ...SHAMBLER.hearingRange, sprint: 1000 },
    };
    const system = new ZombieSystem({
      ...senses(() => player([300, 1, 0], [-1, 0, 0], 'sprinting'), wall),
      isOpaque: () => false,
    });
    const id = system.add(type, [2.8, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    zombie.obstacleWanderHeading = [1, 0, 0];
    zombie.obstacleWanderRemaining = 3;
    zombie.horizontalSpeed = type.speed.chaseMetresPerSimSecond;
    let endedAtBlockedContact = false;
    let resumedMotion = false;
    for (let tick = 0; tick < 20; tick++) {
      const wasWandering = zombie.obstacleWanderRemaining > 0;
      const before = [...zombie.body.pos] as Vec3;
      system.tick(1 / 60);
      const travelled = metres(before, zombie.body.pos);
      endedAtBlockedContact ||=
        wasWandering && zombie.obstacleWanderRemaining === 0 && zombie.obstacleContact && travelled < 0.01;
      resumedMotion ||= endedAtBlockedContact && zombie.obstacleWanderRemaining === 0 && travelled > 0.01;
    }
    expect(endedAtBlockedContact).toBe(true);
    expect(resumedMotion).toBe(true);
    expect(zombie.mode).toBe('investigate');
    expect(zombie.lastPerceived).toEqual([300, 1, 0]);
    expect(zombie.obstacleWanderRemaining).toBe(0);
  });

  it('jumps a low obstacle and keeps beelining past it', () => {
    const obstacle: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 6 && y === 1);
    const system = new ZombieSystem(senses(() => player([24, 1, 0], [-1, 0, 0]), obstacle));
    const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    let airborne = false;
    run(system, 8, () => {
      expect(bodyHitsSolid(zombie.body, obstacle)).toBe(false);
      airborne ||= !zombie.body.onGround && zombie.body.pos[0] > 4;
    });
    expect(airborne).toBe(true);
    expect(zombie.body.pos[0]).toBeGreaterThan(6.5);
  });

  it('does not jump forever at a 2 m wall with a see-through window at eye height', () => {
    const windowWall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 6 && y >= 1 && y <= 4 && y !== 3);
    const result = runChaserAtWall(windowWall, 30);
    expect(result.states.every((state) => state.verticalVelocity <= 0)).toBe(true);
    expect(result.states.slice(1).every((state) => state.onGround)).toBe(true);
    expect(result.clearOfSolid).toBe(true);
  });

  it('does not jump a 1 m wall when a low ceiling leaves too little headroom', () => {
    const lowCeiling: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 6 && (y === 1 || y === 2 || y === 5));
    const result = runChaserAtWall(lowCeiling, 5);
    expect(result.states.every((state) => state.verticalVelocity <= 0)).toBe(true);
    expect(result.states.slice(1).every((state) => state.onGround)).toBe(true);
    expect(result.clearOfSolid).toBe(true);
  });

  it('stops a walking player at a standing shambler without stepping onto its body', () => {
    const { zombie } = standing([2, 1, 0]);
    zombie.body.onGround = true;
    const playerBody = createPlayerBody(SCALE, 0, 1, 0);
    playerBody.onGround = true;
    const obstacles = [zombie.body];
    for (let frame = 0; frame < 3 * 60; frame++) {
      steer(playerBody, SCALE, 0, {
        forward: 0,
        right: 1,
        jump: false,
        sprint: false,
        walk: false,
      });
      stepBody(playerBody, 1 / 60, FLOOR, { ...PHYSICS, obstacles });
      expect(boxesOverlap(playerBody, zombie.body)).toBe(false);
    }
    const gap = (zombie.body.pos[0] - zombie.body.halfWidth - playerBody.pos[0] - playerBody.halfWidth) * BLOCK_SIZE;
    expect(gap).toBeGreaterThanOrEqual(-0.001);
    expect(gap).toBeLessThanOrEqual(0.05);
    expect(playerBody.pos[1]).toBeCloseTo(1, 3);
  });

  it('smooths a grounded shambler step in simulation-owned pose state', () => {
    const stair: SolidAt = (_x, y, z) => y === 0 || (z >= 3 && y === 1);
    const system = new ZombieSystem(senses(() => player([0, 2, 10], [0, 0, -1]), stair));
    const id = system.add(SHAMBLER, [0, 1, 2.2], [0, 0, 1]);
    const zombie = system.store.get(id)!;
    let maximumOffset = 0;
    for (let tick = 0; tick < 120; tick++) {
      system.tick(1 / 60);
      maximumOffset = Math.max(maximumOffset, Math.abs(zombie.stepOffset ?? 0));
    }
    expect(zombie.body.pos[1]).toBeGreaterThan(1);
    expect(maximumOffset).toBeGreaterThan(0.4);
    expect(zombie.stepOffset).toBe(0);
  });

  it('does not separate a player standing two metres above a shambler footprint', () => {
    const platform: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 0 && y === 4 && z === 0);
    const playerBody = createPlayerBody(SCALE, 0.5, 5, 0.5);
    playerBody.onGround = true;
    const target = () => ({ ...player(playerBody.pos), body: playerBody });
    const stillShambler = { ...SHAMBLER, speed: speedRates(0, 0) };
    const system = new ZombieSystem(senses(target, platform));
    const id = system.add(stillShambler, [0.5, 1, 0.5]);
    system.store.get(id)!.body.onGround = true;
    const start = [...playerBody.pos] as Vec3;

    for (let tick = 0; tick < 60; tick++) {
      system.tick(1 / 20);
    }

    expect(playerBody.pos[0]).toBeCloseTo(start[0], 6);
    expect(playerBody.pos[2]).toBeCloseTo(start[2], 6);
  });

  it('does not separate overlapping shambler footprints when one stands two metres above the other', () => {
    const ledge: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 0 && y === 4 && z === 0);
    const stillShambler = { ...SHAMBLER, speed: speedRates(0, 0) };
    const system = new ZombieSystem(senses(() => player([100, 1, 100]), ledge));
    const lowerId = system.add(stillShambler, [0.5, 1, 0.5]);
    const upperId = system.add(stillShambler, [0.5, 5, 0.5]);
    const lower = system.store.get(lowerId)!.body;
    const upper = system.store.get(upperId)!.body;
    lower.onGround = true;
    upper.onGround = true;
    const lowerStart = [...lower.pos] as Vec3;
    const upperStart = [...upper.pos] as Vec3;

    for (let tick = 0; tick < 60; tick++) {
      system.tick(1 / 20);
    }

    expect(lower.pos[0]).toBeCloseTo(lowerStart[0], 6);
    expect(lower.pos[2]).toBeCloseTo(lowerStart[2], 6);
    expect(upper.pos[0]).toBeCloseTo(upperStart[0], 6);
    expect(upper.pos[2]).toBeCloseTo(upperStart[2], 6);
  });

  it('resolves an existing player/shambler overlap softly beside a wall', () => {
    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 5 && z === 0 && y >= 1 && y <= 5);
    const playerBody = createPlayerBody(SCALE, 4, 5, 0);
    const target = () => ({ ...player(playerBody.pos, [1, 0, 0]), body: playerBody });
    const system = new ZombieSystem(senses(target, wall));
    const stillShambler = { ...SHAMBLER, speed: speedRates(0, 0) };
    const id = system.add(stillShambler, [3.4, 1, 0]);
    const zombieBody = system.store.get(id)!.body;
    zombieBody.onGround = true;
    for (let frame = 0; frame < 120; frame++) {
      stepBody(playerBody, 1 / 60, wall, { ...PHYSICS, obstacles: [zombieBody] });
    }
    expect(playerBody.onGround).toBe(true);
    expect(boxesOverlap(playerBody, zombieBody)).toBe(true);
    const wallGap = (5 - playerBody.pos[0] - playerBody.halfWidth) * BLOCK_SIZE;
    expect(wallGap).toBeGreaterThanOrEqual(0);
    expect(wallGap).toBeLessThanOrEqual(0.3);

    const dt = 1 / 20;
    const walk = (right: -1 | 1) => {
      for (let tick = 0; tick < 3 * 20; tick++) {
        const playerBefore = [...playerBody.pos] as Vec3;
        const zombieBefore = [...zombieBody.pos] as Vec3;
        system.tick(dt);
        steer(playerBody, SCALE, 0, {
          forward: 0,
          right,
          jump: false,
          sprint: false,
          walk: true,
        });
        stepBody(playerBody, dt, wall, { ...PHYSICS, obstacles: [zombieBody] });
        expect(bodyHitsSolid(playerBody, wall)).toBe(false);
        expect(bodyHitsSolid(zombieBody, wall)).toBe(false);
        expect(metres(playerBefore, playerBody.pos)).toBeLessThanOrEqual(PLAYER.walk * dt + dt + 0.001);
        expect(metres(zombieBefore, zombieBody.pos)).toBeLessThanOrEqual(dt + 0.001);
        if (right === 1 && tick >= 2 * 20) {
          expect(boxesOverlap(playerBody, zombieBody)).toBe(false);
        }
      }
    };
    walk(1);
    walk(-1);
  });

  it('lets a chaser attack a player against a wall without overlapping either box', () => {
    const playerBody = createPlayerBody(SCALE, 0.4, 1, 0);
    playerBody.onGround = true;
    const target = { ...player([0.4, 1, 0]), body: playerBody };
    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 1 && y >= 1 && y <= 5);
    expect(bodyHitsSolid(playerBody, wall)).toBe(false);
    let hits = 0;
    const system = new ZombieSystem(
      senses(
        () => target,
        wall,
        () => 12,
        () => {
          hits += 1;
        },
      ),
    );
    const id = system.add(SHAMBLER, [-5, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    run(system, 3, () => expect(boxesOverlap(playerBody, zombie.body)).toBe(false));
    expect(zombie.mode).toBe('chase');
    expect(hits).toBeGreaterThan(0);
  });

  it('separates five shamblers converging for 10 s without terrain intersections', () => {
    const playerBody = createPlayerBody(SCALE, 0, 1, 0);
    const target = { ...player([0, 1, 0]), body: playerBody };
    const system = new ZombieSystem(senses(() => target));
    const starts: Vec3[] = [
      [4, 1, 0],
      [6, 1, 0],
      [8, 1, 0],
      [10, 1, 0],
      [12, 1, 0],
    ];
    for (const start of starts) {
      system.add(SHAMBLER, start, [-1, 0, 0]);
    }
    for (let tick = 0; tick < 10 * 20; tick++) {
      system.tick(1 / 20);
      for (const [, zombie] of system.store.entries()) {
        expect(bodyHitsSolid(zombie.body, FLOOR)).toBe(false);
        expect(boxesOverlap(playerBody, zombie.body), `${tick} ${zombie.body.pos}`).toBe(false);
      }
    }
    const finalBodies = [...system.store.entries()].map(([, zombie]) => zombie.body);
    for (let i = 0; i < finalBodies.length; i++) {
      for (let j = i + 1; j < finalBodies.length; j++) {
        expect(
          overlapDepthMetres(finalBodies[i]!, finalBodies[j]!),
          `${i}/${j}: ${finalBodies[i]!.pos} vs ${finalBodies[j]!.pos}`,
        ).toBeLessThanOrEqual(0.05);
      }
    }
  });

  it('keeps bodies supported while attention leads across un-authored terrain steps', () => {
    const stairs: SolidAt = (_x, y, z) => y < stairTop(z);
    const target = [0.25, 1, 0] as Vec3;
    const system = new ZombieSystem(senses(() => player(target, [0, 0, 1], 'sprinting'), stairs));
    const ids = [
      system.add(SHAMBLER, [-Math.SQRT1_2, 4, 8 - Math.SQRT1_2]),
      system.add(SHAMBLER, [Math.SQRT1_2, 4, 8 - Math.SQRT1_2]),
      system.add(SHAMBLER, [-Math.SQRT1_2, 4, 8 + Math.SQRT1_2]),
      system.add(SHAMBLER, [Math.SQRT1_2, 4, 8 + Math.SQRT1_2]),
    ];
    const bodies = ids.map((id) => system.store.get(id)!.body);
    for (let tick = 0; tick < 20 * 20; tick++) {
      system.tick(1 / 20);
      for (const id of ids) {
        expect(['chase', 'investigate', 'search', 'return']).toContain(system.store.get(id)!.mode);
      }
      expect(terrainBodyViolations(bodies, stairs), `tick ${tick}`).toEqual([]);
    }
  });

  it('pushes two overlapping shamblers apart in a one-metre corridor without wall intersections', () => {
    const corridor: SolidAt = (x, y, z) => FLOOR(x, y, z) || (y >= 1 && (x === 0 || x === 3));
    const stillShambler = { ...SHAMBLER, speed: speedRates(0, 0) };
    const system = new ZombieSystem(senses(() => player([1000, 1, 1000]), corridor));
    const first = system.store.get(system.add(stillShambler, [2, 1, 2]))!;
    const second = system.store.get(system.add(stillShambler, [2, 1, 2]))!;
    system.tick(1 / 20);
    expect(Math.abs(first.body.pos[0] - 2) * BLOCK_SIZE).toBeCloseTo(0.05, 5);
    expect(Math.abs(second.body.pos[0] - 2) * BLOCK_SIZE).toBeCloseTo(0.05, 5);
    for (let tick = 1; tick < 10 * 20; tick++) {
      system.tick(1 / 20);
      for (const [, zombie] of system.store.entries()) {
        expect(bodyHitsSolid(zombie.body, corridor)).toBe(false);
      }
    }
    expect(first.body.pos[0]).toBeLessThan(2);
    expect(second.body.pos[0]).toBeGreaterThan(2);
  });

  it('includes a shambler 1.08 m ahead in the melee broad phase', () => {
    const system = new ZombieSystem(senses(() => player([0, 1, 0], [1, 0, 0])));
    const id = system.add(SHAMBLER, [1.08 / BLOCK_SIZE, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    zombie.figureSeed = 1;
    const origin: Vec3 = [0, 1 + PLAYER.eye / BLOCK_SIZE, 0];
    const head = posedShamblerRegionBoxes({
      seed: zombie.figureSeed,
      position: zombie.body.pos,
      facing: zombie.facing,
      headYaw: zombie.headYaw,
      gaitPhase: zombie.gaitPhase,
      speed: zombie.horizontalSpeed,
      chasing: false,
      attackWindup: 0,
      attackWindupSeconds: zombie.type.attack.windupSimSeconds,
      severed: zombie.severed,
      blockSize: BLOCK_SIZE,
    }).head.find((box) => box.bone === 'head')!;
    const direction = normalized([head.center[0] - origin[0], head.center[1] - origin[1], head.center[2] - origin[2]]);
    expect(system.swing(origin, direction, { damage: 1, reach: 2, cooldown: 0 })).toBe(id);
  });

  it('reports the actual damage and final head/torso outcomes from each melee swing', () => {
    const results: unknown[] = [];
    const headKill = {
      ...SHAMBLER,
      regions: { ...SHAMBLER.regions, head: FISTS_MELEE.damage },
      dismember: { chance: 1, headOnKillChance: 1 },
    };
    const headSystem = new ZombieSystem({
      ...senses(() => player([100, 2, 0])),
      onMeleeResult: (result) => results.push(result),
    });
    const headId = headSystem.add(headKill, [1, 1, 0], [0, 0, -1]);
    const headZombie = headSystem.store.get(headId)!;
    const headRay = regionRay(headZombie, 'head');
    expect(headSystem.swing(headRay.origin, headRay.direction, FISTS_MELEE)).toBe(headId);
    expect(results.pop()).toMatchObject({
      id: headId,
      region: 'head',
      damage: FISTS_MELEE.damage,
      healthBefore: FISTS_MELEE.damage,
      healthAfter: 0,
      outcome: 'decapitated',
      part: 'head',
    });

    const torsoKill = {
      ...SHAMBLER,
      regions: { ...SHAMBLER.regions, torso: FISTS_MELEE.damage },
      dismember: { chance: 0, headOnKillChance: 0 },
    };
    const torsoSystem = new ZombieSystem({
      ...senses(() => player([100, 2, 0])),
      onMeleeResult: (result) => results.push(result),
    });
    const torsoId = torsoSystem.add(torsoKill, [1, 1, 0], [0, 0, -1]);
    const torsoZombie = torsoSystem.store.get(torsoId)!;
    const torsoRay = regionRay(torsoZombie, 'torso');
    expect(torsoSystem.swing(torsoRay.origin, torsoRay.direction, FISTS_MELEE)).toBe(torsoId);
    expect(results.pop()).toMatchObject({
      id: torsoId,
      region: 'torso',
      damage: FISTS_MELEE.damage,
      healthBefore: FISTS_MELEE.damage,
      healthAfter: 0,
      outcome: 'incapacitated',
    });
  });

  it('aims at each rigid body region deterministically and damages the first one hit', () => {
    for (const region of ZOMBIE_REGION_NAMES) {
      const makeSystem = () => new ZombieSystem({ ...senses(() => player([100, 2, 0])), seed: 91 });
      const system = makeSystem();
      const replay = makeSystem();
      const id = system.add(SHAMBLER, [1, 1, 0], [0, 0, -1]);
      const replayId = replay.add(SHAMBLER, [1, 1, 0], [0, 0, -1]);
      const zombie = system.store.get(id)!;
      const before = { ...zombie.regions };
      const { origin, direction } = regionRay(zombie, region);
      const replayRay = regionRay(replay.store.get(replayId)!, region);
      expect(system.swing(origin, direction, FISTS_MELEE)).toBe(id);
      expect(replay.swing(replayRay.origin, replayRay.direction, FISTS_MELEE)).toBe(replayId);
      expect(zombie.regions[region]).toBe(before[region] - FISTS_MELEE.damage);
      for (const other of ZOMBIE_REGION_NAMES) {
        if (other !== region) {
          expect(zombie.regions[other]).toBe(before[other]);
        }
      }
      expect(system.snapshotState()).toEqual(replay.snapshotState());
    }
  });

  it('severs every non-head region without killing; destroying the head alone kills', () => {
    for (const region of ZOMBIE_REGION_NAMES) {
      const severed: ZombieRegion[] = [];
      const sounds: string[] = [];
      let deaths = 0;
      const system = new ZombieSystem({
        ...senses(() => player([100, 2, 0])),
        onSound: (event) => sounds.push(event),
        onSevered: (_zombie, part) => severed.push(part),
        onDeath: () => {
          deaths += 1;
        },
      });
      const noRandomSever = { ...SHAMBLER, dismember: { chance: 0, headOnKillChance: 0 } };
      const id = system.add(noRandomSever, [1, 1, 0], [0, 0, -1]);
      const zombie = system.store.get(id)!;
      zombie.modeTimer = 1000;
      const ray = regionRay(zombie, region);
      const weapon = { ...FISTS_MELEE, cooldown: 0 };
      const hits = Math.ceil(zombie.regions[region] / weapon.damage);
      for (let hit = 0; hit < hits; hit++) {
        expect(system.swing(ray.origin, ray.direction, weapon), `swing while damaging ${region}, hit ${hit}`).toBe(id);
      }
      if (region === 'head') {
        expect(system.store.get(id)).toBeUndefined();
        expect(deaths).toBe(1);
        expect(severed).toEqual([]);
      } else {
        expect(system.store.get(id)).toBe(zombie);
        expect(zombie.regions[region], `region ${region}`).toBe(0);
        if (region === 'torso') {
          expect(severed).toEqual([]);
          expect(zombie.incapacitated).toBe(true);
        } else {
          expect(severed).toEqual([region]);
          expect(zombie.incapacitated).toBe(false);
        }
        expect(sounds).toContain('shambler_hurt');
        expect(deaths).toBe(0);
      }
    }
  });

  it('incapacitates on torso destruction without death, noise, motion, or sleep blocking, and saves the flag', () => {
    let incapacitations = 0;
    let deaths = 0;
    let playerHits = 0;
    let sawAttackWindup = false;
    const emitted: string[] = [];
    const type = {
      ...SHAMBLER,
      regions: { ...SHAMBLER.regions, torso: FISTS_MELEE.damage },
      dismember: { chance: 0, headOnKillChance: 1 },
    };
    const options = {
      ...senses(
        () => player([1, 1, 0.5]),
        FLOOR,
        () => 12,
        () => {
          playerHits += 1;
        },
      ),
      onSound: (event: string) => emitted.push(event),
      onIncapacitated: () => {
        incapacitations += 1;
      },
      onDeath: () => {
        deaths += 1;
      },
      onSevered: (_zombie: unknown, _region: ZombieRegion) => {
        throw new Error('torso must not drop an item');
      },
    };
    const system = new ZombieSystem(options);
    const id = system.add(type, [1, 1, 0], [0, 0, -1]);
    const zombie = system.store.get(id)!;
    zombie.mode = 'chase';
    expect(system.unsafeReason([1, 1, 0.5])).toBe('A shambler is close');
    const start: Vec3 = [...zombie.body.pos];
    const { mode } = zombie;
    const behaviorRng = zombie.behaviorRng.state();
    const ray = regionRay(zombie, 'torso');
    expect(system.swing(ray.origin, ray.direction, FISTS_MELEE)).toBe(id);
    expect(zombie.incapacitated).toBe(true);
    expect(system.store.get(id)).toBe(zombie);
    expect(incapacitations).toBe(1);
    expect(deaths).toBe(0);
    expect(zombie.severed).toEqual([]);
    expect(emitted).toContain('shambler_hurt');
    const soundsAfterHit = emitted.length;
    run(system, 10, () => {
      if (zombie.attackWindup > 0) {
        sawAttackWindup = true;
      }
    });
    expect(metres(start, zombie.body.pos)).toBeLessThan(0.01);
    expect(zombie.attackWindup).toBe(0);
    expect(sawAttackWindup).toBe(false);
    expect(playerHits).toBe(0);
    expect(zombie.mode).toBe(mode);
    expect(zombie.behaviorRng.state()).toEqual(behaviorRng);
    expect(emitted).toHaveLength(soundsAfterHit);
    expect(system.unsafeReason([1, 1, 0.5])).toBeUndefined();

    const restored = new ZombieSystem(options);
    restored.restoreState(system.snapshotState(), (restoreId) => (restoreId === type.id ? type : undefined));
    expect(restored.store.get(id)?.incapacitated).toBe(true);
    expect(restored.store.get(id)?.figureSeed).toBe(zombie.figureSeed);
  });

  it('runner closes a beeline faster than a shambler', () => {
    const pursue = (type: typeof SHAMBLER) => {
      const system = new ZombieSystem(senses(() => player([20, 1, 0])));
      const id = system.add(type, [0, 1, 0], [1, 0, 0]);
      run(system, 2);
      return system.store.get(id)!;
    };
    const shambler = pursue(SHAMBLER);
    const runner = pursue(RUNNER);
    expect(shambler.mode).toBe('chase');
    expect(runner.mode).toBe('chase');
    expect(runner.body.pos[0]).toBeGreaterThan(shambler.body.pos[0]);
    expect(runner.body.pos[0]).toBeGreaterThan(Math.abs(runner.body.pos[2]));
  });

  it('crawler attacks wear the player legs region and identify their attacker', () => {
    const hitAreas: ('head' | 'torso' | 'legs')[] = [];
    const attackers: number[] = [];
    const system = new ZombieSystem(
      senses(
        () => player([1.5, 1, 0]),
        FLOOR,
        () => 12,
        (_damage, area, attacker) => {
          hitAreas.push(area ?? 'torso');
          if (attacker !== undefined) {
            attackers.push(attacker);
          }
        },
      ),
    );
    system.add(CRAWLER, [0, 1, 0], [1, 0, 0]);
    run(system, 2);
    expect(hitAreas).toContain('legs');
    expect(attackers.some((id) => system.store.get(id)?.type.name === CRAWLER.name)).toBe(true);
  });

  it('runner and crawler identity, body and movement state survive zombie restore', () => {
    const source = new ZombieSystem({ ...senses(() => player([20, 1, 0])), seed: 0x4_92 });
    source.add(RUNNER, [0, 1, 0], [1, 0, 0]);
    source.add(CRAWLER, [0, 1, 2], [1, 0, 0]);
    run(source, 0.5);
    const snapshot = source.snapshotState();
    expect(snapshot.zombies).toHaveLength(2);
    expect(snapshot.zombies.map(({ zombie }) => zombie.type).sort()).toEqual(['crawler', 'runner']);
    const expected = new Map(
      snapshot.zombies.map(({ id, zombie }) => [
        id,
        {
          type: zombie.type,
          figureSeed: zombie.figureSeed,
          mode: zombie.mode,
          body: zombie.body,
          gaitPhase: zombie.gaitPhase,
        },
      ]),
    );
    const restored = new ZombieSystem(senses(() => player([20, 1, 0])));
    restored.restoreState(snapshot, (id) => registry.zombies.get(id));
    expect(restored.store.size).toBe(2);
    for (const [id, zombie] of restored.store.entries()) {
      expect({
        type: zombie.type.id,
        figureSeed: zombie.figureSeed,
        mode: zombie.mode,
        body: zombie.body,
        gaitPhase: zombie.gaitPhase,
      }).toEqual(expected.get(id));
    }
  });

  it('preserves every zombie figure seed in a snapshot/restore round trip', () => {
    const system = new ZombieSystem({ ...senses(() => player([100, 2, 0])), seed: 0x7_13 });
    for (let i = 0; i < 8; i++) {
      system.add(SHAMBLER, [i * 2, 1, 0], [0, 0, -1]);
    }
    const expected = [...system.store.entries()].map(([id, zombie]) => [id, zombie.figureSeed]);
    const restored = new ZombieSystem(senses(() => player([100, 2, 0])));
    restored.restoreState(system.snapshotState(), (id) => registry.zombies.get(id));
    expect([...restored.store.entries()].map(([id, zombie]) => [id, zombie.figureSeed])).toEqual(expected);
  });

  it('cannot walk after both legs are severed', () => {
    const walking = { ...SHAMBLER, speed: speedRates(0.8, 0.8) };
    const system = new ZombieSystem(senses(() => player([100, 2, 0])));
    const id = system.add(walking, [4, 1, 4]);
    const zombie = system.store.get(id)!;
    zombie.regions.leftLeg = 0;
    zombie.regions.rightLeg = 0;
    zombie.body.onGround = true;
    for (let tick = 0; tick < 10 * 20; tick++) {
      system.tick(1 / 20);
    }
    expect(zombie.body.pos[0]).toBe(4);
    expect(zombie.body.pos[2]).toBe(4);
    expect(zombie.horizontalSpeed).toBe(0);
  });

  it('F: melee hits obey cooldown, exact damage and range; fists and real crowbar data kill shamblers', () => {
    let elapsed = 0;
    const hitTimes: number[] = [];
    const system = new ZombieSystem(
      senses(
        () => player([0, 2, 0]),
        FLOOR,
        () => 12,
        (damage) => {
          expect(damage).toBe(8);
          hitTimes.push(elapsed);
        },
      ),
    );
    system.add(SHAMBLER, [1.2, 1, 0], [-1, 0, 0]);
    for (let frame = 0; frame < 600; frame++) {
      system.tick(1 / 60);
      elapsed += 1 / 60;
    }
    expect(hitTimes.length).toBeLessThanOrEqual(7);
    expect(hitTimes.length).toBeGreaterThan(0);
    expect(hitTimes.every((time, index) => index === 0 || time - hitTimes[index - 1]! >= 1.5)).toBe(true);

    let outsideDamage = 0;
    const stillTarget = player([0, 2, 0]);
    const noChase = { ...SHAMBLER, speed: { ...SHAMBLER.speed, chaseMetresPerSimSecond: simRate(0) } };
    const outside = new ZombieSystem(
      senses(
        () => stillTarget,
        FLOOR,
        () => 12,
        (damage) => {
          outsideDamage += damage;
        },
      ),
    );
    outside.add(noChase, [2.6, 1, 0], [-1, 0, 0]);
    run(outside, 10);
    expect(outsideDamage).toBe(0);

    const stationary = { ...SHAMBLER, speed: speedRates(0, 0) };
    const fistSystem = new ZombieSystem(senses(() => player([100, 2, 0])));
    const fistId = fistSystem.add(stationary, [0.5, 1, 0]);
    let deathDrops = 0;
    // Recreate with a death callback to assert the production drop hook runs.

    const fists = new ZombieSystem({
      ...senses(() => player([100, 2, 0])),
      onDeath: () => {
        deathDrops += 1;
      },
    });
    const fistsId = fists.add(stationary, [0.5, 1, 0]);
    for (let swing = 0; swing < 8; swing++) {
      const target = fists.store.get(fistsId)!;
      const ray = regionRay(target, 'head');
      expect(fists.swing(ray.origin, ray.direction, FISTS_MELEE)).toBe(fistsId);
      run(fists, FISTS_MELEE.cooldown);
    }
    expect(fists.store.get(fistsId)).toBeUndefined();
    expect(deathDrops).toBe(1);
    const fistTarget = fistSystem.store.get(fistId)!;
    const fistRay = regionRay(fistTarget, 'head');
    expect(fistSystem.swing(fistRay.origin, fistRay.direction, FISTS_MELEE)).toBe(fistId);

    const crowbar = runtimeWeapon(registry.items.get('crowbar')!.weapon!.melee!);
    const armed = new ZombieSystem(senses(() => player([100, 2, 0])));
    const armedId = armed.add(stationary, [1, 1, 0]);
    let swings = 0;
    while (armed.store.get(armedId)) {
      const target = armed.store.get(armedId)!;
      const ray = regionRay(target, 'head');
      expect(armed.swing(ray.origin, ray.direction, crowbar)).toBe(armedId);
      run(armed, crowbar.cooldown);
      swings += 1;
    }
    expect(swings).toBe(5);
    expect(
      ['crowbar', 'hammer', 'kitchen_knife', 'baseball_bat', 'steel_pipe'].every(
        (item) => registry.items.get(item)?.weapon?.melee,
      ),
    ).toBe(true);
  });

  it('god mode blocks shambler damage without stopping attacks or their cooldown', () => {
    const simulateAttacks = (godMode: boolean) => {
      const sim = new Simulation({ seed: 9, bodyTuning: registry.body.get('player')! });
      sim.godMode = godMode;
      let hits = 0;
      const system = new ZombieSystem(
        senses(
          () => player([0, 2, 0]),
          FLOOR,
          () => 12,
          (damage) => {
            hits += 1;
            sim.hurt(damage, 'a shambler');
          },
        ),
      );
      system.add(SHAMBLER, [1.2, 1, 0], [-1, 0, 0]);
      for (let frame = 0; frame < 60 * 60; frame++) {
        system.tick(1 / 60);
        sim.frame(1 / 60);
      }
      return { health: sim.body.health, hits };
    };
    const protectedRun = simulateAttacks(true);
    const ordinaryRun = simulateAttacks(false);
    expect(protectedRun.health).toBe(100);
    expect(protectedRun.hits).toBeGreaterThan(0);
    expect(protectedRun.hits).toBe(ordinaryRun.hits);
    expect(ordinaryRun.health).toBeLessThan(100);
  });

  it('loads the hamlet horde once with its group membership intact', () => {
    const site = new Hamlet(7, registry, SCALE);
    let column: [number, number] | undefined;
    for (let cz = -20; cz <= 20 && !column; cz++) {
      for (let cx = -20; cx <= 20 && !column; cx++) {
        if (site.hordesIn(cx, cz).length > 0) {
          column = [cx, cz];
        }
      }
    }
    expect(column).toBeDefined();
    const spawner = new ZombieSpawner();
    const system = new ZombieSystem(senses(() => player([1000, 2, 1000])));
    spawner.onColumn({ cx: column![0], cz: column![1], site, registry, zombies: system });
    const state = system.snapshotState();
    const id = state.hordes[0]?.id;
    expect(id).toBeDefined();
    expect([...system.store.entries()].some(([, zombie]) => zombie.hordeId === id)).toBe(true);
    const { size } = system.store;
    spawner.onColumn({ cx: column![0], cz: column![1], site, registry, zombies: system });
    expect(system.store.size).toBe(size);
    expect(system.snapshotState()).toEqual(state);
  });

  it('G: a killed hamlet shambler stays gone when its column reloads', () => {
    const site = new Hamlet(7, registry, SCALE);
    let column: [number, number] | undefined;
    for (let cz = -20; cz <= 20 && !column; cz++) {
      for (let cx = -20; cx <= 20 && !column; cx++) {
        if (site.zombiesIn(cx, cz).length > 0) {
          column = [cx, cz];
        }
      }
    }
    expect(column).toBeDefined();
    const spawner = new ZombieSpawner();
    const system = new ZombieSystem(senses(() => player([1000, 2, 1000])));
    spawner.onColumn({ cx: column![0], cz: column![1], site, registry, zombies: system });
    const initial = [...system.store.entries()];
    expect(initial.length).toBeGreaterThan(0);
    const [id, zombie] = initial[0]!;
    while (system.store.get(id)) {
      const ray = regionRay(zombie, 'head');
      expect(system.swing(ray.origin, ray.direction, FISTS_MELEE)).toBe(id);
      run(system, FISTS_MELEE.cooldown);
    }
    const survivors = system.store.size;
    spawner.onColumn({ cx: column![0], cz: column![1], site, registry, zombies: system });
    expect(system.store.get(id)).toBeUndefined();
    expect(system.store.size).toBe(survivors);
  });

  it('waits for the game clock to enter a loaded spawn marker window', () => {
    const spawn: ZombieSpawn = {
      type: 'shambler',
      pos: [0, 1, 0],
      window: { fromGameTimeOfDay: gameTimeOfDay(SPAWN_TIMES.dusk) },
    };
    const site = spawnSite(spawn);
    const spawner = new ZombieSpawner();
    const system = new ZombieSystem(senses(() => player([1000, 2, 1000])));
    const load = () => spawner.onColumn({ cx: 0, cz: 0, site, registry, zombies: system });

    load();
    expect(system.store.size).toBe(0);
    spawner.advance({ calendar: SPAWN_TIMES.dusk - 1, registry, zombies: system });
    expect(system.store.size).toBe(0);
    spawner.advance({ calendar: SPAWN_TIMES.dusk, registry, zombies: system });
    expect(system.store.size).toBe(1);
    expect(spawner.snapshotState()).toContain('shambler:0,1,0');
  });

  it('spawns same-tick pending markers in stable order regardless of column load order', () => {
    const markers: ZombieSpawn[] = [
      { type: 'shambler', pos: [0, 1, 0], window: { fromGameTimeOfDay: gameTimeOfDay(SPAWN_TIMES.dusk) } },
      { type: 'shambler', pos: [32, 1, 0], window: { fromGameTimeOfDay: gameTimeOfDay(SPAWN_TIMES.dusk) } },
    ];
    const spawnOrder = (order: readonly ZombieSpawn[]) => {
      const system = new ZombieSystem(senses(() => player([1000, 2, 1000])));
      const spawner = new ZombieSpawner();
      order.forEach((spawn, cx) => {
        spawner.onColumn({
          cx,
          cz: 0,
          site: spawnSite(spawn),
          registry,
          zombies: system,
        });
      });
      spawner.advance({ calendar: SPAWN_TIMES.dusk, registry, zombies: system });
      return [...system.store.entries()].map(([id, zombie]) => ({ id, home: zombie.home }));
    };

    const first = spawnOrder(markers);
    expect(first.map(({ home }) => home)).toEqual([
      [0, 1, 0],
      [32, 1, 0],
    ]);
    expect(first).toEqual(spawnOrder([...markers].reverse()));
  });

  it('queues a windowed marker loaded inside its open interval until advance', () => {
    const spawn: ZombieSpawn = {
      type: 'shambler',
      pos: [0, 1, 0],
      window: { fromGameTimeOfDay: gameTimeOfDay(SPAWN_TIMES.dusk), toGameTimeOfDay: gameTimeOfDay(20 * 3600) },
    };
    const system = new ZombieSystem(senses(() => player([1000, 2, 1000])));
    const spawner = new ZombieSpawner();
    spawner.onColumn({
      cx: 0,
      cz: 0,
      site: spawnSite(spawn),
      registry,
      zombies: system,
    });
    expect(system.store.size).toBe(0);
    spawner.advance({ calendar: SPAWN_TIMES.dusk + 1, registry, zombies: system });
    expect(system.store.size).toBe(1);
  });

  it('drops pending markers on unload and retries a missed bounded window the next day', () => {
    const spawn: ZombieSpawn = {
      type: 'shambler',
      pos: [0, 1, 0],
      window: { fromGameTimeOfDay: gameTimeOfDay(SPAWN_TIMES.dusk), toGameTimeOfDay: gameTimeOfDay(20 * 3600) },
    };
    const site = spawnSite(spawn);
    const system = new ZombieSystem(senses(() => player([1000, 2, 1000])));
    const spawner = new ZombieSpawner();
    const load = () => spawner.onColumn({ cx: 0, cz: 0, site, registry, zombies: system });
    load();
    spawner.unloadColumn(0, 0);
    spawner.advance({ calendar: SPAWN_TIMES.dusk + SECONDS_PER_DAY, registry, zombies: system });
    expect(system.store.size).toBe(0);

    load();
    spawner.advance({ calendar: SPAWN_TIMES.dusk + SECONDS_PER_DAY, registry, zombies: system });
    expect(system.store.size).toBe(1);
    const [id] = system.store.entries().next().value!;
    system.store.remove(id);
    load();
    spawner.advance({ calendar: SPAWN_TIMES.dusk + 2 * SECONDS_PER_DAY, registry, zombies: system });
    expect(system.store.size).toBe(0);
    expect(spawner.snapshotState()).toContain('shambler:0,1,0');

    const restored = new ZombieSpawner();
    restored.restoreState(spawner.snapshotState());
    const afterRestore = new ZombieSystem(senses(() => player([1000, 2, 1000])));
    restored.onColumn({
      cx: 0,
      cz: 0,
      site,
      registry,
      zombies: afterRestore,
    });
    expect(afterRestore.store.size).toBe(0);
  });

  it('gait phase tracks travelled distance during wander, chase and obstacle response', () => {
    const slow = { ...SHAMBLER, speed: { ...SHAMBLER.speed, wander: 0.8 } };
    const wander = new ZombieSystem(senses(() => player([1000, 1, 1000])));
    const wanderId = wander.add(slow, [0, 1, 0]);
    const wanderer = wander.store.get(wanderId)!;
    let wandered = 0;
    for (let tick = 0; tick < 10 * 60; tick++) {
      const before = [...wanderer.body.pos] as Vec3;
      wander.tick(1 / 60);
      wandered += metres(before, wanderer.body.pos);
    }
    expect(wandered).toBeGreaterThan(0);
    expect(wanderer.gaitPhase).toBeCloseTo((wandered / slow.stepLength) * Math.PI, 6);

    let target: Vec3 = [20, 1, 0];
    const chase = new ZombieSystem(senses(() => player(target, [-1, 0, 0])));
    const chaseId = chase.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    const chaser = chase.store.get(chaseId)!;
    let chasedDistance = 0;
    for (let frame = 0; frame < 600; frame++) {
      target = [target[0] + 2.8 / 60 / BLOCK_SIZE, target[1], target[2]];
      const before = [...chaser.body.pos] as Vec3;
      chase.tick(1 / 60);
      chasedDistance += metres(before, chaser.body.pos);
    }
    expect(chasedDistance).toBeGreaterThan(10);
    expect(chaser.gaitPhase).toBeCloseTo((chasedDistance / chaser.type.stepLength) * Math.PI, 6);

    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 1 && y >= 1 && y <= 10);
    const blocked = new ZombieSystem(senses(() => player([10, 1, 0], [-1, 0, 0], 'sprinting'), wall));
    const blockedId = blocked.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    const blockedZombie = blocked.store.get(blockedId)!;
    run(blocked, 2);
    expect(blockedZombie.mode).toBe('investigate');
    expect(blockedZombie.body.pos[0]).toBeLessThan(1);
    const phaseAtWall = blockedZombie.gaitPhase;
    let detourDistance = 0;
    for (let frame = 0; frame < 10 * 60; frame++) {
      const before = [...blockedZombie.body.pos] as Vec3;
      blocked.tick(1 / 60);
      detourDistance += metres(before, blockedZombie.body.pos);
    }
    expect(detourDistance).toBeGreaterThan(0);
    expect(blockedZombie.gaitPhase).toBeGreaterThan(phaseAtWall);
    expect(blockedZombie.gaitPhase).toBeCloseTo(
      phaseAtWall + (detourDistance / blockedZombie.type.stepLength) * Math.PI,
      5,
    );
  });

  // biome-ignore lint/style/noProcessEnv: this benchmark is explicitly opt-in.
  describe.runIf(process.env.DEADVOX_BENCH === '1')('shambler CPU benchmark', () => {
    it('stays within its per-tick budget', () => {
      const system = new ZombieSystem(senses(() => player([0, 2, 0])));
      for (let i = 0; i < 10; i++) {
        system.add(SHAMBLER, [20 + i, 1, i * 0.5], [-1, 0, 0]);
      }
      const start = process.cpuUsage();
      for (let frame = 0; frame < 600; frame++) {
        system.tick(1 / 60);
      }
      const used = process.cpuUsage(start);
      expect((used.user + used.system) / 1000 / 600).toBeLessThan(SHAMBLER_CPU_BUDGET_MS);
    });
  });

  it('renders required figure parts with anatomical joints', () => {
    const requiredParts = ['body', 'head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
    expect(FIGURE_PARTS).toEqual(expect.arrayContaining(requiredParts));
    expect(new Set(FIGURE_PARTS).size).toBe(FIGURE_PARTS.length);
    expect(Object.keys(FIGURE_BOXES)).toEqual(expect.arrayContaining(requiredParts));

    const { system } = standing([0, 1, 0]);
    const meshes = new ZombieMeshes(BLOCK_SIZE);
    meshes.sync(system.store);
    const renderedParts = meshes.group.children as InstancedMesh[];
    const rendered = new Map(FIGURE_PARTS.map((part, index) => [part, instanceBox(renderedParts[index]!)] as const));
    const ranges = (part: (typeof FIGURE_PARTS)[number]) => {
      const { points } = rendered.get(part)!;
      return ([0, 1, 2] as const).map((axis) => {
        const coordinates = points.map((point) => point.getComponent(axis));
        return [Math.min(...coordinates), Math.max(...coordinates)] as const;
      });
    };
    const gap = (a: readonly [number, number], b: readonly [number, number]) => Math.max(0, a[0] - b[1], b[0] - a[1]);
    const bodyRanges = ranges('body');
    const jointTolerance = 0.02;
    const touchesBody = (part: (typeof FIGURE_PARTS)[number]) =>
      ranges(part).every((partRange, axis) => gap(partRange, bodyRanges[axis]!) <= jointTolerance);

    expect(FIGURE_BOXES.head.at[1]).toBeGreaterThan(FIGURE_BOXES.body.at[1]);
    expect(touchesBody('head')).toBe(true);
    expect(FIGURE_BOXES.leftArm.at[0]).toBeLessThan(FIGURE_BOXES.body.at[0]);
    expect(FIGURE_BOXES.rightArm.at[0]).toBeGreaterThan(FIGURE_BOXES.body.at[0]);
    expect(touchesBody('leftArm')).toBe(true);
    expect(touchesBody('rightArm')).toBe(true);
    expect(FIGURE_BOXES.leftLeg.at[1]).toBeLessThan(FIGURE_BOXES.body.at[1]);
    expect(FIGURE_BOXES.rightLeg.at[1]).toBeLessThan(FIGURE_BOXES.body.at[1]);
    expect(touchesBody('leftLeg')).toBe(true);
    expect(touchesBody('rightLeg')).toBe(true);

    const parts = renderedParts;
    expect(parts).toHaveLength(FIGURE_PARTS.length);
    expect(
      parts.every(
        (part) =>
          part instanceof InstancedMesh &&
          part.material instanceof MeshLambertMaterial &&
          part.material.emissive.getHex() === 0,
      ),
    ).toBe(true);
  });

  it('smooths a shambler stepping up while keeping its physics and horizontal render position exact', () => {
    const stepWorld: SolidAt = (x, y) => y === 0 || (x === 2 && y === 1);
    const { system, zombie } = standing([1.4, 1, 0], [1, 0, 0]);
    zombie.body.vel[0] = 2.8 / BLOCK_SIZE;
    const meshes = new ZombieMeshes(BLOCK_SIZE);
    const parts = meshes.group.children as import('three').InstancedMesh[];
    const legs = [parts[4]!, parts[5]!];
    const feet = () => {
      const boxes = legs.map((leg) => instanceBox(leg));
      return {
        y: Math.min(...boxes.flatMap(({ points }) => points.map(({ y }) => y))),
        x: boxes.reduce((sum, { center }) => sum + center.x, 0) / boxes.length,
      };
    };
    const syncFrame = (dt: number) => {
      meshes.sync(system.store, dt);
      const drawn = feet();
      expect(drawn.x).toBeCloseTo(zombie.body.pos[0] * BLOCK_SIZE, 5);
      return drawn.y;
    };

    const beforeStep = syncFrame(0);
    stepBody(zombie.body, 1 / 20, stepWorld, PHYSICS);
    expect(zombie.body.pos[1]).toBeCloseTo(2, 3);
    expect(zombie.body.onGround).toBe(true);
    let previousDrawnY = syncFrame(1 / 60);
    expect(Math.abs(previousDrawnY - beforeStep)).toBeLessThanOrEqual(0.06);
    for (let frame = 1; frame < 15; frame++) {
      const drawnY = syncFrame(1 / 60);
      expect(Math.abs(drawnY - previousDrawnY)).toBeLessThanOrEqual(0.06);
      previousDrawnY = drawnY;
    }
    expect(previousDrawnY).toBeCloseTo(zombie.body.pos[1] * BLOCK_SIZE, 5);

    const beforeSnapDown = previousDrawnY;
    zombie.body.pos[1] -= 1;
    previousDrawnY = syncFrame(1 / 60);
    expect(Math.abs(previousDrawnY - beforeSnapDown)).toBeLessThanOrEqual(0.06);
    for (let frame = 1; frame < 15; frame++) {
      const drawnY = syncFrame(1 / 60);
      expect(Math.abs(drawnY - previousDrawnY)).toBeLessThanOrEqual(0.06);
      previousDrawnY = drawnY;
    }
    expect(previousDrawnY).toBeCloseTo(zombie.body.pos[1] * BLOCK_SIZE, 5);
  });

  it('hides severed regions while keeping the other figure instances visible', () => {
    const meshes = new ZombieMeshes(BLOCK_SIZE);
    const { system, zombie } = standing([4, 1, 4], [1, 0, 0]);
    const parts = meshes.group.children as import('three').InstancedMesh[];
    const meshFor = (part: (typeof FIGURE_PARTS)[number]) => parts[FIGURE_PARTS.indexOf(part)]!;
    meshes.sync(system.store);
    expect(parts.every((mesh) => mesh.count === 1)).toBe(true);

    zombie.regions.leftArm = 0;
    zombie.regions.torso = 0;
    meshes.sync(system.store);

    expect(meshFor('leftArm').count).toBe(0);
    expect(meshFor('body').count).toBe(0);
    for (const part of FIGURE_PARTS) {
      if (part !== 'leftArm' && part !== 'body') {
        expect(meshFor(part).count).toBe(1);
      }
    }
  });

  it('renders collision-sized figures at game scale and swings each leg forward/back about its hip', () => {
    const meshes = new ZombieMeshes(BLOCK_SIZE);
    const { system, id, zombie } = standing([4, 1, 4], [1, 0, 0]);
    meshes.sync(system.store);
    const parts = meshes.group.children as import('three').InstancedMesh[];
    const boxes = parts.flatMap((mesh) => instanceBox(mesh));
    const points = boxes.flatMap(({ points: corners }) => corners);
    const minY = Math.min(...points.map(({ y }) => y));
    const maxY = Math.max(...points.map(({ y }) => y));
    const widthX = Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x));
    const widthZ = Math.max(...points.map(({ z }) => z)) - Math.min(...points.map(({ z }) => z));
    expect(Math.abs(minY - zombie.body.pos[1] * BLOCK_SIZE)).toBeLessThanOrEqual(0.05);
    expect(maxY - minY).toBeCloseTo(zombie.body.height * BLOCK_SIZE, 1);
    expect(Math.max(widthX, widthZ)).toBeCloseTo(zombie.body.halfWidth * 2 * BLOCK_SIZE, 1);

    const legs = [parts[4]!, parts[5]!];
    const feetAtFrame = (frame: number) => {
      zombie.body.vel[0] = 1.6;
      zombie.gaitPhase = frame === 0 ? 0 : 0.12;
      meshes.sync(system.store);
      return legs.map((leg) => {
        const matrix = new Matrix4();
        leg.getMatrixAt(0, matrix);
        const foot = new Vector3(0, -0.5, 0).applyMatrix4(matrix);
        const hip = new Vector3(0, 0.5, 0).applyMatrix4(matrix);
        return { foot, hip };
      });
    };
    const frame0 = feetAtFrame(0);
    const frame1 = feetAtFrame(1);
    for (let leg = 0; leg < 2; leg++) {
      expect(Math.abs(frame0[leg]!.foot.x - frame1[leg]!.foot.x)).toBeGreaterThan(0.01);
      expect(frame0[leg]!.foot.x).not.toBe(frame1[leg]!.foot.x);
      expect(Math.abs(frame0[leg]!.foot.z - frame1[leg]!.foot.z)).toBeLessThan(0.01);
      expect(frame0[leg]!.hip.distanceTo(frame1[leg]!.hip)).toBeLessThan(0.01);
    }
    const upDirectionsAtPhase = (phase: number) => {
      zombie.body.vel[0] = 1.6;
      zombie.gaitPhase = phase;
      meshes.sync(system.store);
      return legs.map((leg) => {
        const matrix = new Matrix4();
        leg.getMatrixAt(0, matrix);
        return new Vector3(0, 1, 0).transformDirection(matrix);
      });
    };
    const walkingPhaseStep = (Math.PI * 0.8) / (SHAMBLER.stepLength * 60);
    const previousUp = upDirectionsAtPhase(0);
    const nextUp = upDirectionsAtPhase(walkingPhaseStep);
    for (let leg = 0; leg < 2; leg++) {
      const angle = Math.acos(Math.max(-1, Math.min(1, previousUp[leg]!.dot(nextUp[leg]!))));
      expect(angle).toBeLessThanOrEqual(0.05);
    }
    zombie.body.vel[0] = 0;
    zombie.gaitPhase = Math.PI / 2;
    meshes.sync(system.store);
    for (const leg of legs) {
      const matrix = new Matrix4();
      leg.getMatrixAt(0, matrix);
      const up = new Vector3(0, 1, 0).transformDirection(matrix);
      expect(up.distanceTo(new Vector3(0, 1, 0))).toBeLessThan(0.001);
    }
    expect(system.store.get(id)).toBeDefined();
  });
});

describe('attention targets across terrain and changing blockers', () => {
  it('projects a far rumour onto known terrain without learning the source storey', () => {
    const terrainFloor = (x: number) => 1 + Math.max(0, Math.floor(x / 4));
    const solid: SolidAt = (x, y) => y < terrainFloor(x) || (x >= 12 && x <= 15 && y === 8);
    const source: Vec3 = [14, 9, 0];
    const type = {
      ...SHAMBLER,
      hearingRange: { ...SHAMBLER.hearingRange, sprint: 4 },
      hearingModel: {
        ...SHAMBLER.hearingModel,
        farMultiplier: 4,
        investigationDistanceMetres: 4,
        bearingErrorRadians: 0,
      },
    };
    const system = new ZombieSystem({
      ...senses(() => player(source, [-1, 0, 0], 'sprinting'), solid),
      isOpaque: () => true,
      terrainFloor,
    });
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    system.tick(1 / 20);
    const zombie = system.store.get(id)!;
    expect(zombie.investigationTier).toBe('far');
    expect(zombie.lastPerceived).toBeDefined();
    const [gx, gy, gz] = zombie.lastPerceived!.map(Math.floor);
    expect(solid(gx!, gy!, gz!)).toBe(false);
    expect(solid(gx!, gy! - 1, gz!)).toBe(true);
    expect(zombie.lastPerceived![1]).not.toBe(source[1]);
  });

  it('keeps a visible high target in sight as it moves to a higher elevation', () => {
    const terrainFloor = (x: number) => 1 + Math.max(0, Math.floor((x - 1) / 2));
    const solid: SolidAt = (x, y) => y < terrainFloor(x);
    const source: Vec3 = [1, terrainFloor(1), 0];
    const targetX = source[0] + Math.floor(SHAMBLER.sight / BLOCK_SIZE) - 1;
    const highTarget: Vec3 = [targetX, terrainFloor(targetX), 0];
    const initialTarget: Vec3 = [source[0] + 2, terrainFloor(source[0] + 2), 0];
    const type = {
      ...SHAMBLER,
      speed: speedRates(0, 2),
      chaseMotion: {
        ...SHAMBLER.chaseMotion,
        swayDegrees: 0,
        speedMultiplier: { min: 1, max: 1 },
        stumbleChancePerSimSecond: simRate(0),
      },
    };
    let target = initialTarget;
    const system = new ZombieSystem({
      ...senses(() => player(target, [-1, 0, 0]), solid),
      terrainFloor,
    });
    const id = system.add(type, source, [1, 0, 0]);
    const zombie = system.store.get(id)!;
    system.tick(1 / 20, 1 / 20);
    expect(zombie.mode).toBe('chase');

    target = highTarget;
    const startDistance = metres(zombie.body.pos, target);
    const spatialDistance =
      Math.hypot(target[0] - zombie.body.pos[0], target[1] - zombie.body.pos[1], target[2] - zombie.body.pos[2]) *
      BLOCK_SIZE;
    expect(startDistance).toBeLessThanOrEqual(type.sight);
    expect(spatialDistance).toBeGreaterThan(type.sight);

    for (let tick = 2; tick <= 10; tick++) {
      system.tick(1 / 20, tick / 20);
      expect(zombie.mode).toBe('chase');
    }

    for (let tick = 11; tick <= 20 * 20; tick++) {
      system.tick(1 / 20, tick / 20);
      expect(bodyHitsSolid(zombie.body, solid)).toBe(false);
    }

    expect(zombie.mode).toBe('chase');
    expect(zombie.body.onGround).toBe(true);
    expect(zombie.body.pos[1]).toBeGreaterThan(source[1]);
    expect(metres(zombie.body.pos, target)).toBeLessThan(startDistance);
  });

  it('pursues a grounded target over graded terrain without treating height changes as storeys', () => {
    const terrainFloor = (x: number) => 1 + Math.max(0, Math.floor(x / 5));
    const solid: SolidAt = (x, y) => y < terrainFloor(x);
    const target: Vec3 = [31, terrainFloor(31), 0];
    const type = {
      ...SHAMBLER,
      speed: speedRates(0, 2),
      hearingRange: { ...SHAMBLER.hearingRange, sprint: 1000 },
      chaseMotion: {
        ...SHAMBLER.chaseMotion,
        swayDegrees: 0,
        speedMultiplier: { min: 1, max: 1 },
        stumbleChancePerSimSecond: simRate(0),
      },
    };
    const system = new ZombieSystem({
      ...senses(() => player(target, [-1, 0, 0], 'sprinting'), solid),
      terrainFloor,
    });
    const id = system.add(type, [1, terrainFloor(1), 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    for (let tick = 1; tick <= 20 * 25; tick++) {
      system.tick(1 / 20, tick / 20);
      expect(bodyHitsSolid(zombie.body, solid)).toBe(false);
    }
    expect(Math.hypot(zombie.body.pos[0] - target[0], zombie.body.pos[2] - target[2]) * BLOCK_SIZE).toBeLessThanOrEqual(
      type.attack.reach,
    );
  });

  it('keeps beelining to a distant same-floor target', () => {
    const target: Vec3 = [60, 1, 1];
    const blockSize = 0.5;
    const type = {
      ...SHAMBLER,
      sight: 1000,
      speed: speedRates(0, 2),
      hearingRange: { ...SHAMBLER.hearingRange, sprint: 1000 },
      chaseMotion: {
        ...SHAMBLER.chaseMotion,
        swayDegrees: 0,
        speedMultiplier: { min: 1, max: 1 },
        stumbleChancePerSimSecond: simRate(0),
      },
    };
    const system = new ZombieSystem({
      ...senses(() => player(target, [-1, 0, 0], 'sprinting')),
      blockSize,
      dayPhase: () => dayStateAtHour(12),
    });
    const id = system.add(type, [1, 1, 1]);
    const zombie = system.store.get(id)!;
    for (let tick = 1; tick <= 20 * 40; tick++) {
      system.tick(1 / 20, tick / 20);
    }
    expect(Math.hypot(zombie.body.pos[0] - target[0], zombie.body.pos[2] - target[2]) * blockSize).toBeLessThanOrEqual(
      type.attack.reach,
    );
  });

  it('keeps closing on a target that crosses block cells', () => {
    const blockSize = 0.5;
    const startTargetX = 40.25;
    let target: Vec3 = [startTargetX, 1, 1];
    const type = {
      ...SHAMBLER,
      sight: 1000,
      speed: speedRates(0, 2),
      chaseMotion: {
        ...SHAMBLER.chaseMotion,
        swayDegrees: 0,
        speedMultiplier: { min: 1, max: 1 },
        stumbleChancePerSimSecond: simRate(0),
      },
    };
    const system = new ZombieSystem({
      ...senses(() => player(target, [-1, 0, 0], 'still')),
      blockSize,
    });
    const id = system.add(type, [1, 1, 1], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    const initialDistance = metres(zombie.body.pos, target);
    const dt = 1 / 20;
    let previousCell = Math.floor(target[0]);
    let cellChanges = 0;
    for (let tick = 1; tick <= 20 * 4; tick++) {
      target = [startTargetX + (1.75 * tick * dt) / blockSize, 1, 1];
      const cell = Math.floor(target[0]);
      if (cell !== previousCell) {
        cellChanges += 1;
        previousCell = cell;
      }
      system.tick(dt, tick * dt);
    }
    expect(cellChanges).toBeGreaterThan(2);
    expect(metres(zombie.body.pos, target)).toBeLessThan(initialDistance);
  });
});

describe('lurching chase', () => {
  it('eases each stumble into and out of a near-stop for at least 0.2 s', () => {
    const type = {
      ...SHAMBLER,
      sight: 1000,
      chaseMotion: { ...SHAMBLER.chaseMotion, stumbleChancePerSimSecond: simRate(1) },
    };
    const system = new ZombieSystem({ ...senses(() => player([20, 1, 0])), seed: 19 });
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    zombie.body.onGround = true;
    const factors: number[] = [];
    for (let tick = 0; tick < 60 * 20; tick++) {
      system.tick(1 / 20);
      factors.push(zombie.stumbleFactor);
    }
    const bottom = factors.findIndex((factor) => factor <= type.chaseMotion.stumbleSpeedFraction + 0.01);
    expect(bottom).toBeGreaterThan(0);
    let easedInAt = bottom;
    while (easedInAt > 0 && factors[easedInAt - 1]! < 0.999) {
      easedInAt -= 1;
    }
    let plateauEnd = bottom;
    while (
      plateauEnd + 1 < factors.length &&
      factors[plateauEnd + 1]! <= type.chaseMotion.stumbleSpeedFraction + 0.01
    ) {
      plateauEnd += 1;
    }
    let easedOutAt = plateauEnd + 1;
    while (easedOutAt < factors.length && factors[easedOutAt]! < 0.999) {
      easedOutAt += 1;
    }
    expect((bottom - easedInAt + 1) / 20).toBeGreaterThanOrEqual(0.2);
    expect((easedOutAt - plateauEnd) / 20).toBeGreaterThanOrEqual(0.2);
  });

  it('wobbles laterally, lurches speed, and still reaches melee on open ground', () => {
    const target: Vec3 = [30, 1, 0];
    const system = new ZombieSystem({ ...senses(() => player(target)), seed: 91 });
    const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    zombie.body.onGround = true;
    const lateral: number[] = [];
    const speeds: number[] = [];
    let ticks = 0;
    for (; ticks < 20 * 15; ticks++) {
      const before = [...zombie.body.pos] as Vec3;
      system.tick(1 / 20);
      lateral.push(zombie.body.pos[2] * BLOCK_SIZE);
      const speed = metres(before, zombie.body.pos) * 20;
      if (ticks >= 20 && metres(zombie.body.pos, target) > 4) {
        speeds.push(speed);
      }
      if (metres(zombie.body.pos, target) <= SHAMBLER.attack.reach) {
        break;
      }
    }
    const rms = Math.sqrt(lateral.reduce((sum, value) => sum + value * value, 0) / lateral.length);
    let largestOneSecondRange = 0;
    for (let start = 0; start + 20 <= speeds.length; start++) {
      const window = speeds.slice(start, start + 20);
      largestOneSecondRange = Math.max(largestOneSecondRange, Math.max(...window) - Math.min(...window));
    }
    expect(rms).toBeGreaterThanOrEqual(0.3);
    expect(rms).toBeLessThanOrEqual(1.5);
    expect(largestOneSecondRange).toBeGreaterThanOrEqual(0.3 * SHAMBLER.speed.chaseMetresPerSimSecond);
    const beelineSeconds =
      (15 -
        SHAMBLER.attack.reach -
        SHAMBLER.speed.chaseMetresPerSimSecond ** 2 /
          (2 * SHAMBLER.wander.movementAccelerationMetresPerSimSecondSquared)) /
        SHAMBLER.speed.chaseMetresPerSimSecond +
      SHAMBLER.speed.chaseMetresPerSimSecond / SHAMBLER.wander.movementAccelerationMetresPerSimSecondSquared;
    expect(ticks / 20).toBeLessThanOrEqual(beelineSeconds * 1.6);
  });
});

describe('facing-directed movement', () => {
  type TravelMode = 'stroll' | 'investigate' | 'return' | 'chase';
  const createScenario = (mode: TravelMode) => {
    let sensed = player(mode === 'chase' ? [10, 1, 0] : [1000, 1, 1000]);
    const type = { ...SHAMBLER, sight: 100, nightSight: 100, sightCone: 180 };
    const system = new ZombieSystem(senses(() => sensed));
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    zombie.body.onGround = true;
    switch (mode) {
      case 'stroll':
        zombie.mode = 'stroll';
        zombie.modeTimer = 10;
        zombie.strollHeading = [0, 0, 1];
        break;
      case 'investigate':
        zombie.mode = 'investigate';
        zombie.investigationTier = 'near';
        zombie.lastPerceived = [10, 1, 0];
        break;
      case 'return':
        zombie.body.pos = [10, 1, 0];
        zombie.mode = 'return';
        break;
      default:
        break;
    }
    return {
      system,
      zombie,
      reverseTarget: () => {
        sensed = player([-10, 1, 0]);
      },
    };
  };
  const velocityFacingErrorDegrees = (zombie: ReturnType<ZombieSystem['store']['get']>): number | undefined => {
    if (!zombie || Math.hypot(zombie.body.vel[0], zombie.body.vel[2]) < 0.01) {
      return undefined;
    }
    const velocityYaw = Math.atan2(zombie.body.vel[0], zombie.body.vel[2]);
    const facingYaw = Math.atan2(zombie.facing[0], zombie.facing[2]);
    const error = Math.abs(Math.atan2(Math.sin(velocityYaw - facingYaw), Math.cos(velocityYaw - facingYaw)));
    return (error * 180) / Math.PI;
  };
  const exercise = (mode: TravelMode): { observed: Set<string>; errors: number[] } => {
    const { system, zombie, reverseTarget } = createScenario(mode);
    const observed = new Set<string>();
    const errors: number[] = [];
    for (let tick = 0; tick < 80; tick++) {
      if (mode === 'chase' && tick === 20) {
        reverseTarget();
      }
      system.tick(1 / 20);
      observed.add(zombie.mode);
      const error = velocityFacingErrorDegrees(zombie);
      if (error !== undefined) {
        errors.push(error);
      }
    }
    return { observed, errors };
  };

  it('keeps velocity within two degrees of facing through a sharp chase reversal and every travel mode', () => {
    for (const mode of ['stroll', 'investigate', 'return', 'chase'] as const) {
      const result = exercise(mode);
      expect(result.observed.has(mode)).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(Math.max(...result.errors)).toBeLessThanOrEqual(2);
    }
    expect(exercise('investigate').observed.has('search')).toBe(true);
  });
});

describe('two-tier shambler hearing', () => {
  const hearing = (seed: number, from: Vec3, source: PlayerSense, isSolid: SolidAt = () => false) =>
    hearPlayer({
      zombie: SHAMBLER,
      from,
      player: source,
      blockSize: BLOCK_SIZE,
      isSolid,
      rng: Rng.stream(seed, 'hearing-test'),
      tuning: SENSE_TUNING,
    });

  it('reports the exact near source and bounded, approximate far bearings over fifty seeds', () => {
    const from: Vec3 = [0, 1, 0];
    expect(SHAMBLER.hearingModel.farMultiplier).toBe(2);
    const near = hearing(1, from, player([20, 1, 0], [-1, 0, 0], 'sprinting'));
    expect(near?.tier).toBe('near');
    expect(near?.target).toEqual([20, 1, 0]);
    for (let seed = 0; seed < 50; seed++) {
      const source = player([35, 1, 0], [-1, 0, 0], 'sprinting');
      const far = hearing(seed, from, source);
      expect(far?.tier).toBe('far');
      expect(far?.target).not.toEqual(source.pos);
      expect(metres(far!.target, from)).toBeCloseTo(8, 5);
      const actualBearing = Math.atan2(source.pos[0] - from[0], source.pos[2] - from[2]);
      const guessedBearing = Math.atan2(far!.target[0] - from[0], far!.target[2] - from[2]);
      const error = Math.abs(
        Math.atan2(Math.sin(guessedBearing - actualBearing), Math.cos(guessedBearing - actualBearing)),
      );
      expect(error).toBeLessThanOrEqual(SHAMBLER.hearingModel.bearingErrorRadians);
    }
    const sprintRange = SHAMBLER.hearingRange.sprint * SHAMBLER.hearing;
    const withinFarLimit = hearing(
      51,
      from,
      player([(sprintRange * (SHAMBLER.hearingModel.farMultiplier - 0.1)) / BLOCK_SIZE, 1, 0], [-1, 0, 0], 'sprinting'),
    );
    const outsideFarLimit = hearing(
      52,
      from,
      player([(sprintRange * (SHAMBLER.hearingModel.farMultiplier + 0.1)) / BLOCK_SIZE, 1, 0], [-1, 0, 0], 'sprinting'),
    );
    expect(withinFarLimit?.tier).toBe('far');
    expect(outsideFarLimit).toBeUndefined();
  });

  it('hears player vocal noise within its radius, demotes through a wall, and uses the configured far tier', () => {
    const from: Vec3 = [0, 1, 0];
    const noise = { id: 1, pos: [10, 1, 0] as Vec3, radiusMetres: 6, expiresAt: 1 };
    const hear = (pos: Vec3, isSolid: SolidAt = () => false) =>
      hearVocalNoise({
        zombie: SHAMBLER,
        from,
        noise: { ...noise, pos },
        time: 0.5,
        blockSize: BLOCK_SIZE,
        isSolid,
        rng: Rng.stream(9, 'voice-test'),
        tuning: SENSE_TUNING,
      });

    expect(hear(noise.pos)?.tier).toBe('near');
    expect(hear([20, 1, 0])?.tier).toBe('far');
    expect(hear([22, 1, 0])?.tier).toBe('far');
    expect(hear([26, 1, 0])).toBeUndefined();
    const wall: SolidAt = (x, y) => x >= 5 && x <= 6 && y >= 1;
    expect(hear(noise.pos, wall)?.tier).toBe('far');
    expect(hear(noise.pos, wall)?.target).not.toEqual(noise.pos);
  });

  it('makes a still player vocalization alert and investigate once', () => {
    const noise = { id: 44, pos: [12, 1, 0] as Vec3, radiusMetres: 6, expiresAt: 1 };
    const target = { ...player(noise.pos), vocalNoise: noise };
    const heard: string[] = [];
    const system = new ZombieSystem({
      ...senses(() => target),
      seed: 21,
      onSound: (event) => heard.push(event),
    });
    const id = system.add({ ...SHAMBLER, sight: 0.01, nightSight: 0.01 }, [0, 1, 0]);
    const zombie = system.store.get(id)!;

    system.tick(1 / 20, 0.05);
    expect(zombie.mode).toBe('investigate');
    expect(zombie.investigationTier).toBe('near');
    expect(zombie.lastPerceived).toEqual(noise.pos);
    expect(heard).toContain('shambler_alert');
    system.tick(1 / 20, 0.1);
    expect(heard.filter((event) => event === 'shambler_alert')).toHaveLength(1);

    const distantNoise = { ...noise, id: 45, pos: [26, 1, 0] as Vec3 };
    const distantPlayer = { ...player(distantNoise.pos), vocalNoise: distantNoise };
    const distantSystem = new ZombieSystem(senses(() => distantPlayer));
    const distantId = distantSystem.add({ ...SHAMBLER, sight: 0.01, nightSight: 0.01 }, [0, 1, 0]);
    distantSystem.tick(1 / 20, 0.05);
    expect(distantSystem.store.get(distantId)!.mode).toBe('idle');
  });

  it('does not leak a heard vocal noise into the next zombie pass', function vocalNoiseDoesNotLeakBetweenZombiePasses() {
    const noise = { id: 46, pos: [12, 1, 0] as Vec3, radiusMetres: 6, expiresAt: 1 };
    const target = { ...player([1000, 1, 0]), vocalNoise: noise };
    const system = new ZombieSystem(senses(() => target));
    const secondId = system.add(SHAMBLER, [80, 1, 0]);
    const second = system.store.get(secondId)!;
    system.tick(1 / 20, 0.05);
    expect(second.lastVocalNoiseId).toBe(noise.id);
    expect(second.mode).toBe('idle');

    const firstId = system.add(SHAMBLER, [8, 1, 0]);
    const first = system.store.get(firstId)!;
    system.store.restore(
      [
        [firstId, first],
        [secondId, second],
      ],
      system.store.nextId,
    );
    system.tick(1 / 20, 0.1);

    expect(first.mode).toBe('investigate');
    expect(first.lastPerceived).toBeDefined();
    expect(second.mode).toBe('idle');
    expect(second.lastPerceived).toBeUndefined();
  });

  it('applies one coarse wall step that demotes a near noise to far', () => {
    const from: Vec3 = [0, 1, 0];
    const source = player([28, 1, 0], [-1, 0, 0], 'sprinting');
    const clear = hearing(4, from, source);
    const wall: SolidAt = (x, y) => y === 0 || (x >= 12 && x <= 15 && y >= 1 && y <= 5);
    const muffled = hearing(4, from, source, wall);
    expect(clear?.tier).toBe('near');
    expect(muffled?.tier).toBe('far');
    expect(muffled?.target).not.toEqual(source.pos);
  });

  it('investigates near noises exactly but lets far rumours affect only idle or strolling bodies', () => {
    const nearPlayer = player([20, 1, 0], [-1, 0, 0], 'sprinting');
    const nearSystem = new ZombieSystem({ ...senses(() => nearPlayer), seed: 17 });
    const nearId = nearSystem.add({ ...SHAMBLER, sight: 1, nightSight: 1 }, [0, 1, 0]);
    nearSystem.tick(1 / 20);
    const nearZombie = nearSystem.store.get(nearId)!;
    expect(nearZombie.mode).toBe('investigate');
    expect(nearZombie.investigationTier).toBe('near');
    expect(nearZombie.lastPerceived).toEqual(nearPlayer.pos);

    const distant = player([35, 1, 0], [-1, 0, 0], 'sprinting');
    const farSystem = new ZombieSystem({ ...senses(() => distant), seed: 17 });
    const farId = farSystem.add({ ...SHAMBLER, sight: 1, nightSight: 1 }, [0, 1, 0]);
    farSystem.tick(1 / 20);
    const curious = farSystem.store.get(farId)!;
    expect(curious.mode).toBe('investigate');
    expect(curious.investigationTier).toBe('far');
    expect(curious.lastPerceived).not.toEqual(distant.pos);

    curious.mode = 'chase';
    curious.lastPerceived = [3, 1, 0];
    farSystem.tick(1 / 20);
    expect(curious.mode).toBe('investigate');
    expect(curious.investigationTier).toBe('near');
    expect(curious.lastPerceived).toEqual([3, 1, 0]);
    curious.mode = 'investigate';
    curious.investigationTier = 'near';
    curious.lastPerceived = [4, 1, 0];
    farSystem.tick(1 / 20);
    expect(curious.mode).toBe('investigate');
    expect(curious.investigationTier).toBe('near');
    expect(curious.lastPerceived).toEqual([4, 1, 0]);
  });

  it('lets a far noise during search restart investigation from a new bearing', () => {
    const distant = player([50, 1, 0], [-1, 0, 0], 'sprinting');
    const system = new ZombieSystem({ ...senses(() => distant), seed: 27 });
    const id = system.add({ ...SHAMBLER, sight: 0.01, nightSight: 0.01 }, [0, 1, 0]);
    const zombie = system.store.get(id)!;
    zombie.body.onGround = true;
    zombie.mode = 'search';
    zombie.searchAnchor = [0, 1, 0];
    zombie.searchTimer = 30;
    zombie.searchStrolling = false;
    const before = [...zombie.body.pos] as Vec3;
    system.tick(1 / 20);
    expect(zombie.mode).toBe('investigate');
    expect(zombie.investigationTier).toBe('far');
    expect(zombie.lastPerceived).not.toEqual(distant.pos);
    expect(metres(zombie.lastPerceived!, before)).toBeCloseTo(SHAMBLER.hearingModel.investigationDistanceMetres, 5);
  });

  const advanceToMode = (
    system: ZombieSystem,
    zombie: NonNullable<ReturnType<ZombieSystem['store']['get']>>,
    mode: string,
    maxTicks: number,
  ): boolean => {
    for (let tick = 0; tick < maxTicks && zombie.mode !== mode; tick++) {
      system.tick(1 / 20);
    }
    return zombie.mode === mode;
  };
  const stayInsideSearch = (
    system: ZombieSystem,
    zombie: NonNullable<ReturnType<ZombieSystem['store']['get']>>,
    ticks: number,
    radius: number,
  ): boolean => {
    let sawStroll = false;
    for (let tick = 0; tick < ticks; tick++) {
      system.tick(1 / 20);
      if (zombie.mode !== 'search' || metres(zombie.body.pos, zombie.searchAnchor!) > radius + 0.01) {
        return false;
      }
      sawStroll ||= zombie.searchStrolling;
    }
    return sawStroll;
  };
  const finishSearch = (
    system: ZombieSystem,
    zombie: NonNullable<ReturnType<ZombieSystem['store']['get']>>,
    maxTicks: number,
    radius: number,
  ): boolean => {
    for (let tick = 0; tick < maxTicks && zombie.mode === 'search'; tick++) {
      system.tick(1 / 20);
      if (zombie.mode === 'search' && metres(zombie.body.pos, zombie.searchAnchor!) > radius + 0.01) {
        return false;
      }
    }
    return zombie.mode === 'return';
  };

  it('searches around a near sound for its data duration and restarts around a second exact sound', () => {
    let noise = player([20, 1, 0], [-1, 0, 0], 'sprinting');
    const system = new ZombieSystem({ ...senses(() => noise), seed: 113 });
    const type = { ...SHAMBLER, sight: 0.01, nightSight: 0.01 };
    const zombie = system.store.get(system.add(type, [0, 1, 0]))!;
    zombie.body.onGround = true;
    expect(advanceToMode(system, zombie, 'investigate', 200)).toBe(true);
    noise = { ...noise, movement: 'still' };
    expect(advanceToMode(system, zombie, 'search', 200)).toBe(true);
    expect(zombie.searchAnchor).toEqual([20, 1, 0]);
    for (let tick = 0; tick < 20; tick++) {
      system.tick(1 / 20);
      expect(zombie.mode).toBe('search');
    }

    noise = player([24, 1, 0], [-1, 0, 0], 'sprinting');
    system.tick(1 / 20);
    expect(zombie.mode).toBe('investigate');
    expect(zombie.investigationTier).toBe('near');
    expect(zombie.lastPerceived).toEqual(noise.pos);
    noise = { ...noise, movement: 'still' };
    expect(advanceToMode(system, zombie, 'search', 200)).toBe(true);
    expect(zombie.searchAnchor).toEqual([24, 1, 0]);
    expect(zombie.searchTimer).toBeGreaterThanOrEqual(type.hearingModel.searchSimSeconds.min);
    expect(zombie.searchTimer).toBeLessThanOrEqual(type.hearingModel.searchSimSeconds.max);

    const minSearchTicks = Math.floor((type.hearingModel.searchSimSeconds.min - 0.1) * 20);
    expect(stayInsideSearch(system, zombie, minSearchTicks, type.hearingModel.searchRadiusMetres)).toBe(true);
    expect(
      finishSearch(
        system,
        zombie,
        type.hearingModel.searchSimSeconds.max * 20 + 5,
        type.hearingModel.searchRadiusMetres,
      ),
    ).toBe(true);
    expect(advanceToMode(system, zombie, 'idle', 20 * 20)).toBe(true);
  });
});

describe('background zombie tier', () => {
  it('routes firearm reports into the long-range player-noise channel', () => {
    for (const id of ['gunshot', 'gunshot_pbs1_reference', 'shotgun_blast']) {
      const noise = registry.sounds.get(id)?.noise;
      expect(noise?.enabled).toBe(true);
      expect(noise?.radiusMetres).toBeGreaterThan(ACTIVE_ZOMBIE_RADIUS_METRES);
    }
  });

  it('takes reduced-rate beeline steps toward a heard shot without crossing a wall', () => {
    const wall: SolidAt = (x, y) => y === 0 || (x === 100 && y > 0 && y < 5);
    const noise = { id: 1, pos: [0, 1, 0] as Vec3, radiusMetres: 300, expiresAt: 60 };
    const target = { ...player([0, 1, 0]), vocalNoise: noise };
    const system = new ZombieSystem({ ...senses(() => target, wall), isLoaded: () => true });
    const id = system.add(SHAMBLER, [200, 1, 0]);
    const zombie = system.store.get(id)!;
    system.tickBackground(0.5, 0.5);
    expect(zombie.tier).toBe('background');
    expect(zombie.lastVocalNoiseId).toBe(noise.id);
    const startDistance = metres(zombie.body.pos, target.pos);
    for (let step = 1; step < 60; step++) {
      system.tickBackground(0.5, (step + 1) * 0.5);
    }
    expect(metres(zombie.body.pos, target.pos)).toBeLessThan(startDistance);
    expect(zombie.body.pos[0]).toBeGreaterThan(100);
  });

  it('does not turn an unalerted background actor into a player-seeking beeline', () => {
    const opaqueScreen: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 100 && y > 0 && y < 5);
    const system = new ZombieSystem({
      ...senses(() => player([0, 1, 0]), FLOOR),
      isOpaque: opaqueScreen,
      isLoaded: () => true,
    });
    const id = system.add(SHAMBLER, [200, 1, 0]);
    const zombie = system.store.get(id)!;
    const startDistance = metres(zombie.body.pos, [0, 1, 0]);
    for (let step = 0; step < 40; step++) {
      system.tickBackground(0.5, (step + 1) * 0.5);
    }
    expect(['idle', 'stroll']).toContain(zombie.mode);
    expect(zombie.lastPerceived).toBeUndefined();
    expect(metres(zombie.body.pos, [0, 1, 0])).toBeGreaterThan(startDistance * 0.75);
  });

  it('pauses an active actor as soon as its column unloads', () => {
    let loaded = true;
    const system = new ZombieSystem({ ...senses(() => player([0, 1, 0])), isLoaded: () => loaded });
    const zombie = system.store.get(system.add(SHAMBLER, [2, 1, 0]))!;
    loaded = false;
    const before = [...zombie.body.pos];
    system.tickActive(1 / 20, 0);
    expect(zombie.tier).toBe('unloaded');
    expect(zombie.body.pos).toEqual(before);
  });

  it('hears a distant gunshot through the existing player-noise stimulus', () => {
    const noise = { id: 1, pos: [0, 1, 0] as Vec3, radiusMetres: 80, expiresAt: 0.5 };
    const target = { ...player([0, 1, 0]), vocalNoise: noise };
    const system = new ZombieSystem({ ...senses(() => target), isLoaded: () => true });
    const id = system.add(SHAMBLER, [100, 1, 0]);
    system.tickBackground(0.5, 0.5);
    expect(system.store.get(id)?.tier).toBe('background');
    expect(system.store.get(id)?.lastVocalNoiseId).toBe(noise.id);
    expect(system.store.get(id)?.lastPerceived).toBeDefined();
  });

  it('uses the active visible-light sense for distant background actors', () => {
    const lightTarget: Vec3 = [75, 1, 0];
    const target: PlayerSense = {
      ...player([0, 1, 0]),
      lightSources: [{ pos: lightTarget, seenFrom: 100, carried: false }],
    };
    const system = new ZombieSystem({
      ...senses(
        () => target,
        FLOOR,
        () => 23,
      ),
      isLoaded: () => true,
    });
    const id = system.add(SHAMBLER, [100, 1, 0], [-1, 0, 0]);
    system.tickBackground(0.5, 0.5);
    const zombie = system.store.get(id)!;
    expect(zombie.tier).toBe('background');
    expect(zombie.mode).toBe('investigate');
    expect(zombie.lastPerceived).toEqual(lightTarget);
  });
});

describe('idle and stroll shambling', () => {
  it('uses seeded idle and straight stroll intervals during a sustained sample', () => {
    const sense = senses(() => player([1000, 1, 1000]));
    const system = new ZombieSystem({ ...sense, seed: 73 });
    const replay = new ZombieSystem({ ...sense, seed: 73 });
    const withExtraBody = new ZombieSystem({ ...sense, seed: 73 });
    const id = system.add(SHAMBLER, [0, 1, 0]);
    const replayId = replay.add(SHAMBLER, [0, 1, 0]);
    const independentId = withExtraBody.add(SHAMBLER, [0, 1, 0]);
    withExtraBody.add(SHAMBLER, [100, 1, 100]);
    const zombie = system.store.get(id)!;
    const replayed = replay.store.get(replayId)!;
    const independent = withExtraBody.store.get(independentId)!;
    zombie.body.onGround = true;
    replayed.body.onGround = true;
    independent.body.onGround = true;
    let idleTicks = 0;
    let strollTicks = 0;
    const sampleTicks = 5 * 60 * 20;
    for (let tick = 0; tick < sampleTicks; tick++) {
      system.tick(1 / 20);
      replay.tick(1 / 20);
      withExtraBody.tick(1 / 20);
      if (tick % 100 === 0) {
        expect(replayed.body.pos).toEqual(zombie.body.pos);
        expect(independent.body.pos).toEqual(zombie.body.pos);
        expect(replayed.behaviorRng.state()).toEqual(zombie.behaviorRng.state());
        expect(independent.behaviorRng.state()).toEqual(zombie.behaviorRng.state());
      }
      if (String(zombie.mode) === 'idle') {
        idleTicks += 1;
      }
      if (String(zombie.mode) === 'stroll') {
        strollTicks += 1;
      }
      expect(metres(zombie.body.pos, zombie.home)).toBeLessThanOrEqual(12.5);
    }
    expect(idleTicks / sampleTicks).toBeGreaterThanOrEqual(0.2);
    expect(strollTicks / sampleTicks).toBeGreaterThanOrEqual(0.2);
  });

  it('keeps strolls straight and turns the body and head during idle', () => {
    const system = new ZombieSystem(senses(() => player([1000, 1, 1000])));
    const id = system.add(SHAMBLER, [0, 1, 0]);
    const zombie = system.store.get(id)!;
    zombie.body.onGround = true;
    let idleTurned = false;
    let strollingTicks = 0;
    const meshes = new ZombieMeshes(BLOCK_SIZE);
    const parts = meshes.group.children as import('three').InstancedMesh[];
    const yaw = (mesh: import('three').InstancedMesh): number => {
      const matrix = new Matrix4();
      mesh.getMatrixAt(0, matrix);
      return Math.atan2(matrix.elements[8]!, matrix.elements[0]!);
    };
    let headLookObserved = false;
    for (let tick = 0; tick < 1200; tick++) {
      const mode = String(zombie.mode);
      const beforeFacing = Math.atan2(zombie.facing[0], zombie.facing[2]);
      const beforePosition = [...zombie.body.pos] as Vec3;
      system.tick(1 / 20);
      const afterFacing = Math.atan2(zombie.facing[0], zombie.facing[2]);
      const turn = Math.abs(Math.atan2(Math.sin(afterFacing - beforeFacing), Math.cos(afterFacing - beforeFacing)));
      if (mode === 'stroll') {
        strollingTicks += 1;
        expect((turn * 180) / Math.PI).toBeLessThanOrEqual(5);
      }
      if (mode === 'idle') {
        expect(metres(zombie.body.pos, beforePosition)).toBeLessThanOrEqual(0.01);
        idleTurned ||= turn > 1e-5;
        meshes.sync(system.store);
        headLookObserved ||=
          Math.abs(Math.atan2(Math.sin(yaw(parts[1]!) - yaw(parts[0]!)), Math.cos(yaw(parts[1]!) - yaw(parts[0]!)))) >
          0.01;
      }
    }
    expect(strollingTicks).toBeGreaterThan(0);
    expect(idleTurned).toBe(true);
    expect(headLookObserved).toBe(true);
  });

  it('interpolates 20 Hz chase poses between 60 Hz draws within facing and speed bounds', () => {
    let target: Vec3 = [20, 1, 0];
    const system = new ZombieSystem(senses(() => player(target)));
    const id = system.add({ ...SHAMBLER, sightCone: 180 }, [0, 1, 0], [1, 0, 0]);
    const zombie = system.store.get(id)!;
    zombie.body.onGround = true;
    const meshes = new ZombieMeshes(BLOCK_SIZE);
    const bodyMesh = meshes.group.children[0] as import('three').InstancedMesh;
    meshes.sync(system.store);
    const pose = () => {
      const matrix = new Matrix4();
      bodyMesh.getMatrixAt(0, matrix);
      return {
        x: matrix.elements[12]!,
        z: matrix.elements[14]!,
        yaw: Math.atan2(matrix.elements[8]!, matrix.elements[0]!),
      };
    };
    let previous = pose();
    let previousSpeed = 0;
    for (let frame = 0; frame < 180; frame++) {
      if (frame % 3 === 0) {
        const angle = (frame / 60) * Math.PI;
        target = [20 * Math.cos(angle), 1, 20 * Math.sin(angle)];
        system.tick(1 / 20);
      }
      Reflect.apply(meshes.sync, meshes, [system.store, 1 / 60, (frame % 3) / 3]);
      const current = pose();
      const speed = Math.hypot(current.x - previous.x, current.z - previous.z) * BLOCK_SIZE * 60;
      const turn = Math.abs(Math.atan2(Math.sin(current.yaw - previous.yaw), Math.cos(current.yaw - previous.yaw)));
      expect((turn * 180) / Math.PI).toBeLessThanOrEqual(4);
      expect(Math.abs(speed - previousSpeed)).toBeLessThanOrEqual(0.25);
      previous = current;
      previousSpeed = speed;
    }

    const idleSystem = new ZombieSystem(senses(() => player([1000, 1, 1000])));
    const idleId = idleSystem.add(SHAMBLER, [0, 1, 0]);
    const idleZombie = idleSystem.store.get(idleId)!;
    idleZombie.body.onGround = true;
    idleZombie.modeTimer = 100;
    const idleMeshes = new ZombieMeshes(BLOCK_SIZE);
    const idleBody = idleMeshes.group.children[0] as import('three').InstancedMesh;
    idleMeshes.sync(idleSystem.store);
    const idlePose = () => {
      const matrix = new Matrix4();
      idleBody.getMatrixAt(0, matrix);
      return Math.atan2(matrix.elements[8]!, matrix.elements[0]!);
    };
    let previousYaw = idlePose();
    for (let frame = 0; frame < 180; frame++) {
      if (frame % 3 === 0) {
        idleSystem.tick(1 / 20);
      }
      Reflect.apply(idleMeshes.sync, idleMeshes, [idleSystem.store, 1 / 60, (frame % 3) / 3]);
      const currentYaw = idlePose();
      const turn = Math.abs(Math.atan2(Math.sin(currentYaw - previousYaw), Math.cos(currentYaw - previousYaw)));
      expect((turn * 180) / Math.PI).toBeLessThanOrEqual(6);
      previousYaw = currentYaw;
    }

    idleZombie.mode = 'stroll';
    idleZombie.modeTimer = 100;
    idleZombie.strollHeading = [1, 0, 0];
    previousYaw = idlePose();
    for (let frame = 0; frame < 180; frame++) {
      if (frame % 3 === 0) {
        idleSystem.tick(1 / 20);
      }
      Reflect.apply(idleMeshes.sync, idleMeshes, [idleSystem.store, 1 / 60, (frame % 3) / 3]);
      const currentYaw = idlePose();
      const turn = Math.abs(Math.atan2(Math.sin(currentYaw - previousYaw), Math.cos(currentYaw - previousYaw)));
      expect((turn * 180) / Math.PI).toBeLessThanOrEqual(4);
      previousYaw = currentYaw;
    }
  });
});

describe('attack windup', () => {
  it('does not damage the player the instant an attack starts — only after the windup elapses', () => {
    let damage = 0;
    const system = new ZombieSystem(
      senses(
        () => player([0, 2, 0]),
        FLOOR,
        () => 12,
        (amount) => {
          damage += amount;
        },
      ),
    );
    const id = system.add(SHAMBLER, [1.2, 1, 0], [-1, 0, 0]);
    system.tick(1 / 60);
    expect(damage).toBe(0);
    const zombie = system.store.get(id)!;
    expect(zombie.mode).toBe('chase');
    expect(zombie.attackWindup).toBeCloseTo(SHAMBLER.attack.windupSimSeconds, 5);
    expect(zombie.attackWait).toBeCloseTo(SHAMBLER.attack.cooldownSimSeconds, 5);
  });

  it('damages the player exactly once on the torso when the windup elapses in reach', () => {
    let damage = 0;
    const areas: ('head' | 'torso' | 'legs' | undefined)[] = [];
    const system = new ZombieSystem(
      senses(
        () => player([0, 2, 0]),
        FLOOR,
        () => 12,
        (amount, area) => {
          damage += amount;
          areas.push(area);
        },
      ),
    );
    system.add(SHAMBLER, [1.2, 1, 0], [-1, 0, 0]);
    system.tick(1 / 60);
    expect(damage).toBe(0);
    run(system, SHAMBLER.attack.windupSimSeconds + 0.1);
    expect(damage).toBe(8);
    expect(areas).toEqual(['torso']);
  });

  it('a miss: no damage if the player steps out of reach during the windup', () => {
    let target: Vec3 = [0, 2, 0];
    let damage = 0;
    const system = new ZombieSystem(
      senses(
        () => player(target),
        FLOOR,
        () => 12,
        (amount) => {
          damage += amount;
        },
      ),
    );
    const id = system.add(SHAMBLER, [1.2, 1, 0], [-1, 0, 0]);
    system.tick(1 / 60);
    expect(system.store.get(id)!.attackWindup).toBeGreaterThan(0);
    target = [50, 2, 0]; // teleports well outside the shambler's reach mid-windup
    run(system, SHAMBLER.attack.windupSimSeconds + 0.1);
    expect(damage).toBe(0);
    expect(system.store.get(id)!.attackWindup).toBe(0); // the windup still resolves — as a miss, not a stall
  });

  it('a miss: no damage if line of sight is blocked (a door closes) during the windup', () => {
    const { entities, door, solid } = makeDoorWorld();
    entities.setOpen(door, true);
    let damage = 0;
    const system = new ZombieSystem(
      senses(
        () => player([5, 1, -0.56]),
        solid,
        () => 12,
        (amount) => {
          damage += amount;
        },
      ),
    );
    const id = system.add(SHAMBLER, [5, 1, 1.56], [0, 0, -1]);
    system.tick(1 / 60);
    expect(system.store.get(id)!.attackWindup).toBeGreaterThan(0);
    entities.setOpen(door, false); // slams shut mid-windup, blocking the chest-to-chest raycast
    run(system, SHAMBLER.attack.windupSimSeconds + 0.1);
    expect(damage).toBe(0);
  });

  it('the cooldown (running since windup start) still gates the next attack after a hit lands', () => {
    let damage = 0;
    const system = new ZombieSystem(
      senses(
        () => player([0, 2, 0]),
        FLOOR,
        () => 12,
        (amount) => {
          damage += amount;
        },
      ),
    );
    const id = system.add(SHAMBLER, [1.2, 1, 0], [-1, 0, 0]);
    run(system, SHAMBLER.attack.windupSimSeconds + 0.05); // resolves the first attack
    expect(damage).toBe(8);
    const afterFirstHit = system.store.get(id)!.attackWait;
    expect(afterFirstHit).toBeGreaterThan(0);
    // Well within the remaining cooldown: no second windup should start yet.
    run(system, afterFirstHit - 0.1);
    expect(system.store.get(id)!.attackWindup).toBe(0);
    expect(damage).toBe(8);
  });

  it('keeps simulation-backed hit flinch through save/restore and freeze', () => {
    const system = new ZombieSystem(senses(() => player([100, 2, 0]), FLOOR));
    const id = system.add(SHAMBLER, [0.5, 1, 0]);
    const zombie = system.store.get(id)!;
    const ray = regionRay(zombie, 'head');
    expect(system.swing(ray.origin, ray.direction, FISTS_MELEE)).toBe(id);
    expect(zombie.hitFlinchTime).toBe(0);

    run(system, 0.1);
    const savedTime = system.store.get(id)!.hitFlinchTime!;
    system.store.get(id)!.stanceWeight = 0.37;
    system.store.get(id)!.stepOffset = -0.25;
    expect(savedTime).toBeGreaterThan(0);
    expect(savedTime).toBeLessThan(0.35);
    const restored = new ZombieSystem(senses(() => player([100, 2, 0]), FLOOR));
    restored.restoreState(system.snapshotState(), (typeId) => registry.zombies.get(typeId));
    expect(restored.store.get(id)!.hitFlinchTime).toBe(savedTime);
    expect(restored.store.get(id)!.stanceWeight).toBe(0.37);
    expect(restored.store.get(id)!.stepOffset).toBe(-0.25);

    restored.setFrozen(true);
    run(restored, 0.5);
    expect(restored.store.get(id)!.hitFlinchTime).toBe(savedTime);
    expect(restored.store.get(id)!.stanceWeight).toBe(0.37);
    expect(restored.store.get(id)!.stepOffset).toBe(-0.25);
    restored.setFrozen(false);
    run(restored, 0.3);
    expect(restored.store.get(id)!.hitFlinchTime).toBeUndefined();
  });

  it('does not replay a live far vocal pulse after a searching zombie is restored', () => {
    const { hearing, hearingModel } = SHAMBLER;
    const { farMultiplier, investigationDistanceMetres } = hearingModel;
    const hearingRadius = (4 * investigationDistanceMetres) / (farMultiplier - 1);
    const radiusMetres = hearingRadius / hearing;
    const farHearingRadius = hearingRadius * farMultiplier;
    const distanceMetres = (hearingRadius + farHearingRadius) / 2;
    const noise = {
      id: 1,
      pos: [0.5 + distanceMetres / BLOCK_SIZE, 1, 0] as Vec3,
      radiusMetres,
      expiresAt: 30,
    };
    const makeSystem = () => new ZombieSystem(senses(() => ({ ...player([100, 2, 0]), vocalNoise: noise }), FLOOR));
    const uninterrupted = makeSystem();
    const id = uninterrupted.add(SHAMBLER, [0.5, 1, 0]);
    const dt = 1 / 60;
    let frame = 0;
    uninterrupted.tick(dt, frame * dt);
    expect(uninterrupted.store.get(id)!.mode).toBe('investigate');
    expect(uninterrupted.store.get(id)!.investigationTier).toBe('far');
    expect(uninterrupted.store.get(id)!.lastVocalNoiseId).toBe(noise.id);

    while (uninterrupted.store.get(id)!.mode !== 'search' && frame < 1800) {
      frame += 1;
      uninterrupted.tick(dt, frame * dt);
    }
    expect(uninterrupted.store.get(id)!.mode).toBe('search');
    expect(frame * dt).toBeLessThan(noise.expiresAt);

    const searchFrame = frame;
    const restored = makeSystem();
    restored.restoreState(uninterrupted.snapshotState(), (typeId) => registry.zombies.get(typeId));
    const firstAfterRestore = searchFrame + 1;
    uninterrupted.tick(dt, firstAfterRestore * dt);
    restored.tick(dt, firstAfterRestore * dt);
    expect(uninterrupted.store.get(id)!.mode).toBe('search');
    expect(restored.store.get(id)!.mode).toBe('search');
    for (let nextFrame = firstAfterRestore + 1; nextFrame <= searchFrame + 600; nextFrame += 1) {
      uninterrupted.tick(dt, nextFrame * dt);
      restored.tick(dt, nextFrame * dt);
    }

    expect(restored.snapshotState()).toEqual(uninterrupted.snapshotState());
  });

  it('round-trips obstacle movement state without persisting route state', () => {
    const system = new ZombieSystem(senses(() => player([100, 2, 0]), FLOOR));
    const id = system.add(SHAMBLER, [0, 1, 0]);
    const zombie = system.store.get(id)!;
    zombie.obstacleWanderHeading = [0, 0, 1];
    zombie.obstacleWanderRemaining = 3;
    zombie.obstacleContact = true;
    zombie.obstacleSlideSide = -1;
    const state = system.snapshotState();
    expect(state).not.toHaveProperty('routes');
    expect(state).not.toHaveProperty('routeClock');
    expect(state).not.toHaveProperty('routeSearchCursor');
    const restored = new ZombieSystem(senses(() => player([100, 2, 0]), FLOOR));
    restored.restoreState(state, (typeId) => registry.zombies.get(typeId));
    expect(restored.snapshotState()).toEqual(state);
  });

  it('keeps attackWindup exactly across a snapshot/restore round trip mid-attack', () => {
    const system = new ZombieSystem(senses(() => player([0, 2, 0]), FLOOR));
    const id = system.add(SHAMBLER, [1.2, 1, 0], [-1, 0, 0]);
    system.tick(1 / 60); // starts the windup
    for (let i = 0; i < 5; i++) {
      system.tick(1 / 60); // partway through — a non-trivial value to round-trip, not just the raw constant
    }
    const before = system.store.get(id)!.attackWindup;
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(SHAMBLER.attack.windupSimSeconds);

    const state = system.snapshotState();
    const restored = new ZombieSystem(senses(() => player([0, 2, 0]), FLOOR));
    restored.restoreState(state, (typeId) => registry.zombies.get(typeId));

    expect(restored.store.get(id)!.attackWindup).toBe(before);
  });
});

describe('dismemberment', () => {
  const stationary = { ...SHAMBLER, speed: speedRates(0, 0) };
  const armParts = ['hand.L', 'hand.R', 'forearm.L', 'forearm.R', 'upperArm.L', 'upperArm.R'];

  /** Regions too healthy for a few fist hits to destroy, so only the dismember roll can sever anything. */
  const survives = { head: 1000, torso: 1000, leftArm: 1000, rightArm: 1000, leftLeg: 1000, rightLeg: 1000 };

  const swingAt = (system: ZombieSystem, id: number) => {
    const target = system.store.get(id)!;
    const origin: Vec3 = [0, target.body.pos[1] + target.body.height * 0.55, 0];
    return system.swing(origin, [1, 0, 0], FISTS_MELEE);
  };

  it('scales launch distance monotonically through 40 N·s and keeps weapon distances bounded', () => {
    const type = {
      ...SHAMBLER,
      speed: speedRates(0, 0),
      regions: { ...survives },
      dismember: { chance: 1, headOnKillChance: 0 },
    };
    const fists = FISTS_MELEE;
    const crowbar = runtimeWeapon(registry.items.get('crowbar')!.weapon!.melee!);
    const bat = runtimeWeapon(registry.items.get('baseball_bat')!.weapon!.melee!);
    const simulate = (weapon: Parameters<ZombieSystem['swing']>[2], settleToRest = false) => {
      let renderer: MobActorMeshes;
      let debrisBody: { asleep: boolean; center: Vec3 } | undefined;
      let firstTouchdownCenter: Vec3 | undefined;
      let hit: HitImpulse | undefined;
      const system = new ZombieSystem({
        ...senses(() => player([100, 2, 0])),
        seed: 5,
        onSever: (sourceId, sourceZombie, sourcePart, severHit) => {
          hit = severHit;
          renderer.zombieSevered(sourceId, sourcePart, severHit, sourceZombie);
        },
      });
      const id = system.add(type, [4, 1, 4], [0, 0, -1]);
      const zombie = system.store.get(id)!;
      renderer = new MobActorMeshes(BLOCK_SIZE, 64, {
        poolSize: mobFigurePoolSizeThrough(zombie.figureSeed),
      });
      renderer.setWorld((_x, y, _z) => {
        const solid = y === -1;
        if (solid && debrisBody && firstTouchdownCenter === undefined) {
          firstTouchdownCenter = [...debrisBody.center];
        }
        return solid;
      }, BLOCK_SIZE);
      renderer.sync(system.store, 0, 1);
      const ray = regionRay(zombie, 'rightArm');
      expect(system.swing(ray.origin, ray.direction, weapon)).toBe(id);
      const debrisMap = (
        renderer as unknown as {
          debris: Map<string, { body: { asleep: boolean; center: Vec3 } }>;
        }
      ).debris;
      const [debrisKey, debris] = [...debrisMap.entries()][0]!;
      debrisBody = debris.body;
      const part = debrisKey.split(':')[2]!;
      for (
        let frame = 0;
        frame < 300 && (settleToRest ? !debris.body.asleep : firstTouchdownCenter === undefined);
        frame++
      ) {
        renderer.sync(system.store, 1 / 30, 1);
      }
      if (settleToRest) {
        expect(debris.body.asleep, `impulse ${weapon.impulse} should settle within ten seconds`).toBe(true);
      }
      expect(firstTouchdownCenter).toBeDefined();
      const hitPointMetres = hit!.point.map((coordinate) => coordinate * BLOCK_SIZE);
      const horizontalDistance = (center: Vec3) =>
        Math.hypot(center[0] - hitPointMetres[0]!, center[2] - hitPointMetres[2]!);
      return {
        distance: horizontalDistance(firstTouchdownCenter!),
        restDistance: settleToRest ? horizontalDistance(debris.body.center) : undefined,
        part,
        hit,
      };
    };
    const realWeapons = [simulate(fists, true), simulate(crowbar, true), simulate(bat, true)];
    const impulseByWeapon = new Map([
      [4, realWeapons[0]!],
      [8, realWeapons[1]!],
      [10, realWeapons[2]!],
    ]);
    const sweep = [4, 8, 10, 20, 40].map(
      (impulse) => impulseByWeapon.get(impulse) ?? simulate({ ...FISTS_MELEE, impulse }),
    );

    for (const outcome of sweep) {
      expect(armParts).toContain(outcome.part);
      expect(outcome.part).toBe(sweep[0]!.part);
      expect(outcome.hit?.point).toEqual(sweep[0]!.hit?.point);
      expect(outcome.hit?.direction).toEqual(sweep[0]!.hit?.direction);
    }
    for (let index = 1; index < sweep.length; index++) {
      expect.soft(sweep[index]!.distance).toBeGreaterThan(sweep[index - 1]!.distance);
    }
    expect.soft(sweep[4]!.distance).toBeGreaterThanOrEqual(1.5 * sweep[3]!.distance);
    for (const outcome of realWeapons) {
      expect(outcome.distance).toBeGreaterThanOrEqual(0.2);
      expect(outcome.distance).toBeLessThanOrEqual(8);
      expect(outcome.restDistance).toBeDefined();
      expect(outcome.restDistance!).toBeGreaterThanOrEqual(0.2);
      expect(outcome.restDistance!).toBeLessThanOrEqual(8);
    }
    expect(realWeapons[0]!.distance).toBeLessThan(realWeapons[1]!.distance);
    expect(realWeapons[1]!.distance).toBeLessThan(realWeapons[2]!.distance);
  });

  it('chance 1 always severs a random arm part on a hit that does not kill', () => {
    const type = { ...stationary, regions: survives, dismember: { chance: 1, headOnKillChance: 0 } };
    const system = new ZombieSystem(senses(() => player([100, 2, 0])));
    const id = system.add(type, [0.5, 1, 0]);
    expect(swingAt(system, id)).toBe(id);
    const { severed } = system.store.get(id)!;
    expect(severed).toHaveLength(1);
    expect(armParts).toContain(severed[0]);
  });

  it('chance 0 never severs, even across many hits', () => {
    const type = { ...stationary, regions: survives, dismember: { chance: 0, headOnKillChance: 0 } };
    const system = new ZombieSystem(senses(() => player([100, 2, 0])));
    const id = system.add(type, [0.5, 1, 0]);
    for (let i = 0; i < 10; i++) {
      swingAt(system, id);
      run(system, FISTS_MELEE.cooldown);
    }
    expect(system.store.get(id)!.severed).toEqual([]);
  });

  it('passes the exact hit point, unit direction and impulse for a random-roll sever', () => {
    const type = { ...stationary, regions: survives, dismember: { chance: 1, headOnKillChance: 0 } };
    const calls: [number, string][] = [];
    let receivedHit: HitImpulse | undefined;
    const system = new ZombieSystem({
      ...senses(() => player([100, 2, 0])),
      onSever: (severedId, sourceZombie, part, hit) => {
        receivedHit = hit;
        calls.push([severedId, part]);
        expect(sourceZombie.severed).toContain(part);
      },
    });
    const id = system.add(type, [0.5, 1, 0]);
    const zombie = system.store.get(id)!;
    const origin: Vec3 = [0, zombie.body.pos[1] + zombie.body.height * 0.55, 0];
    const direction: Vec3 = [1, 0, 0];
    const distance = nearestRegionDistance(zombie, origin, direction);
    swingAt(system, id);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe(id);
    expect(hitRecordMatches({ hit: receivedHit, origin, direction, distance, impulse: FISTS_MELEE.impulse })).toBe(
      true,
    );
  });

  it('passes the exact hit record when a destroyed arm region causes a sever', () => {
    const type = {
      ...stationary,
      regions: { ...survives, leftArm: FISTS_MELEE.damage },
      dismember: { chance: 0, headOnKillChance: 0 },
    };
    let received: { part: string; hit: HitImpulse } | undefined;
    const system = new ZombieSystem({
      ...senses(() => player([100, 2, 0])),
      onSever: (_id, _zombie, part, hit) => {
        received = { part, hit };
      },
    });
    const id = system.add(type, [1, 1, 0], [0, 0, -1]);
    const zombie = system.store.get(id)!;
    const ray = regionRay(zombie, 'leftArm');
    const distance = nearestRegionDistance(zombie, ray.origin, ray.direction);
    const weapon = { ...FISTS_MELEE, impulse: 6.25 };
    expect(system.swing(ray.origin, ray.direction, weapon)).toBe(id);
    expect(received?.part).toBe('upperArm.L');
    expect(
      hitRecordMatches({
        hit: received?.hit,
        origin: ray.origin,
        direction: ray.direction,
        distance,
        impulse: weapon.impulse,
      }),
    ).toBe(true);
  });

  it('containment: a part already covered by a severed upperArm is never independently added', () => {
    const type = { ...stationary, regions: survives, dismember: { chance: 1, headOnKillChance: 0 } };
    const system = new ZombieSystem(senses(() => player([100, 2, 0])));
    const id = system.add(type, [0.5, 1, 0]);
    system.store.get(id)!.severed.push('upperArm.L'); // pre-severed, bypassing the RNG for this check
    for (let i = 0; i < 8; i++) {
      swingAt(system, id);
      run(system, FISTS_MELEE.cooldown);
    }
    const { severed } = system.store.get(id)!;
    expect(severed).not.toContain('forearm.L');
    expect(severed).not.toContain('hand.L');
  });

  it('cannot start a new attack once both arms are gone at the forearm or above', () => {
    let damage = 0;
    const system = new ZombieSystem(
      senses(
        () => player([0, 2, 0]),
        FLOOR,
        () => 12,
        (amount) => {
          damage += amount;
        },
      ),
    );
    const id = system.add(SHAMBLER, [1.2, 1, 0], [-1, 0, 0]);
    system.store.get(id)!.severed.push('forearm.L', 'forearm.R');
    run(system, 5); // comfortably longer than windup + cooldown, if an attack were ever allowed to start
    expect(system.store.get(id)!.attackWindup).toBe(0);
    expect(damage).toBe(0);
  });

  it('a hand-only loss on both sides still allows an attack (only forearm-or-above disables it)', () => {
    let damage = 0;
    const system = new ZombieSystem(
      senses(
        () => player([0, 2, 0]),
        FLOOR,
        () => 12,
        (amount) => {
          damage += amount;
        },
      ),
    );
    const id = system.add(SHAMBLER, [1.2, 1, 0], [-1, 0, 0]);
    system.store.get(id)!.severed.push('hand.L', 'hand.R');
    run(system, SHAMBLER.attack.windupSimSeconds + 0.1);
    expect(damage).toBe(8);
  });

  it('only severs the head on a killing blow, never on a hit the zombie survives', () => {
    const type = { ...stationary, regions: survives, dismember: { chance: 0, headOnKillChance: 1 } };
    const system = new ZombieSystem(senses(() => player([100, 2, 0])));
    const id = system.add(type, [0.5, 1, 0]);
    swingAt(system, id); // fists deal 8, far from lethal at 1000 health
    expect(system.store.get(id)!.severed).toEqual([]);
  });

  it('severs the head on a killing blow when headOnKillChance rolls true', () => {
    const type = {
      ...stationary,
      regions: { ...survives, head: FISTS_MELEE.damage },
      dismember: { chance: 0, headOnKillChance: 1 },
    };
    const severedParts: string[] = [];
    let receivedHit: HitImpulse | undefined;
    const system = new ZombieSystem({
      ...senses(() => player([100, 2, 0])),
      onSever: (_id, _zombie, part, hit) => {
        severedParts.push(part);
        receivedHit = hit;
      },
    });
    const id = system.add(type, [1, 1, 0], [0, 0, -1]);
    const zombie = system.store.get(id)!;
    const ray = regionRay(zombie, 'head');
    const distance = nearestRegionDistance(zombie, ray.origin, ray.direction);
    const weapon = { ...FISTS_MELEE, impulse: 7.5 };
    expect(system.swing(ray.origin, ray.direction, weapon)).toBe(id); // exactly lethal
    expect(system.store.get(id)).toBeUndefined(); // dead, removed from the store
    expect(severedParts).toEqual(['head']);
    expect(
      hitRecordMatches({
        hit: receivedHit,
        origin: ray.origin,
        direction: ray.direction,
        distance,
        impulse: weapon.impulse,
      }),
    ).toBe(true);
  });

  it('destroying an arm region cuts the whole arm at the shoulder', () => {
    const type = {
      ...stationary,
      regions: { ...survives, leftArm: FISTS_MELEE.damage, rightArm: FISTS_MELEE.damage },
      dismember: { chance: 0, headOnKillChance: 0 },
    };
    const calls: string[] = [];
    const system = new ZombieSystem({
      ...senses(() => player([100, 2, 0])),
      onSever: (_id, _zombie, part) => {
        calls.push(part);
      },
    });
    const id = system.add(type, [1, 1, 0], [0, 0, -1]);
    const zombie = system.store.get(id)!;
    const weapon = { ...FISTS_MELEE, cooldown: 0 };
    const left = regionRay(zombie, 'leftArm');
    expect(system.swing(left.origin, left.direction, weapon)).toBe(id);
    expect(zombie.severed).toContain('upperArm.L');
    expect(calls).toContain('upperArm.L');
    const right = regionRay(zombie, 'rightArm');
    expect(system.swing(right.origin, right.direction, weapon)).toBe(id);
    expect(zombie.severed).toContain('upperArm.R');
  });

  it('keeps severed exactly across a snapshot/restore round trip', () => {
    const type = { ...stationary, regions: survives, dismember: { chance: 1, headOnKillChance: 0 } };
    const system = new ZombieSystem(senses(() => player([100, 2, 0])));
    const id = system.add(type, [0.5, 1, 0]);
    swingAt(system, id);
    const before = system.store.get(id)!.severed;
    expect(before.length).toBeGreaterThan(0);

    const state = system.snapshotState();
    const restored = new ZombieSystem(senses(() => player([100, 2, 0])));
    restored.restoreState(state, (typeId) => (typeId === type.id ? type : undefined));
    expect(restored.store.get(id)!.severed).toEqual(before);
  });

  it('is deterministic: two identical systems given the same swings sever the same parts', () => {
    const type = { ...stationary, regions: survives, dismember: { chance: 1, headOnKillChance: 0 } };
    const runFour = (): string[] => {
      const system = new ZombieSystem(senses(() => player([100, 2, 0])));
      const id = system.add(type, [0.5, 1, 0]);
      for (let i = 0; i < 4; i++) {
        swingAt(system, id);
        run(system, FISTS_MELEE.cooldown);
      }
      return system.store.get(id)!.severed;
    };
    expect(runFour()).toEqual(runFour());
  });
});
