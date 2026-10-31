import { afterEach, describe, expect, it, vi } from 'vitest';
import { CanonicalTerrain, installColumn } from '../src/core/canonicalTerrain.ts';
import { worldSolid } from '../src/core/collision.ts';
import { CHUNK, toChunk, toLocal, type Vec3 } from '../src/core/coords.ts';
import { PILE_GRID } from '../src/core/inventoryScale.ts';
import { buildMesh } from '../src/core/mesher.ts';
import { paddedIndex } from '../src/core/meshInput.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { type ColumnSource, type FurnitureSpawn, SupplyFootprints } from '../src/core/site.ts';
import type { BlockBox } from '../src/core/structure.ts';
import { strikeTerrain } from '../src/core/terrainStrike.ts';
import { simSeconds } from '../src/core/time.ts';
import { affectedChunks, World } from '../src/core/world.ts';
import { generateColumn, type Terrain } from '../src/core/worldgen.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { Streamer } from '../src/game/streamer.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import type { FromMesher, ToMesher } from '../src/worker/protocol.ts';
import { baseRegistry } from './baseRegistry.ts';
import { blockMaterialFixture, fixtureBlockMaterial } from './blockMaterialFixture.ts';
import { fixtureLootPoint } from './economyFixtures.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const cell: Vec3 = [CHUNK - 1, 3, 3];
const marker: Vec3 = [CHUNK + 5, 6, 9];
const scale = { blockSize: 0.5, minCy: 0, maxCy: 0 };
const stock = 'terrain_fixture_stock';
const shelfType = 'terrain_fixture_shelf';
const leafType = 'terrain_fixture_leaf';
const floorType = 'terrain_fixture_floor';
const stockRoll = (condition: number) => ({ type: stock, count: 1, condition });
const fixtureRegistry = () => {
  const registry = baseRegistry();
  registry.blockIds.set(floorType, registry.blocks.length);
  registry.blocks.push({ id: floorType, name: 'Floor', material: 'fixture_material', solid: true, color: '#888888' });
  registry.blockMaterials.set('fixture_material', {
    ...fixtureBlockMaterial(floorType),
    rubble: [{ item: stock, count: 1 }],
  });
  for (const sound of blockMaterialFixture(floorType).sounds) {
    registry.sounds.set(sound.id, {
      ...sound,
      minIntervalSimSeconds: simSeconds(0),
      category: 'world',
      pitchJitter: [1, 1],
      gainJitter: [1, 1],
    });
  }
  registry.items.set(stock, {
    id: stock,
    name: 'Stock',
    category: 'material',
    size: [PILE_GRID.w, PILE_GRID.h],
    weight: 1,
    economy: { usage: [], tiers: [] },
    workInProgress: false,
    notLoot: false,
  });
  registry.furniture.set(shelfType, {
    id: shelfType,
    name: 'Shelf',
    size: [2, 1, 1],
    color: '#888888',
    massKg: 1,
    breach: { minimumStrength: 1, durability: 8 },
    material: 'wood',
    container: { pockets: [{ grid: [PILE_GRID.w, PILE_GRID.h], handlingSimSeconds: simSeconds(0.1) }] },
  });
  registry.furniture.set(leafType, {
    ...registry.furniture.get(shelfType)!,
    id: leafType,
    size: [1, 1, 1],
    container: undefined,
    door: { handlingSimSeconds: simSeconds(0.5), methods: {} },
  });
  return registry;
};
interface Variant {
  resident?: boolean;
  arrived?: boolean;
  reverse?: boolean;
  full?: boolean;
  narrow?: boolean;
  leaf?: boolean;
  collision?: boolean;
}
const fixtureSpawns = (variant: Variant): FurnitureSpawn[] => [
  {
    spec: {
      type: variant.leaf ? leafType : shelfType,
      pos: [cell[0], 4, 3],
      size: [variant.narrow || variant.leaf ? 1 : 2, 1, 1],
      facing: 'n',
      ...(variant.leaf ? { fixed: true } : {}),
    },
    loot: variant.leaf ? [] : [stockRoll(0.6)],
    ...(variant.leaf ? {} : { fixedCount: 1, surfaceLoot: [stockRoll(0.8)], wear: 0.25 }),
  },
  {
    spec: { type: shelfType, pos: [CHUNK + 4, 2, 8], size: [1, 1, 1], facing: 'n' },
    loot: [stockRoll(0.4)],
    fixedCount: 1,
    surfaceLoot: [stockRoll(0.7)],
    wear: 0.5,
  },
];
const fixtureGround = (full: boolean | undefined) =>
  (full ? [CHUNK - 2, CHUNK - 1, CHUNK, CHUNK + 1, CHUNK + 2] : [CHUNK]).map((x) => ({
    ...fixtureLootPoint({ kind: 'fixed', items: [{ item: stock, count: 1 }] }),
    id: `terrain_ground_${x}`,
    channel: 'ground' as const,
    position: [x, 1, 3] as Vec3,
    destination: [x, 1, 3] as Vec3,
  }));
