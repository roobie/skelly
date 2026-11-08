import process from 'node:process';
import { templateByName } from '@mobgen/core/template.ts';
import { crawlGaitPose } from '@mobgen/mob/crawl.ts';
import { InstancedMesh, Matrix4, MeshLambertMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { actorFigure } from '../src/core/actorFigure.ts';
import { bodyPlanModel, figureVariantOf } from '../src/core/actorModels.ts';
import { actorCrawls, actorPoseInputFor, HIT_FLINCH_DURATION, posedActor } from '../src/core/actorPose.ts';
import {
  FIGURE_BOXES,
  FIGURE_PARTS,
  type HumanoidHitRegion,
  posedHumanoidRegionBoxes,
  posedRegionHit,
  posedRegionHitDistance,
} from '../src/core/actorRegions.ts';
import type { PlayerSense } from '../src/core/actorSense.ts';
import { ActorSpawner } from '../src/core/actorSpawns.ts';
import type { Actor } from '../src/core/actorState.ts';
import { type HitImpulse, lethalRegion, pickActorHitRegion, pickActorMove } from '../src/core/actorSystem.ts';
import { hearPlayer, hearVocalNoise, perceivePlayer } from '../src/core/agentPerception.ts';
import { BlockEntities } from '../src/core/blockEntities.ts';
import type { BodyRegion } from '../src/core/body.ts';
import { mulMV, quatToMat3 } from '../src/core/boneMath.ts';
import { resolveSpawnTime, SECONDS_PER_DAY } from '../src/core/clock.ts';
import { requireDayCycle } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { dayPhaseAt } from '../src/core/dayPhase.ts';
import { HUMANOID_REGION_NAMES } from '../src/core/humanoidRegionNames.ts';
import { Inventory } from '../src/core/inventory.ts';
import { lightSenseSourceFor, toggleLight } from '../src/core/lights.ts';
import { type Body, bodyOverlapsBlock, stepBody } from '../src/core/physics.ts';
import { Rng } from '../src/core/random.ts';
import { raycast, type SolidAt } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ActorDef, DoorLockDef } from '../src/core/schema.ts';
import { Simulation } from '../src/core/sim.ts';
import type { ActorSpawn, Site } from '../src/core/site.ts';
import { sunDirection } from '../src/core/sky.ts';
import { gameTimeOfDay, simRate, simSeconds } from '../src/core/time.ts';
import { ActorMeshes } from '../src/render/actors.ts';
import { type RagdollWorld, ragdollContent } from '../src/render/ragdoll.ts';
import type { RigidBody } from '../src/render/rigidImpulse.ts';
import { baseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { SnapshotSite } from './fixtures/snapshotSite.ts';
import { sunExposedAt } from './fixtures/sunOracle.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { MobActorMeshes } from './mobActorsFixture.ts';
import { createPlayerBody, PLAYER, physicsFor, steer } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

const SHAMBLER_CPU_BUDGET_MS = 1;
const registry = baseRegistry();
const DAY_CYCLE = requireDayCycle(registry);
const DUSK = resolveSpawnTime(registry.dayCycle!, 'dusk');
const dayStateAtHour = (hour: number) => dayPhaseAt(DAY_CYCLE, hour * 3600);
const SHAMBLER = registry.actors.get('shambler')!;
const SHAMBLER_MOVE_DAMAGES = SHAMBLER.attack!.moves.map(({ damage }) => damage);
const RUNNER = registry.actors.get('runner')!;
const CRAWLER = registry.actors.get('crawler')!;
const ACID = registry.actors.get('acid_zombie')!;
const speedRates = (wander: number, chase: number) => ({
  ...SHAMBLER.speed,
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
): PlayerSense => ({
  pos,
  facing,
  movement,
  lit,
  lightSeenFrom: 40,
  eyeHeightMetres: 1.3,
  stance: crouching ? 'crouching' : 'standing',
});
const senses = (
  playerFn: () => PlayerSense,
  isSolid: SolidAt = FLOOR,
  hourFn: () => number = () => 12,
  hurtPlayer: (
    amount: number,
    hitRegions?: readonly { region: BodyRegion; weight: number }[],
    attacker?: number,
  ) => void = () => undefined,
) => ({
  player: playerFn,
  isSolid,
  isOpaque: isSolid,
  dayPhase: () => dayStateAtHour(hourFn()),
  blockSize: BLOCK_SIZE,
  physics: PHYSICS,
  tuning: SENSE_TUNING,
  hurtPlayer,
});
const sensesWithLocalSun = (
  playerFn: () => PlayerSense,
  hour: number,
  isSunExposedAt: (position: Vec3, hour: number) => boolean,
) => ({ ...senses(playerFn, FLOOR, () => hour), isSunExposedAt: (position: Vec3) => isSunExposedAt(position, hour) });
const run = (system: ActorSystem, seconds: number, onStep?: () => void) => {
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
const spawnSite = (spawn: ActorSpawn): Site => ({
  surface: { height: (_x, _z, natural) => natural, top: () => undefined },
  spawn: { pos: [0, 0, 0], yaw: 0 },
  stamp: () => undefined,
  supplySourcesIn: () => [],
  lootPointsIn: () => [],
  furnitureIn: () => [],
  actorsIn: () => [spawn],
});
const nearestRegionDistance = (actor: import('../src/core/actorState.ts').Actor, origin: Vec3, direction: Vec3) => {
  let nearest = Number.POSITIVE_INFINITY;
  const posed = posedHumanoidRegionBoxes(actorPoseInputFor(actor, 1, BLOCK_SIZE));
  for (const region of HUMANOID_REGION_NAMES) {
    if (actor.regions[region]! <= 0) {
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
/** The bone a test ray aims at in each region, per body model. */
const TARGET_BONES: Readonly<Record<string, Readonly<Record<HumanoidHitRegion, string>>>> = {
  humanoid: {
    head: 'head',
    torso: 'chest',
    leftArm: 'forearm.L',
    rightArm: 'forearm.R',
    leftLeg: 'shin.L',
    rightLeg: 'shin.R',
  },
  acid: { head: 'skull', torso: 'belly', leftArm: 'fore.L', rightArm: 'fore.R', leftLeg: 'shin.L', rightLeg: 'shin.R' },
};
const posedBox = (actor: Actor, region: HumanoidHitRegion, bone: string, id: number) => {
  const target = posedHumanoidRegionBoxes(actorPoseInputFor(actor, id, BLOCK_SIZE))[region].find(
    (box) => box.bone === bone,
  );
  if (!target) {
    throw new Error(`${region} has no box for bone ${bone}`);
  }
  return target;
};
/** A level ray from a metre outside the body, along the line from the body's axis out through one bone. */
const outwardRay = (actor: Actor, region: HumanoidHitRegion, bone: string, id: number) => {
  const { center } = posedBox(actor, region, bone, id);
  const out = normalized([center[0] - actor.body.pos[0], 0, center[2] - actor.body.pos[2]]);
  const origin: Vec3 = [center[0] + out[0] / BLOCK_SIZE, center[1], center[2] + out[2] / BLOCK_SIZE];
  return { origin, direction: [-out[0], 0, -out[2]] as Vec3 };
};
/** Acid limbs and some humanoid forearms sit behind the torso from the front; approach them from outside. */
const regionRay = (actor: Actor, region: HumanoidHitRegion, id = 1) => {
  const bone = (TARGET_BONES[actor.type.model] ?? TARGET_BONES.humanoid!)[region];
  if ((actor.type.model === 'acid' && region !== 'head') || region.endsWith('Arm')) {
    return outwardRay(actor, region, bone, id);
  }
  const { center } = posedBox(actor, region, bone, id);
  const front = [-actor.facing[0], 0, -actor.facing[2]] as Vec3;
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
  const system = new ActorSystem(senses(() => target, isSolid));
  const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
  const actor = system.store.get(id)!;
  const states: { mode: string; verticalVelocity: number; onGround: boolean }[] = [];
  let clearOfSolid = true;
  for (let frame = 0; frame < seconds * 60; frame++) {
    system.tick(1 / 60);
    states.push({ mode: actor.agent!.mode, verticalVelocity: actor.body.vel[1], onGround: actor.body.onGround });
    clearOfSolid &&= !bodyHitsSolid(actor.body, isSolid);
  }
  return { states, clearOfSolid };
};
const settle = (body: Body, solid: SolidAt = FLOOR): void => {
  for (let tick = 0; tick < 60 && !body.onGround; tick++) {
    stepBody(body, 1 / 60, solid, PHYSICS);
  }
  if (!body.onGround) {
    throw new Error('Fixture body did not settle on its terrain');
  }
};
const beginObstacleWander = (system: ActorSystem, actor: Actor): void => {
  for (let tick = 0; tick < 10 * 60 && actor.agent!.obstacleWanderRemaining === 0; tick++) {
    system.tick(1 / 60);
  }
  if (actor.agent!.obstacleWanderRemaining <= 0) {
    throw new Error('Fixture shambler did not start an obstacle wander');
  }
};
const standing = (position: Vec3, facing: Vec3 = [0, 0, -1]) => {
  const system = new ActorSystem(senses(() => player([1000, 1, 1000])));
  const id = system.add(SHAMBLER, position, facing);
  const actor = system.store.get(id)!;
  settle(actor.body);
  return { system, id, actor };
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

describe('actor attack moves', () => {
  it('picks the move of a landed hit by its share of the weights', () => {
    const move = (id: string, weight: number) => ({
      id,
      weight,
      damage: 1,
      damageKind: 'blunt' as const,
      hitRegions: [{ region: 'torso' as const, weight: 1 }],
    });
    const moves = [move('heavy', 3), move('light', 1)];

    expect([0, 0.74, 0.76, 0.999].map((roll) => pickActorMove(moves, roll).id)).toEqual([
      'heavy',
      'heavy',
      'light',
      'light',
    ]);
  });

  it('picks every positively weighted body region in a move and no unlisted region', () => {
    const choices = [
      { region: 'head', weight: 2 },
      { region: 'torso', weight: 6 },
      { region: 'leftArm', weight: 1 },
      { region: 'rightArm', weight: 1 },
    ] as const;
    const totalWeight = choices.reduce((sum, { weight }) => sum + weight, 0);
    let precedingWeight = 0;
    const picks = choices.map(({ weight }) => {
      const roll = (precedingWeight + weight / 2) / totalWeight;
      precedingWeight += weight;
      return pickActorHitRegion(choices, roll);
    });
    const regions = new Set<BodyRegion>(choices.map(({ region }) => region));

    expect(new Set(picks)).toEqual(regions);
  });
});

describe('melee hit sounds', () => {
  const emittedFor = (
    weapon: import('../src/core/actorSystem.ts').MeleeWeapon,
    isFist = false,
  ): { hit: boolean; events: string[] } => {
    const emitted: string[] = [];
    const system = new ActorSystem({
      ...senses(() => player([100, 2, 0])),
      onSound: (event) => emitted.push(event),
    });
    const id = system.add({ ...SHAMBLER, dismember: { chance: 0, headOnKillChance: 0 } }, [1, 1, 0], [0, 0, -1]);
    const actor = system.store.get(id)!;
    actor.agent!.modeTimer = 1000;
    const ray = regionRay(actor, 'torso');
    const hit = system.swing(ray.origin, ray.direction, weapon, isFist);
    return {
      hit: hit === id,
      events: emitted.filter((event) => event === weapon.hitSound || event === FISTS_MELEE.hitSound),
    };
  };

  it('emits exactly one fist impact and no weapon impact for a fist hit', () => {
    const result = emittedFor(FISTS_MELEE, true);
    expect(result.hit).toBe(true);
    expect(result.events).toEqual([FISTS_MELEE.hitSound]);
  });

  it('emits exactly one weapon impact and no fist impact for a weapon hit', () => {
    const hitSound = 'fixture_weapon_hit';
    const result = emittedFor({
      ...FISTS_MELEE,
      hitSound,
      damage: 12,
      reach: 0.7,
      cooldown: 1,
      impulse: 5,
      type: 'blunt',
    });
    expect(result.hit).toBe(true);
    expect(result.events).toEqual([hitSound]);
  });
});

describe('shambler perception', () => {
  it('rejects unreachable senses before terrain queries without shortening far hearing or carried-light reach', () => {
    const type = {
      ...SHAMBLER,
      agent: {
        ...SHAMBLER.agent!,
        sight: 5,
        nightSight: 5,
        hearing: 1,
        hearingRange: { walk: 5, jog: 5, sprint: 5 },
        hearingModel: { ...SHAMBLER.agent!.hearingModel, farMultiplier: 2 },
      },
    };
    let queries = 0;
    const clear = () => {
      queries += 1;
      return false;
    };
    const distant: Vec3 = [100, 0, 0];
    const perception = {
      def: type,
      from: [0, 0, 0] as Vec3,
      facing: [1, 0, 0] as Vec3,
      player: player(distant, [-1, 0, 0], 'walking'),
      dayPhase: 'day' as const,
      sightBlend: 1,
      blockSize: 1,
      isSolid: clear,
      tuning: SENSE_TUNING,
    };
    expect(perceivePlayer(perception)).toBe(false);
    expect(
      hearVocalNoise({
        def: type,
        from: perception.from,
        noise: { id: 1, pos: distant, radiusMetres: 5, expiresAt: 1 },
        time: 0,
        blockSize: 1,
        isSolid: clear,
        rng: Rng.stream(1, 'sense-bounds'),
        tuning: SENSE_TUNING,
      }),
    ).toBeUndefined();
    expect(queries).toBe(0);
    expect(
      hearPlayer({
        ...perception,
        player: player([9, 0, 0], [-1, 0, 0], 'walking'),
        rng: Rng.stream(1, 'sense-bounds'),
      })?.tier,
    ).toBe('far');
    expect(
      perceivePlayer({
        ...perception,
        player: player([9, 0, 0], [-1, 0, 0], 'still', true),
        dayPhase: 'night',
        sightBlend: 0,
      }),
    ).toBe(true);
    expect(queries).toBeGreaterThan(0);
  });

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
        def: SHAMBLER,
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
      (SHAMBLER.agent!.hearingRange[movement] *
        SHAMBLER.agent!.hearing *
        SHAMBLER.agent!.hearingModel.farMultiplier *
        SENSE_TUNING.wall.hearingRangeScale) /
      BLOCK_SIZE;
    expect(sees([10, 2, 0], 12, false, opaque, 'jogging')).toBe(true);
    expect(sees([muffledHearingEdge('jog') - 1, 2, 0], 12, false, opaque, 'jogging')).toBe(true);
    expect(sees([muffledHearingEdge('jog') + 1, 2, 0], 12, false, opaque, 'jogging')).toBe(false);
    expect(sees([muffledHearingEdge('sprint') - 1, 2, 0], 12, false, opaque, 'sprinting')).toBe(true);
    expect(sees([muffledHearingEdge('sprint') + 1, 2, 0], 12, false, opaque, 'sprinting')).toBe(false);
    const hears = (at: Vec3, movement: PlayerSense['movement'], wall: SolidAt = () => false) =>
      perceivePlayer({
        def: { ...SHAMBLER, agent: { ...SHAMBLER.agent!, sight: 1, nightSight: 1 } },
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
      (SHAMBLER.agent!.hearingRange.walk * SHAMBLER.agent!.hearing * SHAMBLER.agent!.hearingModel.farMultiplier) /
      BLOCK_SIZE;
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
      actor = SHAMBLER,
    }: {
      distanceMetres: number;
      hour: number;
      crouching: boolean;
      movement: PlayerSense['movement'];
      actor?: typeof SHAMBLER;
    }) =>
      perceivePlayer({
        def: actor,
        from,
        facing: [1, 0, 0],
        player: player([distanceMetres / BLOCK_SIZE, 2, 0], [-1, 0, 0], movement, false, crouching),
        dayPhase: dayStateAtHour(hour).phase,
        sightBlend: dayStateAtHour(hour).sightBlend,
        blockSize: BLOCK_SIZE,
        isSolid: FLOOR,
        tuning: SENSE_TUNING,
      });
    const sightDistance = (SHAMBLER.agent!.sight * (1 + SENSE_TUNING.crouch.sightRangeScale)) / 2;
    const hearingDistance =
      (SHAMBLER.agent!.hearingRange.walk *
        SHAMBLER.agent!.hearing *
        SHAMBLER.agent!.hearingModel.farMultiplier *
        (1 + SENSE_TUNING.crouch.hearingRangeScale)) /
      2;

    expect(perceives({ distanceMetres: sightDistance, hour: 12, crouching: false, movement: 'still' })).toBe(true);
    expect(perceives({ distanceMetres: sightDistance, hour: 12, crouching: true, movement: 'still' })).toBe(false);
    const hearingOnly = { ...SHAMBLER, agent: { ...SHAMBLER.agent!, sight: 0.01, nightSight: 0.01 } };
    expect(
      perceives({
        distanceMetres: hearingDistance,
        hour: 12,
        crouching: false,
        movement: 'walking',
        actor: hearingOnly,
      }),
    ).toBe(true);
    expect(
      perceives({
        distanceMetres: hearingDistance,
        hour: 12,
        crouching: true,
        movement: 'walking',
        actor: hearingOnly,
      }),
    ).toBe(false);
  });

  it('uses local daylight exposure for carried-light and lure gates', () => {
    const source = player([0, 0, 0], [-1, 0, 0], 'still', true);
    const baseline = Math.max(SHAMBLER.agent!.sight, SHAMBLER.agent!.nightSight);
    const distanceMetres = (baseline + source.lightSeenFrom) / 2;
    const playerVisible = (hour: number, sunlit: boolean) =>
      perceivePlayer({
        def: SHAMBLER,
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
        lightSources: [{ pos: target, seenFrom: 20, carried: false, heightMetres: 0.15 }],
      });
      const system = new ActorSystem(sensesWithLocalSun(sensed, hour, () => sunlit));
      const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
      system.tick(1 / 60);
      return system.store.get(id)!.agent!.mode;
    };
    const carriedAt = (hour: number, sunlit: boolean) => {
      const sensed = (): PlayerSense => ({
        ...player([100, 1, 100]),
        lightSources: [{ pos: target, seenFrom: 20, carried: true, heightMetres: 0.15 }],
      });
      const system = new ActorSystem(sensesWithLocalSun(sensed, hour, () => sunlit));
      const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
      system.tick(1 / 60);
      return system.store.get(id)!.agent!.mode;
    };
    expect(lureAt(12, true)).toBe('idle');
    expect(lureAt(12, false)).toBe('investigate');
    expect(lureAt(0, false)).toBe('investigate');
    expect(carriedAt(12, true)).toBe('idle');
    expect(carriedAt(12, false)).toBe('investigate');
    expect(carriedAt(0, false)).toBe('investigate');

    const wallShadow: SolidAt = (_x, y, z) => y >= 0 && z === -1;
    const daylightSky = (position: Vec3, hour: number) =>
      sunExposedAt({ position, gameHours: hour, cycle: DAY_CYCLE, skyTop: 20, isOpaque: wallShadow });
    const sunlitSample: Vec3 = [0.5, 1.15, 0.5];
    expect(
      raycast([sunlitSample[0], sunlitSample[1] + 1e-4, sunlitSample[2]], sunDirection(12, DAY_CYCLE), 20, wallShadow),
    ).toBeDefined();
    expect(daylightSky(sunlitSample, 12)).toBe(true);

    const shadowPlayer = perceivePlayer({
      def: SHAMBLER,
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
      lightSources: [{ pos: target, seenFrom: 20, carried: false, heightMetres: 0.15 }],
    });
    const shadowLure = new ActorSystem(sensesWithLocalSun(shadowLurePlayer, 12, daylightSky));
    const shadowLureId = shadowLure.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    shadowLure.tick(1 / 60);
    expect(shadowLure.store.get(shadowLureId)!.agent!.mode).toBe('idle');
  });

  it('keeps crouched light reach in the open but lets a half-wall block the lowered light', () => {
    const { lightSeenFrom } = player([0, 0, 0], [-1, 0, 0], 'still', true);
    const crouchSightRange = lightSeenFrom * SENSE_TUNING.crouch.sightRangeScale;
    const distanceMetres = (crouchSightRange + lightSeenFrom) / 2;
    const distanceBlocks = distanceMetres / BLOCK_SIZE;
    const eyeDropMetres = 0.8;
    const crouchedEye = PLAYER.eye - eyeDropMetres;
    const actorEye = SHAMBLER.eyeHeightMetres;
    const wallFraction = (actorEye - 0.9) / (actorEye - crouchedEye);
    const wallX = Math.floor(distanceBlocks * wallFraction);
    const isSolid: SolidAt = (x, y) => x === wallX && y >= 0 && y < 2;
    const visible = (crouching: boolean, blocked: boolean) => {
      const eyeHeightMetres = PLAYER.eye - (crouching ? eyeDropMetres : 0);
      return perceivePlayer({
        def: { ...SHAMBLER, agent: { ...SHAMBLER.agent!, sight: 0.1, nightSight: 0.1 } },
        from: [0, 0, 0],
        facing: [1, 0, 0],
        player: {
          ...player([distanceBlocks, 0, 0], [-1, 0, 0], 'still', true, crouching),
          eyeHeightMetres,
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
      lightSources: [{ pos: target, seenFrom: sourceRange, carried: false, heightMetres: 0.15 }],
    });
    const open = new ActorSystem(senses(sensedPlayer, FLOOR, () => 0));
    const id = open.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    open.tick(1 / 60);
    const actor = open.store.get(id)!;
    expect(actor.agent!.mode).toBe('investigate');
    expect(actor.agent!.lastPerceived).toEqual(target);
    const startingDistance = metres(actor.body.pos, target);
    run(open, 1);
    expect(metres(actor.body.pos, target)).toBeLessThan(startingDistance);

    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === Math.floor(target[0] / 2) && y > 0 && y < 4);
    const blocked = new ActorSystem(senses(sensedPlayer, wall, () => 0));
    const blockedId = blocked.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    blocked.tick(1 / 60);
    expect(blocked.store.get(blockedId)!.agent!.mode).toBe('idle');
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
      const system = new ActorSystem({ ...senses(sensedPlayer, isOpaque, () => 0), isOpaque });
      const id = system.add(SHAMBLER, [3.05, 1, 0.5], [1, 0, 0]);
      system.tick(1 / 60);
      return system.store.get(id)!.agent!.mode;
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
      lightSources: [{ pos: target, seenFrom: sourceRange, carried: false, heightMetres: 0.15 }],
    });
    const alerts: string[] = [];
    const system = new ActorSystem({
      ...senses(sensed, FLOOR, () => 0),
      onSound: (event) => {
        if (event === 'shambler_alert') {
          alerts.push(event);
        }
      },
    });
    const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    const actor = system.store.get(id)!;
    system.tick(1 / 60);
    let investigating = actor.agent!.mode === 'investigate';
    let investigationEntries = Number(investigating);
    const observed = new Set([actor.agent!.mode]);
    const maxSearch = SHAMBLER.agent!.hearingModel.searchSimSeconds.max;
    const roundTripSeconds = (distanceMetres / SHAMBLER.speed.wanderMetresPerSimSecond) * 2;
    const frames = Math.ceil((maxSearch + roundTripSeconds + 10) * 60);
    for (let frame = 1; frame <= frames; frame++) {
      system.tick(1 / 60, frame / 60);
      observed.add(actor.agent!.mode);
      if (actor.agent!.mode === 'investigate' && !investigating) {
        investigationEntries += 1;
      }
      investigating = actor.agent!.mode === 'investigate';
    }

    expect(observed).toContain('search');
    expect(observed).toContain('return');
    expect(investigationEntries).toBe(1);
    expect(alerts).toHaveLength(1);
    expect(actor.agent!.mode).not.toBe('investigate');
  });

  it('alerts when a searching shambler spots the player after its cry cooldown', () => {
    let sensed: PlayerSense = {
      ...player([100, 1, 100]),
      vocalNoise: { id: 1, pos: [20, 1, 0], radiusMetres: 30, expiresAt: 1 },
    };
    const alerts: string[] = [];
    const type = { ...SHAMBLER, agent: { ...SHAMBLER.agent!, sight: 8, nightSight: 0.01 } };
    const system = new ActorSystem({
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
    const actor = system.store.get(id)!;
    system.tick(1 / 20, 0.05);
    expect(actor.agent!.mode).toBe('investigate');

    sensed = player([100, 1, 100]);
    for (let tick = 0; tick < 500 && actor.agent!.mode !== 'search'; tick++) {
      system.tick(1 / 20, 0.1 + tick / 20);
    }
    expect(actor.agent!.mode).toBe('search');
    alerts.length = 0;
    const { facing } = actor;
    sensed = player(
      [actor.body.pos[0] + facing[0] * 5, actor.body.pos[1], actor.body.pos[2] + facing[2] * 5],
      [-facing[0], 0, -facing[2]],
    );
    system.tick(1 / 20, 0.05 + type.agent.hearingModel.alertCooldownSimSeconds);

    expect(actor.agent!.mode).toBe('chase');
    expect(alerts).toEqual([type.sounds.alert]);
  });

  it('chooses a near heard player over a visible light lure', () => {
    const noiseTarget: Vec3 = [4, 1, 0];
    const lightTarget: Vec3 = [8, 1, 0];
    const sensed = (): PlayerSense => ({
      ...player([100, 1, 100]),
      vocalNoise: { id: 1, pos: noiseTarget, radiusMetres: 10, expiresAt: 1 },
      lightSources: [{ pos: lightTarget, seenFrom: 20, carried: false, heightMetres: 0.15 }],
    });
    const system = new ActorSystem(senses(sensed, FLOOR, () => 0));
    const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);

    system.tick(1 / 60);

    expect(system.store.get(id)!.agent!.lastPerceived).toEqual(noiseTarget);
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
    const system = new ActorSystem(senses(() => player(target, [0, 0, 1]), solid));
    const id = system.add(SHAMBLER, [5, 1, 6], [0, 0, -1]);
    run(system, 20);
    expect(metres(system.store.get(id)!.body.pos, target)).toBeLessThanOrEqual(1.2);
  });

  it('routes three close-spaced shamblers through an open real door with no body jams', () => {
    const { entities, door, solid } = makeDoorWorld();
    entities.setOpen(door, true);
    const playerBody = createPlayerBody(SCALE, 5, 1, -6);
    settle(playerBody, solid);
    const target = { ...player([5, 1, -6], [0, 0, 1]), body: playerBody };
    const system = new ActorSystem(senses(() => target, solid));
    const ids = [
      system.add(SHAMBLER, [5, 1, 4], [0, 0, -1]),
      system.add(SHAMBLER, [5, 1, 5], [0, 0, -1]),
      system.add(SHAMBLER, [5, 1, 6], [0, 0, -1]),
    ];
    for (let tick = 0; tick < 20 * 20; tick++) {
      system.tick(1 / 20);
      for (const id of ids) {
        const actor = system.store.get(id)!;
        expect(bodyHitsSolid(actor.body, solid)).toBe(false);
        expect(boxesOverlap(actor.body, playerBody)).toBe(false);
      }
    }
    expect(
      ids.every((id) => system.store.get(id)!.body.pos[2] < -2),
      ids.map((id) => `${system.store.get(id)!.agent!.mode}:${system.store.get(id)!.body.pos}`).join('; '),
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
    const system = new ActorSystem(
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
      const actor = system.store.get(id)!;
      positions.push([...actor.body.pos]);
      expect(entities.bodyIntersects(door, actor.body)).toBe(false);
      if (actor.agent!.mode === 'chase' || actor.agent!.mode === 'investigate') {
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
    const system = new ActorSystem(
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
    run(system, SHAMBLER.attack!.windupSimSeconds + 0.1);
    expect(SHAMBLER_MOVE_DAMAGES).toContain(damage);
  });

  it('C: reaches the last-perceived point, loses sight, then returns within 3 m in 120 seconds', () => {
    let target = player([10, 1, 0], [1, 0, 0]);
    let wallOn = false;
    const wall: SolidAt = (x, y) => FLOOR(x, y, 0) || (wallOn && x === 12 && y >= 1 && y <= 5);
    const system = new ActorSystem(senses(() => target, wall));
    const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    system.tick(1 / 60);
    expect(system.store.get(id)!.agent!.mode).toBe('chase');
    const lastSeen = [...system.store.get(id)!.agent!.lastPerceived!] as Vec3;
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
    expect(system.store.get(id)!.agent!.mode).not.toBe('chase');
    const chaser = system.store.get(id)!;
    let closestHome = metres(chaser.body.pos, chaser.agent!.home);
    for (let frame = 0; frame < 120 * 60; frame++) {
      system.tick(1 / 60);
      closestHome = Math.min(closestHome, metres(chaser.body.pos, chaser.agent!.home));
    }
    expect(closestHome).toBeLessThanOrEqual(3);
    expect(metres(chaser.body.pos, chaser.agent!.home)).toBeLessThanOrEqual(12.5);
  });

  it('does not start a search at the projection of a sound on another floor', () => {
    const target = player([0, 3, 0], [0, 0, 1], 'sprinting');
    const system = new ActorSystem({
      ...senses(() => target),
      isOpaque: () => false,
      terrainFloor: () => 1,
    });
    const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    const actor = system.store.get(id)!;
    system.tick(1 / 20);
    expect(actor.agent!.mode).toBe('investigate');
    expect(actor.agent!.lastPerceived).toEqual(target.pos);
    expect(actor.agent!.searchAnchor).toBeUndefined();
  });

  it('beelines directly toward an attention target across open ground', () => {
    const type = {
      ...SHAMBLER,
      chaseMotion: { ...SHAMBLER.chaseMotion!, swayDegrees: 0, speedMultiplier: { min: 1, max: 1 } },
    };
    const system = new ActorSystem(senses(() => player([20, 1, 0], [-1, 0, 0])));
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const actor = system.store.get(id)!;
    run(system, 1);
    expect(actor.agent!.mode).toBe('chase');
    expect(actor.body.pos[0]).toBeGreaterThan(0);
    expect(Math.abs(actor.body.pos[2])).toBeLessThan(0.1);
  });

  it('slides along an angled wall while a distant target keeps the shambler moving', () => {
    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 5 && y >= 1 && y <= 5);
    const type = {
      ...SHAMBLER,
      speed: { ...SHAMBLER.speed, chaseMetresPerSimSecond: simRate(2) },
      chaseMotion: { ...SHAMBLER.chaseMotion!, swayDegrees: 0, speedMultiplier: { min: 1, max: 1 } },
      agent: { ...SHAMBLER.agent!, hearingRange: { ...SHAMBLER.agent!.hearingRange, sprint: 1000 } },
    };
    const system = new ActorSystem({
      ...senses(() => player([20, 1, 10], [-1, 0, 0], 'sprinting'), wall),
      isOpaque: () => false,
    });
    const id = system.add(type, [0, 1, 0], [1, 0, 1]);
    const actor = system.store.get(id)!;
    let alongWall = false;
    for (let tick = 0; tick < 4 * 60; tick++) {
      system.tick(1 / 60);
      if (tick > 20 && actor.agent!.mode === 'chase' && metres(actor.body.pos, [20, 1, 10]) > type.attack!.reach) {
        expect(Math.hypot(actor.body.vel[0], actor.body.vel[2])).toBeGreaterThan(0);
      }
      alongWall ||= actor.body.pos[2] * BLOCK_SIZE > 0.5;
      expect(bodyHitsSolid(actor.body, wall)).toBe(false);
    }
    expect(alongWall).toBe(true);
    expect(actor.body.pos[0]).toBeLessThan(5);
  });

  it('keeps moving into a wall head-on with zero chase sway', () => {
    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 4 && y >= 1 && y <= 5);
    const type = {
      ...SHAMBLER,
      speed: { ...SHAMBLER.speed, chaseMetresPerSimSecond: simRate(2) },
      chaseMotion: {
        ...SHAMBLER.chaseMotion!,
        swayDegrees: 0,
        speedMultiplier: { min: 1, max: 1 },
        stumbleChancePerSimSecond: simRate(0),
      },
      agent: {
        ...SHAMBLER.agent!,
        hearingRange: { ...SHAMBLER.agent!.hearingRange, sprint: 1000 },
        wander: { ...SHAMBLER.agent!.wander, obstacleWanderChance: 0 },
      },
    };
    for (const seed of [1, 2, 3, 7, 23]) {
      const target = [30, 1, 0] as Vec3;
      const system = new ActorSystem({
        ...senses(() => player(target, [-1, 0, 0], 'sprinting'), wall),
        isOpaque: () => false,
        seed,
      });
      const id = system.add(type, [0, 1, 0], [1, 0, 0]);
      const actor = system.store.get(id)!;
      let hitWall = false;
      let checkedPostContactMovement = false;
      for (let tick = 0; tick < 5 * 60; tick++) {
        const wasAtWall = hitWall;
        const before = [...actor.body.pos] as Vec3;
        system.tick(1 / 60);
        if (wasAtWall && actor.agent!.mode === 'chase' && metres(actor.body.pos, target) > type.attack!.reach) {
          checkedPostContactMovement = true;
          expect(metres(before, actor.body.pos)).toBeGreaterThan(0.005);
        }
        hitWall ||= actor.obstacleContact;
        expect(bodyHitsSolid(actor.body, wall)).toBe(false);
      }
      expect(hitWall).toBe(true);
      expect(checkedPostContactMovement).toBe(true);
    }
  });

  it('slides around the block corner its body catches instead of grinding in place (#608)', () => {
    type CornerBox = readonly [number, number, number, number, number];
    const solidFromBoxes =
      (boxes: readonly CornerBox[]): SolidAt =>
      (x, y, z) =>
        FLOOR(x, y, z) ||
        boxes.some(([x0, x1, z0, z1, top]) => y >= 1 && y <= top && x >= x0 && x < x1 && z >= z0 && z < z1);
    const wall: CornerBox = [4, 5, -10, 10, 4];
    const container: CornerBox = [2, 4, -2, 2, 2];
    const type = {
      ...SHAMBLER,
      chaseMotion: { ...SHAMBLER.chaseMotion!, swayDegrees: 0, stumbleChancePerSimSecond: simRate(0) },
      agent: { ...SHAMBLER.agent!, hearingRange: { ...SHAMBLER.agent!.hearingRange, sprint: 0 } },
    };
    // Two starts at the #608 corner, where a wall meets a container: the shambler's centre line clears
    // the container corner its body catches, so it must slide round instead of grinding in place.
    const corners: readonly { boxes: readonly CornerBox[]; start: Vec3; target: Vec3 }[] = [
      { boxes: [wall, container], start: [0.75, 1, -6.42], target: [1.71, 1, 1.37] },
      { boxes: [wall, container], start: [0.75, 1, -4], target: [1.71, 1, 3] },
    ];
    const crawlMetresPerSecond = type.speed.chaseMetresPerSimSecond / 5;
    for (const { boxes, start, target } of corners) {
      const solid = solidFromBoxes(boxes);
      const system = new ActorSystem({ ...senses(() => player(target), solid), isOpaque: () => false, seed: 1 });
      const id = system.add(type, start, [1, 0, 0]);
      const actor = system.store.get(id)!;
      const boundTicks = Math.ceil((metres(start, target) / crawlMetresPerSecond) * 60) + 5 * 60;
      let reached = false;
      for (let tick = 0; tick < boundTicks; tick++) {
        system.tick(1 / 60);
        expect(bodyHitsSolid(actor.body, solid)).toBe(false);
        if (metres(actor.body.pos, target) <= type.attack!.reach) {
          reached = true;
          break;
        }
      }
      expect(reached).toBe(true);
    }
  });

  it('does not wander through repeated obstacle contacts while its target stays visible', () => {
    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 4 && y >= 1 && y <= 5 && z >= -2 && z <= 2);
    const target: Vec3 = [30, 1, 0];
    const type = {
      ...SHAMBLER,
      chaseMotion: { ...SHAMBLER.chaseMotion!, swayDegrees: 0, stumbleChancePerSimSecond: simRate(0) },
      agent: {
        ...SHAMBLER.agent!,
        sight: 100,
        sightCone: 180,
        wander: { ...SHAMBLER.agent!.wander, obstacleWanderChance: 1 },
        hearingRange: { ...SHAMBLER.agent!.hearingRange, sprint: 1000 },
      },
    };
    const system = new ActorSystem({
      ...senses(() => player(target, [-1, 0, 0], 'sprinting'), wall),
      isOpaque: () => false,
      seed: 1,
    });
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const actor = system.store.get(id)!;
    let sawObstacleContact = false;
    for (let tick = 0; tick < 5 * 60; tick++) {
      system.tick(1 / 60);
      sawObstacleContact ||= actor.obstacleContact;
      expect(actor.agent!.obstacleWanderRemaining).toBe(0);
    }
    expect(sawObstacleContact).toBe(true);
    expect(actor.agent!.mode).toBe('chase');
  });

  it('still wanders at an obstacle when the same target is unseen', () => {
    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 4 && y >= 1 && y <= 5 && z >= -2 && z <= 2);
    const type = {
      ...SHAMBLER,
      chaseMotion: { ...SHAMBLER.chaseMotion!, swayDegrees: 0, stumbleChancePerSimSecond: simRate(0) },
      agent: {
        ...SHAMBLER.agent!,
        sight: 1,
        nightSight: 1,
        wander: { ...SHAMBLER.agent!.wander, obstacleWanderChance: 1 },
        hearingRange: { ...SHAMBLER.agent!.hearingRange, sprint: 1000 },
      },
    };
    const system = new ActorSystem({
      ...senses(() => player([30, 1, 0], [-1, 0, 0], 'sprinting'), wall),
      isOpaque: () => false,
    });
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const actor = system.store.get(id)!;
    let beganWandering = false;
    for (let tick = 0; tick < 5 * 60 && !beganWandering; tick++) {
      system.tick(1 / 60);
      beganWandering = actor.agent!.obstacleWanderRemaining > 0;
    }
    expect(actor.agent!.mode).toBe('investigate');
    expect(beganWandering).toBe(true);
  });

  it('ends an active wander when its target enters sight', () => {
    let target = player([300, 1, 0], [-1, 0, 0], 'sprinting');
    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 4 && y >= 1 && y <= 5);
    const type = {
      ...SHAMBLER,
      agent: {
        ...SHAMBLER.agent!,
        sight: 100,
        sightCone: 180,
        wander: { ...SHAMBLER.agent!.wander, obstacleWanderChance: 1 },
        hearingRange: { ...SHAMBLER.agent!.hearingRange, sprint: 1000 },
      },
    };
    const system = new ActorSystem({
      ...senses(() => target, wall),
      isOpaque: () => false,
    });
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const actor = system.store.get(id)!;
    beginObstacleWander(system, actor);
    expect(actor.agent!.mode).toBe('investigate');
    target = player([...actor.body.pos].map((value, axis) => value + (axis === 0 ? 10 : 0)) as Vec3);

    system.tick(1 / 60);

    expect(actor.agent!.mode).toBe('chase');
    expect(actor.agent!.obstacleWanderRemaining).toBe(0);
    expect(actor.agent!.obstacleWanderHeading).toBeUndefined();
  });

  it('moves in an open direction during an obstacle wander, then resumes pursuit', () => {
    const obstacle: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 4 && y >= 1 && y <= 5 && z >= -2 && z <= 2);
    const target: Vec3 = [300, 1, 0];
    const type = {
      ...SHAMBLER,
      speed: { ...SHAMBLER.speed, chaseMetresPerSimSecond: simRate(2) },
      chaseMotion: {
        ...SHAMBLER.chaseMotion!,
        swayDegrees: 0,
        speedMultiplier: { min: 1, max: 1 },
        stumbleChancePerSimSecond: simRate(0),
      },
      agent: {
        ...SHAMBLER.agent!,
        wander: { ...SHAMBLER.agent!.wander, obstacleWanderChance: 1 },
        sight: 1,
        nightSight: 1,
        hearingRange: { ...SHAMBLER.agent!.hearingRange, sprint: 1000 },
      },
    };
    const system = new ActorSystem({
      ...senses(() => player(target, [-1, 0, 0], 'sprinting'), obstacle),
      isOpaque: () => false,
    });
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const actor = system.store.get(id)!;
    let wanderStart: Vec3 | undefined;
    let wanderingHeading: Vec3 | undefined;
    let furthestWanderDistance = 0;
    let xAtWanderEnd: number | undefined;
    for (let tick = 0; tick < 30 * 60; tick++) {
      system.tick(1 / 60);
      expect(bodyHitsSolid(actor.body, obstacle)).toBe(false);
      if (actor.agent!.obstacleWanderRemaining > 0) {
        wanderStart ??= [...actor.body.pos];
        wanderingHeading ??= actor.agent!.obstacleWanderHeading;
        furthestWanderDistance = Math.max(furthestWanderDistance, metres(actor.body.pos, wanderStart));
      } else if (wanderStart) {
        xAtWanderEnd ??= actor.body.pos[0];
      }
    }
    expect(wanderStart).toBeDefined();
    expect(wanderingHeading).toBeDefined();
    expect(furthestWanderDistance).toBeGreaterThan(0);
    expect(xAtWanderEnd).toBeDefined();
    expect(actor.body.pos[0]).toBeGreaterThan(xAtWanderEnd!);
    expect(actor.agent!.obstacleWanderRemaining).toBe(0);
    expect(actor.agent!.mode).toBe('investigate');
    expect(actor.agent!.lastPerceived).toEqual(target);
  });

  it('ends a blocked obstacle wander and resumes its attention target', () => {
    let barrier: { axis: 0 | 2; coordinate: number } | undefined;
    const wall: SolidAt = (x, y, z) =>
      FLOOR(x, y, z) ||
      (y >= 1 && y <= 5 && (x === 4 || (barrier !== undefined && (barrier.axis === 0 ? x : z) === barrier.coordinate)));
    const type = {
      ...SHAMBLER,
      agent: {
        ...SHAMBLER.agent!,
        sight: 1,
        nightSight: 1,
        wander: { ...SHAMBLER.agent!.wander, obstacleWanderChance: 1 },
        hearingRange: { ...SHAMBLER.agent!.hearingRange, sprint: 1000 },
      },
    };
    const system = new ActorSystem({
      ...senses(() => player([300, 1, 0], [-1, 0, 0], 'sprinting'), wall),
      isOpaque: () => false,
    });
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const actor = system.store.get(id)!;
    beginObstacleWander(system, actor);
    const heading = actor.agent!.obstacleWanderHeading!;
    const axis = Math.abs(heading[0]) > Math.abs(heading[2]) ? 0 : 2;
    const direction = Math.sign(heading[axis]);
    barrier = {
      axis,
      coordinate:
        direction > 0
          ? Math.ceil(actor.body.pos[axis] + actor.body.halfWidth)
          : Math.floor(actor.body.pos[axis] - actor.body.halfWidth) - 1,
    };
    let endedAtBlockedContact = false;
    let resumedMotion = false;
    for (let tick = 0; tick < 10 * 60; tick++) {
      const wasWandering = actor.agent!.obstacleWanderRemaining > 0;
      const before = [...actor.body.pos] as Vec3;
      system.tick(1 / 60);
      const travelled = metres(before, actor.body.pos);
      endedAtBlockedContact ||=
        wasWandering && actor.agent!.obstacleWanderRemaining === 0 && actor.obstacleContact && travelled < 0.01;
      if (endedAtBlockedContact) {
        barrier = undefined;
      }
      resumedMotion ||= endedAtBlockedContact && actor.agent!.obstacleWanderRemaining === 0 && travelled > 0.01;
      if (resumedMotion) {
        break;
      }
    }
    expect(endedAtBlockedContact).toBe(true);
    expect(resumedMotion).toBe(true);
    expect(actor.agent!.mode).toBe('investigate');
    expect(actor.agent!.lastPerceived).toEqual([300, 1, 0]);
    expect(actor.agent!.obstacleWanderRemaining).toBe(0);
  });

  it("takes off with each type's own jump speed", () => {
    const obstacle: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 6 && y >= 1 && y <= 2);
    for (const factor of [1, 1.25]) {
      const type = { ...SHAMBLER, jumpMetresPerSimSecond: simRate(SHAMBLER.jumpMetresPerSimSecond * factor) };
      const system = new ActorSystem(senses(() => player([24, 1, 0], [-1, 0, 0]), obstacle));
      const actor = system.store.get(system.add(type, [0, 1, 0], [1, 0, 0]))!;
      let takeoffSpeed: number | undefined;
      for (let frame = 0; frame < 8 * 60 && takeoffSpeed === undefined; frame++) {
        const grounded = actor.body.onGround;
        system.tick(1 / 60);
        if (grounded && actor.body.vel[1] > 0) {
          [, takeoffSpeed] = actor.body.vel;
        }
      }
      expect(takeoffSpeed).toBeDefined();
      expect(takeoffSpeed).toBeCloseTo(type.jumpMetresPerSimSecond / BLOCK_SIZE - PHYSICS.gravity / 60);
    }
  });

  it('jumps a low obstacle and keeps beelining past it', () => {
    const obstacle: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 6 && y === 1);
    const system = new ActorSystem(senses(() => player([24, 1, 0], [-1, 0, 0]), obstacle));
    const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    const actor = system.store.get(id)!;
    let airborne = false;
    run(system, 8, () => {
      expect(bodyHitsSolid(actor.body, obstacle)).toBe(false);
      airborne ||= !actor.body.onGround && actor.body.pos[0] > 4;
    });
    expect(airborne).toBe(true);
    expect(actor.body.pos[0]).toBeGreaterThan(6.5);
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
    const { actor } = standing([2, 1, 0]);
    const playerBody = createPlayerBody(SCALE, 0, 1, 0);
    settle(playerBody);
    const obstacles = [actor.body];
    for (let frame = 0; frame < 3 * 60; frame++) {
      steer(playerBody, SCALE, 0, {
        forward: 0,
        right: 1,
        jump: false,
        sprint: false,
        walk: false,
      });
      stepBody(playerBody, 1 / 60, FLOOR, { ...PHYSICS, obstacles });
      expect(boxesOverlap(playerBody, actor.body)).toBe(false);
    }
    const gap = (actor.body.pos[0] - actor.body.halfWidth - playerBody.pos[0] - playerBody.halfWidth) * BLOCK_SIZE;
    expect(gap).toBeGreaterThanOrEqual(-0.001);
    expect(gap).toBeLessThanOrEqual(0.05);
    expect(playerBody.pos[1]).toBeCloseTo(1, 3);
  });

  it('smooths a grounded shambler step in simulation-owned pose state', () => {
    const stair: SolidAt = (_x, y, z) => y === 0 || (z >= 3 && y === 1);
    const system = new ActorSystem(senses(() => player([0, 2, 10], [0, 0, -1]), stair));
    const id = system.add(SHAMBLER, [0, 1, 2.2], [0, 0, 1]);
    const actor = system.store.get(id)!;
    let maximumOffset = 0;
    for (let tick = 0; tick < 120; tick++) {
      system.tick(1 / 60);
      maximumOffset = Math.max(maximumOffset, Math.abs(actor.stepOffset ?? 0));
    }
    expect(actor.body.pos[1]).toBeGreaterThan(1);
    expect(maximumOffset).toBeGreaterThan(0.4);
    expect(actor.stepOffset).toBe(0);
  });

  it('does not separate a player standing two metres above a shambler footprint', () => {
    const platform: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 0 && y === 4 && z === 0);
    const playerBody = createPlayerBody(SCALE, 0.5, 5, 0.5);
    settle(playerBody, platform);
    const target = () => ({ ...player(playerBody.pos), body: playerBody });
    const stillShambler = { ...SHAMBLER, speed: speedRates(0, 0) };
    const system = new ActorSystem(senses(target, platform));
    const id = system.add(stillShambler, [0.5, 1, 0.5]);
    settle(system.store.get(id)!.body, platform);
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
    const system = new ActorSystem(senses(() => player([100, 1, 100]), ledge));
    const lowerId = system.add(stillShambler, [0.5, 1, 0.5]);
    const upperId = system.add(stillShambler, [0.5, 5, 0.5]);
    const lower = system.store.get(lowerId)!.body;
    const upper = system.store.get(upperId)!.body;
    settle(lower, ledge);
    settle(upper, ledge);
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
    const system = new ActorSystem(senses(target, wall));
    const stillShambler = { ...SHAMBLER, speed: speedRates(0, 0) };
    const id = system.add(stillShambler, [3.4, 1, 0]);
    const actorBody = system.store.get(id)!.body;
    settle(actorBody, wall);
    for (let frame = 0; frame < 120; frame++) {
      stepBody(playerBody, 1 / 60, wall, { ...PHYSICS, obstacles: [actorBody] });
    }
    expect(playerBody.onGround).toBe(true);
    expect(boxesOverlap(playerBody, actorBody)).toBe(true);
    const wallGap = (5 - playerBody.pos[0] - playerBody.halfWidth) * BLOCK_SIZE;
    expect(wallGap).toBeGreaterThanOrEqual(0);
    expect(wallGap).toBeLessThanOrEqual(0.3);

    const dt = 1 / 20;
    const walk = (right: -1 | 1) => {
      for (let tick = 0; tick < 3 * 20; tick++) {
        const playerBefore = [...playerBody.pos] as Vec3;
        const actorBefore = [...actorBody.pos] as Vec3;
        system.tick(dt);
        steer(playerBody, SCALE, 0, {
          forward: 0,
          right,
          jump: false,
          sprint: false,
          walk: true,
        });
        stepBody(playerBody, dt, wall, { ...PHYSICS, obstacles: [actorBody] });
        expect(bodyHitsSolid(playerBody, wall)).toBe(false);
        expect(bodyHitsSolid(actorBody, wall)).toBe(false);
        expect(metres(playerBefore, playerBody.pos)).toBeLessThanOrEqual(PLAYER.walk * dt + dt + 0.001);
        expect(metres(actorBefore, actorBody.pos)).toBeLessThanOrEqual(dt + 0.001);
        if (right === 1 && tick >= 2 * 20) {
          expect(boxesOverlap(playerBody, actorBody)).toBe(false);
        }
      }
    };
    walk(1);
    walk(-1);
  });

  it('lets a chaser attack a player against a wall without overlapping either box', () => {
    const playerBody = createPlayerBody(SCALE, 0.4, 1, 0);
    settle(playerBody);
    const target = { ...player([0.4, 1, 0]), body: playerBody };
    const wall: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 1 && y >= 1 && y <= 5);
    expect(bodyHitsSolid(playerBody, wall)).toBe(false);
    let hits = 0;
    const system = new ActorSystem(
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
    const actor = system.store.get(id)!;
    run(system, 3, () => expect(boxesOverlap(playerBody, actor.body)).toBe(false));
    expect(actor.agent!.mode).toBe('chase');
    expect(hits).toBeGreaterThan(0);
  });

  it('separates five shamblers converging for 10 s without terrain intersections', () => {
    const playerBody = createPlayerBody(SCALE, 0, 1, 0);
    const target = { ...player([0, 1, 0]), body: playerBody };
    const system = new ActorSystem(senses(() => target));
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
      for (const [, actor] of system.store.entries()) {
        expect(bodyHitsSolid(actor.body, FLOOR)).toBe(false);
        expect(boxesOverlap(playerBody, actor.body), `${tick} ${actor.body.pos}`).toBe(false);
      }
    }
    const finalBodies = [...system.store.entries()].map(([, actor]) => actor.body);
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
    const system = new ActorSystem(senses(() => player(target, [0, 0, 1], 'sprinting'), stairs));
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
        expect(['chase', 'investigate', 'search', 'return']).toContain(system.store.get(id)!.agent!.mode);
      }
      expect(terrainBodyViolations(bodies, stairs), `tick ${tick}`).toEqual([]);
    }
  });

  it('pushes two overlapping shamblers apart in a one-metre corridor without wall intersections', () => {
    const corridor: SolidAt = (x, y, z) => FLOOR(x, y, z) || (y >= 1 && (x === 0 || x === 3));
    const stillShambler = { ...SHAMBLER, speed: speedRates(0, 0) };
    const system = new ActorSystem(senses(() => player([1000, 1, 1000]), corridor));
    const first = system.store.get(system.add(stillShambler, [2, 1, 2]))!;
    const second = system.store.get(system.add(stillShambler, [2, 1, 2]))!;
    system.tick(1 / 20);
    expect(Math.abs(first.body.pos[0] - 2) * BLOCK_SIZE).toBeCloseTo(0.05, 5);
    expect(Math.abs(second.body.pos[0] - 2) * BLOCK_SIZE).toBeCloseTo(0.05, 5);
    for (let tick = 1; tick < 10 * 20; tick++) {
      system.tick(1 / 20);
      for (const [, actor] of system.store.entries()) {
        expect(bodyHitsSolid(actor.body, corridor)).toBe(false);
      }
    }
    expect(first.body.pos[0]).toBeLessThan(2);
    expect(second.body.pos[0]).toBeGreaterThan(2);
  });

  it('includes a shambler 1.08 m ahead in the melee broad phase', () => {
    const system = new ActorSystem(senses(() => player([0, 1, 0], [1, 0, 0])));
    const id = system.add(SHAMBLER, [1.08 / BLOCK_SIZE, 1, 0], [1, 0, 0]);
    const actor = system.store.get(id)!;
    actor.figureSeed = 1;
    const origin: Vec3 = [0, 1 + PLAYER.eye / BLOCK_SIZE, 0];
    const head = posedHumanoidRegionBoxes({
      seed: actor.figureSeed,
      position: actor.body.pos,
      facing: actor.facing,
      headYaw: actor.headYaw,
      gaitPhase: actor.gaitPhase,
      speed: actor.horizontalSpeed,
      chasing: false,
      attackWindup: 0,
      attackWindupSeconds: actor.type.attack!.windupSimSeconds,
      severed: actor.severed,
      blockSize: BLOCK_SIZE,
    }).head.find((box) => box.bone === 'head')!;
    const direction = normalized([head.center[0] - origin[0], head.center[1] - origin[1], head.center[2] - origin[2]]);
    expect(system.swing(origin, direction, { ...FISTS_MELEE, damage: 1, reach: 2, cooldown: 0 })).toBe(id);
  });

  it('reports the actual damage and final head/torso outcomes from each melee swing', () => {
    const results: unknown[] = [];
    const headKill = {
      ...SHAMBLER,
      regions: { ...SHAMBLER.regions, head: FISTS_MELEE.damage },
      dismember: { chance: 1, headOnKillChance: 1 },
    };
    const headSystem = new ActorSystem({
      ...senses(() => player([100, 2, 0])),
      onMeleeResult: (result) => results.push(result),
    });
    const headId = headSystem.add(headKill, [1, 1, 0], [0, 0, -1]);
    const headActor = headSystem.store.get(headId)!;
    const headRay = regionRay(headActor, 'head');
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
    const torsoSystem = new ActorSystem({
      ...senses(() => player([100, 2, 0])),
      onMeleeResult: (result) => results.push(result),
    });
    const torsoId = torsoSystem.add(torsoKill, [1, 1, 0], [0, 0, -1]);
    const torsoActor = torsoSystem.store.get(torsoId)!;
    const torsoRay = regionRay(torsoActor, 'torso');
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
    for (const region of HUMANOID_REGION_NAMES) {
      const makeSystem = () => new ActorSystem({ ...senses(() => player([100, 2, 0])), seed: 91 });
      const system = makeSystem();
      const replay = makeSystem();
      const id = system.add(SHAMBLER, [1, 1, 0], [0, 0, -1]);
      const replayId = replay.add(SHAMBLER, [1, 1, 0], [0, 0, -1]);
      const actor = system.store.get(id)!;
      const before = { ...actor.regions };
      const { origin, direction } = regionRay(actor, region);
      const replayRay = regionRay(replay.store.get(replayId)!, region);
      expect(system.swing(origin, direction, FISTS_MELEE)).toBe(id);
      expect(replay.swing(replayRay.origin, replayRay.direction, FISTS_MELEE)).toBe(replayId);
      expect(actor.regions[region]).toBe(before[region]! - FISTS_MELEE.damage);
      for (const other of HUMANOID_REGION_NAMES) {
        if (other !== region) {
          expect(actor.regions[other]).toBe(before[other]);
        }
      }
      expect(system.snapshotState()).toEqual(replay.snapshotState());
    }
  });

  it('reports wounds one way: a wound listener leaves the simulation as it is without one', () => {
    const wounds: number[] = [];
    const listened = new ActorSystem({
      ...senses(() => player([100, 2, 0])),
      seed: 91,
      onWound: (_id, _actor, _hit, damage) => wounds.push(damage),
    });
    const silent = new ActorSystem({ ...senses(() => player([100, 2, 0])), seed: 91 });
    const listenedId = listened.add(SHAMBLER, [1, 1, 0], [0, 0, -1]);
    const silentId = silent.add(SHAMBLER, [1, 1, 0], [0, 0, -1]);
    for (const region of HUMANOID_REGION_NAMES) {
      const ray = regionRay(listened.store.get(listenedId)!, region);
      const silentRay = regionRay(silent.store.get(silentId)!, region);
      expect(listened.swing(ray.origin, ray.direction, FISTS_MELEE)).toBe(listenedId);
      expect(silent.swing(silentRay.origin, silentRay.direction, FISTS_MELEE)).toBe(silentId);
    }
    // One report per damaging hit, each with damage done.
    expect(wounds).toHaveLength(HUMANOID_REGION_NAMES.length);
    expect(wounds.every((damage) => damage > 0)).toBe(true);
    expect(listened.snapshotState()).toEqual(silent.snapshotState());
  });

  const destroyRegion = (type: ActorDef, region: HumanoidHitRegion, target = () => player([100, 2, 0])) => {
    const severed: HumanoidHitRegion[] = [];
    const sounds: string[] = [];
    let deaths = 0;
    const system = new ActorSystem({
      ...senses(target),
      onSound: (event) => sounds.push(event),
      onSevered: (_actor, part) => severed.push(part),
      onDeath: () => {
        deaths += 1;
      },
    });
    const noRandomSever = { ...type, dismember: { chance: 0, headOnKillChance: 0 } };
    const id = system.add(noRandomSever, [1, 1, 0], [0, 0, -1]);
    const actor = system.store.get(id)!;
    actor.agent!.modeTimer = 1000;
    const ray = regionRay(actor, region, id);
    const weapon = { ...FISTS_MELEE, cooldown: 0 };
    const hits = Math.ceil(actor.regions[region]! / weapon.damage);
    const struck = Array.from({ length: hits }, () => system.swing(ray.origin, ray.direction, weapon));
    return { system, id, actor, struck, severed, sounds, deaths };
  };

  const severCases = [SHAMBLER, ACID].flatMap((type) =>
    HUMANOID_REGION_NAMES.map((region) => ({ type, region, name: `${type.id} ${region}` })),
  );

  it.each(severCases)(
    'severs every non-head region without killing; destroying the head alone kills: $name',
    ({ type, region }) => {
      const { system, id, actor, struck, severed, sounds, deaths } = destroyRegion(type, region);
      expect(struck.every((hit) => hit === id)).toBe(true);
      if (region === 'head') {
        expect(system.store.get(id)).toBeUndefined();
        expect(deaths).toBe(1);
        expect(severed).toEqual([]);
        return;
      }
      expect(system.store.get(id)).toBe(actor);
      expect(actor.regions[region]).toBe(0);
      expect(sounds).toContain(type.sounds.hurt);
      expect(deaths).toBe(0);
      if (region === 'torso') {
        expect(severed).toEqual([]);
        expect(actor.incapacitated).toBe(true);
        return;
      }
      expect(severed).toEqual([region]);
      // The cut follows the body's bone dispositions: the region's top severable part, or none.
      const figure = actorFigure(type, actor.figureSeed);
      const parts = 'severableParts' in figure ? figure.severableParts[region] : [];
      expect(actor.severed).toEqual(parts.slice(0, 1));
      // A severed acid part drops what a shambler's would.
      expect(type.severedItems[region]).toEqual(SHAMBLER.severedItems[region]);
      expect(actor.incapacitated).toBe(false);
    },
  );

  it('counts a shot that meets the acid sac first as a torso hit', () => {
    const system = new ActorSystem({ ...senses(() => player([100, 2, 0])) });
    const type = { ...ACID, regions: { ...ACID.regions, torso: FISTS_MELEE.damage } };
    const id = system.add(type, [1, 1, 0], [0, 0, -1]);
    const actor = system.store.get(id)!;
    const boxes = posedHumanoidRegionBoxes(actorPoseInputFor(actor, id, BLOCK_SIZE));
    const { origin, direction } = outwardRay(actor, 'torso', 'sac.0', id);
    const [first] = HUMANOID_REGION_NAMES.flatMap((region) => {
      const hit = posedRegionHit(boxes[region], origin, direction, BLOCK_SIZE);
      return hit === undefined ? [] : [{ region, ...hit }];
    }).sort((a, b) => a.distance - b.distance);
    expect(first?.box.bone).toBe('sac.0');
    expect(first?.region).toBe('torso');
    expect(system.swing(origin, direction, { ...FISTS_MELEE, reach: 4 })).toBe(id);
    expect(actor.regions.torso).toBe(0);
    expect(actor.incapacitated).toBe(true);
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
      onSevered: (_actor: unknown, _region: HumanoidHitRegion) => {
        throw new Error('torso must not drop an item');
      },
    };
    const system = new ActorSystem(options);
    const id = system.add(type, [1, 1, 0], [0, 0, -1]);
    const actor = system.store.get(id)!;
    actor.agent!.mode = 'chase';
    actor.chaseStance = true;
    const start: Vec3 = [...actor.body.pos];
    const { mode } = actor.agent!;
    const behaviorRng = actor.agent!.behaviorRng.state();
    const ray = regionRay(actor, 'torso');
    expect(system.swing(ray.origin, ray.direction, FISTS_MELEE)).toBe(id);
    expect(actor.incapacitated).toBe(true);
    expect(system.store.get(id)).toBe(actor);
    expect(incapacitations).toBe(1);
    expect(deaths).toBe(0);
    expect(actor.severed).toEqual([]);
    expect(emitted).toContain('shambler_hurt');
    const soundsAfterHit = emitted.length;
    run(system, 10, () => {
      if (actor.attackWindup > 0) {
        sawAttackWindup = true;
      }
    });
    expect(metres(start, actor.body.pos)).toBeLessThan(0.01);
    expect(actor.attackWindup).toBe(0);
    expect(sawAttackWindup).toBe(false);
    expect(playerHits).toBe(0);
    expect(actor.agent!.mode).toBe(mode);
    expect(actor.agent!.behaviorRng.state()).toEqual(behaviorRng);
    expect(emitted).toHaveLength(soundsAfterHit);

    const restored = new ActorSystem(options);
    restored.restoreState(system.snapshotState(), (restoreId) => (restoreId === type.id ? type : undefined));
    expect(restored.store.get(id)?.incapacitated).toBe(true);
    expect(restored.store.get(id)?.figureSeed).toBe(actor.figureSeed);
  });

  it('runner closes a beeline faster than a shambler', () => {
    const pursue = (type: typeof SHAMBLER) => {
      const system = new ActorSystem(senses(() => player([20, 1, 0])));
      const id = system.add(type, [0, 1, 0], [1, 0, 0]);
      run(system, 2);
      return system.store.get(id)!;
    };
    const shambler = pursue(SHAMBLER);
    const runner = pursue(RUNNER);
    expect(shambler.agent!.mode).toBe('chase');
    expect(runner.agent!.mode).toBe('chase');
    expect(runner.body.pos[0]).toBeGreaterThan(shambler.body.pos[0]);
    expect(runner.body.pos[0]).toBeGreaterThan(Math.abs(runner.body.pos[2]));
  });

  it('a born legs-cut humanoid keeps authored speed even after a stump injury', () => {
    const type = {
      ...CRAWLER,
      speed: { ...CRAWLER.speed, chaseMetresPerSimSecond: simRate(2), crawlMetresPerSimSecond: simRate(0.1) },
    };
    const system = new ActorSystem(senses(() => player([20, 1, 0])));
    const id = system.add({ ...type, dismember: { chance: 0, headOnKillChance: 0 } }, [0, 1, 0], [1, 0, 0]);
    const actor = system.store.get(id)!;
    const ray = outwardRay(actor, 'leftLeg', 'thigh.L', id);
    const weapon = { ...FISTS_MELEE, cooldown: 0 };
    const hits = Math.ceil(actor.regions.leftLeg! / weapon.damage);
    const struck = Array.from({ length: hits }, () => system.swing(ray.origin, ray.direction, weapon));
    expect(struck.length).toBeGreaterThan(0);
    expect(struck.every((hit) => hit === id)).toBe(true);
    expect(actor.regions.leftLeg).toBe(0);
    run(system, 1);
    expect(templateByName(bodyPlanModel(figureVariantOf(type))).bodyPlan).toBe('humanoid');
    expect(actorFigure(type, actor.figureSeed).realized.body.bones.some((bone) => bone.id === 'shin.L')).toBe(false);
    expect(actorCrawls(actor)).toBe(false);
    expect(actorPoseInputFor(actor, id, BLOCK_SIZE).crawling).toBe(false);
    expect(actor.horizontalSpeed).toBeGreaterThan(type.speed.crawlMetresPerSimSecond);
    expect(actor.horizontalSpeed).toBeLessThanOrEqual(type.speed.chaseMetresPerSimSecond);
  });

  it('crawler attacks offer only leg hit regions and identify their attacker', () => {
    const hitChoices: (readonly { region: BodyRegion; weight: number }[])[] = [];
    const attackers: number[] = [];
    const system = new ActorSystem(
      senses(
        () => player([1.5, 1, 0]),
        FLOOR,
        () => 12,
        (_damage, choices, attacker) => {
          if (choices) {
            hitChoices.push(choices);
          }
          if (attacker !== undefined) {
            attackers.push(attacker);
          }
        },
      ),
    );
    system.add(CRAWLER, [0, 1, 0], [1, 0, 0]);
    run(system, 2);
    expect(hitChoices.length).toBeGreaterThan(0);
    expect(
      hitChoices.every(
        (choices) => choices.length > 0 && choices.every(({ region }) => region === 'leftLeg' || region === 'rightLeg'),
      ),
    ).toBe(true);
    expect(attackers.some((id) => system.store.get(id)?.type.name === CRAWLER.name)).toBe(true);
  });

  it('runner and crawler identity, body and movement state survive zombie restore', () => {
    const source = new ActorSystem({ ...senses(() => player([20, 1, 0])), seed: 0x4_92 });
    source.add(RUNNER, [0, 1, 0], [1, 0, 0]);
    source.add(CRAWLER, [0, 1, 2], [1, 0, 0]);
    run(source, 0.5);
    const snapshot = source.snapshotState();
    expect(snapshot.actors).toHaveLength(2);
    expect(snapshot.actors.map(({ actor }) => actor.type).sort()).toEqual(['crawler', 'runner']);
    const expected = new Map(
      snapshot.actors.map(({ id, actor }) => [
        id,
        {
          type: actor.type,
          figureSeed: actor.figureSeed,
          mode: actor.agent!.mode,
          body: actor.body,
          gaitPhase: actor.gaitPhase,
        },
      ]),
    );
    const restored = new ActorSystem(senses(() => player([20, 1, 0])));
    restored.restoreState(snapshot, (id) => registry.actors.get(id));
    expect(restored.store.size).toBe(2);
    for (const [id, actor] of restored.store.entries()) {
      expect({
        type: actor.type.id,
        figureSeed: actor.figureSeed,
        mode: actor.agent!.mode,
        body: actor.body,
        gaitPhase: actor.gaitPhase,
      }).toEqual(expected.get(id));
    }
  });

  it('preserves every zombie figure seed in a snapshot/restore round trip', () => {
    const system = new ActorSystem({ ...senses(() => player([100, 2, 0])), seed: 0x7_13 });
    for (let i = 0; i < 8; i++) {
      system.add(SHAMBLER, [i * 2, 1, 0], [0, 0, -1]);
    }
    const expected = [...system.store.entries()].map(([id, actor]) => [id, actor.figureSeed]);
    const restored = new ActorSystem(senses(() => player([100, 2, 0])));
    restored.restoreState(system.snapshotState(), (id) => registry.actors.get(id));
    expect([...restored.store.entries()].map(([id, actor]) => [id, actor.figureSeed])).toEqual(expected);
  });

  it('rejects a restored figure seed that its type does not author', () => {
    const system = new ActorSystem({ ...senses(() => player([100, 2, 0])), seed: 0x7_14 });
    system.add(SHAMBLER, [0, 1, 0], [0, 0, -1]);
    const authored = system.snapshotState();
    const [entry] = authored.actors;
    const snapshot = {
      ...authored,
      actors: [{ ...entry!, actor: { ...entry!.actor, figureSeed: Math.max(...SHAMBLER.figureSeeds!) + 1 } }],
    };
    const restored = new ActorSystem(senses(() => player([100, 2, 0])));
    expect(() => restored.restoreState(snapshot, (id) => registry.actors.get(id))).toThrow('Invalid zombie state');
  });

  it('realizes a figure for every authored seed of every type', () => {
    for (const type of registry.actors.values()) {
      for (const seed of type.figureSeeds ?? []) {
        expect(() => actorFigure(type, seed)).not.toThrow();
      }
    }
  });

  it.each([SHAMBLER, RUNNER])(
    '$id crawls after losing one leg, with matching hit regions and a derived pose after restore',
    (type) => {
      const { system, id, actor } = destroyRegion(type, 'leftLeg', () => player([1, 1, -8]));
      expect(actor.severed.length).toBeGreaterThan(0);
      const before = [...actor.body.pos];
      run(system, 1);
      expect(actor.horizontalSpeed).toBeGreaterThan(0);
      expect(actor.horizontalSpeed).toBeLessThanOrEqual(type.speed.crawlMetresPerSimSecond);
      expect(actor.body.pos).not.toEqual(before);
      const input = actorPoseInputFor(actor, id, BLOCK_SIZE);
      const posed = posedActor(input);
      const crawl = crawlGaitPose(posed.figure.realized, input.gaitPhase, input.speed);
      expect(posed.pose.rotations.pelvis).toEqual(crawl.rotations.pelvis);
      expect(actor.type.id).toBe(type.id);
      expect(posed.figure).toBe(actorFigure(actor.type, actor.figureSeed));
      const boxes = posedHumanoidRegionBoxes(input);
      expect(boxes.leftLeg).toEqual([]);
      expect(boxes.rightLeg.length).toBeGreaterThan(0);
      expect(boxes.torso.length).toBeGreaterThan(0);
      const restored = new ActorSystem(senses(() => player([100, 2, 0])));
      restored.restoreState(system.snapshotState(), (typeId) => registry.actors.get(typeId));
      const loaded = restored.store.get(id)!;
      expect(posedActor(actorPoseInputFor(loaded, id, BLOCK_SIZE)).pose).toEqual(posed.pose);
      expect(loaded.regions).toEqual(actor.regions);
      expect(loaded.severed).toEqual(actor.severed);
    },
  );

  it('F: melee hits obey cooldown, damage and range; fixture fists can kill shamblers', () => {
    let elapsed = 0;
    const hitTimes: number[] = [];
    const system = new ActorSystem(
      senses(
        () => player([0, 2, 0]),
        FLOOR,
        () => 12,
        (damage) => {
          expect(SHAMBLER_MOVE_DAMAGES).toContain(damage);
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
    const outside = new ActorSystem(
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
    const fistSystem = new ActorSystem(senses(() => player([100, 2, 0])));
    const fistId = fistSystem.add(stationary, [0.5, 1, 0]);
    let deathDrops = 0;
    // Recreate with a death callback to assert the production drop hook runs.

    const fists = new ActorSystem({
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
  });

  it('god mode blocks shambler damage without stopping attacks or their cooldown', () => {
    const simulateAttacks = (godMode: boolean) => {
      const sim = new Simulation({
        seed: 9,
        registry,
        bodyTuning: registry.body.get('player')!,
        compressionCaps: registry.compression.get('player')!.caps,
        clock: BASE_CLOCK,
      });
      sim.godMode = godMode;
      let hits = 0;
      const system = new ActorSystem(
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

  it('loads a fixture horde once with its group membership intact', () => {
    const base = new SnapshotSite(7, registry, SCALE);
    const site = {
      ...spawnSite({ type: 'shambler', pos: [0, 41, 0] }),
      registry,
      seed: 7,
      surface: base.surface,
      hordesIn: (cx: number, cz: number) =>
        cx === 0 && cz === 0 ? [{ id: 'fixture-horde', type: 'shambler', pos: [0, 41, 0] as Vec3, members: 20 }] : [],
    };
    let column: [number, number] | undefined;
    for (let cz = -20; cz <= 20 && !column; cz++) {
      for (let cx = -20; cx <= 20 && !column; cx++) {
        if (site.hordesIn(cx, cz).length > 0) {
          column = [cx, cz];
        }
      }
    }
    expect(column).toBeDefined();
    const spawner = new ActorSpawner();
    const system = new ActorSystem(senses(() => player([1000, 2, 1000])));
    spawner.onColumn({ cx: column![0], cz: column![1], site, registry, actors: system });
    const state = system.snapshotState();
    const id = state.hordes[0]?.id;
    expect(id).toBeDefined();
    expect([...system.store.entries()].some(([, actor]) => actor.agent!.hordeId === id)).toBe(true);
    const { size } = system.store;
    spawner.onColumn({ cx: column![0], cz: column![1], site, registry, actors: system });
    expect(system.store.size).toBe(size);
    expect(system.snapshotState()).toEqual(state);
  });

  it('G: a killed fixture shambler stays gone when its column reloads', () => {
    const site = new SnapshotSite(7, registry, SCALE);
    let column: [number, number] | undefined;
    for (let cz = -20; cz <= 20 && !column; cz++) {
      for (let cx = -20; cx <= 20 && !column; cx++) {
        if (site.actorsIn(cx, cz).length > 0) {
          column = [cx, cz];
        }
      }
    }
    expect(column).toBeDefined();
    const spawner = new ActorSpawner();
    const system = new ActorSystem(senses(() => player([1000, 2, 1000])));
    spawner.onColumn({ cx: column![0], cz: column![1], site, registry, actors: system });
    const initial = [...system.store.entries()];
    expect(initial.length).toBeGreaterThan(0);
    const [id, actor] = initial[0]!;
    while (system.store.get(id)) {
      const ray = regionRay(actor, 'head');
      expect(system.swing(ray.origin, ray.direction, FISTS_MELEE)).toBe(id);
      run(system, FISTS_MELEE.cooldown);
    }
    const survivors = system.store.size;
    spawner.onColumn({ cx: column![0], cz: column![1], site, registry, actors: system });
    expect(system.store.get(id)).toBeUndefined();
    expect(system.store.size).toBe(survivors);
  });

  it('waits for the game clock to enter a loaded spawn marker window', () => {
    const spawn: ActorSpawn = {
      type: 'shambler',
      pos: [0, 1, 0],
      window: { fromGameTimeOfDay: gameTimeOfDay(DUSK) },
    };
    const site = spawnSite(spawn);
    const spawner = new ActorSpawner();
    const system = new ActorSystem(senses(() => player([1000, 2, 1000])));
    const load = () => spawner.onColumn({ cx: 0, cz: 0, site, registry, actors: system });

    load();
    expect(system.store.size).toBe(0);
    spawner.advance({ calendar: DUSK - 1, registry, actors: system });
    expect(system.store.size).toBe(0);
    spawner.advance({ calendar: DUSK, registry, actors: system });
    expect(system.store.size).toBe(1);
    expect(spawner.snapshotState()).toContain('shambler:0,1,0');
  });

  it('spawns same-tick pending markers in stable order regardless of column load order', () => {
    const markers: ActorSpawn[] = [
      { type: 'shambler', pos: [0, 1, 0], window: { fromGameTimeOfDay: gameTimeOfDay(DUSK) } },
      { type: 'shambler', pos: [32, 1, 0], window: { fromGameTimeOfDay: gameTimeOfDay(DUSK) } },
    ];
    const spawnOrder = (order: readonly ActorSpawn[]) => {
      const system = new ActorSystem(senses(() => player([1000, 2, 1000])));
      const spawner = new ActorSpawner();
      order.forEach((spawn, cx) => {
        spawner.onColumn({
          cx,
          cz: 0,
          site: spawnSite(spawn),
          registry,
          actors: system,
        });
      });
      spawner.advance({ calendar: DUSK, registry, actors: system });
      return [...system.store.entries()].map(([id, actor]) => ({ id, home: actor.agent!.home }));
    };

    const first = spawnOrder(markers);
    expect(first.map(({ home }) => home)).toEqual([
      [0, 1, 0],
      [32, 1, 0],
    ]);
    expect(first).toEqual(spawnOrder([...markers].reverse()));
  });

  it('queues a windowed marker loaded inside its open interval until advance', () => {
    const spawn: ActorSpawn = {
      type: 'shambler',
      pos: [0, 1, 0],
      window: { fromGameTimeOfDay: gameTimeOfDay(DUSK), toGameTimeOfDay: gameTimeOfDay(20 * 3600) },
    };
    const system = new ActorSystem(senses(() => player([1000, 2, 1000])));
    const spawner = new ActorSpawner();
    spawner.onColumn({
      cx: 0,
      cz: 0,
      site: spawnSite(spawn),
      registry,
      actors: system,
    });
    expect(system.store.size).toBe(0);
    spawner.advance({ calendar: DUSK + 1, registry, actors: system });
    expect(system.store.size).toBe(1);
  });

  it('drops pending markers on unload and retries a missed bounded window the next day', () => {
    const spawn: ActorSpawn = {
      type: 'shambler',
      pos: [0, 1, 0],
      window: { fromGameTimeOfDay: gameTimeOfDay(DUSK), toGameTimeOfDay: gameTimeOfDay(20 * 3600) },
    };
    const site = spawnSite(spawn);
    const system = new ActorSystem(senses(() => player([1000, 2, 1000])));
    const spawner = new ActorSpawner();
    const load = () => spawner.onColumn({ cx: 0, cz: 0, site, registry, actors: system });
    load();
    spawner.unloadColumn(0, 0);
    spawner.advance({ calendar: DUSK + SECONDS_PER_DAY, registry, actors: system });
    expect(system.store.size).toBe(0);

    load();
    spawner.advance({ calendar: DUSK + SECONDS_PER_DAY, registry, actors: system });
    expect(system.store.size).toBe(1);
    const [id] = system.store.entries().next().value!;
    system.store.remove(id);
    load();
    spawner.advance({ calendar: DUSK + 2 * SECONDS_PER_DAY, registry, actors: system });
    expect(system.store.size).toBe(0);
    expect(spawner.snapshotState()).toContain('shambler:0,1,0');

    const restored = new ActorSpawner();
    restored.restoreState(spawner.snapshotState());
    const afterRestore = new ActorSystem(senses(() => player([1000, 2, 1000])));
    restored.onColumn({
      cx: 0,
      cz: 0,
      site,
      registry,
      actors: afterRestore,
    });
    expect(afterRestore.store.size).toBe(0);
  });

  it('gait phase tracks travelled distance during wander, chase and obstacle response', () => {
    const slow = { ...SHAMBLER, speed: { ...SHAMBLER.speed, wander: 0.8 } };
    const wander = new ActorSystem(senses(() => player([1000, 1, 1000])));
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
    const chase = new ActorSystem(senses(() => player(target, [-1, 0, 0])));
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
    const blocked = new ActorSystem(senses(() => player([10, 1, 0], [-1, 0, 0], 'sprinting'), wall));
    const blockedId = blocked.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    const blockedActor = blocked.store.get(blockedId)!;
    run(blocked, 2);
    expect(blockedActor.agent!.mode).toBe('investigate');
    expect(blockedActor.body.pos[0]).toBeLessThan(1);
    const phaseAtWall = blockedActor.gaitPhase;
    let detourDistance = 0;
    for (let frame = 0; frame < 10 * 60; frame++) {
      const before = [...blockedActor.body.pos] as Vec3;
      blocked.tick(1 / 60);
      detourDistance += metres(before, blockedActor.body.pos);
    }
    expect(detourDistance).toBeGreaterThan(0);
    expect(blockedActor.gaitPhase).toBeGreaterThan(phaseAtWall);
    expect(blockedActor.gaitPhase).toBeCloseTo(
      phaseAtWall + (detourDistance / blockedActor.type.stepLength) * Math.PI,
      5,
    );
  });

  // biome-ignore lint/style/noProcessEnv: this benchmark is explicitly opt-in.
  describe.runIf(process.env.SKELLY_BENCH === '1')('shambler CPU benchmark', () => {
    it('stays within its per-tick budget', () => {
      const system = new ActorSystem(senses(() => player([0, 2, 0])));
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
    const meshes = new ActorMeshes(BLOCK_SIZE);
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
    const { system, actor } = standing([1.4, 1, 0], [1, 0, 0]);
    actor.body.vel[0] = 2.8 / BLOCK_SIZE;
    const meshes = new ActorMeshes(BLOCK_SIZE);
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
      expect(drawn.x).toBeCloseTo(actor.body.pos[0] * BLOCK_SIZE, 5);
      return drawn.y;
    };

    const beforeStep = syncFrame(0);
    stepBody(actor.body, 1 / 20, stepWorld, PHYSICS);
    expect(actor.body.pos[1]).toBeCloseTo(2, 3);
    expect(actor.body.onGround).toBe(true);
    let previousDrawnY = syncFrame(1 / 60);
    expect(Math.abs(previousDrawnY - beforeStep)).toBeLessThanOrEqual(0.06);
    for (let frame = 1; frame < 15; frame++) {
      const drawnY = syncFrame(1 / 60);
      expect(Math.abs(drawnY - previousDrawnY)).toBeLessThanOrEqual(0.06);
      previousDrawnY = drawnY;
    }
    expect(previousDrawnY).toBeCloseTo(actor.body.pos[1] * BLOCK_SIZE, 5);

    const beforeSnapDown = previousDrawnY;
    actor.body.pos[1] -= 1;
    previousDrawnY = syncFrame(1 / 60);
    expect(Math.abs(previousDrawnY - beforeSnapDown)).toBeLessThanOrEqual(0.06);
    for (let frame = 1; frame < 15; frame++) {
      const drawnY = syncFrame(1 / 60);
      expect(Math.abs(drawnY - previousDrawnY)).toBeLessThanOrEqual(0.06);
      previousDrawnY = drawnY;
    }
    expect(previousDrawnY).toBeCloseTo(actor.body.pos[1] * BLOCK_SIZE, 5);
  });

  it('hides severed regions while keeping the other figure instances visible', () => {
    const meshes = new ActorMeshes(BLOCK_SIZE);
    const { system, actor } = standing([4, 1, 4], [1, 0, 0]);
    const parts = meshes.group.children as import('three').InstancedMesh[];
    const meshFor = (part: (typeof FIGURE_PARTS)[number]) => parts[FIGURE_PARTS.indexOf(part)]!;
    meshes.sync(system.store);
    expect(parts.every((mesh) => mesh.count === 1)).toBe(true);

    actor.regions.leftArm = 0;
    actor.regions.torso = 0;
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
    const meshes = new ActorMeshes(BLOCK_SIZE);
    const { system, id, actor } = standing([4, 1, 4], [1, 0, 0]);
    meshes.sync(system.store);
    const parts = meshes.group.children as import('three').InstancedMesh[];
    const boxes = parts.flatMap((mesh) => instanceBox(mesh));
    const points = boxes.flatMap(({ points: corners }) => corners);
    const minY = Math.min(...points.map(({ y }) => y));
    const maxY = Math.max(...points.map(({ y }) => y));
    const widthX = Math.max(...points.map(({ x }) => x)) - Math.min(...points.map(({ x }) => x));
    const widthZ = Math.max(...points.map(({ z }) => z)) - Math.min(...points.map(({ z }) => z));
    expect(Math.abs(minY - actor.body.pos[1] * BLOCK_SIZE)).toBeLessThanOrEqual(0.05);
    expect(maxY - minY).toBeCloseTo(actor.body.height * BLOCK_SIZE, 1);
    expect(Math.max(widthX, widthZ)).toBeCloseTo(actor.body.halfWidth * 2 * BLOCK_SIZE, 1);

    const legs = [parts[4]!, parts[5]!];
    const feetAtFrame = (frame: number) => {
      actor.body.vel[0] = 1.6;
      actor.gaitPhase = frame === 0 ? 0 : 0.12;
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
      actor.body.vel[0] = 1.6;
      actor.gaitPhase = phase;
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
    actor.body.vel[0] = 0;
    actor.gaitPhase = Math.PI / 2;
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
      agent: {
        ...SHAMBLER.agent!,
        hearingRange: { ...SHAMBLER.agent!.hearingRange, sprint: 4 },
        hearingModel: {
          ...SHAMBLER.agent!.hearingModel,
          farMultiplier: 4,
          investigationDistanceMetres: 4,
          bearingErrorRadians: 0,
        },
      },
    };
    const system = new ActorSystem({
      ...senses(() => player(source, [-1, 0, 0], 'sprinting'), solid),
      isOpaque: () => true,
      terrainFloor,
    });
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    system.tick(1 / 20);
    const actor = system.store.get(id)!;
    expect(actor.agent!.investigationTier).toBe('far');
    expect(actor.agent!.lastPerceived).toBeDefined();
    const [gx, gy, gz] = actor.agent!.lastPerceived!.map(Math.floor);
    expect(solid(gx!, gy!, gz!)).toBe(false);
    expect(solid(gx!, gy! - 1, gz!)).toBe(true);
    expect(actor.agent!.lastPerceived![1]).not.toBe(source[1]);
  });

  it('keeps a visible high target in sight as it moves to a higher elevation', () => {
    const terrainFloor = (x: number) => 1 + Math.max(0, Math.floor((x - 1) / 2));
    const solid: SolidAt = (x, y) => y < terrainFloor(x);
    const source: Vec3 = [1, terrainFloor(1), 0];
    const targetX = source[0] + Math.floor(SHAMBLER.agent!.sight / BLOCK_SIZE) - 1;
    const highTarget: Vec3 = [targetX, terrainFloor(targetX), 0];
    const initialTarget: Vec3 = [source[0] + 2, terrainFloor(source[0] + 2), 0];
    const type = {
      ...SHAMBLER,
      speed: speedRates(0, 2),
      chaseMotion: {
        ...SHAMBLER.chaseMotion!,
        swayDegrees: 0,
        speedMultiplier: { min: 1, max: 1 },
        stumbleChancePerSimSecond: simRate(0),
      },
    };
    let target = initialTarget;
    const system = new ActorSystem({
      ...senses(() => player(target, [-1, 0, 0]), solid),
      terrainFloor,
    });
    const id = system.add(type, source, [1, 0, 0]);
    const actor = system.store.get(id)!;
    system.tick(1 / 20, 1 / 20);
    expect(actor.agent!.mode).toBe('chase');

    target = highTarget;
    const startDistance = metres(actor.body.pos, target);
    const spatialDistance =
      Math.hypot(target[0] - actor.body.pos[0], target[1] - actor.body.pos[1], target[2] - actor.body.pos[2]) *
      BLOCK_SIZE;
    expect(startDistance).toBeLessThanOrEqual(type.agent!.sight);
    expect(spatialDistance).toBeGreaterThan(type.agent!.sight);

    for (let tick = 2; tick <= 10; tick++) {
      system.tick(1 / 20, tick / 20);
      expect(actor.agent!.mode).toBe('chase');
    }

    for (let tick = 11; tick <= 20 * 20; tick++) {
      system.tick(1 / 20, tick / 20);
      expect(bodyHitsSolid(actor.body, solid)).toBe(false);
    }

    expect(actor.agent!.mode).toBe('chase');
    expect(actor.body.onGround).toBe(true);
    expect(actor.body.pos[1]).toBeGreaterThan(source[1]);
    expect(metres(actor.body.pos, target)).toBeLessThan(startDistance);
  });

  it('pursues a grounded target over graded terrain without treating height changes as storeys', () => {
    const terrainFloor = (x: number) => 1 + Math.max(0, Math.floor(x / 5));
    const solid: SolidAt = (x, y) => y < terrainFloor(x);
    const target: Vec3 = [31, terrainFloor(31), 0];
    const type = {
      ...SHAMBLER,
      speed: speedRates(0, 2),
      chaseMotion: {
        ...SHAMBLER.chaseMotion!,
        swayDegrees: 0,
        speedMultiplier: { min: 1, max: 1 },
        stumbleChancePerSimSecond: simRate(0),
      },
      agent: { ...SHAMBLER.agent!, hearingRange: { ...SHAMBLER.agent!.hearingRange, sprint: 1000 } },
    };
    const system = new ActorSystem({
      ...senses(() => player(target, [-1, 0, 0], 'sprinting'), solid),
      terrainFloor,
    });
    const id = system.add(type, [1, terrainFloor(1), 0], [1, 0, 0]);
    const actor = system.store.get(id)!;
    for (let tick = 1; tick <= 20 * 25; tick++) {
      system.tick(1 / 20, tick / 20);
      expect(bodyHitsSolid(actor.body, solid)).toBe(false);
    }
    expect(Math.hypot(actor.body.pos[0] - target[0], actor.body.pos[2] - target[2]) * BLOCK_SIZE).toBeLessThanOrEqual(
      type.attack!.reach,
    );
  });

  it('keeps beelining to a distant same-floor target', () => {
    const target: Vec3 = [60, 1, 1];
    const blockSize = 0.5;
    const type = {
      ...SHAMBLER,
      speed: speedRates(0, 2),
      chaseMotion: {
        ...SHAMBLER.chaseMotion!,
        swayDegrees: 0,
        speedMultiplier: { min: 1, max: 1 },
        stumbleChancePerSimSecond: simRate(0),
      },
      agent: { ...SHAMBLER.agent!, sight: 1000, hearingRange: { ...SHAMBLER.agent!.hearingRange, sprint: 1000 } },
    };
    const system = new ActorSystem({
      ...senses(() => player(target, [-1, 0, 0], 'sprinting')),
      blockSize,
      dayPhase: () => dayStateAtHour(12),
    });
    const id = system.add(type, [1, 1, 1]);
    const actor = system.store.get(id)!;
    for (let tick = 1; tick <= 20 * 40; tick++) {
      system.tick(1 / 20, tick / 20);
    }
    expect(Math.hypot(actor.body.pos[0] - target[0], actor.body.pos[2] - target[2]) * blockSize).toBeLessThanOrEqual(
      type.attack!.reach,
    );
  });

  it('keeps closing on a target that crosses block cells', () => {
    const blockSize = 0.5;
    const startTargetX = 40.25;
    let target: Vec3 = [startTargetX, 1, 1];
    const type = {
      ...SHAMBLER,
      speed: speedRates(0, 2),
      chaseMotion: {
        ...SHAMBLER.chaseMotion!,
        swayDegrees: 0,
        speedMultiplier: { min: 1, max: 1 },
        stumbleChancePerSimSecond: simRate(0),
      },
      agent: { ...SHAMBLER.agent!, sight: 1000 },
    };
    const system = new ActorSystem({
      ...senses(() => player(target, [-1, 0, 0], 'still')),
      blockSize,
    });
    const id = system.add(type, [1, 1, 1], [1, 0, 0]);
    const actor = system.store.get(id)!;
    const initialDistance = metres(actor.body.pos, target);
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
    expect(metres(actor.body.pos, target)).toBeLessThan(initialDistance);
  });
});

describe('lurching chase', () => {
  it('eases each stumble into and out of a near-stop for at least 0.2 s', () => {
    const type = {
      ...SHAMBLER,
      chaseMotion: { ...SHAMBLER.chaseMotion!, stumbleChancePerSimSecond: simRate(1) },
      agent: { ...SHAMBLER.agent!, sight: 1000 },
    };
    const system = new ActorSystem({ ...senses(() => player([20, 1, 0])), seed: 19 });
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const actor = system.store.get(id)!;
    settle(actor.body);
    const factors: number[] = [];
    for (let tick = 0; tick < 60 * 20; tick++) {
      system.tick(1 / 20);
      factors.push(actor.stumbleFactor);
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
    const system = new ActorSystem({ ...senses(() => player(target)), seed: 91 });
    const id = system.add(SHAMBLER, [0, 1, 0], [1, 0, 0]);
    const actor = system.store.get(id)!;
    settle(actor.body);
    const lateral: number[] = [];
    const speeds: number[] = [];
    let ticks = 0;
    for (; ticks < 20 * 15; ticks++) {
      const before = [...actor.body.pos] as Vec3;
      system.tick(1 / 20);
      lateral.push(actor.body.pos[2] * BLOCK_SIZE);
      const speed = metres(before, actor.body.pos) * 20;
      if (ticks >= 20 && metres(actor.body.pos, target) > 4) {
        speeds.push(speed);
      }
      if (metres(actor.body.pos, target) <= SHAMBLER.attack!.reach) {
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
        SHAMBLER.attack!.reach -
        SHAMBLER.speed.chaseMetresPerSimSecond ** 2 /
          (2 * SHAMBLER.motion.movementAccelerationMetresPerSimSecondSquared)) /
        SHAMBLER.speed.chaseMetresPerSimSecond +
      SHAMBLER.speed.chaseMetresPerSimSecond / SHAMBLER.motion.movementAccelerationMetresPerSimSecondSquared;
    expect(ticks / 20).toBeLessThanOrEqual(beelineSeconds * 1.6);
  });
});

describe('facing-directed movement', () => {
  type TravelMode = 'stroll' | 'investigate' | 'return' | 'chase';
  const createScenario = (mode: TravelMode) => {
    const distant = player([1000, 1, 1000]);
    let sensed = mode === 'stroll' ? distant : player([10, 1, 0], [-1, 0, 0], 'sprinting');
    const type = { ...SHAMBLER, agent: { ...SHAMBLER.agent!, sight: 100, nightSight: 100, sightCone: 180 } };
    const system = new ActorSystem({
      ...senses(() => sensed),
      isOpaque: () => mode === 'investigate',
    });
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const actor = system.store.get(id)!;
    if (mode === 'return') {
      run(system, 2);
      sensed = distant;
    }
    for (let tick = 0; tick < 60 * 20 && actor.agent!.mode !== mode; tick++) {
      const time = mode === 'return' ? type.agent.stimulusMemorySimSeconds + 3 + tick / 20 : tick / 20;
      system.tick(1 / 20, time);
    }
    if (actor.agent!.mode !== mode) {
      throw new Error(`Fixture shambler did not enter ${mode}`);
    }
    if (mode === 'investigate') {
      sensed = distant;
    }
    return {
      system,
      actor,
      reverseTarget: () => {
        sensed = player([-10, 1, 0]);
      },
    };
  };
  const velocityFacingErrorDegrees = (actor: ReturnType<ActorSystem['store']['get']>): number | undefined => {
    if (!actor || Math.hypot(actor.body.vel[0], actor.body.vel[2]) < 0.01) {
      return undefined;
    }
    const velocityYaw = Math.atan2(actor.body.vel[0], actor.body.vel[2]);
    const facingYaw = Math.atan2(actor.facing[0], actor.facing[2]);
    const error = Math.abs(Math.atan2(Math.sin(velocityYaw - facingYaw), Math.cos(velocityYaw - facingYaw)));
    return (error * 180) / Math.PI;
  };
  const exercise = (mode: TravelMode): { observed: Set<string>; errors: number[] } => {
    const { system, actor, reverseTarget } = createScenario(mode);
    const observed = new Set<string>();
    const errors: number[] = [];
    for (let tick = 0; tick < 80; tick++) {
      if (mode === 'chase' && tick === 20) {
        reverseTarget();
      }
      system.tick(1 / 20);
      observed.add(actor.agent!.mode);
      const error = velocityFacingErrorDegrees(actor);
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
      def: SHAMBLER,
      from,
      player: source,
      blockSize: BLOCK_SIZE,
      isSolid,
      rng: Rng.stream(seed, 'hearing-test'),
      tuning: SENSE_TUNING,
    });

  it('reports the exact near source and bounded, approximate far bearings over fifty seeds', () => {
    const from: Vec3 = [0, 1, 0];
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
      expect(error).toBeLessThanOrEqual(SHAMBLER.agent!.hearingModel.bearingErrorRadians);
    }
    const sprintRange = SHAMBLER.agent!.hearingRange.sprint * SHAMBLER.agent!.hearing;
    const withinFarLimit = hearing(
      51,
      from,
      player(
        [(sprintRange * (SHAMBLER.agent!.hearingModel.farMultiplier - 0.1)) / BLOCK_SIZE, 1, 0],
        [-1, 0, 0],
        'sprinting',
      ),
    );
    const outsideFarLimit = hearing(
      52,
      from,
      player(
        [(sprintRange * (SHAMBLER.agent!.hearingModel.farMultiplier + 0.1)) / BLOCK_SIZE, 1, 0],
        [-1, 0, 0],
        'sprinting',
      ),
    );
    expect(withinFarLimit?.tier).toBe('far');
    expect(outsideFarLimit).toBeUndefined();
  });

  it('hears player vocal noise within its radius, demotes through a wall, and uses the configured far tier', () => {
    const from: Vec3 = [0, 1, 0];
    const noise = { id: 1, pos: [10, 1, 0] as Vec3, radiusMetres: 6, expiresAt: 1 };
    const hear = (pos: Vec3, isSolid: SolidAt = () => false) =>
      hearVocalNoise({
        def: SHAMBLER,
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

  it('makes a loud still-player vocalization alert and investigate once', () => {
    const noise = { id: 44, pos: [12, 1, 0] as Vec3, radiusMetres: 6, expiresAt: 1 };
    const type = {
      ...SHAMBLER,
      agent: {
        ...SHAMBLER.agent!,
        sight: 0.01,
        nightSight: 0.01,
        hearingModel: { ...SHAMBLER.agent!.hearingModel, loudNoiseRadiusMetres: noise.radiusMetres },
      },
    };
    const target = { ...player(noise.pos), vocalNoise: noise };
    const heard: string[] = [];
    const system = new ActorSystem({
      ...senses(() => target),
      seed: 21,
      onSound: (event) => heard.push(event),
    });
    const id = system.add(type, [0, 1, 0]);
    const actor = system.store.get(id)!;

    system.tick(1 / 20, 0.05);
    expect(actor.agent!.mode).toBe('investigate');
    expect(actor.agent!.investigationTier).toBe('near');
    expect(actor.agent!.lastPerceived).toEqual(noise.pos);
    expect(heard).toContain('shambler_alert');
    system.tick(1 / 20, 0.1);
    expect(heard.filter((event) => event === 'shambler_alert')).toHaveLength(1);

    const distantNoise = { ...noise, id: 45, pos: [26, 1, 0] as Vec3 };
    const distantPlayer = { ...player(distantNoise.pos), vocalNoise: distantNoise };
    const distantSystem = new ActorSystem(senses(() => distantPlayer));
    const distantId = distantSystem.add(
      { ...SHAMBLER, agent: { ...SHAMBLER.agent!, sight: 0.01, nightSight: 0.01 } },
      [0, 1, 0],
    );
    distantSystem.tick(1 / 20, 0.05);
    expect(distantSystem.store.get(distantId)!.agent!.mode).toBe('idle');
  });

  it('does not leak a heard vocal noise into the next actor pass', function vocalNoiseDoesNotLeakBetweenActorPasses() {
    const noise = { id: 46, pos: [12, 1, 0] as Vec3, radiusMetres: 6, expiresAt: 1 };
    const target = { ...player([1000, 1, 0]), vocalNoise: noise };
    const system = new ActorSystem(senses(() => target));
    const secondId = system.add(SHAMBLER, [80, 1, 0]);
    const second = system.store.get(secondId)!;
    system.tick(1 / 20, 0.05);
    expect(second.agent!.lastVocalNoiseId).toBe(noise.id);
    expect(second.agent!.mode).toBe('idle');

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

    expect(first.agent!.mode).toBe('hesitate');
    expect(first.agent!.lastPerceived).toBeDefined();
    expect(second.agent!.mode).toBe('idle');
    expect(second.agent!.lastPerceived).toBeUndefined();
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
    const nearSystem = new ActorSystem({ ...senses(() => nearPlayer), seed: 17 });
    const nearId = nearSystem.add({ ...SHAMBLER, agent: { ...SHAMBLER.agent!, sight: 1, nightSight: 1 } }, [0, 1, 0]);
    nearSystem.tick(1 / 20);
    const nearActor = nearSystem.store.get(nearId)!;
    expect(nearActor.agent!.mode).toBe('investigate');
    expect(nearActor.agent!.investigationTier).toBe('near');
    expect(nearActor.agent!.lastPerceived).toEqual(nearPlayer.pos);

    const distant = player([35, 1, 0], [-1, 0, 0], 'sprinting');
    const farSystem = new ActorSystem({ ...senses(() => distant), seed: 17 });
    const farId = farSystem.add({ ...SHAMBLER, agent: { ...SHAMBLER.agent!, sight: 1, nightSight: 1 } }, [0, 1, 0]);
    farSystem.tick(1 / 20);
    const curious = farSystem.store.get(farId)!;
    expect(curious.agent!.mode).toBe('investigate');
    expect(curious.agent!.investigationTier).toBe('far');
    expect(curious.agent!.lastPerceived).not.toEqual(distant.pos);

    curious.agent!.mode = 'chase';
    curious.chaseStance = true;
    curious.agent!.lastPerceived = [3, 1, 0];
    farSystem.tick(1 / 20);
    expect(curious.agent!.mode).toBe('investigate');
    expect(curious.agent!.investigationTier).toBe('near');
    expect(curious.agent!.lastPerceived).toEqual([3, 1, 0]);
    curious.agent!.mode = 'investigate';
    curious.chaseStance = false;
    curious.agent!.investigationTier = 'near';
    curious.agent!.lastPerceived = [4, 1, 0];
    farSystem.tick(1 / 20);
    expect(curious.agent!.mode).toBe('investigate');
    expect(curious.agent!.investigationTier).toBe('near');
    expect(curious.agent!.lastPerceived).toEqual([4, 1, 0]);
  });

  it('lets a far noise during search restart investigation from a new bearing', () => {
    const distant = player([50, 1, 0], [-1, 0, 0], 'sprinting');
    const system = new ActorSystem({ ...senses(() => distant), seed: 27 });
    const id = system.add({ ...SHAMBLER, agent: { ...SHAMBLER.agent!, sight: 0.01, nightSight: 0.01 } }, [0, 1, 0]);
    const actor = system.store.get(id)!;
    settle(actor.body);
    actor.agent!.mode = 'search';
    actor.chaseStance = false;
    actor.agent!.searchAnchor = [0, 1, 0];
    actor.agent!.searchTimer = 30;
    actor.agent!.searchStrolling = false;
    const before = [...actor.body.pos] as Vec3;
    system.tick(1 / 20);
    expect(actor.agent!.mode).toBe('investigate');
    expect(actor.agent!.investigationTier).toBe('far');
    expect(actor.agent!.lastPerceived).not.toEqual(distant.pos);
    expect(metres(actor.agent!.lastPerceived!, before)).toBeCloseTo(
      SHAMBLER.agent!.hearingModel.investigationDistanceMetres,
      5,
    );
  });

  const advanceToMode = (
    system: ActorSystem,
    actor: NonNullable<ReturnType<ActorSystem['store']['get']>>,
    mode: string,
    maxTicks: number,
  ): boolean => {
    for (let tick = 0; tick < maxTicks && actor.agent!.mode !== mode; tick++) {
      system.tick(1 / 20);
    }
    return actor.agent!.mode === mode;
  };
  const stayInsideSearch = (
    system: ActorSystem,
    actor: NonNullable<ReturnType<ActorSystem['store']['get']>>,
    ticks: number,
    radius: number,
  ): boolean => {
    let sawStroll = false;
    for (let tick = 0; tick < ticks; tick++) {
      system.tick(1 / 20);
      if (actor.agent!.mode !== 'search' || metres(actor.body.pos, actor.agent!.searchAnchor!) > radius + 0.01) {
        return false;
      }
      sawStroll ||= actor.agent!.searchStrolling;
    }
    return sawStroll;
  };
  const finishSearch = (
    system: ActorSystem,
    actor: NonNullable<ReturnType<ActorSystem['store']['get']>>,
    maxTicks: number,
    radius: number,
  ): boolean => {
    for (let tick = 0; tick < maxTicks && actor.agent!.mode === 'search'; tick++) {
      system.tick(1 / 20);
      if (actor.agent!.mode === 'search' && metres(actor.body.pos, actor.agent!.searchAnchor!) > radius + 0.01) {
        return false;
      }
    }
    return actor.agent!.mode === 'return';
  };

  it('searches around a near sound for its data duration and restarts around a second exact sound', () => {
    let noise = player([20, 1, 0], [-1, 0, 0], 'sprinting');
    const system = new ActorSystem({ ...senses(() => noise), seed: 113 });
    const type = { ...SHAMBLER, agent: { ...SHAMBLER.agent!, sight: 0.01, nightSight: 0.01 } };
    const actor = system.store.get(system.add(type, [0, 1, 0]))!;
    settle(actor.body);
    expect(advanceToMode(system, actor, 'investigate', 200)).toBe(true);
    noise = { ...noise, movement: 'still' };
    expect(advanceToMode(system, actor, 'search', 200)).toBe(true);
    expect(actor.agent!.searchAnchor).toEqual([20, 1, 0]);
    for (let tick = 0; tick < 20; tick++) {
      system.tick(1 / 20);
      expect(actor.agent!.mode).toBe('search');
    }

    noise = player([24, 1, 0], [-1, 0, 0], 'sprinting');
    system.tick(1 / 20);
    expect(actor.agent!.mode).toBe('investigate');
    expect(actor.agent!.investigationTier).toBe('near');
    expect(actor.agent!.lastPerceived).toEqual(noise.pos);
    noise = { ...noise, movement: 'still' };
    expect(advanceToMode(system, actor, 'search', 200)).toBe(true);
    expect(actor.agent!.searchAnchor).toEqual([24, 1, 0]);
    expect(actor.agent!.searchTimer).toBeGreaterThanOrEqual(type.agent.hearingModel.searchSimSeconds.min);
    expect(actor.agent!.searchTimer).toBeLessThanOrEqual(type.agent.hearingModel.searchSimSeconds.max);

    const minSearchTicks = Math.floor((type.agent.hearingModel.searchSimSeconds.min - 0.1) * 20);
    expect(stayInsideSearch(system, actor, minSearchTicks, type.agent.hearingModel.searchRadiusMetres)).toBe(true);
    expect(
      finishSearch(
        system,
        actor,
        type.agent.hearingModel.searchSimSeconds.max * 20 + 5,
        type.agent.hearingModel.searchRadiusMetres,
      ),
    ).toBe(true);
    expect(advanceToMode(system, actor, 'idle', 20 * 20)).toBe(true);
  });
});

describe('background actor tier', () => {
  it('uses authored liveness radius to classify a loaded actor', () => {
    for (const [activeActorRadiusMetres, tier] of [
      [7, 'background'],
      [17, 'active'],
    ] as const) {
      const system = new ActorSystem({
        ...senses(() => player([0, 1, 0])),
        activeActorRadiusMetres,
      });
      const actor = system.store.get(system.add(SHAMBLER, [12 / BLOCK_SIZE, 1, 0]))!;
      system.tickActive(1 / 20, 0);
      expect(actor.tier).toBe(tier);
    }
  });

  it('routes firearm reports into the long-range player-noise channel', () => {
    for (const id of ['gunshot', 'gunshot_pbs1_reference', 'shotgun_blast']) {
      const noise = registry.sounds.get(id)?.noise;
      expect(noise?.enabled).toBe(true);
      expect(noise?.radiusMetres).toBeGreaterThan(registry.siteGeneration.get('authored')!.activeActorRadiusMetres);
    }
  });

  it('takes reduced-rate beeline steps toward a heard shot without crossing a wall', () => {
    const wall: SolidAt = (x, y) => y === 0 || (x === 100 && y > 0 && y < 5);
    const noise = { id: 1, pos: [0, 1, 0] as Vec3, radiusMetres: 300, expiresAt: 60 };
    const target = { ...player([0, 1, 0]), vocalNoise: noise };
    const system = new ActorSystem({ ...senses(() => target, wall), isLoaded: () => true });
    const id = system.add(SHAMBLER, [200, 1, 0]);
    const actor = system.store.get(id)!;
    system.tickBackground(0.5, 0.5);
    expect(actor.tier).toBe('background');
    expect(actor.agent!.lastVocalNoiseId).toBe(noise.id);
    const startDistance = metres(actor.body.pos, target.pos);
    for (let step = 1; step < 60; step++) {
      system.tickBackground(0.5, (step + 1) * 0.5);
    }
    expect(metres(actor.body.pos, target.pos)).toBeLessThan(startDistance);
    expect(actor.body.pos[0]).toBeGreaterThan(100);
  });

  it('does not turn an unalerted background actor into a player-seeking beeline', () => {
    const opaqueScreen: SolidAt = (x, y, z) => FLOOR(x, y, z) || (x === 100 && y > 0 && y < 5);
    const system = new ActorSystem({
      ...senses(() => player([0, 1, 0]), FLOOR),
      isOpaque: opaqueScreen,
      isLoaded: () => true,
    });
    const id = system.add(SHAMBLER, [200, 1, 0]);
    const actor = system.store.get(id)!;
    const startDistance = metres(actor.body.pos, [0, 1, 0]);
    for (let step = 0; step < 40; step++) {
      system.tickBackground(0.5, (step + 1) * 0.5);
    }
    expect(['idle', 'stroll']).toContain(actor.agent!.mode);
    expect(actor.agent!.lastPerceived).toBeUndefined();
    expect(metres(actor.body.pos, [0, 1, 0])).toBeGreaterThan(startDistance * 0.75);
  });

  it('pauses an active actor as soon as its column unloads', () => {
    let loaded = true;
    const system = new ActorSystem({ ...senses(() => player([0, 1, 0])), isLoaded: () => loaded });
    const actor = system.store.get(system.add(SHAMBLER, [2, 1, 0]))!;
    loaded = false;
    const before = [...actor.body.pos];
    system.tickActive(1 / 20, 0);
    expect(actor.tier).toBe('unloaded');
    expect(actor.body.pos).toEqual(before);
  });

  it('hears a distant gunshot through the existing player-noise stimulus', () => {
    const noise = { id: 1, pos: [0, 1, 0] as Vec3, radiusMetres: 80, expiresAt: 0.5 };
    const target = { ...player([0, 1, 0]), vocalNoise: noise };
    const system = new ActorSystem({ ...senses(() => target), isLoaded: () => true });
    const id = system.add(SHAMBLER, [100, 1, 0]);
    system.tickBackground(0.5, 0.5);
    expect(system.store.get(id)?.tier).toBe('background');
    expect(system.store.get(id)?.agent?.lastVocalNoiseId).toBe(noise.id);
    expect(system.store.get(id)?.agent?.lastPerceived).toBeDefined();
  });

  it('uses the active visible-light sense for distant background actors', () => {
    const lightTarget: Vec3 = [75, 1, 0];
    const target: PlayerSense = {
      ...player([0, 1, 0]),
      lightSources: [{ pos: lightTarget, seenFrom: 100, carried: false, heightMetres: 0.15 }],
    };
    const system = new ActorSystem({
      ...senses(
        () => target,
        FLOOR,
        () => 23,
      ),
      isLoaded: () => true,
    });
    const id = system.add(SHAMBLER, [100, 1, 0], [-1, 0, 0]);
    system.tickBackground(0.5, 0.5);
    const actor = system.store.get(id)!;
    expect(actor.tier).toBe('background');
    expect(actor.agent!.mode).toBe('investigate');
    expect(actor.agent!.lastPerceived).toEqual(lightTarget);
  });
});

describe('idle and stroll shambling', () => {
  it('uses seeded idle and straight stroll intervals during a sustained sample', () => {
    const sense = senses(() => player([1000, 1, 1000]));
    const system = new ActorSystem({ ...sense, seed: 73 });
    const withExtraBody = new ActorSystem({ ...sense, seed: 73 });
    const id = system.add(SHAMBLER, [0, 1, 0]);
    const independentId = withExtraBody.add(SHAMBLER, [0, 1, 0]);
    withExtraBody.add(SHAMBLER, [100, 1, 100]);
    const actor = system.store.get(id)!;
    const independent = withExtraBody.store.get(independentId)!;
    settle(actor.body);
    settle(independent.body);
    let idleTicks = 0;
    let strollTicks = 0;
    const sampleTicks = 5 * 60 * 20;
    for (let tick = 0; tick < sampleTicks; tick++) {
      system.tick(1 / 20);
      withExtraBody.tick(1 / 20);
      if (tick % 100 === 0) {
        expect(independent.body.pos).toEqual(actor.body.pos);
        expect(independent.agent!.behaviorRng.state()).toEqual(actor.agent!.behaviorRng.state());
      }
      if (String(actor.agent!.mode) === 'idle') {
        idleTicks += 1;
      }
      if (String(actor.agent!.mode) === 'stroll') {
        strollTicks += 1;
      }
      expect(metres(actor.body.pos, actor.agent!.home)).toBeLessThanOrEqual(12.5);
    }
    expect(idleTicks / sampleTicks).toBeGreaterThanOrEqual(0.2);
    expect(strollTicks / sampleTicks).toBeGreaterThanOrEqual(0.2);
  });

  it('keeps strolls straight and turns the body and head during idle', () => {
    const system = new ActorSystem(senses(() => player([1000, 1, 1000])));
    const id = system.add(SHAMBLER, [0, 1, 0]);
    const actor = system.store.get(id)!;
    settle(actor.body);
    let idleTurned = false;
    let strollingTicks = 0;
    const meshes = new ActorMeshes(BLOCK_SIZE);
    const parts = meshes.group.children as import('three').InstancedMesh[];
    const yaw = (mesh: import('three').InstancedMesh): number => {
      const matrix = new Matrix4();
      mesh.getMatrixAt(0, matrix);
      return Math.atan2(matrix.elements[8]!, matrix.elements[0]!);
    };
    let headLookObserved = false;
    for (let tick = 0; tick < 1200; tick++) {
      const mode = String(actor.agent!.mode);
      const beforeFacing = Math.atan2(actor.facing[0], actor.facing[2]);
      const beforePosition = [...actor.body.pos] as Vec3;
      system.tick(1 / 20);
      const afterFacing = Math.atan2(actor.facing[0], actor.facing[2]);
      const turn = Math.abs(Math.atan2(Math.sin(afterFacing - beforeFacing), Math.cos(afterFacing - beforeFacing)));
      if (mode === 'stroll') {
        strollingTicks += 1;
        expect((turn * 180) / Math.PI).toBeLessThanOrEqual(5);
      }
      if (mode === 'idle') {
        expect(metres(actor.body.pos, beforePosition)).toBeLessThanOrEqual(0.01);
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

  it('interpolates ordinary 20 Hz chase acceleration between 60 Hz draws within facing and speed bounds', () => {
    const tickSeconds = 1 / 20;
    const type = {
      ...SHAMBLER,
      chaseMotion: { ...SHAMBLER.chaseMotion!, stumbleChancePerSimSecond: simRate(0) },
      agent: { ...SHAMBLER.agent!, sightCone: 180 },
    };
    const maxSpeedChange = type.motion.movementAccelerationMetresPerSimSecondSquared * tickSeconds;
    let target: Vec3 = [20, 1, 0];
    const system = new ActorSystem(senses(() => player(target)));
    const id = system.add(type, [0, 1, 0], [1, 0, 0]);
    const actor = system.store.get(id)!;
    settle(actor.body);
    const meshes = new ActorMeshes(BLOCK_SIZE);
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
        system.tick(tickSeconds);
      }
      Reflect.apply(meshes.sync, meshes, [system.store, 1 / 60, (frame % 3) / 3]);
      const current = pose();
      const speed = Math.hypot(current.x - previous.x, current.z - previous.z) * BLOCK_SIZE * 60;
      const turn = Math.abs(Math.atan2(Math.sin(current.yaw - previous.yaw), Math.cos(current.yaw - previous.yaw)));
      expect((turn * 180) / Math.PI).toBeLessThanOrEqual(4);
      expect(Math.abs(speed - previousSpeed)).toBeLessThanOrEqual(maxSpeedChange + 1e-5);
      previous = current;
      previousSpeed = speed;
    }

    const idleSystem = new ActorSystem(senses(() => player([1000, 1, 1000])));
    const idleId = idleSystem.add(SHAMBLER, [0, 1, 0]);
    const idleActor = idleSystem.store.get(idleId)!;
    settle(idleActor.body);
    idleActor.agent!.modeTimer = 100;
    const idleMeshes = new ActorMeshes(BLOCK_SIZE);
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

    idleActor.agent!.mode = 'stroll';
    idleActor.chaseStance = false;
    idleActor.agent!.modeTimer = 100;
    idleActor.agent!.strollHeading = [1, 0, 0];
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
    const system = new ActorSystem(
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
    const actor = system.store.get(id)!;
    expect(actor.agent!.mode).toBe('chase');
    expect(actor.attackWindup).toBeCloseTo(SHAMBLER.attack!.windupSimSeconds, 5);
    expect(actor.attackWait).toBeCloseTo(SHAMBLER.attack!.cooldownSimSeconds, 5);
  });

  it("passes one move's weighted body regions when the attack windup elapses in reach", () => {
    let damage = 0;
    const hitChoices: (readonly { region: BodyRegion; weight: number }[])[] = [];
    const system = new ActorSystem(
      senses(
        () => player([0, 2, 0]),
        FLOOR,
        () => 12,
        (amount, choices) => {
          damage += amount;
          if (choices) {
            hitChoices.push(choices);
          }
        },
      ),
    );
    system.add(SHAMBLER, [1.2, 1, 0], [-1, 0, 0]);
    system.tick(1 / 60);
    expect(damage).toBe(0);
    run(system, SHAMBLER.attack!.windupSimSeconds + 0.1);
    expect(SHAMBLER_MOVE_DAMAGES).toContain(damage);
    expect(hitChoices).toHaveLength(1);
    expect(SHAMBLER.attack!.moves.map(({ hitRegions }) => hitRegions)).toContainEqual(hitChoices[0]);
  });

  it('a miss: no damage if the player steps out of reach during the windup', () => {
    let target: Vec3 = [0, 2, 0];
    let damage = 0;
    const system = new ActorSystem(
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
    run(system, SHAMBLER.attack!.windupSimSeconds + 0.1);
    expect(damage).toBe(0);
    expect(system.store.get(id)!.attackWindup).toBe(0); // the windup still resolves — as a miss, not a stall
  });

  it('a miss: no damage if line of sight is blocked (a door closes) during the windup', () => {
    const { entities, door, solid } = makeDoorWorld();
    entities.setOpen(door, true);
    let damage = 0;
    const system = new ActorSystem(
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
    run(system, SHAMBLER.attack!.windupSimSeconds + 0.1);
    expect(damage).toBe(0);
  });

  it('the cooldown (running since windup start) still gates the next attack after a hit lands', () => {
    let damage = 0;
    const system = new ActorSystem(
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
    run(system, SHAMBLER.attack!.windupSimSeconds + 0.05); // resolves the first attack
    expect(SHAMBLER_MOVE_DAMAGES).toContain(damage);
    const firstHit = damage;
    const afterFirstHit = system.store.get(id)!.attackWait;
    expect(afterFirstHit).toBeGreaterThan(0);
    // Well within the remaining cooldown: no second windup should start yet.
    run(system, afterFirstHit - 0.1);
    expect(system.store.get(id)!.attackWindup).toBe(0);
    expect(damage).toBe(firstHit);
  });

  it('keeps simulation-backed hit flinch through save/restore and freeze', () => {
    const stair: SolidAt = (_x, y, z) => y === 0 || (z >= 3 && y === 1);
    const sense = senses(() => player([0, 2, 10], [0, 0, -1]), stair);
    const system = new ActorSystem(sense);
    const id = system.add(SHAMBLER, [0, 1, 2.2], [0, 0, 1]);
    const actor = system.store.get(id)!;
    for (let tick = 0; tick < 120 && (actor.stepOffset ?? 0) === 0; tick++) {
      system.tick(1 / 60);
    }
    expect(actor.stepOffset).toBeLessThan(0);
    const ray = regionRay(actor, 'head');
    expect(system.swing(ray.origin, ray.direction, FISTS_MELEE)).toBe(id);
    expect(actor.hitFlinchTime).toBe(0);

    run(system, HIT_FLINCH_DURATION / 4);
    const { hitFlinchTime: savedTime, stanceWeight, stepOffset } = system.store.get(id)!;
    expect(savedTime).toBeGreaterThan(0);
    expect(savedTime).toBeLessThan(HIT_FLINCH_DURATION);
    expect(stanceWeight).toBeGreaterThan(0);
    expect(stepOffset).toBeLessThan(0);
    const restored = new ActorSystem(sense);
    restored.restoreState(system.snapshotState(), (typeId) => registry.actors.get(typeId));
    expect(restored.store.get(id)!.hitFlinchTime).toBe(savedTime);
    expect(restored.store.get(id)!.stanceWeight).toBe(stanceWeight);
    expect(restored.store.get(id)!.stepOffset).toBe(stepOffset);

    restored.setFrozen(true);
    run(restored, HIT_FLINCH_DURATION * 2);
    expect(restored.store.get(id)!.hitFlinchTime).toBe(savedTime);
    expect(restored.store.get(id)!.stanceWeight).toBe(stanceWeight);
    expect(restored.store.get(id)!.stepOffset).toBe(stepOffset);
    restored.setFrozen(false);
    run(restored, HIT_FLINCH_DURATION);
    expect(restored.store.get(id)!.hitFlinchTime).toBeUndefined();
  });

  it('does not replay a live far vocal pulse after a searching zombie is restored', () => {
    const { hearing, hearingModel } = SHAMBLER.agent!;
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
    const makeSystem = () => new ActorSystem(senses(() => ({ ...player([100, 2, 0]), vocalNoise: noise }), FLOOR));
    const uninterrupted = makeSystem();
    const id = uninterrupted.add(SHAMBLER, [0.5, 1, 0]);
    const dt = 1 / 60;
    let frame = 0;
    uninterrupted.tick(dt, frame * dt);
    expect(uninterrupted.store.get(id)!.agent!.mode).toBe('investigate');
    expect(uninterrupted.store.get(id)!.agent!.investigationTier).toBe('far');
    expect(uninterrupted.store.get(id)!.agent!.lastVocalNoiseId).toBe(noise.id);

    while (uninterrupted.store.get(id)!.agent!.mode !== 'search' && frame < 1800) {
      frame += 1;
      uninterrupted.tick(dt, frame * dt);
    }
    expect(uninterrupted.store.get(id)!.agent!.mode).toBe('search');
    expect(frame * dt).toBeLessThan(noise.expiresAt);

    const searchFrame = frame;
    const restored = makeSystem();
    restored.restoreState(uninterrupted.snapshotState(), (typeId) => registry.actors.get(typeId));
    const firstAfterRestore = searchFrame + 1;
    uninterrupted.tick(dt, firstAfterRestore * dt);
    restored.tick(dt, firstAfterRestore * dt);
    expect(uninterrupted.store.get(id)!.agent!.mode).toBe('search');
    expect(restored.store.get(id)!.agent!.mode).toBe('search');
    for (let nextFrame = firstAfterRestore + 1; nextFrame <= searchFrame + 600; nextFrame += 1) {
      uninterrupted.tick(dt, nextFrame * dt);
      restored.tick(dt, nextFrame * dt);
    }

    expect(restored.snapshotState()).toEqual(uninterrupted.snapshotState());
  });

  it('round-trips obstacle movement state without persisting route state', () => {
    const system = new ActorSystem(senses(() => player([100, 2, 0]), FLOOR));
    const id = system.add(SHAMBLER, [0, 1, 0]);
    const actor = system.store.get(id)!;
    actor.agent!.obstacleWanderHeading = [0, 0, 1];
    actor.agent!.obstacleWanderRemaining = 3;
    actor.obstacleContact = true;
    actor.agent!.obstacleSlideSide = -1;
    const state = system.snapshotState();
    expect(state).not.toHaveProperty('routes');
    expect(state).not.toHaveProperty('routeClock');
    expect(state).not.toHaveProperty('routeSearchCursor');
    const restored = new ActorSystem(senses(() => player([100, 2, 0]), FLOOR));
    restored.restoreState(state, (typeId) => registry.actors.get(typeId));
    expect(restored.snapshotState()).toEqual(state);
  });

  it('keeps attackWindup exactly across a snapshot/restore round trip mid-attack', () => {
    const system = new ActorSystem(senses(() => player([0, 2, 0]), FLOOR));
    const id = system.add(SHAMBLER, [1.2, 1, 0], [-1, 0, 0]);
    system.tick(1 / 60); // starts the windup
    for (let i = 0; i < 5; i++) {
      system.tick(1 / 60); // partway through — a non-trivial value to round-trip, not just the raw constant
    }
    const before = system.store.get(id)!.attackWindup;
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(SHAMBLER.attack!.windupSimSeconds);

    const state = system.snapshotState();
    const restored = new ActorSystem(senses(() => player([0, 2, 0]), FLOOR));
    restored.restoreState(state, (typeId) => registry.actors.get(typeId));

    expect(restored.store.get(id)!.attackWindup).toBe(before);
  });
});

describe('stagger', () => {
  const stagger = { impulseThreshold: 6, durationSimSeconds: simSeconds(0.5) };
  const staggering: ActorDef = { ...SHAMBLER, stagger };
  const heavy = { ...FISTS_MELEE, impulse: stagger.impulseThreshold };
  const light = { ...FISTS_MELEE, impulse: stagger.impulseThreshold - 0.1 };

  /** A shambler in reach of a still player, one tick into its attack wind-up. */
  const windingUp = () => {
    let damage = 0;
    const system = new ActorSystem(
      senses(
        () => player([0, 2, 0]),
        FLOOR,
        () => 12,
        (amount) => {
          damage += amount;
        },
      ),
    );
    const id = system.add(staggering, [1.2, 1, 0], [-1, 0, 0]);
    system.tick(1 / 60);
    return { system, id, actor: system.store.get(id)!, damage: () => damage };
  };

  it('a hit at the threshold spoils the attack for the stagger duration; a lighter hit does not', () => {
    const staggered = windingUp();
    expect(staggered.actor.attackWindup).toBeGreaterThan(0);
    const ray = regionRay(staggered.actor, 'torso');
    expect(staggered.system.swing(ray.origin, ray.direction, heavy)).toBe(staggered.id);
    expect(staggered.actor.staggerSimSeconds).toBe(stagger.durationSimSeconds);
    expect(staggered.actor.attackWindup).toBe(0);
    run(staggered.system, stagger.durationSimSeconds - 2 / 60);
    expect(staggered.actor.staggerSimSeconds).toBeGreaterThan(0);
    expect(staggered.actor.attackWindup).toBe(0);
    expect(staggered.damage()).toBe(0);
    run(staggered.system, 3 / 60);
    expect(staggered.actor.staggerSimSeconds).toBe(0);

    const unstaggered = windingUp();
    expect(unstaggered.actor.attackWindup).toBeGreaterThan(0);
    const lightRay = regionRay(unstaggered.actor, 'torso');
    expect(unstaggered.system.swing(lightRay.origin, lightRay.direction, light)).toBe(unstaggered.id);
    expect(unstaggered.actor.staggerSimSeconds).toBe(0);
    expect(unstaggered.actor.attackWindup).toBeGreaterThan(0);
  });

  it('never moves the zombie: it holds its exact position while staggered', () => {
    const chasing = () => {
      const system = new ActorSystem(senses(() => player([12, 1, 0], [-1, 0, 0]), FLOOR));
      const id = system.add(staggering, [0, 1, 0], [1, 0, 0]);
      run(system, 1);
      return { system, id, actor: system.store.get(id)! };
    };
    const { system, id, actor } = chasing();
    expect(actor.agent!.mode).toBe('chase');
    const before = [...actor.body.pos];
    const ray = regionRay(actor, 'torso');
    expect(system.swing(ray.origin, ray.direction, heavy)).toBe(id);
    expect(actor.body.pos).toEqual(before);
    run(system, stagger.durationSimSeconds - 2 / 60);
    expect(actor.body.pos).toEqual(before);

    const control = chasing();
    const controlBefore = [...control.actor.body.pos];
    const controlRay = regionRay(control.actor, 'torso');
    expect(control.system.swing(controlRay.origin, controlRay.direction, light)).toBe(control.id);
    run(control.system, stagger.durationSimSeconds - 2 / 60);
    expect(control.actor.body.pos).not.toEqual(controlBefore);
  });

  it('never adds a second stagger to the remaining time', () => {
    const { system, actor } = windingUp();
    const ray = regionRay(actor, 'torso');
    system.swing(ray.origin, ray.direction, heavy);
    system.swing(ray.origin, ray.direction, heavy);
    expect(actor.staggerSimSeconds).toBe(stagger.durationSimSeconds);
  });

  it('keeps the remaining stagger across a snapshot/restore', () => {
    const { system, id, actor } = windingUp();
    const ray = regionRay(actor, 'torso');
    system.swing(ray.origin, ray.direction, heavy);
    run(system, stagger.durationSimSeconds / 2);
    const remaining = actor.staggerSimSeconds;
    expect(remaining).toBeGreaterThan(0);
    const restored = new ActorSystem(senses(() => player([0, 2, 0]), FLOOR));
    restored.restoreState(system.snapshotState(), () => staggering);
    expect(restored.store.get(id)!.staggerSimSeconds).toBe(remaining);
  });
});

describe('dismemberment', () => {
  const stationary = { ...SHAMBLER, speed: speedRates(0, 0) };
  const armParts = ['hand.L', 'hand.R', 'forearm.L', 'forearm.R', 'upperArm.L', 'upperArm.R'];

  /** Regions too healthy for a few fist hits to destroy, so only the dismember roll can sever anything. */
  const survives = { head: 1000, torso: 1000, leftArm: 1000, rightArm: 1000, leftLeg: 1000, rightLeg: 1000 };

  it('uses the same lethal region for an individual hit and a blast', () => {
    const type: ActorDef = {
      ...stationary,
      regions: { ...survives, head: FISTS_MELEE.damage },
      dismember: { chance: 0, headOnKillChance: 0 },
    };
    type.damageResistance = undefined;
    const hitSystem = new ActorSystem(senses(() => player([100, 2, 0])));
    const hitId = hitSystem.add(type, [1, 1, 0], [0, 0, 1]);
    const hitActor = hitSystem.store.get(hitId)!;
    const head = regionRay(hitActor, 'head');
    expect(lethalRegion(type, 'head')).toBe(true);
    expect(hitSystem.swing(head.origin, head.direction, FISTS_MELEE)).toBe(hitId);
    expect(hitSystem.store.get(hitId)).toBeUndefined();

    let blastDeathRegions: number[] | undefined;
    const blastSystem = new ActorSystem({
      ...senses(() => player([100, 2, 0])),
      onDeath: (_id, actor) => {
        blastDeathRegions = Object.values(actor.regions);
      },
    });
    const blastId = blastSystem.add(type, [1, 1, 0], [0, 0, 1]);
    blastSystem.detonate({
      blast: { damageKind: 'blunt', radiusMetres: 6, damage: 1_000_000, impulse: 1 },
      fragments: { damageKind: 'pierce', origin: [0, 1, 0], directions: [], damage: 0, impulse: 0, rangeMetres: 0 },
    });
    expect(blastSystem.store.get(blastId)).toBeUndefined();
    expect(blastDeathRegions).toBeDefined();
    expect(blastDeathRegions!.every((health) => health === 0)).toBe(true);
  });

  const swingAt = (system: ActorSystem, id: number) => {
    const target = system.store.get(id)!;
    const origin: Vec3 = [0, target.body.pos[1] + target.body.height * 0.55, 0];
    return system.swing(origin, [1, 0, 0], FISTS_MELEE);
  };

  it("hands the severing hit to the renderer scaled by the kind's severedImpulseScale", () => {
    const severingImpulse = (severedImpulseScale: number): number => {
      let hit: HitImpulse | undefined;
      const system = new ActorSystem({
        ...senses(() => player([100, 2, 0])),
        seed: 5,
        onSever: (_id, _actor, _part, severHit) => {
          hit = severHit;
        },
      });
      const type = {
        ...SHAMBLER,
        regions: { ...survives },
        dismember: { chance: 1, headOnKillChance: 0 },
        severedImpulseScale,
      };
      const id = system.add(type, [4, 1, 4], [0, 0, -1]);
      const ray = regionRay(system.store.get(id)!, 'rightArm');
      expect(system.swing(ray.origin, ray.direction, { ...FISTS_MELEE, impulse: 5 })).toBe(id);
      expect(hit).toBeDefined();
      return hit!.impulse;
    };
    const base = severingImpulse(1);
    expect(base).toBeGreaterThan(0);
    expect(severingImpulse(2)).toBeCloseTo(2 * base);
  });

  it('scales launch distance monotonically through fixture impulses', async () => {
    const type = {
      ...SHAMBLER,
      speed: speedRates(0, 0),
      regions: { ...survives },
      dismember: { chance: 1, headOnKillChance: 0 },
    };
    const fists = FISTS_MELEE;
    const simulate = async (weapon: Parameters<ActorSystem['swing']>[2]) => {
      let renderer: MobActorMeshes;
      let firstTouchdownCenter: Vec3 | undefined;
      let hit: HitImpulse | undefined;
      const system = new ActorSystem({
        ...senses(() => player([100, 2, 0])),
        seed: 5,
        onSever: (sourceId, sourceActor, sourcePart, severHit) => {
          hit = severHit;
          renderer.actorSevered(sourceId, sourcePart, severHit, sourceActor);
        },
      });
      const id = system.add(type, [4, 1, 4], [0, 0, -1]);
      const actor = system.store.get(id)!;
      renderer = new MobActorMeshes(BLOCK_SIZE, 2, {
        actors: new Map([[type.id, { ...type, figureSeeds: [actor.figureSeed] }]]),
      });
      renderer.setWorld((_x, y, _z) => y === -1, BLOCK_SIZE);
      renderer.sync(system.store, 0, 1);
      const ray = regionRay(actor, 'rightArm');
      expect(system.swing(ray.origin, ray.direction, weapon)).toBe(id);
      const debrisMap = (
        renderer as unknown as {
          debris: Map<string, { body: RigidBody }>;
          ragdolls: RagdollWorld;
        }
      ).debris;
      const [debrisKey, debris] = [...debrisMap.entries()][0]!;
      await (renderer as unknown as { ragdolls: RagdollWorld }).ragdolls.ready;
      const part = debrisKey.split(':')[2]!;
      try {
        for (let frame = 0; frame < ragdollContent.stepBudget && !debris.body.asleep; frame++) {
          renderer.sync(system.store, ragdollContent.timestep, 1);
          const r = quatToMat3(debris.body.orientation);
          const bottom = Math.min(...debris.body.corners.map((corner) => mulMV(r, corner)[1] + debris.body.center[1]));
          if (bottom <= 0.02 && firstTouchdownCenter === undefined) {
            firstTouchdownCenter = [...debris.body.center];
          }
        }
        expect(debris.body.asleep, `impulse ${weapon.impulse} should settle within the step budget`).toBe(true);
        expect(firstTouchdownCenter).toBeDefined();
        const hitPointMetres = hit!.point.map((coordinate) => coordinate * BLOCK_SIZE);
        const horizontalDistance = (center: Vec3) =>
          Math.hypot(center[0] - hitPointMetres[0]!, center[2] - hitPointMetres[2]!);
        return {
          distance: horizontalDistance(firstTouchdownCenter!),
          part,
          hit,
        };
      } finally {
        renderer.dispose();
      }
    };
    const sweep = await Promise.all([4, 8, 10, 20, 40].map((impulse) => simulate({ ...fists, impulse })));

    for (const outcome of sweep) {
      expect(armParts).toContain(outcome.part);
      expect(outcome.part).toBe(sweep[0]!.part);
      expect(outcome.hit?.point).toEqual(sweep[0]!.hit?.point);
      expect(outcome.hit?.direction).toEqual(sweep[0]!.hit?.direction);
    }
    for (let index = 1; index < sweep.length; index++) {
      expect.soft(sweep[index]!.distance).toBeGreaterThan(sweep[index - 1]!.distance);
    }
  });

  it('chance 1 always severs a random arm part on a hit that does not kill', () => {
    const type = { ...stationary, regions: survives, dismember: { chance: 1, headOnKillChance: 0 } };
    const system = new ActorSystem(senses(() => player([100, 2, 0])));
    const id = system.add(type, [0.5, 1, 0]);
    expect(swingAt(system, id)).toBe(id);
    const { severed } = system.store.get(id)!;
    expect(severed).toHaveLength(1);
    expect(armParts).toContain(severed[0]);
  });

  it('chance 0 never severs, even across many hits', () => {
    const type = { ...stationary, regions: survives, dismember: { chance: 0, headOnKillChance: 0 } };
    const system = new ActorSystem(senses(() => player([100, 2, 0])));
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
    const system = new ActorSystem({
      ...senses(() => player([100, 2, 0])),
      onSever: (severedId, sourceActor, part, hit) => {
        receivedHit = hit;
        calls.push([severedId, part]);
        expect(sourceActor.severed).toContain(part);
      },
    });
    const id = system.add(type, [0.5, 1, 0]);
    const actor = system.store.get(id)!;
    const origin: Vec3 = [0, actor.body.pos[1] + actor.body.height * 0.55, 0];
    const direction: Vec3 = [1, 0, 0];
    const distance = nearestRegionDistance(actor, origin, direction);
    swingAt(system, id);
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe(id);
    expect(
      hitRecordMatches({
        hit: receivedHit,
        origin,
        direction,
        distance,
        impulse: FISTS_MELEE.impulse * type.severedImpulseScale,
      }),
    ).toBe(true);
  });

  it('passes the exact hit record when a destroyed arm region causes a sever', () => {
    const type = {
      ...stationary,
      regions: { ...survives, leftArm: FISTS_MELEE.damage },
      dismember: { chance: 0, headOnKillChance: 0 },
    };
    let received: { part: string; hit: HitImpulse } | undefined;
    const system = new ActorSystem({
      ...senses(() => player([100, 2, 0])),
      onSever: (_id, _actor, part, hit) => {
        received = { part, hit };
      },
    });
    const id = system.add(type, [1, 1, 0], [0, 0, -1]);
    const actor = system.store.get(id)!;
    const ray = regionRay(actor, 'leftArm');
    const distance = nearestRegionDistance(actor, ray.origin, ray.direction);
    const weapon = { ...FISTS_MELEE, impulse: 6.25 };
    expect(system.swing(ray.origin, ray.direction, weapon)).toBe(id);
    expect(received?.part).toBe('upperArm.L');
    expect(
      hitRecordMatches({
        hit: received?.hit,
        origin: ray.origin,
        direction: ray.direction,
        distance,
        impulse: weapon.impulse * type.severedImpulseScale,
      }),
    ).toBe(true);
  });

  it('containment: a part already covered by a severed upperArm is never independently added', () => {
    const type = { ...stationary, regions: survives, dismember: { chance: 1, headOnKillChance: 0 } };
    const system = new ActorSystem(senses(() => player([100, 2, 0])));
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
    const system = new ActorSystem(
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
    const system = new ActorSystem(
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
    run(system, SHAMBLER.attack!.windupSimSeconds + 0.1);
    expect(SHAMBLER_MOVE_DAMAGES).toContain(damage);
  });

  it('only severs the head on a killing blow, never on a hit the zombie survives', () => {
    const type = { ...stationary, regions: survives, dismember: { chance: 0, headOnKillChance: 1 } };
    const system = new ActorSystem(senses(() => player([100, 2, 0])));
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
    const system = new ActorSystem({
      ...senses(() => player([100, 2, 0])),
      onSever: (_id, _actor, part, hit) => {
        severedParts.push(part);
        receivedHit = hit;
      },
    });
    const id = system.add(type, [1, 1, 0], [0, 0, -1]);
    const actor = system.store.get(id)!;
    const ray = regionRay(actor, 'head');
    const distance = nearestRegionDistance(actor, ray.origin, ray.direction);
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
        impulse: weapon.impulse * type.severedImpulseScale,
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
    const system = new ActorSystem({
      ...senses(() => player([100, 2, 0])),
      onSever: (_id, _actor, part) => {
        calls.push(part);
      },
    });
    const id = system.add(type, [1, 1, 0], [0, 0, -1]);
    const actor = system.store.get(id)!;
    const weapon = { ...FISTS_MELEE, cooldown: 0 };
    const left = regionRay(actor, 'leftArm');
    expect(system.swing(left.origin, left.direction, weapon)).toBe(id);
    expect(actor.severed).toContain('upperArm.L');
    expect(calls).toContain('upperArm.L');
    const right = regionRay(actor, 'rightArm');
    expect(system.swing(right.origin, right.direction, weapon)).toBe(id);
    expect(actor.severed).toContain('upperArm.R');
  });

  it('keeps severed exactly across a snapshot/restore round trip', () => {
    const type = { ...stationary, regions: survives, dismember: { chance: 1, headOnKillChance: 0 } };
    const system = new ActorSystem(senses(() => player([100, 2, 0])));
    const id = system.add(type, [0.5, 1, 0]);
    swingAt(system, id);
    const before = system.store.get(id)!.severed;
    expect(before.length).toBeGreaterThan(0);

    const state = system.snapshotState();
    const restored = new ActorSystem(senses(() => player([100, 2, 0])));
    restored.restoreState(state, (typeId) => (typeId === type.id ? type : undefined));
    expect(restored.store.get(id)!.severed).toEqual(before);
  });

  it('is deterministic: two identical systems given the same swings sever the same parts', () => {
    const type = { ...stationary, regions: survives, dismember: { chance: 1, headOnKillChance: 0 } };
    const runFour = (): string[] => {
      const system = new ActorSystem(senses(() => player([100, 2, 0])));
      const id = system.add(type, [0.5, 1, 0]);
      for (let i = 0; i < 4; i++) {
        swingAt(system, id);
        run(system, FISTS_MELEE.cooldown);
      }
      return system.store.get(id)!.severed;
    };
    expect(runFour()).toEqual(runFour());
  });

  it('thins idle cues per enemy in a local crowd without changing a lone enemy rate', () => {
    const duration = simSeconds(SHAMBLER.agent!.idleSound.intervalSimSeconds.max * 12);
    const type = {
      ...SHAMBLER,
      agent: {
        ...SHAMBLER.agent!,
        wander: {
          ...SHAMBLER.agent!.wander,
          idleSimSeconds: { min: simSeconds(duration + 1), max: simSeconds(duration + 1) },
        },
      },
    };
    const cueCounts = (positions: readonly Vec3[], candidate: ActorDef): number[] => {
      const cues = new Map<Actor, number>();
      const system = new ActorSystem({
        ...senses(() => player([100, 2, 0])),
        onSound: (event, _position, actor) => {
          if (actor && event === actor.type.sounds.idle) {
            cues.set(actor, (cues.get(actor) ?? 0) + 1);
          }
        },
      });
      const ids = positions.map((position) => system.add(candidate, position));
      run(system, duration);
      return ids.map((id) => cues.get(system.store.get(id)!) ?? 0);
    };
    const radius = type.agent.idleSound.density.radiusMetres / BLOCK_SIZE;
    const lone = cueCounts([[0, 1, 0]], type);
    const crowded = cueCounts(
      [
        [0, 1, 0],
        [radius / 3, 1, 0],
        [0, 1, radius / 3],
        [radius / 3, 1, radius / 3],
      ],
      type,
    );
    const strongerDensityCurve = {
      ...type,
      agent: {
        ...type.agent,
        idleSound: {
          ...type.agent.idleSound,
          density: {
            ...type.agent.idleSound.density,
            penaltyPerNeighbour: type.agent.idleSound.density.penaltyPerNeighbour * 2,
          },
        },
      },
    };

    expect(crowded.every((count) => count < lone[0]!)).toBe(true);
    expect(cueCounts([[0, 1, 0]], strongerDensityCurve)).toEqual(lone);
  });
});
