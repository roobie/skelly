import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { Chunk } from '../src/core/chunk.ts';
import { defaultClock } from '../src/core/clock.ts';
import { worldSolid } from '../src/core/collision.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { CHUNK, localIndex, toChunk } from '../src/core/coords.ts';
import type { MapEntityStore } from '../src/core/entities.ts';
import { Hamlet } from '../src/core/hamlet.ts';
import {
  encodeSave,
  SAVE_SCHEMA_VERSION,
  type SaveContentKind,
  type SaveVersionComponents,
} from '../src/core/saveFormat.ts';
import type { SaveSnapshot, snapshotSession } from '../src/core/saveState.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { generateColumn, type Terrain } from '../src/core/worldgen.ts';
import type { MoveIntent } from '../src/game/player.ts';
import { createSession, IDLE, type PlayerInputSample } from '../src/game/session.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);

export { registry };
export const seed = 13;
export const scale = makeScale(0.5);
export const blockId = (id: string): number => {
  const found = registry.blockIds.get(id);
  if (found === undefined) {
    throw new Error(`Missing block ${id}`);
  }
  return found;
};
export const blockName = (id: number): string => {
  const found = registry.blocks[id]?.id;
  if (!found) {
    throw new Error(`Missing block id ${id}`);
  }
  return found;
};

export const fixtureHamlet = new Hamlet(seed, registry, scale);
export const fixtureColumns: [number, number][] = [];
for (let cz = toChunk(fixtureHamlet.bounds.z0); cz <= toChunk(fixtureHamlet.bounds.z1 - 1); cz++) {
  for (let cx = toChunk(fixtureHamlet.bounds.x0); cx <= toChunk(fixtureHamlet.bounds.x1 - 1); cx++) {
    if (
      fixtureHamlet.hordesIn(cx, cz).length === 0 &&
      (fixtureHamlet.furnitureIn(cx, cz).length > 0 || fixtureHamlet.zombiesIn(cx, cz).length > 0)
    ) {
      fixtureColumns.push([cx, cz]);
    }
  }
}
const fixtureTerrain: Terrain = {
  seed,
  blocks: { grass: blockId('grass'), dirt: blockId('dirt'), stone: blockId('stone'), sand: blockId('sand') },
  scale,
  surface: fixtureHamlet.surface,
  stamp: (chunk) => fixtureHamlet.stamp(chunk),
};
const foundZombieColumn = fixtureColumns.find(([cx, cz]) => fixtureHamlet.zombiesIn(cx, cz).length > 0);
if (!foundZombieColumn) {
  throw new Error('Snapshot fixture has no zombie column');
}
export const fixtureZombieColumn: [number, number] = foundZombieColumn;
const chunksByColumn = new Map<string, Chunk[]>();
const fixtureChunksFor = (columns: readonly [number, number][]): Chunk[] =>
  columns.flatMap(([cx, cz]) => {
    const key = `${cx},${cz}`;
    let chunks = chunksByColumn.get(key);
    if (!chunks) {
      chunks = generateColumn(fixtureTerrain, cx, cz);
      chunksByColumn.set(key, chunks);
    }
    return chunks;
  });

const cloneFixtureChunk = (source: Chunk): Chunk => {
  const copy = new Chunk(source.cx, source.cy, source.cz, source.uniformId ?? 0);
  const data = source.raw();
  if (!data) {
    return copy;
  }
  for (let y = 0; y < CHUNK; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        const id = data[localIndex(x, y, z)]!;
        if (id !== 0) {
          copy.set(x, y, z, id);
        }
      }
    }
  }
  return copy;
};

export type Runtime = ReturnType<typeof createRuntime>;

export const addFixtureColumn = (runtime: Runtime, cx: number, cz: number): void => {
  for (const chunk of fixtureChunksFor([[cx, cz]])) {
    runtime.world.addChunk(cloneFixtureChunk(chunk));
  }
};

export const removeFixtureColumn = (runtime: Runtime, cx: number, cz: number): void => {
  for (let cy = scale.minCy; cy <= scale.maxCy; cy++) {
    runtime.world.removeChunk(cx, cy, cz);
  }
};

