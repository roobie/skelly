import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEGATIVE_ZERO_TAG } from '../src/core/canonicalJson.ts';
import { Chunk } from '../src/core/chunk.ts';
import { hourOfDay } from '../src/core/clock.ts';
import { buildRegistry } from '../src/core/content.ts';
import { CHUNK, toChunk } from '../src/core/coords.ts';
import type { MapEntityStore } from '../src/core/entities.ts';
import { Hamlet } from '../src/core/hamlet.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { stepBody } from '../src/core/physics.ts';
import { decodeSave, encodeSave, type SaveContentKind, type SaveVersionComponents } from '../src/core/saveFormat.ts';
import { restorePlayerAudioState, type SaveSnapshot, snapshotSession } from '../src/core/saveState.ts';
import { makeScale } from '../src/core/scale.ts';
import { Simulation } from '../src/core/sim.ts';
import { SoundPicker } from '../src/core/soundPicker.ts';
import { World } from '../src/core/world.ts';
import { generateColumn, type Terrain } from '../src/core/worldgen.ts';
import { ZombieSpawner } from '../src/core/zombieSpawns.ts';
import { ZombieSystem } from '../src/core/zombies.ts';
import { createPlayerBody, physicsFor, restorePlayer, snapshotPlayer } from '../src/game/player.ts';
import { RestController } from '../src/game/rest.ts';
import { Survival } from '../src/game/survival.ts';
import { Quickbar } from '../src/ui/hud.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const seed = 13;
const scale = makeScale(0.5);
const blockId = (id: string): number => {
  const found = registry.blockIds.get(id);
  if (found === undefined) {
    throw new Error(`Missing block ${id}`);
  }
  return found;
};
const blockName = (id: number): string => {
  const found = registry.blocks[id]?.id;
  if (!found) {
    throw new Error(`Missing block id ${id}`);
  }
  return found;
};

type Runtime = ReturnType<typeof createRuntime>;

