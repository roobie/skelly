import type { VocalNoise } from '@skelly/engine/internal/core/actorSense.ts';
import { canonicalJsonBytes } from '@skelly/engine/internal/core/canonicalJson.ts';
import type { PlayerSense } from '@skelly/engine/sim';
import { makeScale, type SolidAt, type Vec3 } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

const registry = baseRegistry();
const SHAMBLER = registry.actors.get('shambler')!;
const BLOCK_SIZE = makeScale(0.5).blockSize;
const PHYSICS = physicsFor(makeScale(0.5));
const FLOOR: SolidAt = (_x, y) => y === 0;
const player = (pos: Vec3): PlayerSense => ({
  pos,
  facing: [-1, 0, 0],
  movement: 'still',
  lit: false,
  lightSeenFrom: 40,
  eyeHeightMetres: 1.3,
  stance: 'standing',
});
const senses = (playerFn: () => PlayerSense, isSolid: SolidAt = FLOOR, hour = 12) => ({
  player: playerFn,
  isSolid,
  isOpaque: isSolid,
  dayPhase: () => dayStateAtHour(hour),
  blockSize: BLOCK_SIZE,
  physics: PHYSICS,
  tuning: TEST_SENSE_TUNING,
  hurtPlayer: () => undefined,
  actorFigureFiles: stackActorFigureFiles(registry),
});
const noiseAtPlayer = (id: number, expiresAt: number): VocalNoise => ({
  id,
  pos: [0, 1, 0],
  radiusMetres: 500,
  expiresAt,
});

describe('stimulus memory', () => {
  it('returns a blocked active investigator to its home behavior after stimulus memory expires', () => {
    const noise = noiseAtPlayer(1, 1);
    const target = () => ({ ...player([0, 1, 0]), vocalNoise: noise });
    const type = { ...SHAMBLER, agent: { ...SHAMBLER.agent!, sight: 0.01, nightSight: 0.01 } };
    const wall: SolidAt = (x, y) => y === 0 || (x === 10 && y > 0 && y < 5);
    const system = new ActorSystem({ ...senses(target, wall), seed: 113 });
    const actor = system.store.get(system.add(type, [20, 1, 0]))!;
    actor.body.onGround = true;
    const dt = 1 / 20;
    let time = dt;
    // A blocked shambler slides along the wall, so it can drift past the active radius and out of
    // tickActive's selection during the 180 s wait; tick every tier to keep the memory timer under test.
    system.tick(dt, time);
    expect(actor.agent!.mode).toBe('investigate');
    expect(actor.body.pos[0]).toBeGreaterThan(10);
    const { stimulusAt } = actor.agent!;
    if (stimulusAt === undefined) {
      throw new Error('Active zombie did not record the heard sound time');
    }
    const deadline = stimulusAt + type.agent.stimulusMemorySimSeconds;
    const ticksBeforeExpiry = Math.ceil((deadline - time) / dt) - 1;
    for (let tick = 0; tick < ticksBeforeExpiry; tick++) {
      time += dt;
      system.tick(dt, time);
    }
    expect(actor.agent!.mode).toBe('investigate');
    expect(actor.body.pos[0]).toBeGreaterThan(10);
    time += dt;
    system.tick(dt, time);
    expect(actor.agent!.mode).toBe('return');
    expect(actor.agent!.lastPerceived).toBeUndefined();
  });

  it('round-trips a forgotten zombie and a following horde with a fresh zombie', () => {
    const noise = noiseAtPlayer(1, 1);
    const target = () => ({ ...player([0, 1, 0]), vocalNoise: noise });
    const type = { ...SHAMBLER, agent: { ...SHAMBLER.agent!, sight: 0.01, nightSight: 0.01 } };
    const wall: SolidAt = (x, y) => y === 0 || (x === 10 && y > 0 && y < 5);
    const options = { ...senses(target, wall), seed: 113 };
    const system = new ActorSystem(options);
    const actor = system.store.get(system.add(type, [20, 1, 0]))!;
    system.addHorde('forgotten-memory-fixture', type, [200, 1, 0], 1);
    actor.body.onGround = true;
    const dt = 1 / 20;
    let time = dt;
    system.tickActive(dt, time);
    system.tickBackground(dt, time);
    expect(actor.agent!.mode).toBe('investigate');
    expect(actor.agent!.stimulusAt).toBeDefined();
    expect(actor.agent!.lastPerceived).toBeDefined();
    expect(actor.agent!.investigationTier).toBeDefined();
    expect(system.snapshotState().hordes[0]).toMatchObject({ mode: 'noise', heard: { tier: 'near' } });
    const stimulusAt = actor.agent!.stimulusAt!;
    const deadline = stimulusAt + type.agent.stimulusMemorySimSeconds;
    while (time < deadline + dt) {
      time += dt;
      system.tickActive(dt, time);
      system.tickBackground(dt, time);
    }

    expect(actor.agent!.mode).toBe('return');
    expect(actor.agent!.stimulusAt).toBeUndefined();
    expect(actor.agent!.lastPerceived).toBeUndefined();
    expect(actor.agent!.investigationTier).toBeUndefined();
    expect(actor.agent!.searchAnchor).toBeUndefined();

    system.add(type, [40, 1, 0]);
    const snapshot = system.snapshotState();
    const canonical = canonicalJsonBytes(snapshot);
    const restored = new ActorSystem(options);
    restored.restoreState(snapshot, (id) => registry.actors.get(id));
    expect(canonicalJsonBytes(restored.snapshotState())).toEqual(canonical);
  });
});
