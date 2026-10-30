import { describe, expect, it } from 'vitest';
import { requireDayCycle } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { dayPhaseAt } from '../src/core/dayPhase.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ZombieDef } from '../src/core/schema.ts';
import { simRate, simSeconds } from '../src/core/time.ts';
import type { PlayerSense, Zombie } from '../src/core/zombies.ts';
import { baseRegistry } from './baseRegistry.ts';
import { physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ZombieSystem } from './zombieSystemFixture.ts';

const registry = baseRegistry();
const base = registry.zombies.get('shambler')!;
const scale = makeScale(0.5);
const type: ZombieDef = {
  ...base,
  sight: 0,
  nightSight: 0,
  hearingModel: {
    ...base.hearingModel,
    loudNoiseRadiusMetres: 10,
    hesitationSimSeconds: { min: simSeconds(0.2), max: simSeconds(0.2) },
  },
  wander: { ...base.wander, idleSimSeconds: { min: simSeconds(0.1), max: simSeconds(0.1) } },
};
const fixture = (radiusMetres = 4) => {
  const player: PlayerSense = {
    pos: [1000, 1, 0],
    facing: [-1, 0, 0],
    movement: 'still',
    lit: false,
    lightSeenFrom: 0,
    eyeHeightMetres: 1.3,
    vocalNoise: { id: 1, pos: [6, 1, 0], radiusMetres, expiresAt: 0.1 },
  };
  const cries: Zombie[] = [];
  const options = {
    onSound: (event: string, _pos: Vec3, zombie?: Zombie) => {
      if (zombie && event === zombie.type.sounds.alert) {
        cries.push(zombie);
      }
    },
    player: () => player,
    isSolid: (_x: number, y: number) => y === 0,
    isOpaque: () => false,
    dayPhase: () => dayPhaseAt(requireDayCycle(registry), 12 * 3600),
    blockSize: scale.blockSize,
    physics: physicsFor(scale),
    tuning: TEST_SENSE_TUNING,
    hurtPlayer: () => undefined,
  };
  const system = new ZombieSystem(options);
  let time = 0;
  const step = (dt = 0.05) => {
    time += dt;
    system.tick(dt, time);
  };
  const add = (pos: Vec3 = [0, 1, 0], def = type) => system.store.get(system.add(def, pos))!;
  return { system, options, player, step, add, cries, time: () => time };
};