// The scenario factory builds the same session the game does (src/game/session.ts) and only
// supplies what the DOM would: controls, sound output, and the hamlet's world. Fresh and
// restored runs share it.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: keep test runtime wiring in one auditable place.
export function createRuntime(
  snapshot?: ReturnType<typeof snapshotSession>,
  fixture: boolean | 'right' | 'left' = false,
  columnsOverride?: readonly [number, number][],
  options: {
    spawn?: Vec3;
    start?: number;
    yaw?: number;
    active?: boolean;
    intent?: () => MoveIntent;
    ready?: (x: number, z: number) => boolean;
    zombieReady?: (x: number, z: number) => boolean;
    wobbleFlatOverride?: number;
    sampleAtPlayerTick?: (
      tick: number,
      live: PlayerInputSample,
      time: number,
      compression: number,
    ) => PlayerInputSample;
  } = {},
) {
  const { sampleAtPlayerTick } = options;
  const restFixture = fixture === true;
  const handedness = typeof fixture === 'string' ? fixture : undefined;
  const hamlet = fixtureHamlet;
  const columns = columnsOverride ?? (restFixture ? fixtureColumns : [fixtureZombieColumn]);
  const { x1 } = hamlet.bounds;
  const world = new World();
  const sharedEntities = new BlockEntities(registry);
  for (const chunk of fixtureChunksFor(columns)) {
    world.addChunk(cloneFixtureChunk(chunk));
  }
  const [editCx, editCz] = columns[0]!;
  const editChunk = [...world.chunks.values()].find((chunk) => chunk.cx === editCx && chunk.cz === editCz)!;

  const [sx, sy, sz] = hamlet.spawn.pos.map((metres) => metres / scale.blockSize);
  // Real wiring refuses to rest with a shambler within 30 m, so the player starts falling well clear of the hamlet.
  const awayFromShamblers = x1 - sx! + 200;
  // Where the player is looking: the game reads this from its input, here it is plain state.
  const view = {
    yaw: options.yaw ?? hamlet.spawn.yaw,
    pitch: 0.03,
    walk: false,
    crouchToggle: false,
    intent: { ...IDLE },
  };
  const heardSounds: { event: string; file: string; time: number; position: [number, number, number] }[] = [];
  const spawn: Vec3 = options.spawn ?? [sx! + awayFromShamblers, sy! + 400, sz!];
  const restFixturePos: Vec3 = [spawn[0] + 2, spawn[1], spawn[2]];
  if (restFixture) {
    const sleepable = [...registry.furniture.values()].find((def) => def.rest?.sleep);
    if (!sleepable) {
      throw new Error('Snapshot fixture has no sleepable furniture definition');
    }
    if (!snapshot) {
      const placed = sharedEntities.add({
        type: sleepable.id,
        pos: restFixturePos,
        size: sleepable.size,
        facing: 'n',
      });
      if (!placed) {
        throw new Error('Could not place the snapshot rest fixture');
      }
    }
  }
  const session = createSession({
    registry,
    world,
    isSolid: worldSolid(world, registry, sharedEntities),
    isOpaque: (x, y, z) => world.getBlock(x, y, z) !== 0 || sharedEntities.isSolid(x, y, z),
    entities: sharedEntities,
    scale,
    seed,
    start: options.start ?? defaultClock.start,
    spawn,
    wobbleFlatOverride: options.wobbleFlatOverride,
    ready: options.ready ?? (() => true),
    ...(options.zombieReady ? { zombieReady: options.zombieReady } : {}),
    controls: {
      active: () => options.active ?? Boolean(sampleAtPlayerTick),
      intent: options.intent ?? (() => view.intent),
      ...(sampleAtPlayerTick ? { sampleAtPlayerTick } : {}),
      consumeCrouchToggle: () => {
        const pressed = view.crouchToggle;
        view.crouchToggle = false;
        return pressed;
      },
      yaw: () => view.yaw,
      pitch: () => view.pitch,
      walking: () => options.intent?.().walk ?? view.walk,
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
    ...(handedness ? { handedness } : {}),
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
    if (!inventory.add(backpack, { kind: 'hand', side: 'right' })) {
      throw new Error('Could not hold fixture backpack');
    }
    inventory.add(beans, { kind: 'pocket', owner: backpack, pocket: 0 });
    const rag = inventory.create('rag');
    inventory.add(rag, { kind: 'pile', pos: [editCx * CHUNK + 2, editChunk.cy * CHUNK + 1, editCz * CHUNK + 2] });
    const flashlight = inventory.create('flashlight');
    if (!inventory.add(flashlight, { kind: 'hand', side: 'left' }) || survival.use(flashlight) !== undefined) {
      throw new Error('Could not hold and light fixture flashlight');
    }
    quickbar.assign(0, beans);
    const container = [...entities.all].find((entity) => entity.pockets);
    if (container) {
      entities.markSearched(container);
    }
    const first = zombies.store.entries().next().value as [number, unknown] | undefined;
    if (first && (restFixture || zombies.store.size > 1)) {
      zombies.store.remove(first[0]);
    }
    world.setBlock(editCx * CHUNK + 1, editChunk.cy * CHUNK + 1, editCz * CHUNK + 1, blockId('planks'));
  }
  const restAnchor = restFixture
    ? [...entities.all].find(
        (entity) =>
          entity.pos.every((coordinate, axis) => coordinate === restFixturePos[axis]) &&
          entities.defOf(entity).rest?.sleep,
      )
    : undefined;
  const restAnchorUid = restAnchor?.uid;
  if (restFixture && restAnchorUid === undefined) {
    throw new Error('Snapshot fixture has no sleepable furniture');
  }
  return {
    session,
    restAnchorUid,
    hamlet,
    columns,
    world,
    sim,
    player,
    view,
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
    toggleCrouch: () => {
      view.crouchToggle = true;
    },
  };
}

export const capture = (runtime: Runtime) =>
  runtime.session.snapshot({ worldId: `world-${seed}`, characterId: 'character-1' });
export const startRest = (runtime: Runtime, kind: 'rest' | 'sleep') => {
  if (runtime.restAnchorUid === undefined) {
    throw new Error('Rest fixture is not enabled');
  }
  return runtime.rest.start(kind, runtime.restAnchorUid);
};

// Test-only inspection reads the live runtime directly; it deliberately does not call a save serializer.
const inspectItem = (item: import('../src/core/items.ts').Item): unknown => ({
  uid: item.uid,
  type: item.type,
  count: item.count,
  condition: item.condition,
  charges: item.charges,
  on: item.on,
  madeAtGameTimestamp: item.madeAtGameTimestamp,
  pockets: item.pockets?.map((grid) =>
    grid.map((placed) => ({ x: placed.x, y: placed.y, rotated: placed.rotated, item: inspectItem(placed.item) })),
  ),
});
export const inspect = (runtime: Runtime): unknown => {
  const scheduler = (
    runtime.sim.scheduler as unknown as { entries: { spec: { id: string }; done: number; ticks: number }[] }
  ).entries;
  const spawns = (runtime.spawner as unknown as { spawned: Set<string> }).spawned;
  const { deltas } = runtime.world as unknown as { deltas: Map<string, unknown> };
  return {
    chunks: [...runtime.world.chunks.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, chunk]) => [key, chunk.toArray(), chunk.edited]),
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
      crouching: runtime.session.crouching,
      sprinting: runtime.session.sprinting,
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
      hordes: runtime.zombies.snapshotState().hordes,
      entries: [...runtime.zombies.store.entries()].map(([id, zombie]) => {
        const { type, behaviorRng, soundRng, renderPrevious: _renderPrevious, tier: _tier, ...fields } = zombie;
        return [
          id,
          {
            ...structuredClone(fields),
            type: type.id,
            behaviorRng: behaviorRng.state(),
            soundRng: soundRng.state(),
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

export const plainDataTree = (value: unknown): boolean => {
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
export const frozenTree = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') {
    return true;
  }
  return Object.isFrozen(value) && Object.values(value).every(frozenTree);
};
export const advance = (runtime: Runtime, frames: number, interruptAt = -1) => {
  runtime.sim.paused = false;
  for (let frame = 0; frame < frames; frame++) {
    if (frame === interruptAt) {
      runtime.sim.emit({ kind: 'interrupt', reason: 'test interruption' });
    }
    runtime.session.frame(1 / 60);
  }
};

const IDLE_GROANER_DISTANCE = 20;
export const prepareAudioContinuation = (runtime: Runtime): void => {
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
  idle.idleSoundTimer = 0.02;
  idle.lastVocalNoiseId = runtime.playerAudio.vocalNoiseId;
  runtime.heardSounds.length = 0;
};

export const formatVersion: SaveVersionComponents = {
  simulationHash: 'a'.repeat(64),
  schemaVersion: SAVE_SCHEMA_VERSION,
  generators: { worldgen: 'worldgen-v1', shamblerFigure: 'shambler-figure-v1', amalgamFigure: 'amalgam-figure-v1' },
  contentPacks: [{ id: 'deadvox.base', version: '1', canonicalHash: '0'.repeat(64) }],
};
export const formatWorldOptions = { blockSize: 0.5, site: 'forest' as const, storeys: 1, density: 0.75 };
export const contentLookup = (kind: SaveContentKind, id: string): boolean => {
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
  return [
    'needs',
    'body',
    'long-action',
    'player',
    'zombies',
    'zombie-background',
    'handling',
    'lights',
    'firearms',
  ].includes(id);
};
export const encodeFixture = (snapshot: SaveSnapshot, generation = 7) =>
  encodeSave(snapshot, { generation, version: formatVersion, worldOptions: formatWorldOptions });
