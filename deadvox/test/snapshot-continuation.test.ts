import { describe, expect, it } from 'vitest';
import { SPAWN_TIMES } from '../src/core/clock.ts';
import { Inventory } from '../src/core/inventory.ts';
import { restorePlayerAudioState } from '../src/core/saveState.ts';
import type { Site } from '../src/core/site.ts';
import { SoundPicker } from '../src/core/soundPicker.ts';
import {
  advance,
  capture,
  createRuntime,
  fixtureZombieColumn,
  frozenTree,
  inspect,
  plainDataTree,
  prepareAudioContinuation,
  registry,
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
  it('loads a closed-window marker from a save and spawns it when the clock opens the window', () => {
    const start = SPAWN_TIMES.dusk - 60;
    const [cx, cz] = fixtureZombieColumn;
    const pos: [number, number, number] = [cx * 32 + 20, 1, cz * 32 + 20];
    const marker = { type: 'shambler', pos, window: { from: 'dusk' } };
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
      [...loaded.zombies.store.entries()].filter(([, zombie]) => zombie.home.every((v, i) => v === pos[i])).length;
    expect(atHome()).toBe(0);
    advance(loaded, 456);
    expect(loaded.sim.calendar).toBeGreaterThan(SPAWN_TIMES.dusk);
    expect(atHome()).toBe(1);
    expect(loaded.spawner.snapshotState()).toContain(key);
  });

  it('continues active compressed rest through the first 1 Hz tick after load', () => {
    const source = createRuntime(undefined, true, oneColumn);
    expect(startRest(source, 'sleep')).toBeUndefined();
    advance(source, 120);
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
    advance(source, 4);
    advance(loaded, 4);

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

  it('deeply matches N steps with K/save/load/N−K (active rest)', () => {
    const uninterrupted = createRuntime(undefined, true);
    const split = createRuntime(undefined, true);
    expect(uninterrupted.columns.length).toBeGreaterThan(0);
    expect([...uninterrupted.zombies.store.entries()].length).toBeGreaterThan(0);
    expect(uninterrupted.spawner.snapshotState().length).toBeGreaterThan(uninterrupted.zombies.store.size);
    expect(uninterrupted.inventory.entities.all).toSatisfy((entities) =>
      [...entities].some((entity) => entity.searched),
    );
    expect(uninterrupted.player.body.onGround).toBe(false);
    expect(uninterrupted.inventory.hands.right?.pockets?.[0]).toHaveLength(1);
    expect(startRest(uninterrupted, 'sleep')).toBeUndefined();
    expect(startRest(split, 'sleep')).toBeUndefined();
    advance(uninterrupted, 4);
    advance(split, 4);
    expect(split.player.body.onGround).toBe(false);
    prepareAudioContinuation(uninterrupted);
    prepareAudioContinuation(split);
    const snapshot = capture(split);
    expect(Object.keys(snapshot.character.playerAudio).sort()).toEqual(['soundPicker', 'vocalNoise', 'vocalNoiseId']);
    expect(snapshot.character.playerAudio.vocalNoise).not.toBeNull();
    expect(snapshot.character.playerAudio.vocalNoise!.expiresAt - split.sim.time).toBeCloseTo(0.25);
    expect(snapshot.world.zombies.zombies[0]!.zombie).not.toHaveProperty('footstepClock');
    expect(snapshot.character.playerAudio.soundPicker.events).toContainEqual(
      expect.objectContaining({ event: 'player_strain', lastPlayedAt: split.sim.time }),
    );
    expect(snapshot.world.zombies.zombies.some(({ zombie }) => zombie.idleSoundTimer > 0)).toBe(true);
    expect(snapshot.character.handling.jobs).toEqual([]);
    expect(plainDataTree(snapshot)).toBe(true);
    expect(frozenTree(snapshot)).toBe(true);
    advance(uninterrupted, 4, 1);
    const continuedSounds = [...uninterrupted.heardSounds];
    const loaded = createRuntime(snapshot, true);
    advance(loaded, 4, 1);
    expect(loaded.heardSounds).toEqual(continuedSounds);
    expect(continuedSounds.some(({ event }) => event === 'shambler_idle')).toBe(true);
    expect(inspect(loaded)).toEqual(inspect(uninterrupted));
  }, 15_000);

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
  }, 15_000);

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
  }, 15_000);

  it('detects omission of simulation, world, scheduler, inventory, and audio state', () => {
    const original = createRuntime(undefined, true);
    expect(startRest(original, 'rest')).toBeUndefined();
    advance(original, 2);
    prepareAudioContinuation(original);
    const saved = capture(original);
    const baseline = createRuntime(saved, true);
    advance(baseline, 1);

    const noDelta = structuredClone(saved);
    noDelta.world.diffs.chunks[0]!.cells.pop();
    const withoutDelta = createRuntime(noDelta, true);
    advance(withoutDelta, 1);
    expect(inspect(withoutDelta)).not.toEqual(inspect(baseline));

    const noAllocator = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noAllocator.character.inventory, 'nextItemUid');
    expect(() => Inventory.restoreState(registry, noAllocator.character.inventory)).toThrow('Invalid next item id');

    const noCursor = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    noCursor.character.simulation.scheduler.systems = noCursor.character.simulation.scheduler.systems.filter(
      (cursor) => cursor.id !== 'player',
    );
    expect(() => createRuntime(noCursor, true)).toThrow('Scheduler system set does not match snapshot');

    expect(saved.world.zombies.zombies.length).toBeGreaterThan(0);
    const noRngWord = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    const [a, b, c] = noRngWord.world.zombies.zombies[0]!.zombie.behaviorRng;
    noRngWord.world.zombies.zombies[0]!.zombie.behaviorRng = [a, b, c] as never;
    expect(() => createRuntime(noRngWord, true)).toThrow('Invalid zombie state');

    const noZombieSoundRng = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noZombieSoundRng.world.zombies.zombies[0]!.zombie, 'soundRng');
    expect(() => createRuntime(noZombieSoundRng, true)).toThrow('Invalid zombie state');

    const noIdleSoundTimer = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noIdleSoundTimer.world.zombies.zombies[0]!.zombie, 'idleSoundTimer');
    expect(() => createRuntime(noIdleSoundTimer, true)).toThrow('Invalid zombie state');

    const noLastNoiseId = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noLastNoiseId.world.zombies.zombies[0]!.zombie, 'lastVocalNoiseId');
    expect(() => createRuntime(noLastNoiseId, true)).toThrow('Invalid zombie state');

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
  }, 15_000);
});
