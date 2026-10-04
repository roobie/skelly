import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { NEGATIVE_ZERO_TAG } from '../src/core/canonicalJson.ts';
import { Chunk } from '../src/core/chunk.ts';
import { defaultClock } from '../src/core/clock.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { CHUNK, toChunk } from '../src/core/coords.ts';
import type { MapEntityStore } from '../src/core/entities.ts';
import { Hamlet } from '../src/core/hamlet.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory, PILE_GRID } from '../src/core/inventory.ts';
import { decodeSave, encodeSave, type SaveContentKind, type SaveVersionComponents } from '../src/core/saveFormat.ts';
import { restorePlayerAudioState, type SaveSnapshot, type snapshotSession } from '../src/core/saveState.ts';
import { chunksFor, makeScale } from '../src/core/scale.ts';
import { Simulation } from '../src/core/sim.ts';
import type { Site } from '../src/core/site.ts';
import { SoundPicker } from '../src/core/soundPicker.ts';
import { World } from '../src/core/world.ts';
import { generateColumn, type Terrain } from '../src/core/worldgen.ts';
import { zombiePoseInputFor } from '../src/core/zombiePose.ts';
import { posedShamblerRegionBoxes } from '../src/core/zombieRegions.ts';
import type { MeleeWeapon } from '../src/core/zombies.ts';
import { startPlayerMelee } from '../src/game/melee.ts';
import { PLAYER } from '../src/game/player.ts';
import { createSession, IDLE } from '../src/game/session.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const seed = 13;
// biome-ignore lint/style/noProcessEnv: distinguish local measurements from the named CI runner.
const measurementRunner = process.env.GITHUB_ACTIONS === 'true' ? 'ubuntu-latest' : 'local';
const TEN_HOUR_SAVE_BUDGET_BYTES = 5 * 1024 * 1024; // ~17× headroom over the current synthetic fixture; catches meaningful growth.
const TEN_HOUR_LOAD_BUDGET_MS = 1000; // CI-runner bound for ubuntu-latest, not a general device target.
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

// The scenario factory builds the same session the game does (src/game/session.ts) and only
// supplies what the DOM would: controls, sound output, and the hamlet's world. Fresh and
// restored runs share it.
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
  const sharedEntities = new BlockEntities(registry);
  for (const [cx, cz] of columns) {
    for (const chunk of generateColumn(terrain, cx, cz)) {
      world.addChunk(chunk);
    }
  }
  const [editCx, editCz] = columns[0]!;
  const editChunk = [...world.chunks.values()].find((chunk) => chunk.cx === editCx && chunk.cz === editCz)!;

  const [sx, sy, sz] = hamlet.spawn.pos.map((metres) => metres / scale.blockSize);
  // Real wiring refuses to rest with a shambler within 30 m, so the player starts falling well clear of the hamlet.
  const awayFromShamblers = x1 - sx! + 200;
  // Where the player is looking: the game reads this from its input, here it is plain state.
  const view = { yaw: hamlet.spawn.yaw, pitch: 0.03, walk: false };
  const heardSounds: { event: string; file: string; time: number; position: [number, number, number] }[] = [];
  const session = createSession({
    registry,
    world,
    isSolid: (x, y, z) => world.getBlock(x, y, z) !== 0 || sharedEntities.isSolid(x, y, z),
    isOpaque: (x, y, z) => world.getBlock(x, y, z) !== 0 || sharedEntities.isSolid(x, y, z),
    entities: sharedEntities,
    scale,
    seed,
    start: defaultClock.start,
    spawn: [sx! + awayFromShamblers, sy! + 400, sz!],
    ready: () => true,
    controls: {
      active: () => false,
      intent: () => IDLE,
      yaw: () => view.yaw,
      pitch: () => view.pitch,
      walking: () => view.walk,
      descending: () => false,
    },
    audio: {
      play: ({ event, position, time, pick }) => {
        heardSounds.push({ event, file: pick.file, time, position: [...position] });
      },
    },
    notice: () => undefined,
    onRead: () => {
      throw new Error('Unexpected reading in snapshot fixture');
    },
    ...(snapshot ? { restore: snapshot } : {}),
  });
  const { sim, inventory, entities, zombies, spawner, rest, survival, quickbar, playerAudio } = session;
  if (session.restoredLook) {
    Object.assign(view, session.restoredLook);
  }
  const player = {
    body: session.body,
    get yaw() {
      return view.yaw;
    },
    get pitch() {
      return view.pitch;
    },
    get walk() {
      return view.walk;
    },
  };

  if (!snapshot) {
    session.body.vel[1] = -1;
    for (const [cx, cz] of columns) {
      session.onColumn(cx, cz, hamlet);
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
    session,
    hamlet,
    columns,
    world,
    sim,
    player,
    inventory,
    entities,
    sharedEntities,
    handling: session.queue,
    zombies,
    spawner,
    rest,
    survival,
    quickbar,
    playerAudio,
    heardSounds,
    emitPlayerSound: session.playPlayerSound,
  };
};

