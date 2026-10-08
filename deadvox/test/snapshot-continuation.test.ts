import { describe, expect, it } from 'vitest';
import { SPAWN_TIMES } from '../src/core/clock.ts';
import { toChunk } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { STAMINA } from '../src/core/needs.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { restorePlayerAudioState } from '../src/core/saveState.ts';
import type { Site } from '../src/core/site.ts';
import { SoundPicker } from '../src/core/soundPicker.ts';
import { gameTimeOfDay, realSeconds } from '../src/core/time.ts';
import { terrainHeight } from '../src/core/worldgen.ts';
import { BACKGROUND_ZOMBIE_SLICE_COUNT } from '../src/core/zombies.ts';
import { planRealFrame } from '../src/game/frameDriver.ts';
import { IDLE } from '../src/game/session.ts';
import {
  advance,
  capture,
  contentLookup,
  createRuntime,
  encodeFixture,
  fixtureColumns,
  fixtureHamlet,
  fixtureZombieColumn,
  formatVersion,
  frozenTree,
  inspect,
  plainDataTree,
  prepareAudioContinuation,
  registry,
  scale,
  seed,
  startRest,
} from './snapshotTestSupport.ts';

describe('zombie attack causes', () => {
  it('attributes player damage to the attacking zombie type', () => {
    const runtime = createRuntime();
    for (const [id] of runtime.zombies.store.entries()) {
      runtime.zombies.store.remove(id);
    }

    const events = runtime.sim.events.reader();
    const runner = registry.zombies.get('runner')!;
    const playerPos = runtime.session.body.pos;
    runtime.zombies.add(runner, [playerPos[0] + 0.5, playerPos[1], playerPos[2]], [-1, 0, 0]);
    advance(runtime, 300);

    expect(
      events
        .read()
        .some((event) => event.kind === 'damage' && event.cause.toLowerCase().includes(runner.name.toLowerCase())),
    ).toBe(true);
  });
});

