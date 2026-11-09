import { describe, expect, it } from 'vitest';
import { actorFigure } from '../src/core/actorFigureFiles.ts';
import { type HumanoidHitRegion, posedHumanoidRegionBoxes } from '../src/core/actorRegions.ts';
import type { Actor } from '../src/core/actorState.ts';
import type { MeleeResult } from '../src/core/actorSystem.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

const registry = baseRegistry();
const SHAMBLER = registry.actors.get('shambler')!;
const FIGURES = stackActorFigureFiles(registry);
const SCALE = makeScale(0.5);
const BLOCK_SIZE = SCALE.blockSize;
const FLOOR = (_x: number, y: number) => y === 0;
const player = (
  pos: Vec3,
): { pos: Vec3; facing: Vec3; movement: 'still'; lit: false; lightSeenFrom: number; eyeHeightMetres: number } => ({
  pos,
  facing: [0, 0, -1],
  movement: 'still',
  lit: false,
  lightSeenFrom: 40,
  eyeHeightMetres: 1.3,
});
const makeSystem = (
  target: Vec3,
  hurtPlayer: (amount: number) => void = () => undefined,
  onMeleeResult?: (result: MeleeResult) => void,
) =>
  new ActorSystem({
    player: () => player(target),
    isSolid: FLOOR,
    isOpaque: FLOOR,
    dayPhase: () => dayStateAtHour(12),
    blockSize: BLOCK_SIZE,
    physics: physicsFor(SCALE),
    tuning: TEST_SENSE_TUNING,
    hurtPlayer,
    actorFigureFiles: FIGURES,
    ...(onMeleeResult ? { onMeleeResult } : {}),
    seed: 31,
  });
const run = (system: ActorSystem, seconds: number): void => {
  for (let frame = 0; frame < Math.ceil(seconds * 60); frame++) {
    system.tick(1 / 60);
  }
};
const posedBoxes = (actor: Actor) =>
  posedHumanoidRegionBoxes({
    seed: actor.figureSeed,
    figure: actorFigure(FIGURES, actor.type, actor.figureSeed),
    position: actor.body.pos,
    facing: actor.facing,
    headYaw: actor.headYaw,
    gaitPhase: actor.gaitPhase,
    speed: actor.horizontalSpeed,
    chasing: actor.agent!.mode === 'chase',
    attackWindup: actor.attackWindup,
    attackWindupSeconds: actor.type.attack!.windupSimSeconds,
    severed: actor.severed,
    blockSize: BLOCK_SIZE,
  });
const regionRay = (actor: Actor, region: HumanoidHitRegion) => {
  const targetBone: Readonly<Record<HumanoidHitRegion, string>> = {
    head: 'head',
    torso: 'chest',
    leftArm: 'forearm.L',
    rightArm: 'forearm.R',
    leftLeg: 'shin.L',
    rightLeg: 'shin.R',
  };
  const box = posedBoxes(actor)[region].find((candidate) => candidate.bone === targetBone[region])!;
  const front: Vec3 = [-actor.facing[0], 0, -actor.facing[2]];
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
  it('holds chasing position, heading, timers, and posed hit boxes for five seconds without hurting the player', () => {
    let playerHealth = 100;
    const system = makeSystem([0, 1, 3.2], (damage) => {
      playerHealth -= damage;
    });
    const id = system.add(SHAMBLER, [0, 1, 0], [0, 0, 1]);
    run(system, 0.15);
    const actor = system.store.get(id)!;
    expect(actor.agent!.mode).toBe('chase');
    expect(actor.body.pos[2]).toBeGreaterThan(0);
    const healthBeforeFreeze = playerHealth;
    system.setFrozen(true);
    const before = system.snapshotState();
    const boxesBefore = posedBoxes(actor);
    run(system, 5);
    expect(system.snapshotState()).toEqual(before);
    expect(posedBoxes(actor)).toEqual(boxesBefore);
    expect(playerHealth).toBe(healthBeforeFreeze);
  });

  it('cancels an active attack windup without landing, while preserving the remaining cooldown', () => {
    let playerHealth = 100;
    const system = makeSystem([0, 1, 1], (damage) => {
      playerHealth -= damage;
    });
    const id = system.add(SHAMBLER, [0, 1, 0], [0, 0, 1]);
    const actor = system.store.get(id)!;
    for (let frame = 0; frame < 120 && actor.attackWindup === 0; frame++) {
      system.tick(1 / 60);
    }
    expect(actor.attackWindup).toBeGreaterThan(0);
    system.setFrozen(true);
    const cooldown = actor.attackWait;
    expect(actor.attackWindup).toBe(0);
    run(system, 5);
    expect(playerHealth).toBe(100);
    expect(actor.attackWait).toBe(cooldown);
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
    const headActor = headSystem.store.get(headId)!;
    headSystem.setFrozen(true);
    const ray = regionRay(headActor, 'head');
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