const capture = (runtime: Runtime) =>
  runtime.session.snapshot({ worldId: `world-${seed}`, characterId: 'character-1' });

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
    playerCombat: runtime.session.playerCombat.snapshotState(),
    audio: {
      vocalNoiseId: runtime.playerAudio.vocalNoiseId,
      vocalNoise: runtime.playerAudio.vocalNoise,
      soundPicker: runtime.session.audioState(),
    },
    spawned: [...spawns].sort(),
    longAction: { job: structuredClone(runtime.sim.actions.job ?? null) },
    light: runtime.survival.lit?.uid,
    quickbar: runtime.quickbar.slots.map((uid) =>
      uid === null ? null : (runtime.inventory.itemByUid(uid)?.uid ?? null),
    ),
    handling: structuredClone(runtime.handling.jobs),
  };
};

const stateHash = (state: unknown): string => createHash('sha256').update(jsonCanonical(state)).digest('hex');

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
    runtime.session.frame(1 / 60);
  }
};

const editBudgetChunk = (runtime: Runtime, cx: number, cy: number, cz: number): void => {
  for (let cell = 0; cell < 8; cell++) {
    const x = cx * CHUNK + 4 + cell;
    const y = cy * CHUNK + 4;
    const z = cz * CHUNK + 6;
    const current = runtime.world.getBlock(x, y, z);
    runtime.world.setBlock(x, y, z, current === blockId('planks') ? blockId('dirt') : blockId('planks'));
  }
};

// PROJECT.md/config.ts default radius is 96 m; 32-block chunks at 0.5 m are 16 m,
// so config.ts/streamer.ts cover a 13x13 mesh square, with 8 vertical layers from scale.ts.
// The 25%-edited / 8-cells-per-edited-chunk load is an explicit high-side stress assumption.
const applyBudgetWorldEdits = (runtime: Runtime) => {
  const radiusChunks = chunksFor(scale, 96);
  const centerX = toChunk(Math.floor(runtime.hamlet.spawn.pos[0] / scale.blockSize));
  const centerZ = toChunk(Math.floor(runtime.hamlet.spawn.pos[2] / scale.blockSize));
  const visitedChunks = (radiusChunks * 2 + 1) ** 2 * (scale.maxCy - scale.minCy + 1);
  let ordinal = 0;
  let editedChunks = 0;
  // 13x13 horizontal columns x 8 vertical layers: one edited layer in four, 8 block changes.
  for (let cz = centerZ - radiusChunks; cz <= centerZ + radiusChunks; cz++) {
    for (let cx = centerX - radiusChunks; cx <= centerX + radiusChunks; cx++) {
      runtime.session.onColumn(cx, cz, runtime.hamlet);
      for (let cy = scale.minCy; cy <= scale.maxCy; cy++) {
        const editThisChunk = ordinal % 4 === 0;
        ordinal += 1;
        if (!editThisChunk) {
          continue;
        }
        editedChunks += 1;
        editBudgetChunk(runtime, cx, cy, cz);
      }
    }
  }
  return { visitedChunks, editedChunks };
};