// The scenario factory wires the same deterministic hamlet actors for fresh and restored runs.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keep test runtime wiring in one auditable place.
const createRuntime = (snapshot?: ReturnType<typeof snapshotSession>) => {
  const hamlet = new Hamlet(seed, registry, scale);
  const { x0, z0, x1, z1 } = hamlet.bounds;
  const columns: [number, number][] = [];
  for (let cz = toChunk(z0); cz <= toChunk(z1 - 1); cz++) {
    for (let cx = toChunk(x0); cx <= toChunk(x1 - 1); cx++) {
      if (hamlet.furnitureIn(cx, cz).length > 0 || hamlet.zombiesIn(cx, cz).length > 0) {
        columns.push([cx, cz]);
      }
    }
  }
  const terrain: Terrain = {
    seed,
    blocks: { grass: blockId('grass'), dirt: blockId('dirt'), stone: blockId('stone'), sand: blockId('sand') },
    scale,
    surface: hamlet.surface,
    stamp: (chunk) => hamlet.stamp(chunk),
  };
  const world = new World();
  for (const [cx, cz] of columns) {
    for (const chunk of generateColumn(terrain, cx, cz)) {
      world.addChunk(chunk);
    }
  }
  const [editCx, editCz] = columns[0]!;
  const editChunk = [...world.chunks.values()].find((chunk) => chunk.cx === editCx && chunk.cz === editCz)!;

  const [sx, sy, sz] = hamlet.spawn.pos.map((metres) => metres / scale.blockSize);
  const player = restorePlayer(
    snapshot?.character.player ??
      snapshotPlayer(
        { ...createPlayerBody(scale, sx!, sy! + 400, sz!), vel: [0, -1, 0] },
        hamlet.spawn.yaw,
        0.03,
        false,
      ),
  );
  let rest: RestController | undefined;
  const sim = new Simulation({ seed, unsafe: () => undefined, restRate: () => rest?.action?.rate });
  const inventory = snapshot ? Inventory.restoreState(registry, snapshot.character.inventory) : new Inventory(registry);
  const handling = new HandlingQueue(inventory);
  const { entities } = inventory;
  const isSolid = (x: number, y: number, z: number) => world.getBlock(x, y, z) !== 0;
  const physics = physicsFor(scale);
  const restoredPlayerAudio = snapshot ? restorePlayerAudioState(snapshot.character.playerAudio) : undefined;
  const playerAudio = {
    vocalNoiseId: restoredPlayerAudio?.vocalNoiseId ?? 0,
    vocalNoise: restoredPlayerAudio?.vocalNoise ?? null,
  };
  const audioPicker = new SoundPicker(seed, registry.sounds);
  if (restoredPlayerAudio) {
    audioPicker.restoreState(restoredPlayerAudio.soundPicker);
  }
  const heardSounds: { event: string; file: string; time: number; position: [number, number, number] }[] = [];
  const emitWorldSound = (
    event: import('../src/core/soundEvents.ts').SoundEventId,
    position: [number, number, number],
  ) => {
    const pick = audioPicker.pick(event, sim.time);
    if (pick) {
      heardSounds.push({ event, file: pick.file, time: sim.time, position: [...position] });
    }
  };
  const emitPlayerSound = (event: import('../src/core/soundEvents.ts').SoundEventId, time = sim.time): boolean => {
    const pick = audioPicker.pick(event, time);
    if (!pick) {
      return false;
    }
    const position = [...player.body.pos] as [number, number, number];
    heardSounds.push({ event, file: pick.file, time, position });
    const sound = registry.sounds.get(event);
    if (sound?.noise.enabled) {
      playerAudio.vocalNoiseId += 1;
      playerAudio.vocalNoise = {
        id: playerAudio.vocalNoiseId,
        pos: position,
        radiusMetres: sound.noise.radiusMetres,
        expiresAt: time + 0.5,
      };
    }
    return true;
  };
  const zombies = new ZombieSystem({
    seed,
    isSolid,
    blockSize: scale.blockSize,
    physics,
    jumpSpeed: 7.9 / scale.blockSize,
    player: () => ({
      pos: player.body.pos,
      body: player.body,
      facing: [Math.sin(player.yaw), 0, -Math.cos(player.yaw)],
      movement: 'still',
      vocalNoise:
        playerAudio.vocalNoise && sim.time <= playerAudio.vocalNoise.expiresAt ? playerAudio.vocalNoise : undefined,
      lit: false,
      lightSeenFrom: 40,
    }),
    hour: () => hourOfDay(sim.calendar),
    hurtPlayer: (amount) => sim.hurt(amount, 'a shambler'),
    onSound: emitWorldSound,
  });
  sim.scheduler.register({ id: 'player-physics', rate: 60, tick: (dt) => stepBody(player.body, dt, isSolid, physics) });
  sim.scheduler.register({ id: 'zombies', rate: 20, tick: (dt, time) => zombies.tick(dt, time) });
  const survival = new Survival(sim, inventory, handling, {
    feet: () => ({ kind: 'pile', pos: player.body.pos.map(Math.floor) as [number, number, number] }),
    notice: () => undefined,
  });
  rest = new RestController(sim, { bedQuality: () => 0.5, notice: () => undefined });
  const quickbar = new Quickbar();
  const spawner = new ZombieSpawner();

  if (snapshot) {
    world.restoreDiffs(snapshot.world.diffs, (id) => blockId(id));
    zombies.restoreState(snapshot.world.zombies, (id) => registry.zombies.get(id));
    spawner.restoreState(snapshot.world.spawned);
    sim.restoreState(snapshot.character.simulation);
    rest.restoreState(snapshot.character.rest);
    survival.restoreState(snapshot.character.lightUid === null ? {} : { litUid: snapshot.character.lightUid });
    quickbar.restoreState(snapshot.character.quickbar, inventory);
  } else {
    for (const [cx, cz] of columns) {
      for (const { spec, loot } of hamlet.furnitureIn(cx, cz)) {
        inventory.furnish(spec, loot);
      }
      spawner.onColumn({ cx, cz, site: hamlet, registry, zombies });
    }
    const backpack = inventory.create('school_backpack');
    const beans = inventory.create('canned_beans');
    inventory.hands.right = backpack;
    inventory.add(beans, { kind: 'pocket', owner: backpack, pocket: 0 });
    const rag = inventory.create('rag');
    inventory.add(rag, { kind: 'pile', pos: [editCx * CHUNK + 2, editChunk.cy * CHUNK + 1, editCz * CHUNK + 2] });
    const flashlight = inventory.create('flashlight');
    flashlight.on = true;
    inventory.hands.left = flashlight;
    survival.lit = flashlight;
    quickbar.assign(0, beans);
    const container = [...entities.all].find((entity) => entity.pockets);
    if (container) {
      entities.markSearched(container);
    }
    const first = zombies.store.entries().next().value as [number, unknown] | undefined;
    if (first) {
      zombies.store.remove(first[0]);
    }
    world.setBlock(editCx * CHUNK + 1, editChunk.cy * CHUNK + 1, editCz * CHUNK + 1, blockId('planks'));
  }
  return {
    hamlet,
    columns,
    world,
    sim,
    player,
    inventory,
    entities,
    handling,
    zombies,
    spawner,
    rest,
    survival,
    quickbar,
    playerAudio,
    audioPicker,
    heardSounds,
    emitPlayerSound,
  };
};

const capture = (runtime: Runtime) =>
  snapshotSession({
    worldId: `world-${seed}`,
    characterId: 'character-1',
    world: runtime.world,
    blockContentId: blockName,
    inventory: runtime.inventory,
    simulation: runtime.sim,
    player: runtime.player,
    rest: runtime.rest,
    survival: runtime.survival,
    quickbar: runtime.quickbar.snapshotState(),
    zombies: runtime.zombies,
    spawner: runtime.spawner,
    handling: runtime.handling,
    vocalNoiseId: runtime.playerAudio.vocalNoiseId,
    vocalNoise: runtime.playerAudio.vocalNoise ?? undefined,
    audio: runtime.audioPicker,
  });

