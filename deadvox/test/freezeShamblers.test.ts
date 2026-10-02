import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { posedShamblerRegionBoxes, type ZombieRegion } from '../src/core/zombieRegions.ts';
import { FISTS_MELEE, type MeleeResult, type Zombie, ZombieSystem } from '../src/core/zombies.ts';
import { PLAYER, physicsFor } from '../src/game/player.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const SHAMBLER = registry.zombies.get('shambler')!;
const SCALE = makeScale(0.5);
const BLOCK_SIZE = SCALE.blockSize;
const FLOOR = (_x: number, y: number) => y === 0;
const player = (pos: Vec3): { pos: Vec3; facing: Vec3; movement: 'still'; lit: false; lightSeenFrom: number } => ({
  pos,
  facing: [0, 0, -1],
  movement: 'still',
  lit: false,
  lightSeenFrom: 40,
});
const makeSystem = (
  target: Vec3,
  hurtPlayer: (amount: number) => void = () => undefined,
  onMeleeResult?: (result: MeleeResult) => void,
) =>
  new ZombieSystem({
    player: () => player(target),
    isSolid: FLOOR,
    hour: () => 12,
    blockSize: BLOCK_SIZE,
    physics: physicsFor(SCALE),
    jumpSpeed: PLAYER.jump,
    hurtPlayer,
    ...(onMeleeResult ? { onMeleeResult } : {}),
    seed: 31,
  });