// One full floor pile per each of the five hamlet lots each game hour: 50 piles in 10 h.
// PILE_GRID is 8x6 and duct_tape is a real 1x1 non-stackable content item.
const applyBudgetPiles = (runtime: Runtime) => {
  const baselinePileCount = runtime.inventory.piles.size;
  const baselinePileItems = [...runtime.inventory.piles.values()].reduce((sum, pile) => sum + pile.items.length, 0);
  const pileCount = 10 * runtime.hamlet.lots.length;
  const pileCapacity = PILE_GRID.w * PILE_GRID.h;
  const centerX = toChunk(Math.floor(runtime.hamlet.spawn.pos[0] / scale.blockSize));
  const centerZ = toChunk(Math.floor(runtime.hamlet.spawn.pos[2] / scale.blockSize));
  const pileY = Math.floor(runtime.hamlet.spawn.pos[1] / scale.blockSize);
  let addedItems = 0;
  for (let index = 0; index < pileCount; index++) {
    const pos: [number, number, number] = [
      centerX * CHUNK + 4 + (index % 10) * 2,
      pileY,
      centerZ * CHUNK + 4 + Math.floor(index / 10) * 2,
    ];
    for (let cell = 0; cell < pileCapacity; cell++) {
      const added = runtime.inventory.add(runtime.inventory.create('duct_tape'), {
        kind: 'pile',
        pos,
        at: { x: cell % PILE_GRID.w, y: Math.floor(cell / PILE_GRID.w), rotated: false },
      });
      addedItems += Number(added);
    }
  }
  return { baselinePileCount, baselinePileItems, pileCount, pileCapacity, addedItems };
};

// Exercise the normal idempotent column-arrival path; the seeded hamlet spawns 6–10
// shamblers and the existing fixture removes one, leaving its spawn-ledger entry behind.
const touchBudgetFurnitureAndZombies = (runtime: Runtime) => {
  const touchedContainers = [...runtime.entities.all].filter((entity) => entity.pockets);
  for (const entity of touchedContainers) {
    runtime.entities.markSearched(entity);
  }
  return {
    touchedContainers: touchedContainers.length,
    spawned: runtime.spawner.snapshotState().length,
    alive: runtime.zombies.store.size,
  };
};

const setBudgetClock = (runtime: Runtime): void => {
  const scheduler = runtime.sim.scheduler.snapshotState();
  runtime.sim.scheduler.restoreState({
    time: 4500,
    systems: scheduler.systems.map((cursor) => ({ ...cursor, done: 4500 })),
  });
};