// Test-only inspection reads the live runtime directly; it deliberately does not call a save serializer.
const inspectItem = (item: import('../src/core/items.ts').Item): unknown => ({
  uid: item.uid,
  type: item.type,
  count: item.count,
  condition: item.condition,
  charges: item.charges,
  on: item.on,
  made: item.made,
  pockets: item.pockets?.map((grid) =>
    grid.map((placed) => ({ x: placed.x, y: placed.y, rotated: placed.rotated, item: inspectItem(placed.item) })),
  ),
});
const inspect = (runtime: Runtime): unknown => {
  const scheduler = (
    runtime.sim.scheduler as unknown as { entries: { spec: { id: string }; done: number; ticks: number }[] }
  ).entries;
  const spawns = (runtime.spawner as unknown as { spawned: Set<string> }).spawned;
  const { deltas } = runtime.world as unknown as { deltas: Map<string, unknown> };
  return {
    chunks: [...runtime.world.chunks.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, chunk]) => [key, [...chunk.toArray()], chunk.edited]),
    deltas: [...deltas.entries()].sort(([a], [b]) => a.localeCompare(b)),
    simulation: {
      seed: runtime.sim.seed,
      clock: runtime.sim.clock,
      time: runtime.sim.time,
      needs: { ...runtime.sim.needs },
      compression: {
        c: runtime.sim.compression.c,
        active: runtime.sim.compression.active,
        interruption: runtime.sim.compression.interruption,
      },
      dead: runtime.sim.dead,
      scheduler: scheduler.map((entry) => [entry.spec.id, entry.done, entry.ticks]),
    },
    player: {
      body: structuredClone(runtime.player.body),
      yaw: runtime.player.yaw,
      pitch: runtime.player.pitch,
      walk: runtime.player.walk,
    },
    inventory: {
      nextUid: runtime.inventory.factory.next,
      hands: Object.fromEntries(
        Object.entries(runtime.inventory.hands).map(([side, item]) => [side, item && inspectItem(item)]),
      ),
      worn: Object.fromEntries(
        Object.entries(runtime.inventory.worn).map(([slot, item]) => [slot, item && inspectItem(item)]),
      ),
      piles: [...runtime.inventory.piles.values()].map((pile) => ({
        pos: [...pile.pos],
        items: pile.items.map((placed) => ({ ...placed, item: inspectItem(placed.item) })),
      })),
      entitiesNextUid: runtime.entities.next,
      entities: [...runtime.entities.all].map((entity) => ({
        uid: entity.uid,
        type: entity.type,
        pos: [...entity.pos],
        size: [...entity.size],
        facing: entity.facing,
        searched: entity.searched,
        open: entity.open,
        pockets: entity.pockets?.map((grid) =>
          grid.map((placed) => ({ x: placed.x, y: placed.y, rotated: placed.rotated, item: inspectItem(placed.item) })),
        ),
      })),
      looted: [...runtime.inventory.looted.entries()],
    },
    zombies: {
      nextId: (runtime.zombies.store as MapEntityStore<unknown>).nextId,
      playerAttackWait: (runtime.zombies as unknown as { playerAttackWait: number }).playerAttackWait,
      entries: [...runtime.zombies.store.entries()].map(([id, zombie]) => {
        const { type, behaviorRng, soundRng, footstepClock: _footstepClock, renderPrevious, ...fields } = zombie;
        return [
          id,
          {
            ...structuredClone(fields),
            type: type.id,
            behaviorRng: behaviorRng.state(),
            soundRng: soundRng.state(),
            renderPrevious,
          },
        ];
      }),
    },
    audio: {
      vocalNoiseId: runtime.playerAudio.vocalNoiseId,
      vocalNoise: runtime.playerAudio.vocalNoise,
      soundPicker: runtime.audioPicker.snapshotState(),
    },
    spawned: [...spawns].sort(),
    rest: runtime.rest.action && { ...runtime.rest.action },
    light: runtime.survival.lit?.uid,
    quickbar: runtime.quickbar.slots.map((item) => item?.uid ?? null),
    handling: structuredClone(runtime.handling.jobs),
  };
};

const plainDataTree = (value: unknown): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(plainDataTree);
  }
  if (typeof value !== 'object') {
    return false;
  }
  return (
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) &&
    Object.values(value).every(plainDataTree)
  );
};

const frozenTree = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(frozenTree);
};

const advance = (runtime: Runtime, frames: number, interruptAt = -1) => {
  runtime.sim.paused = false;
  for (let frame = 0; frame < frames; frame++) {
    if (frame === interruptAt) {
      runtime.sim.emit({ kind: 'interrupt', reason: 'test interruption' });
    }
    runtime.rest.frame(1 / 60);
  }
};