const run = (system: ZombieSystem, seconds: number): void => {
  for (let frame = 0; frame < Math.ceil(seconds * 60); frame++) {
    system.tick(1 / 60);
  }
};
const posedBoxes = (zombie: Zombie) =>
  posedShamblerRegionBoxes({
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
const regionRay = (zombie: Zombie, region: ZombieRegion) => {
  const targetBone: Readonly<Record<ZombieRegion, string>> = {
    head: 'head',
    torso: 'chest',
    leftArm: 'forearm.L',
    rightArm: 'forearm.R',
    leftLeg: 'shin.L',
    rightLeg: 'shin.R',
  };
  const box = posedBoxes(zombie)[region].find((candidate) => candidate.bone === targetBone[region])!;
  const front: Vec3 = [-zombie.facing[0], 0, -zombie.facing[2]];
  return {
    origin: [
      box.center[0] + (front[0] * 0.45) / BLOCK_SIZE,
      box.center[1],
      box.center[2] + (front[2] * 0.45) / BLOCK_SIZE,
    ] as Vec3,
    direction: [-front[0], 0, -front[2]] as Vec3,
  };
};

describe('debug shambler freeze', () => {
  it('advances stance over 0.5 simulation seconds and pauses the fade while frozen', () => {
    let target: Vec3 = [100, 1, 100];
    const system = new ZombieSystem({
      player: () => player(target),
      isSolid: FLOOR,
      hour: () => 12,
      blockSize: BLOCK_SIZE,
      physics: physicsFor(SCALE),
      jumpSpeed: PLAYER.jump,
      hurtPlayer: () => undefined,
      seed: 31,
    });
    const id = system.add(SHAMBLER, [0, 1, 0], [0, 0, 1]);
    const zombie = system.store.get(id)!;
    run(system, 0.25);
    target = [0, 1, 3.2];
    run(system, 0.25);
    expect(zombie.mode).toBe('chase');
    expect(zombie.stanceWeight).toBeCloseTo(0.5, 5);
    system.setFrozen(true);
    const midway = zombie.stanceWeight;
    run(system, 1);
    expect(zombie.stanceWeight).toBe(midway);
    system.setFrozen(false);
    run(system, 0.25);
    expect(zombie.stanceWeight).toBe(1);
  });

  it('holds chasing position, heading, timers, and posed hit boxes for five seconds without hurting the player', () => {
    let playerHealth = 100;
    const system = makeSystem([0, 1, 3.2], (damage) => {
      playerHealth -= damage;
    });
    const id = system.add(SHAMBLER, [0, 1, 0], [0, 0, 1]);
    run(system, 0.15);
    const zombie = system.store.get(id)!;
    expect(zombie.mode).toBe('chase');
    expect(zombie.body.pos[2]).toBeGreaterThan(0);
    const healthBeforeFreeze = playerHealth;
    system.setFrozen(true);
    const before = system.snapshotState();
    const boxesBefore = posedBoxes(zombie);
    run(system, 5);
    expect(system.snapshotState()).toEqual(before);
    expect(posedBoxes(zombie)).toEqual(boxesBefore);
    expect(playerHealth).toBe(healthBeforeFreeze);
  });

  it('cancels an active attack windup without landing, while preserving the remaining cooldown', () => {
    let playerHealth = 100;
    const system = makeSystem([0, 1, 1], (damage) => {
      playerHealth -= damage;
    });
    const id = system.add(SHAMBLER, [0, 1, 0], [0, 0, 1]);
    const zombie = system.store.get(id)!;
    for (let frame = 0; frame < 120 && zombie.attackWindup === 0; frame++) {
      system.tick(1 / 60);
    }
    expect(zombie.attackWindup).toBeGreaterThan(0);
    system.setFrozen(true);
    const cooldown = zombie.attackWait;
    expect(zombie.attackWindup).toBe(0);
    run(system, 5);
    expect(playerHealth).toBe(100);
    expect(zombie.attackWait).toBe(cooldown);
  });

  it('skips cooldown, idle/search, wander, and stumble timers for frozen time', () => {
    const system = makeSystem([100, 1, 100]);
    const id = system.add(SHAMBLER, [0, 1, 0], [0, 0, -1]);
    const zombie = system.store.get(id)!;
    zombie.attackWait = 1;
    zombie.idleSoundTimer = 2;
    zombie.modeTimer = 3;
    zombie.searchTimer = 4;
    zombie.wanderClock = 5;
    zombie.stumbleFactor = 0.4;
    zombie.stumbleElapsed = 0.6;
    zombie.stumbleDuration = 1.2;
    const before = [
      zombie.attackWait,
      zombie.idleSoundTimer,
      zombie.modeTimer,
      zombie.searchTimer,
      zombie.wanderClock,
      zombie.stumbleFactor,
      zombie.stumbleElapsed,
      zombie.stumbleDuration,
    ];
    system.setFrozen(true);
    run(system, 10);
    expect([
      zombie.attackWait,
      zombie.idleSoundTimer,
      zombie.modeTimer,
      zombie.searchTimer,
      zombie.wanderClock,
      zombie.stumbleFactor,
      zombie.stumbleElapsed,
      zombie.stumbleDuration,
    ]).toEqual(before);
  });

  it('resumes movement after unfreezing and starts newly spawned shamblers frozen', () => {
    const system = makeSystem([0, 1, 10]);
    const id = system.add(SHAMBLER, [0, 1, 0], [0, 0, 1]);
    run(system, 1.5);
    system.setFrozen(true);
    const oldZombie = system.store.get(id)!;
    const frozenPosition = [...oldZombie.body.pos];
    const spawnedId = system.add(SHAMBLER, [5, 1, 5], [0, 0, -1]);
    const spawned = system.store.get(spawnedId)!;
    expect(spawned.mode).toBe('idle');
    const spawnedState = system.snapshotState();
    run(system, 5);
    expect(oldZombie.body.pos).toEqual(frozenPosition);
    expect(system.snapshotState()).toEqual(spawnedState);
    system.setFrozen(false);
    run(system, 1);
    expect(oldZombie.body.pos).not.toEqual(frozenPosition);
  });

  it('allows frozen shamblers to take lethal melee hits and does not persist the freeze toggle', () => {
    const headKill = {
      ...SHAMBLER,
      regions: { ...SHAMBLER.regions, head: FISTS_MELEE.damage },
      dismember: { chance: 0, headOnKillChance: 1 },
    };
    const result: MeleeResult[] = [];
    const headSystem = makeSystem(
      [100, 1, 100],
      () => undefined,
      (value) => result.push(value),
    );
    const headId = headSystem.add(headKill, [1, 1, 0], [0, 0, -1]);
    const headZombie = headSystem.store.get(headId)!;
    headSystem.setFrozen(true);
    const ray = regionRay(headZombie, 'head');
    expect(headSystem.swing(ray.origin, ray.direction, FISTS_MELEE)).toBe(headId);
    expect(result[0]).toMatchObject({ region: 'head', outcome: 'decapitated', part: 'head' });

    const frozen = makeSystem([100, 1, 100]);
    const frozenId = frozen.add(SHAMBLER, [3, 1, 0], [0, 0, -1]);
    frozen.setFrozen(true);
    const save = frozen.snapshotState();
    expect(frozen.isFrozen).toBe(true);
    const restored = makeSystem([100, 1, 100]);
    restored.restoreState(save, (typeId) => (typeId === SHAMBLER.id ? SHAMBLER : undefined));
    expect(restored.isFrozen).toBe(false);
    expect(restored.store.get(frozenId)).toBeDefined();
  });
});