describe('snapshot state components', () => {
  it('persists zero-start skills and changed recipe knowledge without reseeding or mutating live state', async () => {
    const runtime = createRuntime();
    const actor = runtime.session.character;
    expect(Object.keys(actor.skills).sort()).toEqual([...registry.skills.keys()].sort());
    expect(Object.values(actor.skills).every((level) => level === 0)).toBe(true);
    const removedRecipe = actor.knownRecipes.values().next().value;
    if (removedRecipe === undefined) {
      throw new Error('starter character has no known recipe');
    }
    const savedLevel = actor.skills.crafting! + 1;
    actor.skills.crafting = savedLevel;
    actor.knownRecipes.delete(removedRecipe);
    const snapshot = capture(runtime);
    actor.skills.crafting = savedLevel + 1;
    const decoded = await decodeSave(await encodeFixture(snapshot), { version: formatVersion, contentLookup });
    const loadedRuntime = createRuntime(decoded.snapshot);
    const loaded = loadedRuntime.session.character;
    expect(loaded.skills.crafting).toBe(savedLevel);
    loaded.skills.crafting = -0;
    const zero = await decodeSave(await encodeFixture(capture(loadedRuntime)), {
      version: formatVersion,
      contentLookup,
    });
    expect(Object.is(createRuntime(zero.snapshot).session.character.skills.crafting, -0)).toBe(true);
    expect(loaded.knownRecipes).toEqual(new Set(actor.knownRecipes));
    expect(loaded.knownRecipes.has(removedRecipe)).toBe(false);
    expect(actor.skills.crafting).toBe(savedLevel + 1);
  });

  it('restores after eating the quickbar-bound item without a dangling UID', () => {
    const runtime = createRuntime();
    const { inventory, quickbar, survival, handling, player } = runtime;
    const beans = inventory.hands.right!.pockets![0]![0]!.item;
    const feet = player.body.pos.map(Math.floor) as Vec3;
    expect(inventory.move(inventory.hands.left!, { kind: 'pile', pos: feet }).ok).toBe(true);
    expect(inventory.move(beans, { kind: 'hand', side: 'left' }).ok).toBe(true);
    quickbar.assign(0, beans);
    expect(survival.use(beans)).toBeUndefined();
    handling.tick(3.1);
    expect(inventory.itemByUid(beans.uid)).toBeUndefined();
    const snapshot = capture(runtime);
    expect(() => createRuntime(snapshot)).not.toThrow();
    expect(snapshot.character.quickbar[0]).toBeNull();
  });

  it('rejects a dangling component reference at the snapshot barrier', () => {
    const runtime = createRuntime();
    const missingUid = runtime.inventory.factory.next;
    runtime.quickbar.snapshotState = () => [missingUid, null, null, null, null];
    expect(() => capture(runtime)).toThrow(`Snapshot contains dangling item UID ${missingUid}`);
  });

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

/**
 * Blocks. Far enough that the groaner neither sees the lit flashlight (40 m) nor hears the
 * player, so it stays idle: the real wiring reports the light and the noise to shamblers.
 */
const IDLE_GROANER_DISTANCE = 120;

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
    playerPos[0] + IDLE_GROANER_DISTANCE,
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

describe('craft job codec and ownership', () => {
  it.each([false, true])(
    'encodes/restores stopped=%s work with one owned subtree and validated references',
    async (stopped) => {
      const runtime = createRuntime();
      // Use the same session/save factory as the game; clear hands through Inventory.
      const pos: Vec3 = runtime.player.body.pos.map(Math.floor) as Vec3;
      for (const item of Object.values(runtime.inventory.hands)) {
        expect(runtime.inventory.move(item!, { kind: 'pile', pos }).ok).toBe(true);
      }
      for (const [type, count] of [
        ['stick', 1],
        ['rag', 2],
        ['wax', 1],
        ['kitchen_knife', 1],
      ] as const) {
        expect(
          runtime.inventory.add(runtime.inventory.create(type, count), {
            kind: 'pile',
            pos: [pos[0] - 1, pos[1], pos[2]],
          }),
        ).toBe(true);
      }
      const planned = runtime.session.planCraft(registry.recipes.get('torch')!);
      if (!('plan' in planned)) {
        throw new Error(planned.missing.reason);
      }
      const work = runtime.inventory.beginWork(planned.plan)!;
      expect(runtime.sim.actions.startCraft(work.uid)).toBeUndefined();
      // Progress the registered native job without changing the falling scenario body's origin.
      runtime.sim.actions.craft!.advance(work.uid, 37);
      if (stopped) {
        runtime.sim.actions.stop();
      }
      const snapshot = capture(runtime);
      const bytes = await encodeFixture(snapshot);
      expect(capture(runtime)).toEqual(snapshot);
      const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
      const loaded = createRuntime(decoded.snapshot);
      expect(capture(loaded)).toEqual(snapshot);
      expect(loaded.inventory.itemByUid(work.uid)!.work).toEqual(work.work);
      expect(loaded.inventory.hands.left).toBeUndefined();
      const bad = structuredClone(snapshot);
      bad.character.inventory.hands.right!.work!.recipe = 'unknown_craft';
      await expect(decodeSave(await encodeFixture(bad), { version: formatVersion, contentLookup })).rejects.toThrow(
        'Unknown recipe',
      );
      const dangling = structuredClone(snapshot);
      dangling.character.longAction.job = { jobType: 'craft', stopped: true, last: 0, workUid: 999_999 };
      await expect(encodeFixture(dangling)).rejects.toThrow('Missing craft work item');
    },
  );

  it('encodes and restores an in-progress repair target and amount', async () => {
    const runtime = createRuntime();
    const pos: Vec3 = runtime.player.body.pos.map(Math.floor) as Vec3;
    for (const item of Object.values(runtime.inventory.hands)) {
      expect(runtime.inventory.move(item!, { kind: 'pile', pos }).ok).toBe(true);
    }
    const target = runtime.inventory.create('crowbar');
    target.condition = 0.2;
    expect(runtime.inventory.add(target, { kind: 'pile', pos })).toBe(true);
    for (const [type, offset] of [
      ['repair_kit', 1],
      ['scrap_metal', 2],
      ['duct_tape', 3],
    ] as const) {
      expect(
        runtime.inventory.add(runtime.inventory.create(type), {
          kind: 'pile',
          pos: [pos[0] - 1 + offset, pos[1], pos[2]],
        }),
      ).toBe(true);
    }
    const recipe = registry.recipes.get('repair_crowbar')!;
    const planned = runtime.session.planCraft(recipe);
    if (!('plan' in planned)) {
      throw new Error(planned.missing.reason);
    }
    const amount = recipe.repair!.amount;
    const work = runtime.inventory.beginWork(planned.plan, { targetUid: target.uid, amount });
    if (!work) {
      throw new Error('Cannot gather repair inputs');
    }
    expect(runtime.sim.actions.startCraft(work.uid)).toBeUndefined();
    runtime.sim.actions.craft!.advance(work.uid, 37);
    const snapshot = capture(runtime);
    const bytes = await encodeFixture(snapshot);
    const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
    const loaded = createRuntime(decoded.snapshot);
    expect(loaded.inventory.itemByUid(work.uid)!.work).toEqual(work.work);
  });
});

describe('restored session world state', () => {
  it('shares restored block entities and does not re-furnish visited columns', () => {
    const source = createRuntime();
    const container = [...source.entities.all].find((entity) => entity.pockets && !entity.searched);
    const door = [...source.entities.all].find((entity) => registry.furniture.get(entity.type)?.door);
    expect(container).toBeDefined();
    expect(door).toBeDefined();
    source.inventory.canReachEntity = () => true;
    expect(source.session.search(container!)).toBeUndefined();
    source.handling.tick(3);
    source.handling.enqueueAction('furniture.door', 'Open door', 0, { entityUid: door!.uid });
    source.handling.tick(0);
    const savedContents = container!.pockets!.map((pocket) => pocket.map((placed) => placed.item.type));
    const snapshot = capture(source);

    const loaded = createRuntime(snapshot);
    expect(loaded.entities).toBe(loaded.sharedEntities);
    const restoredContainer = loaded.entities.byUid(container!.uid)!;
    const restoredDoor = loaded.entities.byUid(door!.uid)!;
    expect(restoredContainer.pockets!.map((pocket) => pocket.map((placed) => placed.item.type))).toEqual(savedContents);
    expect(restoredContainer.searched).toBe(true);
    expect(restoredDoor.open).toBe(true);
    loaded.handling.enqueueAction('furniture.door', 'Close door', 0, { entityUid: restoredDoor.uid, closing: true });
    loaded.handling.tick(0);
    expect(loaded.sharedEntities.at(...restoredContainer.pos)).toBe(restoredContainer);
    expect(loaded.sharedEntities.isSolid(...restoredDoor.pos)).toBe(true);
    expect(loaded.inventory.entities).toBe(loaded.sharedEntities);

    const countsBefore = [...loaded.entities.all].map((entity) => [entity.uid, entity.pockets?.map((p) => p.length)]);
    for (const [cx, cz] of loaded.columns) {
      loaded.session.onColumn(cx, cz, loaded.hamlet);
    }
    expect([...loaded.entities.all].map((entity) => [entity.uid, entity.pockets?.map((p) => p.length)])).toEqual(
      countsBefore,
    );
    expect(loaded.zombies.store.size).toBe(snapshot.world.zombies.zombies.length);

    const fresh = loaded.hamlet.furnitureIn(...loaded.columns[0]!)[0]!;
    const freshSpec = {
      ...fresh.spec,
      pos: [fresh.spec.pos[0] + CHUNK * 100, ...fresh.spec.pos.slice(1)] as [number, number, number],
    };
    const freshSpawnPos: [number, number, number] = [freshSpec.pos[0] + 10, freshSpec.pos[1], freshSpec.pos[2]];
    const unseenSite = {
      furnitureIn: () => [{ spec: freshSpec, loot: fresh.loot }],
      zombiesIn: () => [{ type: 'shambler', pos: freshSpawnPos }],
    } as unknown as Site;
    loaded.session.onColumn(loaded.columns[0]![0] + 100, loaded.columns[0]![1], unseenSite);
    expect(loaded.entities.at(...freshSpec.pos)?.type).toBe(freshSpec.type);
    expect(loaded.zombies.store.size).toBe(snapshot.world.zombies.zombies.length + 1);
  });
});

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
      (cursor) => cursor.id !== 'player',
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
  schemaVersion: 10,
  generators: { worldgen: 'worldgen-v1', shamblerFigure: 'shambler-figure-v1' },
  contentPacks: [{ id: 'deadvox.base', version: '1', canonicalHash: '0'.repeat(64) }],
};
const formatWorldOptions = { blockSize: 0.5, site: 'forest' as const, storeys: 1, density: 0.75 };
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
  if (kind === 'skill') {
    return registry.skills.has(id);
  }
  if (kind === 'recipe') {
    return registry.recipes.has(id);
  }
  return ['needs', 'long-action', 'player', 'zombies', 'handling', 'lights', 'firearms'].includes(id);
};
const encodeFixture = (snapshot: SaveSnapshot, generation = 7) =>
  encodeSave(snapshot, { generation, version: formatVersion, worldOptions: formatWorldOptions });