const fixture = (
  variant: Variant = {},
  restored?: Readonly<SaveSnapshot>,
  onTerrainEdited: (chunks: Vec3[]) => void = () => undefined,
) => {
  const registry = fixtureRegistry();
  const world = new World();
  const floor = registry.blockIds.get(floorType)!;
  const structures: BlockBox[] = [
    { min: cell, max: [cell[0] + 1, 4, 4], block: floor },
    { min: [CHUNK - 3, 1, 2], max: [CHUNK - 2, 8, 5], block: floor },
    { min: [CHUNK + 3, 1, 2], max: [CHUNK + 4, 8, 5], block: floor },
    { min: [CHUNK - 2, 1, 2], max: [CHUNK + 3, 8, 3], block: floor },
    { min: [CHUNK - 2, 1, 4], max: [CHUNK + 3, 8, 5], block: floor },
    { min: [CHUNK + 4, 1, 8], max: [CHUNK + 5, 2, 9], block: floor },
  ];
  const terrain: Terrain = {
    seed: 7,
    scale,
    blocks: { grass: floor, dirt: floor, rock: floor, sand: floor, water: floor },
    shape: {
      minHeightMetres: 0,
      maxHeightMetres: 0,
      beachBelowMetres: 0,
      dirtDepthMetres: 1,
      featureSizeMetres: 1,
      octaves: 1,
    },
    stamp: (chunk) => {
      if (chunk.cx === 1 && chunk.cz === 0) {
        chunk.set(toLocal(marker[0]), marker[1], marker[2], floor);
      }
    },
  };
  const canonical = new CanonicalTerrain(world, terrain, structures);
  const spawns = fixtureSpawns(variant);
  const points = fixtureGround(variant.full);
  const footprints = new SupplyFootprints(
    spawns.map(({ spec }) => spec),
    points,
  );
  const source: ColumnSource = {
    furnitureIn: (cx, cz) => spawns.filter(({ spec }) => toChunk(spec.pos[0]) === cx && toChunk(spec.pos[2]) === cz),
    lootPointsIn: (cx, cz) =>
      points.filter(({ position }) => toChunk(position[0]) === cx && toChunk(position[2]) === cz),
    supplySourcesIn: (area) => footprints.in(area),
    zombiesIn: () => [],
  };
  const session = createSession({
    registry,
    world,
    scale,
    seed: 7,
    start: 43_200,
    spawn: [CHUNK - 1, 1, 6],
    terrainDestruction: { terrain: canonical, source },
    onTerrainEdited,
    isSolid: (x, y, z) => registry.blocks[world.getBlock(x, y, z)]!.solid,
    isOpaque: (x, y, z) => registry.blocks[world.getBlock(x, y, z)]!.solid,
    ready: () => false,
    controls: {
      active: () => true,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
    ...(restored ? { restore: restored } : {}),
  });
  const { inventory } = session;
  const order = variant.reverse ? [1, 0] : [0, 1];
  if (!restored) {
    if (variant.resident) {
      for (const cx of order) {
        installColumn(world, generateColumn(terrain, cx, 0, structures));
      }
    }
    if (variant.collision) {
      inventory.furnish(spawns[0]!.spec, [stockRoll(0.3)], [], 1);
    }
    if (variant.arrived) {
      for (const cx of order) {
        session.onColumn(cx, 0, source);
      }
    }
  }
  const snapshot = () => session.snapshot({ worldId: 'terrain-fixture', characterId: 'terrain-character' });
  const strike = (strength = 20, kind: 'blunt' | 'cut' | 'pierce' = 'blunt') =>
    strikeTerrain(
      {
        terrain: canonical,
        supply: session.projectSupply(source),
        mover: {
          inventory,
          terrainSolid: worldSolid(world, registry, inventory.entities),
          blockSize: scale.blockSize,
          player: session.body,
          others: [],
          stamina: 100,
        },
      },
      cell,
      { strength, kind },
    );
  const playerStrike = (strength: number) => {
    const hands = { right: null, left: null };
    const started = session.playerCombat.beginMeleeSwing({
      origin: [cell[0] + 0.5, cell[1] - 0.9, cell[2] + 0.5],
      direction: [0, 1, 0],
      weapon: { ...FISTS_MELEE, impulse: strength },
      profile: 'fists',
      twoHanded: false,
      hands,
    });
    session.playerCombat.tick(FISTS_MELEE.cooldown, hands);
    return started;
  };
  const arrive = () => {
    for (const cx of order) {
      session.onColumn(cx, 0, source);
    }
  };
  return {
    registry,
    world,
    canonical,
    terrain,
    structures,
    inventory,
    session,
    source,
    snapshot,
    strike,
    playerStrike,
    arrive,
    floor,
    spawns,
  };
};
type Fixture = ReturnType<typeof fixture>;
const owners = (f: Fixture) => ({
  inventory: f.inventory.snapshotState(),
  version: f.inventory.version,
  entities: f.inventory.entities.version,
  standing: f.inventory.entities.standing,
  rolled: f.snapshot().world.rolledColumns,
});
const logical = (f: Fixture) => {
  const state = structuredClone(f.inventory.snapshotState());
  state.entities.entities.sort((a, b) => a.pos[1] - b.pos[1] || a.pos[0] - b.pos[0] || a.pos[2] - b.pos[2]);
  state.piles.sort((a, b) => a.pos[1] - b.pos[1] || a.pos[0] - b.pos[0] || a.pos[2] - b.pos[2]);
  for (const [at, entity] of state.entities.entities.entries()) {
    entity.uid = at + 1;
  }
  const itemIds = new Map<number, number>();
  const inventory = JSON.parse(
    JSON.stringify(state, (key, value) => {
      if (key !== 'item') {
        return value;
      }
      if (!itemIds.has(value.uid)) {
        itemIds.set(value.uid, itemIds.size + 1);
      }
      return { ...value, uid: itemIds.get(value.uid) };
    }),
  );
  return {
    inventory,
    columns: [0, 1].map((cx) =>
      (f.world.getChunk(cx, 0, 0) ?? generateColumn(f.terrain, cx, 0, f.structures)[0]!).toArray(),
    ),
    damage: f.world.blockDamage.snapshotState(),
    rolled: [...f.snapshot().world.rolledColumns].sort(),
  };
};
const restore = async (f: Fixture, variant: Variant) => {
  const saved = f.snapshot();
  const decoded = await decodeSave(await encodeFixture(saved), {
    version: formatVersion,
    contentLookup: (kind, id, item) => contentLookup(f.registry, kind, id, item),
  });
  return fixture(variant, decoded.snapshot);
};

const meshing = (f: Fixture) => {
  type Request = Extract<ToMesher, { type: 'mesh' }>;
  const requests: { worker: ControlledWorker; message: Request }[] = [];
  class ControlledWorker {
    onmessage: ((event: { data: FromMesher }) => void) | undefined;
    postMessage(message: ToMesher): void {
      if (message.type === 'mesh') {
        requests.push({ worker: this, message });
      }
    }
  }
  vi.stubGlobal('Worker', ControlledWorker);
  const meshes = { keys: () => [], set: vi.fn(), remove: vi.fn(), setRevealedColumns: vi.fn() };
  const colors = new Uint8Array(f.registry.blocks.length * 4);
  const streamer = new Streamer({
    world: f.world,
    meshes: meshes as never,
    seed: f.terrain.seed,
    terrain: f.terrain.blocks,
    shape: f.terrain.shape,
    scale,
    structures: f.structures,
    stamp: f.terrain.stamp,
    colors,
    patterns: new Uint8Array(f.registry.blocks.length),
    weatherable: new Uint8Array(f.registry.blocks.length),
    radius: 0,
    preloadRings: 0,
    hysteresis: 1,
  });
  const next = () => {
    for (let step = 0; step < 32 && requests.length === 0; step += 1) {
      streamer.update(cell[0], cell[2]);
    }
    const request = requests.shift();
    if (!request) {
      throw new Error('Expected a mesh request');
    }
    return request;
  };
  const reply = ({ worker, message }: ReturnType<typeof next>) => {
    const mesh = buildMesh(message.padded, colors, { wide: message.wide });
    worker.onmessage?.({ data: { type: 'mesh', key: message.key, version: message.version, ms: 0, mesh } });
    return mesh;
  };
  return { streamer, meshes, next, reply };
};

afterEach(() => vi.unstubAllGlobals());

describe('supply-aware terrain destruction', () => {
  it.each(['drawn', 'in-flight'] as const)(
    'remeshes an admitted player terrain strike with a %s pre-strike mesh',
    (state) => {
      const edited = vi.fn<(chunks: Vec3[]) => void>();
      const f = fixture({}, undefined, edited);
      const { streamer, meshes, next, reply } = meshing(f);
      const mark = vi.spyOn(streamer, 'markEdited');
      edited.mockImplementation((chunks) => streamer.markEdited(chunks));
      const old = next();
      const index = paddedIndex(toLocal(cell[0]) + 1, toLocal(cell[1]) + 1, toLocal(cell[2]) + 1);
      expect(old.message.padded[index]).toBe(f.floor);
      if (state === 'drawn') {
        const mesh = reply(old);
        expect(meshes.set).toHaveBeenCalledWith(old.message.key, expect.any(Array), mesh);
        meshes.set.mockClear();
      }
      expect(f.playerStrike(20)).toBe(true);
      expect(f.world.getBlock(...cell)).toBe(0);
      const affected = affectedChunks(...cell);
      expect(affected.length).toBeGreaterThan(1);
      expect(mark).toHaveBeenCalledExactlyOnceWith(affected);
      if (state === 'in-flight') {
        reply(old);
        expect(meshes.set).not.toHaveBeenCalled();
      }
      const replacement = next();
      expect(replacement.message.key).toBe(old.message.key);
      expect(replacement.message.version).toBeGreaterThan(old.message.version);
      expect(replacement.message.padded[index]).toBe(0);
      const mesh = reply(replacement);
      expect(meshes.set).toHaveBeenCalledExactlyOnceWith(replacement.message.key, expect.any(Array), mesh);
    },
  );

  it.each([false, true])(
    'publishes no terrain removal notification for resisted, partial or refused blows (full destinations: %s)',
    (full) => {
      const edited = vi.fn<(chunks: Vec3[]) => void>();
      const f = fixture({ resident: true, full }, undefined, edited);
      expect(f.playerStrike(1)).toBe(true);
      expect(f.world.blockDamage.get(cell)).toBeUndefined();
      expect(f.playerStrike(full ? 20 : 4)).toBe(true);
      expect(f.world.blockDamage.get(cell)?.damage).toBe(full ? 20 : 4);
      expect(f.world.getBlock(...cell)).toBe(f.floor);
      expect(edited).not.toHaveBeenCalled();
    },
  );
  it('keeps complete affected columns and consumed supply through real streamer unload and return', () => {
    const f = fixture();
    expect(f.strike()?.outcome).toBe('broken');
    const before = f.snapshot();
    expect(before.world.rolledColumns).toEqual(expect.arrayContaining(['0,0', '1,0']));
    const { streamer } = meshing(f);
    streamer.onColumn = (cx, cz) => f.session.onColumn(cx, cz, f.source);
    const unload = vi.fn();
    streamer.onColumnUnload = unload;
    const supply = vi.spyOn(f.source, 'furnitureIn');
    const serve = (x: number, z: number) => {
      for (let step = 0; step < 32 && !streamer.isReady(x, z); step += 1) {
        streamer.update(x, z);
      }
    };
    serve(cell[0], cell[2]);
    expect(streamer.isReady(...([cell[0], cell[2]] as const))).toBe(true);
    expect(streamer.hasGeneratedColumn(0, 0)).toBe(true);
    serve(20 * CHUNK, 20 * CHUNK);
    expect(unload).toHaveBeenCalledWith(0, 0);
    expect(streamer.hasGeneratedColumn(0, 0)).toBe(false);
    expect(f.world.getChunk(0, 0, 0)).toBeDefined();
    expect(f.world.getChunk(1, 0, 0)).toBeDefined();
    serve(cell[0], cell[2]);
    expect(streamer.hasGeneratedColumn(0, 0)).toBe(true);
    expect(supply.mock.calls.some(([cx, cz]) => (cx === 0 || cx === 1) && cz === 0)).toBe(false);
    expect(f.inventory.snapshotState()).toEqual(before.character.inventory);
    expect(f.snapshot().world.columns).toEqual(before.world.columns);
    expect(f.world.getBlock(...marker)).toBe(f.floor);
    expect(f.world.getBlock(...cell)).toBe(0);
  });

  it('admits a canonical fall path deeper than the resident-only furniture search limit', () => {
    const f = fixture();
    const deep: Terrain = {
      ...f.terrain,
      scale: { ...scale, minCy: -3 },
      shape: { ...f.terrain.shape, minHeightMetres: -35.5, maxHeightMetres: -35.5 },
      stamp: (chunk) => {
        if (chunk.cy === 0) {
          f.terrain.stamp?.(chunk);
        }
      },
    };
    const canonical = new CanonicalTerrain(f.world, deep, f.structures);
    const source: ColumnSource = {
      ...f.source,
      furnitureIn: (cx, cz) => (cx === 0 && cz === 0 ? [f.spawns[0]!] : []),
      lootPointsIn: () => [],
    };
    const result = strikeTerrain(
      {
        terrain: canonical,
        supply: f.session.projectSupply(source),
        mover: {
          inventory: f.inventory,
          terrainSolid: () => false,
          blockSize: 0.5,
          player: f.session.body,
          others: [],
          stamina: 100,
        },
      },
      cell,
      { strength: 20, kind: 'blunt' },
    );
    expect(result?.outcome).toBe('broken');
    const items = [...f.inventory.items()].filter(({ item }) => item.type === stock);
    expect(items).toHaveLength(3);
    for (const { item } of items) {
      const at = f.inventory.locate(item);
      expect(at?.kind).toBe('pile');
      if (at?.kind === 'pile') {
        expect(at.pile.pos[1]).toBe(-70);
        expect(canonical.getBlock(at.pile.pos[0], at.pile.pos[1] - 1, at.pile.pos[2])).toBe(f.floor);
      }
    }
  });
  it('resists without owners or overlay, then publishes partial damage with complete stamped terrain', async () => {
    const f = fixture();
    const before = owners(f);
    expect(f.strike(1)?.outcome).toBe('resisted');
    expect(owners(f)).toEqual(before);
    expect(f.world.chunks.size).toBe(0);
    expect(f.strike(4, 'cut')?.outcome).toBe('damaged');
    const entry = f.world.blockDamage.get(cell)!;
    expect(entry.damage).toBe(2);
    const restored = await restore(f, {});
    expect(restored.world.blockDamage.get(cell)).toEqual(entry);
    expect(restored.world.snapshotColumns((id) => restored.registry.blocks[id]!.id)).toEqual(
      f.snapshot().world.columns,
    );
    expect(restored.canonical.getBlock(...marker)).toBe(f.floor);
    expect(restored.world.getBlock(...cell)).toBe(f.floor);
    const root = restored.inventory.entities.at(...f.spawns[0]!.spec.pos)!;
    const content = root.pockets![0]![0]!.item;
    restored.arrive();
    expect(restored.inventory.entities.at(...f.spawns[0]!.spec.pos)).toBe(root);
    expect(root.damage).toBe(2);
    expect(root.pockets![0]![0]!.item).toBe(content);
    const after = restored.inventory.snapshotState();
    restored.arrive();
    expect(restored.inventory.snapshotState()).toEqual(after);
  });

  it('removes a floorless shelf, conserves all drops, and agrees across terrain and supply arrival orders', async () => {
    const variants: Variant[] = [
      {},
      { resident: true, reverse: true },
      { arrived: true },
      { resident: true, arrived: true, reverse: true },
    ];
    const results = await Promise.all(
      variants.map(async (variant) => {
        const f = fixture(variant);
        expect(f.strike()?.outcome).toBe('broken');
        expect(f.world.getBlock(...cell)).toBe(0);
        expect(f.world.blockDamage.get(cell)).toBeUndefined();
        expect(f.inventory.entities.at(...f.spawns[0]!.spec.pos)).toBeUndefined();
        expect(f.canonical.getBlock(...marker)).toBe(f.floor);
        expect(f.canonical.getBlock(CHUNK, 3, 2)).toBe(f.floor);
        expect(f.inventory.entities.at(...f.spawns[1]!.spec.pos)?.damage).toBe(4);
        const items = [...f.inventory.items()].map(({ item }) => item).filter(({ type }) => type === stock);
        expect(items.reduce((sum, item) => sum + item.count, 0)).toBe(6);
        expect(items.map(({ condition }) => condition).sort()).toEqual([0.4, 0.6, 0.7, 0.8, 1, 1]);
        expect(new Set(items.map(({ uid }) => uid)).size).toBe(items.length);
        const post = logical(f);
        const restored = await restore(f, variant);
        const furnish = vi.spyOn(restored.source, 'furnitureIn');
        restored.arrive();
        expect(furnish).not.toHaveBeenCalled();
        expect(logical(restored)).toEqual(post);
        f.arrive();
        expect(logical(f)).toEqual(post);
        return post;
      }),
    );
    for (const result of results.slice(1)) {
      expect(result).toEqual(results[0]);
    }
  });

  it('retains only full damage on a no-room refusal, restores it, then retries after owner consumption', async () => {
    const variants: Variant[] = [{ full: true }, { full: true, arrived: true, resident: true, reverse: true }];
    const results = await Promise.all(
      variants.map(async (variant) => {
        const f = fixture(variant);
        const before = owners(f);
        expect(f.strike()?.outcome).toBe('refused');
        expect(owners(f)).toEqual(before);
        expect(f.world.getBlock(...cell)).toBe(f.floor);
        expect(f.world.blockDamage.get(cell)?.damage).toBe(20);
        if (!variant.resident) {
          expect(f.world.getChunk(1, 0, 0)).toBeUndefined();
        }
        const restored = await restore(f, variant);
        expect(restored.world.blockDamage.get(cell)).toEqual(f.world.blockDamage.get(cell));
        restored.arrive();
        const normalized = logical(restored);
        expect(restored.inventory.entities.at(...f.spawns[0]!.spec.pos)).toBeDefined();
        expect(restored.strike(2)?.outcome).toBe('refused');
        expect(logical(restored)).toEqual(normalized);
        const ground = [...restored.inventory.piles.values()]
          .filter(({ pos }) => pos[1] === 1 && pos[2] === 3)
          .sort((a, b) => a.pos[0] - b.pos[0]);
        expect(ground.length).toBeGreaterThanOrEqual(3);
        for (const pile of ground.slice(0, 3)) {
          expect(restored.inventory.consume(pile.items[0]!.item)).toBe(true);
        }
        expect(restored.strike(2)?.outcome).toBe('broken');
        expect(restored.world.blockDamage.get(cell)).toBeUndefined();
        expect(restored.inventory.entities.at(...f.spawns[0]!.spec.pos)).toBeUndefined();
        return logical(restored);
      }),
    );
    expect(results[0]).toEqual(results[1]);
  });

  it('replans when destination search discovers authored piles in another column', () => {
    const f = fixture({ narrow: true, full: true });
    const projection = f.session.projectSupply(f.source);
    const publish = vi.spyOn(projection, 'publish');
    const before = owners(f);
    const result = strikeTerrain(
      {
        terrain: f.canonical,
        supply: projection,
        mover: {
          inventory: f.inventory,
          terrainSolid: () => false,
          blockSize: 0.5,
          player: f.session.body,
          others: [],
          stamina: 100,
        },
      },
      cell,
      { strength: 20, kind: 'blunt' },
    );
    expect(projection.revision).toBeGreaterThan(1);
    expect(result?.outcome).toBe('refused');
    expect(publish).not.toHaveBeenCalled();
    expect(owners(f)).toEqual(before);
    expect(f.world.getChunk(1, 0, 0)).toBeUndefined();
  });

  it('removes a floorless fixed leaf instead of merely opening it', () => {
    const f = fixture({ leaf: true });
    expect(f.strike()?.outcome).toBe('broken');
    expect(f.inventory.entities.at(...f.spawns[0]!.spec.pos)).toBeUndefined();
    f.arrive();
    expect(f.inventory.entities.at(...f.spawns[0]!.spec.pos)).toBeUndefined();
  });

  it('matches add collision refusal before or after arrival without orphan stock', () => {
    const results = [false, true].map((arrived) => {
      const f = fixture({ collision: true, arrived });
      expect(f.strike()?.outcome).toBe('broken');
      f.arrive();
      expect([...f.inventory.items()].filter(({ item }) => item.condition === 0.6 || item.condition === 0.8)).toEqual(
        [],
      );
      expect([...f.inventory.items()].filter(({ item }) => item.condition === 0.3)).toHaveLength(1);
      return logical(f);
    });
    expect(results[0]).toEqual(results[1]);
  });

  it('shares remaining pile capacity across two dependants and rubble, refusing the whole floor loss', () => {
    const f = fixture({ arrived: true });
    for (const x of [cell[0], cell[0] + 1]) {
      expect(
        f.inventory.furnish(
          { type: shelfType, pos: [x, 5, 3], size: [1, 1, 1], facing: 'n', fixed: true },
          [stockRoll(0.2)],
          [],
          1,
        ),
      ).toBeDefined();
    }
    const before = owners(f);
    expect(f.strike()?.outcome).toBe('refused');
    expect(owners(f)).toEqual(before);
    const left = f.inventory.entities.at(cell[0], 5, 3)!;
    expect(f.inventory.consume(left.pockets![0]![0]!.item)).toBe(true);
    expect(f.strike(2)?.outcome).toBe('broken');
    expect(f.inventory.entities.at(cell[0], 5, 3)).toBeUndefined();
    expect(f.inventory.entities.at(cell[0] + 1, 5, 3)).toBeUndefined();
  });

  it('uses player weapon impulse and kind for terrain only when no entity is struck', () => {
    for (const entityFirst of [false, true]) {
      const f = fixture({ resident: true });
      const target: Vec3 = [CHUNK - 1, 3, 3];
      const piece = entityFirst
        ? f.inventory.furnish({ type: shelfType, pos: target, size: [1, 1, 1], facing: 'n' })
        : undefined;
      const hands = { right: null, left: null };
      f.session.playerCombat.beginMeleeSwing({
        origin: [CHUNK - 0.5, 4.9, 3.5],
        direction: [0, -1, 0],
        weapon: { ...FISTS_MELEE, damage: 999, impulse: 4, type: 'cut' },
        profile: 'fists',
        twoHanded: false,
        hands,
      });
      f.session.playerCombat.tick(f.session.playerCombat.activeMeleeAction!.contactAt, hands);
      if (entityFirst) {
        expect(piece?.damage).toBe(4);
        expect(f.world.blockDamage.get(target)).toBeUndefined();
      } else {
        expect(f.world.blockDamage.get(target)?.damage).toBe(2);
      }
    }
  });
});