describe('snapshot state components', () => {
  it('exports/restores scheduler cursors without changing their next due tick', () => {
    const first = new Simulation({ seed: 4 });
    let count = 0;
    first.scheduler.register({
      id: 'test',
      rate: 2,
      tick: () => {
        count += 1;
      },
    });
    first.scheduler.advance(0.6);
    const state = first.scheduler.snapshotState();
    const second = new Simulation({ seed: 4 });
    second.scheduler.register({
      id: 'test',
      rate: 2,
      tick: () => {
        count += 10;
      },
    });
    second.scheduler.restoreState(structuredClone(state));
    first.scheduler.advance(0.4);
    second.scheduler.advance(0.4);
    expect(count).toBe(12);
    expect(second.scheduler.time).toBe(first.scheduler.time);
  });

  it('stores stable-ID block deltas and restores them over matching generated chunks', () => {
    const source = new World();
    source.addChunk(new Chunk(0, 0, 0, blockId('dirt')));
    source.setBlock(1, 2, 3, blockId('planks'));
    const state = source.snapshotDiffs(blockName);
    expect(state.chunks).toEqual([
      { cx: 0, cy: 0, cz: 0, cells: [{ index: 1 + CHUNK * (3 + CHUNK * 2), base: 'dirt', id: 'planks' }] },
    ]);
    const restored = new World();
    restored.addChunk(new Chunk(0, 0, 0, blockId('dirt')));
    restored.restoreDiffs(structuredClone(state), (id) => blockId(id));
    expect(restored.getBlock(1, 2, 3)).toBe(blockId('planks'));
    restored.setBlock(1, 2, 3, blockId('dirt'));
    expect(restored.snapshotDiffs(blockName).chunks).toEqual([]);
  });

  it('projects queued tagged jobs as canceled only in the snapshot copy', () => {
    const inventory = new Inventory(registry);
    const queue = new HandlingQueue(inventory);
    let appliedAt = -1;
    queue.registerAction('test.increment', (params) => {
      appliedAt = Number(params.value);
    });
    const job = queue.enqueueAction('test.increment', 'wait', 2, { value: 19 });
    queue.tick(0.75);
    const state = queue.snapshotCancelled();
    expect(state.jobs).toEqual([]);
    expect(queue.jobs).toEqual([job]);
    expect(job.elapsed).toBe(0.75);
    queue.tick(1.25);
    expect(appliedAt).toBe(19);
    expect(job.elapsed).toBe(2);
  });

  it('snapshots an unread interrupt after death and restores the same cause and time', () => {
    const dead = new Simulation({ seed: 9 });
    dead.hurt(5, 'a bite');
    dead.hurt(1000, 'a bite');
    dead.frame(1 / 60);
    dead.frame(1 / 60);
    const state = dead.snapshotState();
    const loaded = new Simulation({ seed: 9, clock: structuredClone(state.clock) });
    loaded.restoreState(structuredClone(state));

    expect(state.dead).toEqual({ cause: 'a bite', time: dead.time });
    expect(state.pendingInterrupt).toBeUndefined();
    expect(loaded.dead).toEqual(dead.dead);
    expect(loaded.paused).toBe(true);
    expect(loaded.godMode).toBe(false);
  });

  it('snapshots an unread interrupt while paused without advancing the simulation', () => {
    const sim = new Simulation({ seed: 1 });
    sim.hurt(5, 'a bite');
    sim.paused = true;
    sim.frame(1 / 60);
    sim.frame(1 / 60);

    const state = sim.snapshotState();
    expect(state.pendingInterrupt).toBe("You're hurt");
    expect(sim.paused).toBe(true);
    expect(sim.compression.interruption).toBeUndefined();
  });

  it('round-trips signed zero and subnormal numbers through the snapshot', () => {
    const original = createRuntime();
    original.player.body.pos[0] = -0;
    original.player.body.vel[1] = Number.MIN_VALUE;
    original.sim.needs.fatigue = Number.MIN_VALUE;
    const restored = createRuntime(capture(original));

    expect(Object.is(restored.player.body.pos[0], -0)).toBe(true);
    expect(Object.is(restored.player.body.vel[1], Number.MIN_VALUE)).toBe(true);
    expect(Object.is(restored.sim.needs.fatigue, Number.MIN_VALUE)).toBe(true);
  });
});

const prepareAudioContinuation = (runtime: Runtime): void => {
  const playerPos = [...runtime.player.body.pos] as [number, number, number];
  const firstZombie = runtime.zombies.store.entries().next().value as
    | [number, import('../src/core/zombies.ts').Zombie]
    | undefined;
  if (!firstZombie) {
    throw new Error('Hamlet continuation requires a live shambler');
  }
  const [, listener] = firstZombie;
  listener.body.pos = [playerPos[0] + 0.25, playerPos[1], playerPos[2]];
  listener.body.vel = [0, 0, 0];
  listener.body.onGround = true;
  listener.facing = [0, 0, 1];
  listener.mode = 'idle';
  listener.modeTimer = 100;
  listener.idleSoundTimer = 100;
  listener.lastVocalNoiseId = 0;

  const playerNoise = runtime.emitPlayerSound('player_strain', runtime.sim.time);
  if (!(playerNoise && runtime.playerAudio.vocalNoise)) {
    throw new Error('Could not seed player vocal noise');
  }
  runtime.playerAudio.vocalNoise.expiresAt -= 0.25;

  const groaner = runtime.zombies.add(registry.zombies.get('shambler')!, [
    playerPos[0] + 30,
    playerPos[1],
    playerPos[2],
  ]);
  const idle = runtime.zombies.store.get(groaner)!;
  idle.body.onGround = true;
  idle.mode = 'idle';
  idle.modeTimer = 100;
  idle.idleSoundTimer = 0.6;
  idle.lastVocalNoiseId = runtime.playerAudio.vocalNoiseId;
  runtime.heardSounds.length = 0;
};