it('a door lock survives the save codec and fresh native entity owner, independently of the source object', async () => {
  const source = createRuntime();
  const door = [...source.entities.all].find((entity) => registry.furniture.get(entity.type)?.door)!;
  door.lock = { id: 'test_shed', locked: true }; // authored metadata in this hamlet save fixture
  const snapshot = capture(source);
  expect(source.entities.setLocked(door, false, ['test_shed'])).toBeUndefined();
  const decoded = await decodeSave(await encodeFixture(snapshot), { version: formatVersion, contentLookup });
  const loaded = createRuntime(decoded.snapshot);
  const restored = loaded.entities.byUid(door.uid)!;
  expect(restored.lock).toEqual({ id: 'test_shed', locked: true });
  expect(loaded.entities.setOpen(restored, true)).toBe("It's locked");
  expect(loaded.entities.setLocked(restored, false, ['test_shed'])).toBeUndefined();
  expect(loaded.entities.setOpen(restored, true)).toBeUndefined();
});

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
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: integration test couples save round-trip, tick advancement and single-contact restore.
  it('round-trips an active player swing and resolves its one pending hit after restore', async () => {
    const source = createRuntime();
    source.sim.frame(0.049);
    expect(source.sim.time).toBeCloseTo(0.049);
    for (const [id] of [...source.zombies.store.entries()]) {
      source.zombies.store.remove(id);
    }
    const id = source.zombies.add(
      registry.zombies.get('shambler')!,
      [source.player.body.pos[0] + 5, source.player.body.pos[1], source.player.body.pos[2]],
      [0, 0, 1],
    );
    const zombie = source.zombies.store.get(id)!;
    zombie.body.onGround = true;
    source.zombies.setFrozen(true);
    const posed = posedShamblerRegionBoxes(zombiePoseInputFor(zombie, id, scale.blockSize));
    const { center } = posed.head.find((box) => box.bone === 'head')!;
    const origin: Vec3 = [
      source.player.body.pos[0],
      source.player.body.pos[1] + PLAYER.eye / scale.blockSize,
      source.player.body.pos[2],
    ];
    const delta: Vec3 = [center[0] - origin[0], center[1] - origin[1], center[2] - origin[2]];
    const length = Math.hypot(...delta);
    const direction = delta.map((value) => value / length) as Vec3;
    const weapon: MeleeWeapon = { damage: 1, reach: 4, cooldown: 0.8, stamina: 4, impulse: 4, type: 'blunt' };
    expect(source.zombies.aimAt(origin, direction, weapon)?.inReach).toBe(true);
    const hands = {
      right: source.inventory.hands.right?.uid ?? null,
      left: source.inventory.hands.left?.uid ?? null,
    };
    expect(
      startPlayerMelee(source.session.playerCombat, source.sim.needs, {
        origin,
        direction,
        weapon,
        profile: 'blunt',
        hand: 'right',
        twoHanded: false,
        hands,
      }),
    ).toBe('started');
    const initialHealth = zombie.regions.head;
    const snapshot = capture(source);
    const bytes = await encodeFixture(snapshot);
    const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
    expect(decoded.snapshot.character.playerCombat.meleeAction).toEqual(snapshot.character.playerCombat.meleeAction);
    const loaded = createRuntime(decoded.snapshot);
    loaded.zombies.setFrozen(true);
    expect(loaded.session.playerCombat.activeMeleeAction?.elapsed).toBe(0);

    for (const runtime of [source, loaded]) {
      const held = {
        right: runtime.inventory.hands.right?.uid ?? null,
        left: runtime.inventory.hands.left?.uid ?? null,
      };
      for (let tick = 1; tick < 15; tick++) {
        runtime.session.playerCombat.tick(1 / 60, held);
        if (tick % 3 === 0) {
          runtime.zombies.tick(0.05, tick / 20, held);
        }
        expect(runtime.zombies.store.get(id)?.regions.head).toBe(initialHealth);
      }
      runtime.session.playerCombat.tick(1 / 60, held);
      runtime.zombies.tick(0.05, 0.25, held);
      expect(runtime.zombies.store.get(id)?.regions.head).toBe(initialHealth - weapon.damage);
      for (let tick = 0; tick < 48; tick++) {
        runtime.session.playerCombat.tick(1 / 60, held);
        if (tick % 3 === 2) {
          runtime.zombies.tick(0.05, 0.3 + (tick + 1) / 60, held);
        }
      }
      expect(runtime.zombies.store.get(id)?.regions.head).toBe(initialHealth - weapon.damage);
    }
  });

  it('persists severed and damaged zombie regions through encode, decode, and restore', async () => {
    const source = createRuntime();
    const id = source.zombies.add(registry.zombies.get('shambler')!, [3, 4, 5]);
    const zombie = source.zombies.store.get(id)!;
    zombie.regions.leftArm = 0;
    zombie.regions.head = 37;
    zombie.regions.torso = 44;

    const snapshot = capture(source);
    const bytes = await encodeFixture(snapshot);
    const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
    const loaded = createRuntime(decoded.snapshot);
    const restored = loaded.zombies.store.get(id)!;

    expect(restored.regions).toEqual(zombie.regions);
    expect(capture(loaded)).toEqual(decoded.snapshot);
  });

  it('preserves an authored site id through the save codec', async () => {
    const snapshot = capture(createRuntime());
    const bytes = await encodeSave(snapshot, {
      generation: 1,
      version: formatVersion,
      worldOptions: { ...formatWorldOptions, site: 'lone_house' },
    });
    const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
    expect(decoded.worldOptions.site).toBe('lone_house');
  });

  it('round-trips an edited hamlet byte-exactly and continues deterministically from the restored bytes', async () => {
    const source = createRuntime();
    source.rest.start('rest');
    advance(source, 17);
    prepareAudioContinuation(source);
    const snapshot = capture(source);
    const sourceHash = stateHash(snapshot);
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
    expect(stateHash(decoded.snapshot)).toBe(sourceHash);
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
    expect(stateHash(buildDecoded.snapshot)).toBe(sourceHash);
    expect(encodedAt - started).toBeGreaterThanOrEqual(0);
    expect(decodedAt - encodedAt).toBeGreaterThanOrEqual(0);
  }, 20_000);

  it('checks a representative ten-hour hamlet save and records its size and timings', async () => {
    const runtime = createRuntime();
    const worldStats = applyBudgetWorldEdits(runtime);
    const pileStats = applyBudgetPiles(runtime);
    const population = touchBudgetFurnitureAndZombies(runtime);
    expect(worldStats.visitedChunks).toBe(1352);
    expect(worldStats.editedChunks).toBe(338);
    expect(pileStats.pileCount).toBe(50);
    expect(pileStats.addedItems).toBe(pileStats.pileCount * pileStats.pileCapacity);
    expect(population.touchedContainers).toBe(36);
    expect(population.spawned).toBe(8);
    expect(population.alive).toBe(7);

    // 1:8 clock ratio makes 4,500 simulation seconds ten game hours. Advance
    // scheduler cursors without running the fixed-rate physics ticks.
    setBudgetClock(runtime);
    const snapshot = capture(runtime);
    expect(snapshot.world.diffs.chunks.length).toBeGreaterThanOrEqual(worldStats.editedChunks);
    expect(snapshot.world.spawned.length).toBe(population.spawned);
    expect(snapshot.world.zombies.zombies.length).toBe(population.alive);
    expect(snapshot.character.inventory.piles.length).toBe(pileStats.pileCount + pileStats.baselinePileCount);
    expect(snapshot.character.inventory.piles.reduce((sum, pile) => sum + pile.items.length, 0)).toBe(
      pileStats.pileCount * pileStats.pileCapacity + pileStats.baselinePileItems,
    );
    expect(snapshot.character.inventory.entities.entities.filter((entity) => entity.searched).length).toBe(
      population.touchedContainers,
    );
    const encodeStarted = performance.now();
    const bytes = await encodeSave(snapshot, { generation: 1, worldOptions: formatWorldOptions });
    const encodeMs = performance.now() - encodeStarted;
    expect(bytes.byteLength).toBeLessThan(TEN_HOUR_SAVE_BUDGET_BYTES);

    const decodeStarted = performance.now();
    const decoded = await decodeSave(bytes, { contentLookup });
    const decodeMs = performance.now() - decodeStarted;
    const loadStarted = performance.now();
    const loaded = createRuntime(decoded.snapshot);
    const restoreMs = performance.now() - loadStarted;
    const loadMs = decodeMs + restoreMs;
    expect(capture(loaded)).toEqual(decoded.snapshot);
    expect(loadMs).toBeLessThan(TEN_HOUR_LOAD_BUDGET_MS);
    process.stdout.write(
      `SAVE_BUDGET_TEN_HOUR runner=${measurementRunner} visited=${worldStats.visitedChunks} edited=${worldStats.editedChunks} edits=${worldStats.editedChunks * 8} syntheticPiles=${pileStats.pileCount} totalPiles=${snapshot.character.inventory.piles.length} items=${pileStats.pileCount * pileStats.pileCapacity + pileStats.baselinePileItems} touchedContainers=${population.touchedContainers} spawned=${population.spawned} alive=${population.alive} dead=${population.spawned - population.alive} size=${bytes.byteLength} encodeMs=${encodeMs.toFixed(1)} decodeMs=${decodeMs.toFixed(1)} restoreMs=${restoreMs.toFixed(1)} loadMs=${loadMs.toFixed(1)}\n`,
    );
  }, 30_000);

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
      buildRevision: 'saved-git-revision-aaaaaaaa',
      worldOptions: formatWorldOptions,
    });
    const original = bytes.slice();
    let lookups = 0;
    const otherVersion = { ...formatVersion, simulationHash: 'f'.repeat(64) };
    let mismatch: unknown;
    try {
      await decodeSave(bytes, {
        version: otherVersion,
        buildRevision: 'running-git-revision-bbbbbbbb',
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
    expect((mismatch as Error).message).toContain('saved-git-revision-aaaaaaaa');
    expect((mismatch as Error).message).toContain('running-git-revision-bbbbbbbb');
    expect((mismatch as Error).message).toContain(formatVersion.simulationHash);
    expect((mismatch as Error).message).toContain(otherVersion.simulationHash);
    expect(bytes).toEqual(original);
  });

  it('identifies content-pack-only differences in the refusal message', async () => {
    const savedVersion = {
      ...formatVersion,
      contentPacks: formatVersion.contentPacks.map((pack) => ({ ...pack, canonicalHash: 'f'.repeat(64) })),
    };
    const bytes = await encodeSave(capture(createRuntime()), {
      generation: 1,
      version: savedVersion,
      buildRevision: 'saved-content-revision',
      worldOptions: formatWorldOptions,
    });
    let mismatch: unknown;
    try {
      await decodeSave(bytes, {
        version: formatVersion,
        buildRevision: 'running-content-revision',
        contentLookup: () => true,
      });
    } catch (error) {
      mismatch = error;
    }
    expect(mismatch).toBeInstanceOf(Error);
    expect((mismatch as Error).message).toContain('content packs');
    expect((mismatch as Error).message).toContain('deadvox.base');
    expect((mismatch as Error).message).toContain(formatVersion.simulationHash);
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
    badSchema.schemaVersion = 1;
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