describe('shambler interest', () => {
  it('pauses and turns its head toward a quiet sound without walking', () => {
    const f = fixture();
    const zombie = f.add();
    const before = [...zombie.body.pos];
    f.step();
    expect(zombie.mode).toBe('hesitate');
    expect(zombie.body.pos[0]).toBe(before[0]);
    expect(zombie.body.pos[2]).toBe(before[2]);
    expect(Math.abs(zombie.headYaw)).toBeGreaterThan(0);
  });

  it('a loud sound at the threshold skips hesitation', () => {
    const f = fixture(type.hearingModel.loudNoiseRadiusMetres);
    const zombie = f.add();
    f.step();
    expect(zombie.mode).toBe('investigate');
  });

  it('a loud far-tier sound interrupts an existing quiet pause', () => {
    const f = fixture();
    const zombie = f.add();
    f.step();
    expect(zombie.mode).toBe('hesitate');
    f.player.vocalNoise = { id: 2, pos: [30, 1, 0], radiusMetres: 10, expiresAt: 2 };
    f.step();
    expect(zombie.mode).toBe('investigate');
    expect(zombie.investigationTier).toBe('far');
    expect(zombie.hesitationFrom).toBeUndefined();
  });

  it('an idle refusal biases the next stroll and makes the next sound suspicious', () => {
    const f = fixture();
    const zombie = f.add();
    f.step();
    f.step(0.15);
    f.step(0.06);
    expect(zombie.mode).toBe('idle');
    expect(zombie.refusedAt).toBeDefined();
    expect(zombie.leanTarget).toEqual(f.player.vocalNoise!.pos);
    f.step(0.11);
    expect(zombie.mode).toBe('stroll');
    expect(zombie.strollHeading[0]).toBeGreaterThan(0);
    expect(zombie.leanTarget).toBeUndefined();
    f.player.vocalNoise = { ...f.player.vocalNoise!, id: 2, expiresAt: 2 };
    f.step();
    expect(zombie.mode).toBe('investigate');
  });

  it('a strolling listener pursues after the pause rather than refusing', () => {
    const f = fixture();
    f.player.vocalNoise = undefined;
    const zombie = f.add();
    f.step(0.11);
    expect(zombie.mode).toBe('stroll');
    f.player.vocalNoise = { id: 2, pos: [6, 1, 0], radiusMetres: 4, expiresAt: 2 };
    f.step();
    expect(zombie.mode).toBe('hesitate');
    f.step(0.21);
    expect(zombie.mode).toBe('investigate');
  });

  it('horde members beeline even for a quiet sound', () => {
    const f = fixture();
    f.system.addHorde('interest-fixture', type, [0, 1, 0], 1);
    f.step();
    const members = [...f.system.store.entries()].map(([, zombie]) => zombie);
    expect(members.length).toBeGreaterThan(0);
    expect(members.every((zombie) => zombie.mode === 'investigate')).toBe(true);
  });

  it('chains within the caller radius, cascades, and preserves the caller target point', () => {
    const f = fixture(2);
    f.player.vocalNoise!.pos = [0, 1, 4];
    const callerType = {
      ...type,
      hearingModel: {
        ...type.hearingModel,
        loudNoiseRadiusMetres: 2,
        farMultiplier: 1,
        chainRadiusMetres: 4,
        chainChance: 1,
      },
    };
    const caller = f.add([0, 1, 0], callerType);
    const listener = f.add([8, 1, 0], callerType);
    const cascade = f.add([16, 1, 0], callerType);
    const beyond = f.add([40, 1, 0], callerType);
    f.step();
    expect(caller.mode).toBe('investigate');
    for (const zombie of [listener, cascade]) {
      expect(zombie.mode).toBe('investigate');
      expect(zombie.lastPerceived).toEqual(caller.lastPerceived);
      expect(zombie.lastPerceived).not.toEqual(caller.body.pos);
    }
    expect(beyond.mode).toBe('idle');
    expect(beyond.lastPerceived).toBeUndefined();
  });

  it.each(['search', 'return'] as const)('does not re-recruit a body already in %s', (mode) => {
    const f = fixture(2);
    f.player.vocalNoise!.pos = [0, 1, 4];
    const def: ZombieDef = {
      ...type,
      stimulusMemorySimSeconds: simSeconds(30),
      speed: { ...type.speed, chaseMetresPerSimSecond: simRate(1), wanderMetresPerSimSecond: simRate(1) },
      hearingModel: {
        ...type.hearingModel,
        loudNoiseRadiusMetres: 2,
        farMultiplier: 1,
        chainRadiusMetres: 4,
        chainChance: 1,
        searchSimSeconds: { min: simSeconds(1), max: simSeconds(1) },
      },
    };
    const listener = f.add([0, 1, 0], def);
    f.step();
    expect(listener.mode).toBe('investigate');
    f.player.vocalNoise = undefined;
    for (let tick = 0; tick < 200 && listener.mode !== mode; tick++) {
      f.step();
    }
    expect(listener.mode).toBe(mode);
    const rememberedAt = listener.stimulusAt;
    const callerPos: Vec3 = [listener.body.pos[0] + 8, 1, listener.body.pos[2]];
    const caller = f.add(callerPos, def);
    f.player.vocalNoise = {
      id: 2,
      pos: [callerPos[0] + 4, 1, callerPos[2]],
      radiusMetres: 2,
      expiresAt: 30,
    };
    f.step();
    expect(caller.mode).toBe('investigate');
    expect(listener.mode).toBe(mode);
    expect(listener.stimulusAt).toBe(rememberedAt);
  });

  it('a listener before its caller in entity order moves on the same tick as the chain', () => {
    const f = fixture(2);
    f.player.vocalNoise!.pos = [0, 1, 4];
    const def = {
      ...type,
      hearingModel: {
        ...type.hearingModel,
        loudNoiseRadiusMetres: 2,
        farMultiplier: 1,
        chainRadiusMetres: 4,
        chainChance: 1,
      },
    };
    const listener = f.add([8, 1, 0], def);
    f.add([0, 1, 0], def);
    f.step();
    expect(listener.mode).toBe('investigate');
    expect(listener.horizontalSpeed).toBeGreaterThan(0);
  });

  it('a zero chain chance leaves a listener outside player hearing asleep', () => {
    const f = fixture(2);
    f.player.vocalNoise!.pos = [0, 1, 4];
    const def = {
      ...type,
      hearingModel: {
        ...type.hearingModel,
        loudNoiseRadiusMetres: 2,
        farMultiplier: 1,
        chainRadiusMetres: 4,
        chainChance: 0,
      },
    };
    f.add([0, 1, 0], def);
    const listener = f.add([8, 1, 0], def);
    f.step();
    expect(listener.mode).toBe('idle');
  });

  it('measures undamped spread across a dense yard from one local noise', () => {
    const f = fixture(0.5);
    f.player.vocalNoise!.pos = [0.5, 1, 0];
    const def = { ...type, hearingModel: { ...type.hearingModel, loudNoiseRadiusMetres: 0.5 } };
    const crowd = Array.from({ length: 100 }, (_, index) =>
      f.add([(index % 10) * 6, 1, Math.floor(index / 10) * 6], def),
    );
    f.step();
    expect(crowd[0]!.stimulusAt).toBeDefined();
    const pursuing = crowd.filter((zombie) => zombie.stimulusAt !== undefined);
    const reach = Math.max(...pursuing.map((zombie) => Math.hypot(zombie.home[0], zombie.home[2]) * scale.blockSize));
    // biome-ignore lint/suspicious/noConsole: This fixture measures undamped reach without pinning a tuning-dependent count.
    console.info(
      `Undamped dense-yard spread: ${pursuing.length}/${crowd.length} pursuing; ${reach.toFixed(2)} metres from source.`,
    );
  });

  it('settles mutual-earshot alerts, suppresses repeat cries, and cries again after the cooldown', () => {
    const f = fixture(0.5);
    f.player.vocalNoise!.pos = [0.5, 1, 0];
    const def: ZombieDef = {
      ...type,
      stimulusMemorySimSeconds: simSeconds(0.5),
      hearingModel: {
        ...type.hearingModel,
        loudNoiseRadiusMetres: 0.5,
        farMultiplier: 1,
        chainRadiusMetres: 100,
        chainChance: 1,
        searchSimSeconds: { min: simSeconds(0.1), max: simSeconds(0.1) },
      },
    };
    const crowd = [f.add([0, 1, 0], def), f.add([6, 1, 0], def), f.add([12, 1, 0], def)];
    const counts = () => crowd.map((zombie) => f.cries.filter((caller) => caller === zombie).length);
    const settle = () => {
      f.player.vocalNoise = undefined;
      for (let tick = 0; tick < 200; tick++) {
        f.step();
      }
      expect(crowd.every((zombie) => zombie.mode === 'idle' || zombie.mode === 'stroll')).toBe(true);
    };
    const stimulate = (id: number) => {
      f.player.vocalNoise = {
        id,
        pos: [...crowd[0]!.body.pos],
        radiusMetres: 0.5,
        expiresAt: f.time() + 0.1,
      };
      f.step();
    };
    f.step();
    expect(counts()).toEqual(crowd.map(() => 1));
    const firstCryAt = f.time();
    settle();
    expect(f.time() - firstCryAt).toBeLessThan(base.hearingModel.alertCooldownSimSeconds);
    stimulate(2);
    expect(crowd[0]!.stimulusAt).toBe(f.time());
    expect(counts()).toEqual(crowd.map(() => 1));
    f.player.vocalNoise = undefined;
    while (f.time() - firstCryAt < base.hearingModel.alertCooldownSimSeconds) {
      f.step();
    }
    expect(counts()).toEqual(crowd.map(() => 1));
    stimulate(3);
    expect(counts()[0]).toBe(2);
  });

  it('preserves a recruited listener cooldown through saves without blocking recruitment', () => {
    const f = fixture(0.5);
    f.player.vocalNoise!.pos = [0.5, 1, 0];
    const def: ZombieDef = {
      ...type,
      stimulusMemorySimSeconds: simSeconds(0.5),
      hearingModel: {
        ...type.hearingModel,
        loudNoiseRadiusMetres: 0.5,
        farMultiplier: 1,
        chainRadiusMetres: 10,
        chainChance: 1,
        searchSimSeconds: { min: simSeconds(0.1), max: simSeconds(0.1) },
      },
    };
    const listener = f.add([0, 1, 0], def);
    f.step();
    const firstCryAt = f.time();
    f.player.vocalNoise = undefined;
    for (let tick = 0; tick < 100; tick++) {
      f.step();
    }
    expect(listener.mode === 'idle' || listener.mode === 'stroll').toBe(true);
    const snapshot = f.system.snapshotState();
    const restored = new ZombieSystem(f.options);
    restored.restoreState(snapshot, () => def);
    expect(restored.snapshotState()).toEqual(snapshot);
    const [, savedListener] = [...restored.store.entries()][0]!;
    expect(savedListener.lastAlertAt).toBe(firstCryAt);
    const pos: Vec3 = [savedListener.body.pos[0] + 8, 1, savedListener.body.pos[2]];
    restored.add(def, pos);
    f.player.vocalNoise = { id: 2, pos, radiusMetres: 0.5, expiresAt: f.time() + 1 };
    const before = f.cries.length;
    restored.tick(0.05, f.time() + 0.05);
    expect(f.cries.length - before).toBe(1);
    expect(savedListener.lastPerceived).toEqual(pos);
    expect(savedListener.stimulusAt).toBe(f.time() + 0.05);
    expect(savedListener.lastAlertAt).toBe(firstCryAt);
    const invalid = structuredClone(snapshot);
    invalid.zombies[0]!.zombie.lastAlertAt = -1;
    expect(() => new ZombieSystem(f.options).restoreState(invalid, () => def)).toThrow('Invalid zombie state');
  });

  it('round-trips a live hesitation and refusal lean through validated saves', () => {
    const f = fixture();
    const zombie = f.add();
    f.step();
    const restore = () => {
      const snapshot = f.system.snapshotState();
      const restored = new ZombieSystem(f.options);
      restored.restoreState(snapshot, () => type);
      expect(restored.snapshotState()).toEqual(snapshot);
      return snapshot;
    };
    expect(restore().zombies[0]!.zombie.mode).toBe('hesitate');
    f.step(0.15);
    f.step(0.06);
    expect(zombie.leanTarget).toBeDefined();
    const snapshot = structuredClone(restore());
    snapshot.zombies[0]!.zombie.refusedAt = -1;
    expect(() => new ZombieSystem(f.options).restoreState(snapshot, () => type)).toThrow('Invalid zombie state');
  });
});