describe('hamlet save/load continuation', () => {
  for (const interruption of [false, true]) {
    it(`deeply matches N steps with K/save/load/N−K (${interruption ? 'interrupted' : 'active'} rest)`, () => {
      const uninterrupted = createRuntime();
      const split = createRuntime();
      expect(uninterrupted.columns.length).toBeGreaterThan(0);
      expect([...uninterrupted.zombies.store.entries()].length).toBeGreaterThan(0);
      expect(uninterrupted.spawner.snapshotState().length).toBeGreaterThan(uninterrupted.zombies.store.size);
      expect(uninterrupted.inventory.entities.all).toSatisfy((entities) =>
        [...entities].some((entity) => entity.searched),
      );
      expect(uninterrupted.player.body.onGround).toBe(false);
      expect(uninterrupted.inventory.hands.right?.pockets?.[0]).toHaveLength(1);
      expect(uninterrupted.rest.start('sleep')).toBeUndefined();
      expect(split.rest.start('sleep')).toBeUndefined();
      if (interruption) {
        uninterrupted.sim.emit({ kind: 'interrupt', reason: 'test interruption' });
        split.sim.emit({ kind: 'interrupt', reason: 'test interruption' });
      }
      advance(uninterrupted, 40);
      advance(split, 40);
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
      advance(uninterrupted, 80, interruption ? -1 : 20);
      const continuedSounds = [...uninterrupted.heardSounds];
      const loaded = createRuntime(snapshot);
      advance(loaded, 80, interruption ? -1 : 20);
      expect(loaded.heardSounds).toEqual(continuedSounds);
      expect(continuedSounds.some(({ event }) => event === 'shambler_idle')).toBe(true);
      expect(inspect(loaded)).toEqual(inspect(uninterrupted));
    }, 15_000);
  }

  it('preserves an active-sleep interruption emitted between frames across save/load', () => {
    const uninterrupted = createRuntime();
    const split = createRuntime();
    expect(uninterrupted.rest.start('sleep')).toBeUndefined();
    expect(split.rest.start('sleep')).toBeUndefined();
    advance(uninterrupted, 40);
    advance(split, 40);

    uninterrupted.sim.emit({ kind: 'interrupt', reason: 'test interruption' });
    split.sim.emit({ kind: 'interrupt', reason: 'test interruption' });
    const snapshot = capture(split);
    expect(snapshot.character.simulation.pendingInterrupt).toBe('test interruption');
    expect(split.sim.compression.active).toBe(true);
    expect(split.sim.compression.interruption).toBeUndefined();

    advance(uninterrupted, 80);
    const loaded = createRuntime(snapshot);
    advance(loaded, 80);
    expect(inspect(loaded)).toEqual(inspect(uninterrupted));
  }, 15_000);

  it('preserves a pending sleep interruption across a paused snapshot and load', () => {
    const uninterrupted = createRuntime();
    const split = createRuntime();
    expect(uninterrupted.rest.start('sleep')).toBeUndefined();
    expect(split.rest.start('sleep')).toBeUndefined();
    advance(uninterrupted, 40);
    advance(split, 40);

    uninterrupted.sim.emit({ kind: 'interrupt', reason: 'test interruption' });
    split.sim.emit({ kind: 'interrupt', reason: 'test interruption' });
    uninterrupted.sim.paused = true;
    split.sim.paused = true;
    const snapshot = capture(split);
    expect(snapshot.character.simulation.pendingInterrupt).toBe('test interruption');

    advance(uninterrupted, 80);
    const loaded = createRuntime(snapshot);
    advance(loaded, 80);
    expect(inspect(loaded)).toEqual(inspect(uninterrupted));
  }, 15_000);

  it('detects omission of simulation, world, scheduler, inventory, and audio state', () => {
    const original = createRuntime();
    original.rest.start('rest');
    advance(original, 12);
    prepareAudioContinuation(original);
    const saved = capture(original);
    const baseline = createRuntime(saved);
    advance(baseline, 20);

    const noDelta = structuredClone(saved);
    noDelta.world.diffs.chunks[0]!.cells.pop();
    const withoutDelta = createRuntime(noDelta);
    advance(withoutDelta, 20);
    expect(inspect(withoutDelta)).not.toEqual(inspect(baseline));

    const noAllocator = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noAllocator.character.inventory, 'nextItemUid');
    expect(() => Inventory.restoreState(registry, noAllocator.character.inventory)).toThrow('Invalid next item id');

    const noCursor = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    noCursor.character.simulation.scheduler.systems = noCursor.character.simulation.scheduler.systems.filter(
      (cursor) => cursor.id !== 'player-physics',
    );
    expect(() => createRuntime(noCursor)).toThrow('Scheduler system set does not match snapshot');

    expect(saved.world.zombies.zombies.length).toBeGreaterThan(0);
    const noRngWord = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    const [a, b, c] = noRngWord.world.zombies.zombies[0]!.zombie.behaviorRng;
    noRngWord.world.zombies.zombies[0]!.zombie.behaviorRng = [a, b, c] as never;
    expect(() => createRuntime(noRngWord)).toThrow('Invalid zombie state');

    const noZombieSoundRng = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noZombieSoundRng.world.zombies.zombies[0]!.zombie, 'soundRng');
    expect(() => createRuntime(noZombieSoundRng)).toThrow('Invalid zombie state');

    const noIdleSoundTimer = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noIdleSoundTimer.world.zombies.zombies[0]!.zombie, 'idleSoundTimer');
    expect(() => createRuntime(noIdleSoundTimer)).toThrow('Invalid zombie state');

    const noLastNoiseId = structuredClone(saved) as import('../src/core/saveState.ts').SaveSnapshot;
    Reflect.deleteProperty(noLastNoiseId.world.zombies.zombies[0]!.zombie, 'lastVocalNoiseId');
    expect(() => createRuntime(noLastNoiseId)).toThrow('Invalid zombie state');

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

const formatVersion: SaveVersionComponents = {
  simulationHash: 'a'.repeat(64),
  schemaVersion: 1,
  generators: { worldgen: 'worldgen-v1' },
  contentPacks: [{ id: 'deadvox.base', version: '1', canonicalHash: '0'.repeat(64) }],
};
const formatWorldOptions = { blockSize: 0.5, site: 'hamlet' as const, storeys: 1 };
const hashPattern = /^[0-9a-f]{64}$/;
const contentLookup = (kind: SaveContentKind, id: string): boolean => {
  if (kind === 'block') {
    return registry.blockIds.has(id);
  }
  if (kind === 'item') {
    return registry.items.has(id);
  }
  if (kind === 'furniture') {
    return registry.furniture.has(id);
  }
  if (kind === 'zombie') {
    return registry.zombies.has(id);
  }
  if (kind === 'sound') {
    return registry.sounds.has(id);
  }
  return ['needs', 'player-physics', 'zombies', 'lights'].includes(id);
};
const encodeFixture = (snapshot: SaveSnapshot, generation = 7) =>
  encodeSave(snapshot, { generation, version: formatVersion, worldOptions: formatWorldOptions });

const jsonCanonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(jsonCanonical).join(',')}]`;
  }
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${jsonCanonical(object[key])}`).join(',')}}`;
};
const sealEnvelope = async (envelope: Record<string, unknown>, preserveLength = false): Promise<Uint8Array> => {
  const { payload } = envelope;
  const payloadBytes = new TextEncoder().encode(jsonCanonical(payload));
  if (!preserveLength) {
    envelope.payloadByteLength = payloadBytes.byteLength;
  }
  const digest = await crypto.subtle.digest('SHA-256', payloadBytes.slice().buffer as ArrayBuffer);
  envelope.checksum = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return new TextEncoder().encode(jsonCanonical(envelope));
};
const parseEnvelope = (bytes: Uint8Array): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
const getObject = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;
const reverseObjectKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(reverseObjectKeys);
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, child]) => [key, reverseObjectKeys(child)]),
  );
};
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: recursive matcher explicitly checks every primitive with Object.is.
const assertNumbersObjectIs = (expected: unknown, actual: unknown, path = '$'): void => {
  if (typeof expected === 'number') {
    if (typeof actual !== 'number' || !Object.is(actual, expected)) {
      throw new Error(`Number differs at ${path}`);
    }
    return;
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) {
      throw new Error(`Array differs at ${path}`);
    }
    for (const [index, value] of expected.entries()) {
      assertNumbersObjectIs(value, actual[index], `${path}[${index}]`);
    }
    return;
  }
  if (typeof expected === 'object' && expected !== null) {
    if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) {
      throw new Error(`Object differs at ${path}`);
    }
    const left = Object.keys(expected).sort();
    const right = Object.keys(actual).sort();
    if (left.join('\\u0000') !== right.join('\\u0000')) {
      throw new Error(`Object keys differ at ${path}`);
    }
    for (const key of left) {
      assertNumbersObjectIs(
        (expected as Record<string, unknown>)[key],
        (actual as Record<string, unknown>)[key],
        `${path}.${key}`,
      );
    }
    return;
  }
  if (!Object.is(actual, expected)) {
    throw new Error(`Value differs at ${path}`);
  }
};

describe('canonical save format', () => {
  it('round-trips an edited hamlet byte-exactly and continues deterministically from the restored bytes', async () => {
    const source = createRuntime();
    source.rest.start('rest');
    advance(source, 17);
    prepareAudioContinuation(source);
    const snapshot = capture(source);
    const started = performance.now();
    const bytes = await encodeFixture(snapshot);
    const encodedAt = performance.now();
    const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
    const decodedAt = performance.now();
    const wirePayload = getObject(parseEnvelope(bytes).payload);
    const wireWorld = getObject(wirePayload.world);
    expect(Object.keys(getObject(wireWorld.regions)).length).toBeGreaterThan(0);

    expect(decoded.generation).toBe(7);
    expect(decoded.worldOptions).toEqual({
      ...formatWorldOptions,
      seed: snapshot.character.simulation.seed,
      clock: snapshot.character.simulation.clock,
    });
    expect(decoded.snapshot).toEqual(snapshot);
    const loaded = createRuntime(decoded.snapshot);
    advance(source, 90);
    advance(loaded, 90);
    expect(inspect(loaded)).toEqual(inspect(source));

    const interrupted = createRuntime();
    expect(interrupted.rest.start('sleep')).toBeUndefined();
    advance(interrupted, 40);
    interrupted.sim.emit({ kind: 'interrupt', reason: 'format round-trip' });
    const interruptedSnapshot = capture(interrupted);
    expect(interruptedSnapshot.character.simulation.pendingInterrupt).toBe('format round-trip');
    const interruptedBytes = await encodeFixture(interruptedSnapshot);
    const interruptedDecoded = await decodeSave(interruptedBytes, { version: formatVersion, contentLookup });
    const interruptedLoaded = createRuntime(interruptedDecoded.snapshot);
    advance(interrupted, 80);
    advance(interruptedLoaded, 80);
    expect(inspect(interruptedLoaded)).toEqual(inspect(interrupted));

    const reversed = reverseObjectKeys(snapshot) as SaveSnapshot;
    expect(await encodeFixture(reversed)).toEqual(bytes);
    expect(await encodeFixture(snapshot)).toEqual(bytes);
    const buildBytes = await encodeSave(snapshot, { generation: 8, worldOptions: formatWorldOptions });
    const buildDecoded = await decodeSave(buildBytes, { contentLookup });
    expect(buildDecoded.versionIdentity.components.simulationHash).toMatch(hashPattern);
    expect(buildDecoded.versionIdentity.buildRevision.length).toBeGreaterThan(0);
    expect(buildDecoded.versionIdentity.components.contentPacks[0]!.canonicalHash).toMatch(hashPattern);
    expect(buildDecoded.generation).toBe(8);
    expect(encodedAt - started).toBeGreaterThanOrEqual(0);
    expect(decodedAt - encodedAt).toBeGreaterThanOrEqual(0);
  }, 20_000);

  it('preserves signed zero, subnormals, the largest safe integer, and ordinary decimal values exactly', async () => {
    const snapshot = structuredClone(capture(createRuntime())) as SaveSnapshot;
    snapshot.character.player.yaw = -0;
    snapshot.character.simulation.needs.stamina = Number.MIN_VALUE;
    snapshot.character.simulation.needs.calories = 2.225_073_858_507_201e-308;
    snapshot.character.player.body.pos[0] = 0.1 + 0.2;
    snapshot.character.inventory.nextItemUid = Number.MAX_SAFE_INTEGER;
    const decoded = await decodeSave(await encodeFixture(snapshot), { version: formatVersion, contentLookup });
    assertNumbersObjectIs(snapshot, decoded.snapshot);

    await Promise.all(
      [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY].map(async (value) => {
        const invalid = structuredClone(snapshot);
        invalid.character.player.yaw = value;
        await expect(encodeFixture(invalid)).rejects.toThrow('snapshot.character.player.yaw');
      }),
    );
  });

  it('rejects user objects that collide with the reserved negative-zero tag', async () => {
    const snapshot = structuredClone(capture(createRuntime())) as SaveSnapshot;
    (snapshot.character.player as unknown as Record<string, unknown>).surprise = { [NEGATIVE_ZERO_TAG]: '-0' };
    await expect(encodeFixture(snapshot)).rejects.toThrow('Reserved number tag');
  });

  it('keeps the Git revision as diagnostic metadata, outside save compatibility', async () => {
    const snapshot = capture(createRuntime());
    const bytes = await encodeSave(snapshot, {
      generation: 1,
      version: formatVersion,
      buildRevision: 'saved-git-revision',
      worldOptions: formatWorldOptions,
    });
    const decoded = await decodeSave(bytes, {
      version: formatVersion,
      buildRevision: 'running-git-revision',
      contentLookup,
    });
    expect(decoded.versionIdentity.buildRevision).toBe('saved-git-revision');
    expect(decoded.versionIdentity.components.simulationHash).toBe(formatVersion.simulationHash);
  });

  it('refuses an exact version mismatch before content lookup and never mutates the input bytes', async () => {
    const bytes = await encodeSave(capture(createRuntime()), {
      generation: 1,
      version: formatVersion,
      buildRevision: 'saved-build',
      worldOptions: formatWorldOptions,
    });
    const original = bytes.slice();
    let lookups = 0;
    const otherVersion = { ...formatVersion, simulationHash: 'f'.repeat(64) };
    let mismatch: unknown;
    try {
      await decodeSave(bytes, {
        version: otherVersion,
        buildRevision: 'running-build',
        contentLookup: () => {
          lookups += 1;
          return true;
        },
      });
    } catch (error) {
      mismatch = error;
    }
    expect(lookups).toBe(0);
    expect(mismatch).toBeInstanceOf(Error);
    expect((mismatch as Error).message).toContain('Save version mismatch');
    expect((mismatch as Error).message).toContain('saved-build');
    expect((mismatch as Error).message).toContain('running-build');
    expect(bytes).toEqual(original);
  });

  it('rejects truncated, corrupted, non-canonical, over-limit, invalid-version, and malformed payloads', async () => {
    const valid = await encodeFixture(capture(createRuntime()));
    const malformed: {
      name: string;
      bytes: Promise<Uint8Array> | Uint8Array;
      options?: { maxPayloadBytes?: number };
      message: string;
    }[] = [];
    malformed.push({ name: 'truncated', bytes: valid.slice(0, -1), message: 'truncated' });
    malformed.push({ name: 'over limit', bytes: valid, options: { maxPayloadBytes: 16 }, message: 'configured limit' });
    malformed.push({
      name: 'noncanonical',
      bytes: new TextEncoder().encode(` ${new TextDecoder().decode(valid)}`),
      message: 'Non-canonical',
    });

    const badChecksum = parseEnvelope(valid);
    badChecksum.checksum = `${String(badChecksum.checksum)[0] === '0' ? '1' : '0'}${String(badChecksum.checksum).slice(1)}`;
    malformed.push({
      name: 'checksum',
      bytes: new TextEncoder().encode(jsonCanonical(badChecksum)),
      message: 'checksum mismatch',
    });
    const badLength = parseEnvelope(valid);
    badLength.payloadByteLength = Number(badLength.payloadByteLength) + 1;
    malformed.push({ name: 'length', bytes: sealEnvelope(badLength, true), message: 'Payload length mismatch' });
    const badMagic = parseEnvelope(valid);
    badMagic.magic = 'NOT_A_SAVE';
    malformed.push({ name: 'magic', bytes: sealEnvelope(badMagic), message: 'Invalid value' });
    const badSchema = parseEnvelope(valid);
    badSchema.schemaVersion = 2;
    malformed.push({ name: 'schema version', bytes: sealEnvelope(badSchema), message: 'schema mismatch' });

    const badRle = parseEnvelope(valid);
    const rlePayload = getObject(badRle.payload);
    const rleWorld = getObject(rlePayload.world);
    const rleRegions = Object.values(getObject(rleWorld.regions)) as Record<string, unknown>[];
    const rleChunks = rleRegions.find((region) => (region.chunks as unknown[]).length > 0)!.chunks as Record<
      string,
      unknown
    >[];
    const firstChunk = rleChunks[0]!;
    const firstRun = (firstChunk.runs as Record<string, unknown>[])[0]!;
    firstRun.id = (firstChunk.palette as unknown[]).length;
    malformed.push({ name: 'RLE', bytes: sealEnvelope(badRle), message: 'Malformed RLE run' });
    const adjacentSnapshot = structuredClone(capture(createRuntime())) as SaveSnapshot;
    const changedChunk = adjacentSnapshot.world.diffs.chunks[0]!;
    changedChunk.cells.push({ ...changedChunk.cells[0]!, index: changedChunk.cells[0]!.index + 1 });
    const nonMaximalRle = parseEnvelope(await encodeFixture(adjacentSnapshot));
    const nonMaximalPayload = getObject(nonMaximalRle.payload);
    const nonMaximalWorld = getObject(nonMaximalPayload.world);
    const nonMaximalRegion = Object.values(getObject(nonMaximalWorld.regions))[0] as Record<string, unknown>;
    const nonMaximalChunk = (nonMaximalRegion.chunks as Record<string, unknown>[])[0]!;
    const nonMaximalRuns = nonMaximalChunk.runs as Record<string, unknown>[];
    const maximalRun = nonMaximalRuns[0]!;
    const runStart = Number(maximalRun.start);
    const runLength = Number(maximalRun.length);
    expect(runLength).toBeGreaterThan(1);
    nonMaximalRuns.splice(
      0,
      1,
      { ...maximalRun, length: 1 },
      { ...maximalRun, start: runStart + 1, length: runLength - 1 },
    );
    malformed.push({ name: 'non-maximal RLE', bytes: sealEnvelope(nonMaximalRle), message: 'Non-maximal RLE runs' });

    const duplicate = parseEnvelope(valid);
    const duplicatePayload = getObject(duplicate.payload);
    const duplicateCharacter = getObject(duplicatePayload.character);
    const duplicateInventory = getObject(duplicateCharacter.inventory);
    const hands = getObject(duplicateInventory.hands);
    getObject(hands.left).uid = getObject(hands.right).uid;
    malformed.push({ name: 'duplicate item ID', bytes: sealEnvelope(duplicate), message: 'Duplicate item id' });

    const unknownField = parseEnvelope(valid);
    const unknownPayload = getObject(unknownField.payload);
    const unknownCharacter = getObject(unknownPayload.character);
    getObject(unknownCharacter.player).surprise = true;
    malformed.push({ name: 'unknown field', bytes: sealEnvelope(unknownField), message: 'Unknown field' });
    const missingField = parseEnvelope(valid);
    const missingPayload = getObject(missingField.payload);
    const missingCharacter = getObject(missingPayload.character);
    Reflect.deleteProperty(getObject(missingCharacter.player), 'pitch');
    malformed.push({ name: 'missing field', bytes: sealEnvelope(missingField), message: 'Missing field' });
    const invalidRange = parseEnvelope(valid);
    const invalidPayload = getObject(invalidRange.payload);
    const invalidCharacter = getObject(invalidPayload.character);
    const invalidInventory = getObject(invalidCharacter.inventory);
    getObject(getObject(invalidInventory.hands).right).uid = 0;
    malformed.push({ name: 'invalid item ID range', bytes: sealEnvelope(invalidRange), message: 'Invalid number' });

    const unknownId = parseEnvelope(valid);
    const unknownIdPayload = getObject(unknownId.payload);
    const unknownIdCharacter = getObject(unknownIdPayload.character);
    const unknownInventory = getObject(unknownIdCharacter.inventory);
    getObject(getObject(unknownInventory.hands).right).type = 'not_a_real_item';
    malformed.push({ name: 'unknown content ID', bytes: sealEnvelope(unknownId), message: 'Unknown item content id' });
    const unknownSystem = parseEnvelope(valid);
    const unknownSystemPayload = getObject(unknownSystem.payload);
    const unknownSystemCharacter = getObject(unknownSystemPayload.character);
    const unknownSimulation = getObject(unknownSystemCharacter.simulation);
    const unknownScheduler = getObject(unknownSimulation.scheduler);
    (unknownScheduler.systems as Record<string, unknown>[])[0]!.id = 'missing_system';
    malformed.push({
      name: 'unknown scheduler system',
      bytes: sealEnvelope(unknownSystem),
      message: 'Unknown scheduler content id',
    });

    await Promise.all(
      malformed.map(async (test) => {
        const bytes = await test.bytes;
        let rejection: unknown;
        try {
          await decodeSave(bytes, { version: formatVersion, contentLookup, ...test.options });
        } catch (error) {
          rejection = error;
        }
        expect(rejection, test.name).toBeInstanceOf(Error);
        expect((rejection as Error).message, test.name).toContain(test.message);
      }),
    );
  }, 20_000);
});