describe('hamlet save/load continuation', () => {
  const oneColumn = [fixtureZombieColumn] as const;
  const soundColumn = fixtureColumns.find(([cx, cz]) =>
    fixtureHamlet.zombiesIn(cx, cz).some(({ type }) => type === 'shambler'),
  );
  if (!soundColumn) {
    throw new Error('Snapshot fixture has no shambler sound column');
  }
  const soundColumns = [soundColumn] as const;
  const containerColumn = fixtureColumns.find(([cx, cz]) =>
    fixtureHamlet.furnitureIn(cx, cz).some(({ spec }) => registry.furniture.get(spec.type)?.container),
  );
  if (!containerColumn) {
    throw new Error('Snapshot fixture has no container column');
  }
  const continuationColumns = [containerColumn] as const;

  it('continues horde noise response and night drift deterministically through a save', async () => {
    const [cx, cz] = fixtureZombieColumn;
    const center = fixtureHamlet.zombiesIn(cx, cz)[0]?.pos;
    if (!center) {
      throw new Error('Horde save fixture has no nearby terrain spawn');
    }
    const playerSpawn: [number, number, number] = [center[0] - 180, center[1], center[2]];
    const start = 23 * 3600;
    const source = createRuntime(undefined, false, oneColumn, { start, spawn: playerSpawn });
    source.zombies.addHorde('save-fixture', registry.zombies.get('shambler')!, center, BACKGROUND_ZOMBIE_SLICE_COUNT);
    expect(source.zombies.snapshotState().hordes.length).toBeGreaterThan(0);
    advance(source, 60);
    expect(source.zombies.snapshotState().hordes[0]?.mode).toBe('roam');
    source.emitPlayerSound('shotgun_blast', source.sim.time);
    advance(source, 97);
    const state = source.zombies.snapshotState();
    expect(state.hordes[0]?.mode).toBe('noise');
    expect(state.hordes[0]?.lastNoiseId).toBeGreaterThan(0);
    const stimulusAt = state.hordes[0]?.stimulusAt;
    if (stimulusAt === undefined) {
      throw new Error('Horde save fixture did not record the sound time');
    }

    const decoded = await decodeSave(await encodeFixture(capture(source)), { version: formatVersion, contentLookup });
    const loaded = createRuntime(decoded.snapshot, false, oneColumn, { start, spawn: playerSpawn });
    const continuationFrames = BACKGROUND_ZOMBIE_SLICE_COUNT + 1;
    advance(source, continuationFrames);
    advance(loaded, continuationFrames);
    expect(loaded.zombies.snapshotState()).toEqual(source.zombies.snapshotState());
    expect(loaded.sim.scheduler.snapshotState()).toEqual(source.sim.scheduler.snapshotState());
    const forgetAt = stimulusAt + registry.zombies.get('shambler')!.stimulusMemorySimSeconds;
    loaded.zombies.tickBackground(0.5, forgetAt - 0.5, 0, BACKGROUND_ZOMBIE_SLICE_COUNT);
    expect(loaded.zombies.snapshotState().hordes[0]?.mode).toBe('noise');
    loaded.zombies.tickBackground(0.5, forgetAt, 0, BACKGROUND_ZOMBIE_SLICE_COUNT);
    expect(loaded.zombies.snapshotState().hordes[0]?.mode).toBe('roam');
  });

  it('loads a closed-window marker from a save and spawns it in the background tier when the window opens', () => {
    const start = SPAWN_TIMES.dusk - 60;
    const [cx, cz] = fixtureZombieColumn;
    const pos: [number, number, number] = [cx * 32 + 20, 1, cz * 32 + 20];
    const marker = { type: 'shambler', pos, window: { fromGameTimeOfDay: gameTimeOfDay(SPAWN_TIMES.dusk) } };
    const timedSite = {
      surface: { height: (_x: number, _z: number, natural: number) => natural, top: () => undefined },
      spawn: { pos: [0, 0, 0] as [number, number, number], yaw: 0 },
      stamp: () => undefined,
      furnitureIn: () => [],
      zombiesIn: () => [marker],
    } as Site;
    const original = createRuntime(undefined, false, [fixtureZombieColumn], { start });
    original.session.onColumn(cx, cz, timedSite);
    const key = `shambler:${pos.join(',')}`;
    expect(original.spawner.snapshotState()).not.toContain(key);

    const loaded = createRuntime(capture(original), false, [fixtureZombieColumn], { start });
    loaded.session.onColumn(cx, cz, timedSite);
    const atHome = () =>
      [...loaded.zombies.store.entries()].filter(([, zombie]) => zombie.home.every((v, i) => v === pos[i]));
    expect(atHome()).toHaveLength(0);
    advance(loaded, 456);
    expect(loaded.sim.calendar).toBeGreaterThan(SPAWN_TIMES.dusk);
    expect(atHome()).toHaveLength(1);
    expect(atHome()[0]?.[1].tier).toBe('background');
    expect(loaded.spawner.snapshotState()).toContain(key);
  });

  it('preserves the whole sound-event stream across save and load', async () => {
    const uninterrupted = createRuntime(undefined, false, soundColumns);
    const split = createRuntime(undefined, false, soundColumns);
    const framesBeforeSave = 290;
    const framesAfterSave = 900;
    advance(uninterrupted, framesBeforeSave);
    advance(split, framesBeforeSave);
    const soundCountAtSave = uninterrupted.heardSounds.length;
    const bytes = await encodeFixture(capture(split));
    const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
    const loaded = createRuntime(decoded.snapshot, false, soundColumns);

    advance(uninterrupted, framesAfterSave);
    advance(loaded, framesAfterSave);

    const continuedSounds = uninterrupted.heardSounds.slice(soundCountAtSave);
    expect(continuedSounds.some(({ event }) => event === 'shambler_idle')).toBe(true);
    expect(continuedSounds.length).toBeGreaterThan(0);
    expect(loaded.heardSounds).toEqual(continuedSounds);
  });

  it('continues moving player audio and sprint hysteresis through save/load', async () => {
    const hedge = fixtureHamlet.hedges.find(({ min }) => toChunk(min[2]) === toChunk(min[2] + 3.5));
    if (!hedge) {
      throw new Error('Snapshot fixture has no hedge crossing route');
    }
    const [x, , z] = hedge.min;
    const startZ = z + 3.5;
    const ground = fixtureHamlet.surface.height(x, startZ, terrainHeight(seed, scale, x, startZ));
    const spawn: [number, number, number] = [x + 0.5, ground + 1.0001, startZ];
    const cx = toChunk(x);
    const cz = toChunk(z);
    const columns: [number, number][] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        columns.push([cx + dx, cz + dz]);
      }
    }
    let intent = { ...IDLE, forward: 1, walk: true };
    const runtimeFor = (snapshot?: ReturnType<typeof capture>) =>
      createRuntime(snapshot, 'left', columns, {
        spawn,
        yaw: 0,
        active: true,
        intent: () => intent,
      });
    const load = async (snapshot: ReturnType<typeof capture>) => {
      const bytes = await encodeFixture(snapshot);
      const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
      return runtimeFor(decoded.snapshot);
    };

    const uninterrupted = runtimeFor();
    advance(uninterrupted, 45);
    expect(uninterrupted.player.body.onGround).toBe(true);
    expect(uninterrupted.player.body.pos[2]).toBeLessThan(spawn[2]);
    const snapshotAtHedge = capture(uninterrupted);
    expect(snapshotAtHedge.character.playerAudio.footstepClock.gait).toBe('walking');
    expect(snapshotAtHedge.character.playerAudio.footstepClock.stepIndex).toBeGreaterThan(0);
    expect(snapshotAtHedge.character.playerAudio.rustleClock.cells.length).toBeGreaterThan(0);
    expect(snapshotAtHedge.character.playerAudio.footstepClock.distanceUntilStep).toBeGreaterThan(0);
    expect(snapshotAtHedge.character.playerAudio.footstepClock.stridePhase).toBeGreaterThanOrEqual(0);
    expect(snapshotAtHedge.character.playerAudio.footstepClock.stridePhase).toBeLessThan(1);

    const soundCountAtHedge = uninterrupted.heardSounds.length;
    const loadedWalking = await load(snapshotAtHedge);
    advance(uninterrupted, 60);
    advance(loadedWalking, 60);
    const continuedWalkingSounds = uninterrupted.heardSounds.slice(soundCountAtHedge);
    expect(continuedWalkingSounds.length).toBeGreaterThan(0);
    expect(loadedWalking.heardSounds).toEqual(continuedWalkingSounds);
    expect(loadedWalking.player.body).toEqual(uninterrupted.player.body);
    expect(loadedWalking.session.playerStridePhase).toBeCloseTo(uninterrupted.session.playerStridePhase, 8);
    expect(loadedWalking.session.aim.frame).toEqual(uninterrupted.session.aim.frame);

    intent = { ...IDLE, forward: 1, walk: true, jump: true };
    advance(uninterrupted, 1);
    advance(loadedWalking, 1);
    const jumpSnapshot = capture(uninterrupted);
    expect(jumpSnapshot.character.playerAudio.airbornePeakY).not.toBeNull();
    const loadedJumping = await load(jumpSnapshot);
    expect(capture(loadedJumping).character.playerAudio.airbornePeakY).toBe(
      jumpSnapshot.character.playerAudio.airbornePeakY,
    );
    intent = { ...IDLE, forward: 1, walk: true };
    const soundCountAtJump = uninterrupted.heardSounds.length;
    advance(uninterrupted, 45);
    advance(loadedJumping, 45);
    expect(loadedJumping.heardSounds).toEqual(uninterrupted.heardSounds.slice(soundCountAtJump));
    expect(loadedJumping.player.body).toEqual(uninterrupted.player.body);

    intent = { ...IDLE, right: 1, sprint: true };
    const framesUntilWinded =
      Math.ceil(((uninterrupted.sim.needs.stamina - STAMINA.winded) / -STAMINA.sprint) * 60) + 2;
    for (let frame = 0; frame < framesUntilWinded; frame++) {
      intent = { ...intent, right: frame % 60 < 30 ? 1 : -1 };
      advance(uninterrupted, 1);
      advance(loadedJumping, 1);
      if (uninterrupted.sim.needs.stamina < STAMINA.winded) {
        break;
      }
    }
    expect(uninterrupted.session.sprinting).toBe(true);
    expect(uninterrupted.sim.needs.stamina).toBeGreaterThan(0);
    expect(uninterrupted.sim.needs.stamina).toBeLessThan(STAMINA.winded);
    expect(loadedJumping.session.sprinting).toBe(true);
    const sprintSnapshot = capture(uninterrupted);
    expect(sprintSnapshot.character.player.sprinting).toBe(true);

    const soundCountAtSprint = uninterrupted.heardSounds.length;
    const loadedSprinting = await load(sprintSnapshot);
    advance(uninterrupted, 30);
    advance(loadedSprinting, 30);
    const continuedSprintSounds = uninterrupted.heardSounds.slice(soundCountAtSprint);
    expect(continuedSprintSounds.length).toBeGreaterThan(0);
    expect(loadedSprinting.heardSounds).toEqual(continuedSprintSounds);
    expect(loadedSprinting.player.body).toEqual(uninterrupted.player.body);
    expect(loadedSprinting.sim.needs).toEqual(uninterrupted.sim.needs);
    expect(loadedSprinting.session.sprinting).toBe(uninterrupted.session.sprinting);
  });

  it('continues the stamina recovery delay across save/load', async () => {
    const hedge = fixtureHamlet.hedges.find(({ min }) => toChunk(min[2]) === toChunk(min[2] + 3.5));
    if (!hedge) {
      throw new Error('Snapshot fixture has no ground route for stamina recovery');
    }
    const [x, , z] = hedge.min;
    const startZ = z + 3.5;
    const ground = fixtureHamlet.surface.height(x, startZ, terrainHeight(seed, scale, x, startZ));
    const spawn: [number, number, number] = [x + 0.5, ground + 1.0001, startZ];
    const cx = toChunk(x);
    const cz = toChunk(z);
    const columns: [number, number][] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        columns.push([cx + dx, cz + dz]);
      }
    }
    let intent = { ...IDLE };
    const runtimeFor = (savedSnapshot?: ReturnType<typeof capture>) =>
      createRuntime(savedSnapshot, false, columns, { spawn, active: true, intent: () => intent });
    const load = async (savedSnapshot: ReturnType<typeof capture>) => {
      const bytes = await encodeFixture(savedSnapshot);
      const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
      return runtimeFor(decoded.snapshot);
    };

    const source = runtimeFor();
    let frames = 0;
    while (source.sim.needs.stamina > 0 && frames < 5000) {
      intent = { ...IDLE, right: frames % 60 < 30 ? 1 : -1, sprint: true };
      advance(source, 1);
      frames += 1;
    }
    expect(frames).toBeLessThan(5000);
    expect(source.player.body.onGround).toBe(true);
    expect(source.sim.needs.stamina).toBe(0);
    intent = { ...IDLE };
    const framesBeforeRecovery = Math.floor((source.sim.body.tuning.staminaRegenDelaySimSeconds * 60) / 2);
    advance(source, framesBeforeRecovery);
    expect(source.sim.needs.stamina).toBe(0);

    const snapshot = capture(source);
    const remaining = snapshot.character.simulation.needs.staminaRegenDelayRemainingSimSeconds;
    expect(remaining).toBeGreaterThan(0);
    const loaded = await load(snapshot);
    const beforeExpiry = Math.max(0, Math.floor(remaining * 60) - 1);
    advance(source, beforeExpiry);
    advance(loaded, beforeExpiry);
    expect(source.sim.needs.stamina).toBe(0);
    expect(loaded.sim.needs.stamina).toBe(0);

    advance(source, 3);
    advance(loaded, 3);
    expect(source.sim.needs.stamina).toBeGreaterThan(0);
    expect(loaded.sim.needs).toEqual(source.sim.needs);
  });

  it('continues active compressed rest through the first 1 Hz tick after load', () => {
    const advanceReal = (runtime: ReturnType<typeof createRuntime>, frames: number) => {
      runtime.sim.paused = false;
      for (let frame = 0; frame < frames; frame++) {
        runtime.session.frame(planRealFrame(runtime.sim.compression, realSeconds(1 / 60)));
      }
    };
    const source = createRuntime(undefined, true, oneColumn);
    expect(startRest(source, 'sleep')).toBeUndefined();
    advanceReal(source, 120);
    expect(source.sim.compression.active).toBe(true);
    expect(source.sim.compression.c).toBeGreaterThan(1);
    expect(source.sim.actions.job).toMatchObject({ jobType: 'sleep', stopped: false });

    const savedNeeds = { ...source.sim.needs };
    const snapshot = capture(source);
    const loaded = createRuntime(snapshot, true, oneColumn);
    expect(loaded.sim.compression.active).toBe(true);
    expect(loaded.sim.compression.c).toBeGreaterThan(1);
    expect(loaded.sim.actions.job).toMatchObject({ jobType: 'sleep', stopped: false });

    const schedulerSystems = ['needs', 'lights', 'long-action'] as const;
    const savedTicks = new Map(snapshot.character.simulation.scheduler.systems.map(({ id, ticks }) => [id, ticks]));
    advanceReal(source, 4);
    advanceReal(loaded, 4);

    for (const id of schedulerSystems) {
      const saved = savedTicks.get(id);
      expect(saved).toBeDefined();
      expect(source.sim.scheduler.tickCounts().get(id)).toBeGreaterThan(saved!);
      expect(loaded.sim.scheduler.tickCounts().get(id)).toBeGreaterThan(saved!);
    }
    expect(source.sim.compression.active).toBe(true);
    expect(loaded.sim.compression.active).toBe(true);
    expect(source.inventory.hands.left?.charges).toBeDefined();
    expect(loaded.inventory.hands.left?.charges).toBe(source.inventory.hands.left?.charges);
    expect(loaded.sim.needs).toEqual(source.sim.needs);
    expect(loaded.sim.needs).not.toEqual(savedNeeds);
    expect(loaded.sim.actions.snapshotState()).toEqual(source.sim.actions.snapshotState());
  });

  // Two one-column runtimes are compared across active-rest save/load, including full world bytes.
  it('deeply matches N steps with K/save/load/N−K (active rest)', () => {
    const uninterrupted = createRuntime(undefined, true, continuationColumns);
    const split = createRuntime(undefined, true, continuationColumns);
    expect(uninterrupted.columns.length).toBeGreaterThan(0);
    expect(uninterrupted.inventory.entities.all).toSatisfy((entities) =>
      [...entities].some((entity) => entity.searched),
    );
    expect(uninterrupted.player.body.onGround).toBe(false);
    expect(uninterrupted.inventory.hands.right?.pockets?.[0]).toHaveLength(1);
    expect(startRest(uninterrupted, 'sleep')).toBeUndefined();
    expect(startRest(split, 'sleep')).toBeUndefined();
    advance(uninterrupted, 4);
    advance(split, 4);
    for (const runtime of [uninterrupted, split]) {
      runtime.zombies.add(registry.zombies.get('shambler')!, [...runtime.player.body.pos]);
    }
    expect([...uninterrupted.zombies.store.entries()].length).toBeGreaterThan(0);
    expect(split.player.body.onGround).toBe(false);
    prepareAudioContinuation(uninterrupted);
    prepareAudioContinuation(split);
    const snapshot = capture(split);
    expect(Object.keys(snapshot.character.playerAudio).sort()).toEqual([
      'airbornePeakY',
      'footstepClock',
      'rustleClock',
      'soundPicker',
      'vocalNoise',
      'vocalNoiseId',
    ]);
    expect(snapshot.character.playerAudio.vocalNoise).not.toBeNull();
    expect(snapshot.character.playerAudio.vocalNoise!.expiresAt - split.sim.time).toBeCloseTo(0.25);
    expect(snapshot.world.zombies.zombies[0]!.zombie).toHaveProperty('footstepClock');
    expect(snapshot.character.playerAudio.soundPicker.events).toContainEqual(
      expect.objectContaining({ event: 'player_strain', lastPlayedAt: split.sim.time }),
    );
    expect(snapshot.world.zombies.zombies.some(({ zombie }) => zombie.idleSoundTimer > 0)).toBe(true);
    expect(snapshot.character.handling.jobs).toEqual([]);
    expect(plainDataTree(snapshot)).toBe(true);
    expect(frozenTree(snapshot)).toBe(true);
    advance(uninterrupted, 4, 1);
    const continuedSounds = [...uninterrupted.heardSounds];
    const loaded = createRuntime(snapshot, true, continuationColumns);
    advance(loaded, 4, 1);
    expect(loaded.heardSounds).toEqual(continuedSounds);
    expect(continuedSounds.some(({ event }) => event === 'shambler_idle')).toBe(true);
    expect(inspect(loaded)).toEqual(inspect(uninterrupted));
  }, 5000);

  it('preserves an active-sleep interruption emitted between frames across save/load', () => {
    const uninterrupted = createRuntime(undefined, true, oneColumn);
    const split = createRuntime(undefined, true, oneColumn);
    expect(startRest(uninterrupted, 'sleep')).toBeUndefined();
    expect(startRest(split, 'sleep')).toBeUndefined();
    advance(uninterrupted, 2);
    advance(split, 2);

    uninterrupted.sim.emit({ kind: 'interrupt', reason: 'test interruption' });
    split.sim.emit({ kind: 'interrupt', reason: 'test interruption' });
    const snapshot = capture(split);
    expect(snapshot.character.simulation.pendingInterrupt).toBe('test interruption');
    expect(split.sim.compression.active).toBe(true);
    expect(split.sim.compression.interruption).toBeUndefined();

    advance(uninterrupted, 1);
    const loaded = createRuntime(snapshot, true, oneColumn);
    advance(loaded, 1);
    expect(inspect(loaded)).toEqual(inspect(uninterrupted));
  });

  it('preserves a pending sleep interruption across a paused snapshot and load', () => {
    const uninterrupted = createRuntime(undefined, true, oneColumn);
    const split = createRuntime(undefined, true, oneColumn);
    expect(startRest(uninterrupted, 'sleep')).toBeUndefined();
    expect(startRest(split, 'sleep')).toBeUndefined();
    advance(uninterrupted, 2);
    advance(split, 2);

    uninterrupted.sim.emit({ kind: 'interrupt', reason: 'test interruption' });
    split.sim.emit({ kind: 'interrupt', reason: 'test interruption' });
    uninterrupted.sim.paused = true;
    split.sim.paused = true;
    const snapshot = capture(split);
    expect(snapshot.character.simulation.pendingInterrupt).toBe('test interruption');

    advance(uninterrupted, 1);
    const loaded = createRuntime(snapshot, true, oneColumn);
    advance(loaded, 1);
    expect(inspect(loaded)).toEqual(inspect(uninterrupted));
  });

  it('detects omission of simulation, world, scheduler, inventory, and audio state', () => {
    const runtimeFrom = (snapshot?: ReturnType<typeof capture>) => createRuntime(snapshot, true, oneColumn);
    const original = runtimeFrom();
    expect(startRest(original, 'rest')).toBeUndefined();
    advance(original, 2);
    original.zombies.add(registry.zombies.get('shambler')!, original.player.body.pos);
    prepareAudioContinuation(original);
    const saved = capture(original);
    expect(saved.world.diffs.chunks.length).toBeGreaterThan(0);
    const baseline = runtimeFrom(saved);
    advance(baseline, 1);

    const noDelta = structuredClone(saved);
    noDelta.world.diffs.chunks[0]!.cells.pop();
    const withoutDelta = runtimeFrom(noDelta);
    advance(withoutDelta, 1);
    expect(inspect(withoutDelta)).not.toEqual(inspect(baseline));

    const noAllocator = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noAllocator.character.inventory, 'nextItemUid');
    expect(() => Inventory.restoreState(registry, noAllocator.character.inventory)).toThrow('Invalid next item id');

    const noCursor = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    noCursor.character.simulation.scheduler.systems = noCursor.character.simulation.scheduler.systems.filter(
      (cursor) => cursor.id !== 'player',
    );
    expect(() => runtimeFrom(noCursor)).toThrow('Scheduler system set does not match snapshot');

    expect(saved.world.zombies.zombies.length).toBeGreaterThan(0);
    const noRngWord = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    const [a, b, c] = noRngWord.world.zombies.zombies[0]!.zombie.behaviorRng;
    noRngWord.world.zombies.zombies[0]!.zombie.behaviorRng = [a, b, c] as never;
    expect(() => runtimeFrom(noRngWord)).toThrow('Invalid zombie state');

    const noZombieSoundRng = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noZombieSoundRng.world.zombies.zombies[0]!.zombie, 'soundRng');
    expect(() => runtimeFrom(noZombieSoundRng)).toThrow('Invalid zombie state');

    const noIdleSoundTimer = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noIdleSoundTimer.world.zombies.zombies[0]!.zombie, 'idleSoundTimer');
    expect(() => runtimeFrom(noIdleSoundTimer)).toThrow('Invalid zombie state');

    const noLastNoiseId = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noLastNoiseId.world.zombies.zombies[0]!.zombie, 'lastVocalNoiseId');
    expect(() => runtimeFrom(noLastNoiseId)).toThrow('Invalid zombie state');

    const noVocalNoiseId = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noVocalNoiseId.character.playerAudio, 'vocalNoiseId');
    expect(() => restorePlayerAudioState(noVocalNoiseId.character.playerAudio)).toThrow('Invalid player audio state');

    const noVocalNoise = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noVocalNoise.character.playerAudio, 'vocalNoise');
    expect(() => restorePlayerAudioState(noVocalNoise.character.playerAudio)).toThrow('Invalid active vocal noise');

    for (const field of ['id', 'pos', 'radiusMetres', 'expiresAt'] as const) {
      const noNoiseField = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
      Reflect.deleteProperty(noNoiseField.character.playerAudio.vocalNoise!, field);
      expect(() => restorePlayerAudioState(noNoiseField.character.playerAudio)).toThrow('Invalid active vocal noise');
    }

    const noPickerState = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noPickerState.character.playerAudio, 'soundPicker');
    expect(() => restorePlayerAudioState(noPickerState.character.playerAudio)).toThrow('Invalid player audio state');

    const noPickerEvent = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noPickerEvent.character.playerAudio.soundPicker.events[0]!, 'event');
    expect(() =>
      new SoundPicker(seed, registry.sounds).restoreState(noPickerEvent.character.playerAudio.soundPicker),
    ).toThrow('Invalid sound picker state');

    const noPickerRng = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noPickerRng.character.playerAudio.soundPicker.events[0]!, 'rng');
    expect(() =>
      new SoundPicker(seed, registry.sounds).restoreState(noPickerRng.character.playerAudio.soundPicker),
    ).toThrow('Invalid sound picker state');

    const noPickerVariant = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noPickerVariant.character.playerAudio.soundPicker.events[0]!, 'lastVariant');
    expect(() =>
      new SoundPicker(seed, registry.sounds).restoreState(noPickerVariant.character.playerAudio.soundPicker),
    ).toThrow('Invalid sound picker state');

    const noPickerTime = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noPickerTime.character.playerAudio.soundPicker.events[0]!, 'lastPlayedAt');
    expect(() =>
      new SoundPicker(seed, registry.sounds).restoreState(noPickerTime.character.playerAudio.soundPicker),
    ).toThrow('Invalid sound picker state');
  });
});
