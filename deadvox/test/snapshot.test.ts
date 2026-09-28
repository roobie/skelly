import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Chunk } from '../src/core/chunk.ts';
import { hourOfDay } from '../src/core/clock.ts';
import { buildRegistry } from '../src/core/content.ts';
import { CHUNK, toChunk } from '../src/core/coords.ts';
import type { MapEntityStore } from '../src/core/entities.ts';
import { Hamlet } from '../src/core/hamlet.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { stepBody } from '../src/core/physics.ts';
import { snapshotSession } from '../src/core/saveState.ts';
import { makeScale } from '../src/core/scale.ts';
import { Simulation } from '../src/core/sim.ts';
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
      lit: false,
      lightSeenFrom: 40,
    }),
    hour: () => hourOfDay(sim.calendar),
    hurtPlayer: (amount) => sim.hurt(amount, 'a shambler'),
  });
  sim.scheduler.register({ id: 'player-physics', rate: 60, tick: (dt) => stepBody(player.body, dt, isSolid, physics) });
  sim.scheduler.register({ id: 'zombies', rate: 20, tick: (dt) => zombies.tick(dt) });
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
        const { type, behaviorRng, renderPrevious, ...fields } = zombie;
        return [id, { ...structuredClone(fields), type: type.id, behaviorRng: behaviorRng.state(), renderPrevious }];
      }),
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
      const snapshot = capture(split);
      expect(snapshot.character.handling.jobs).toEqual([]);
      expect(plainDataTree(snapshot)).toBe(true);
      expect(frozenTree(snapshot)).toBe(true);
      advance(uninterrupted, 80, interruption ? -1 : 20);
      const loaded = createRuntime(snapshot);
      advance(loaded, 80, interruption ? -1 : 20);
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

  it('detects omission of an RNG word, scheduler cursor, item allocator, or world delta', () => {
    const original = createRuntime();
    original.rest.start('rest');
    advance(original, 12);
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
  }, 15_000);
});
