import { CanonicalTerrain } from '@skelly/engine/internal/core/canonicalTerrain.ts';
import type { ColumnSource } from '@skelly/engine/internal/core/site.ts';
import { gameMinutes, gameSeconds, simSeconds } from '@skelly/engine/internal/core/time.ts';
import { decodeSave, type SaveSnapshot } from '@skelly/engine/save';
import { createSession, IDLE } from '@skelly/engine/session';
import { createTerrainEvaluator, type TerrainPlan, type Vec3, World } from '@skelly/engine/world';
import { contentLookup } from '@skelly/presentation/ui';
import { describe, expect, it } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { blockMaterialFixture, fixtureBlockMaterial } from './blockMaterialFixture.ts';
import { encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const scale = { blockSize: 0.5, minCy: 0, maxCy: 0 };
const WOOD = 'fire_fixture_wood';
const FIBRE = 'fire_fixture_fibre';
const CHAR = 'fire_fixture_char';
const METAL = 'fire_fixture_metal';
const LIQUID = 'fire_fixture_liquid';
const POST: Vec3 = [2, 1, 3];
const BEAM: Vec3 = [3, 3, 3];
const PATCH: Vec3[] = [
  [2, 1, 6],
  [3, 1, 6],
  [4, 1, 6],
  [5, 1, 6],
  [6, 1, 6],
];
const OTHER: Vec3 = [2, 1, 8];
const fixture = (restored?: Readonly<SaveSnapshot>) => {
  const registry = baseRegistry();
  const burn = { ignitionStrength: 3, burnDurationGameMinutes: gameMinutes(1), burnsTo: CHAR };
  for (const [id, span, flammability] of [
    [WOOD, 2, burn],
    [FIBRE, 1, burn],
    [CHAR, 0, undefined],
    [METAL, 2, undefined],
    [LIQUID, 0, undefined],
  ] as const) {
    registry.blockMaterials.set(id, {
      ...fixtureBlockMaterial(CHAR),
      id,
      span,
      breakable: true,
      fallsTo: { block: CHAR },
      flammability,
    });
    registry.blockIds.set(id, registry.blocks.length);
    registry.blocks.push({ id, name: id, material: id, solid: id !== LIQUID, color: '#555555' });
  }
  for (const sound of blockMaterialFixture(CHAR).sounds) {
    registry.sounds.set(sound.id, {
      ...sound,
      minIntervalSimSeconds: simSeconds(0),
      category: 'world',
      pitchJitter: [1, 1],
      gainJitter: [1, 1],
    });
  }
  const [fire] = registry.fireTuning.values();
  registry.fireTuning.set(fire!.id, { ...fire!, cellsPerTick: 2 });
  const ground = registry.blockIds.get(METAL)!;
  const wood = registry.blockIds.get(WOOD)!;
  const plan: TerrainPlan = {
    seed: 7,
    scale,
    blocks: { grass: ground, dirt: ground, rock: ground, sand: ground, water: ground },
    shape: {
      minHeightMetres: 0,
      maxHeightMetres: 0,
      beachBelowMetres: 0,
      dirtDepthMetres: 1,
      featureSizeMetres: 1,
      octaves: 1,
    },
    site: {
      kind: 'weathering-pad',
      data: {
        blockSize: scale.blockSize,
        padTop: 0,
        heightPad: { x0: 0, x1: 0, z0: 0, z1: 0 },
        materialPad: { x0: 0, x1: 0, z0: 0, z1: 0 },
        concrete: ground,
        structures: [],
      },
    },
    structures: [
      { min: POST, max: [3, 4, 4], block: wood },
      { min: BEAM, max: [4, 4, 4], block: wood },
      { min: PATCH[0]!, max: [7, 2, 7], block: wood },
      { min: OTHER, max: [3, 2, 9], block: registry.blockIds.get(FIBRE)! },
      { min: [3, 1, 8], max: [4, 2, 9], block: ground },
      { min: [4, 1, 8], max: [5, 2, 9], block: registry.blockIds.get(LIQUID)! },
    ],
  };
  const world = new World();
  const terrain = new CanonicalTerrain(world, createTerrainEvaluator(plan));
  const source: ColumnSource = {
    furnitureIn: () => [],
    lootPointsIn: () => [],
    supplySourcesIn: () => [],
    actorsIn: () => [],
  };
  const edited: Vec3[] = [];
  const session = createSession({
    registry,
    actorFigureFiles: stackActorFigureFiles(registry),
    world,
    scale,
    seed: plan.seed,
    start: 43_200,
    spawn: [2.5, 1, 5],
    terrainDestruction: { terrain, source },
    isSolid: (x, y, z) => registry.blocks[world.getBlock(x, y, z)]!.solid,
    isOpaque: (x, y, z) => registry.blocks[world.getBlock(x, y, z)]!.solid,
    ready: () => false,
    actorReady: () => true,
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
    onTerrainEdited: (cells) => edited.push(...cells),
    ...(restored ? { restore: restored } : {}),
  });
  const duration = burn.burnDurationGameMinutes / session.sim.clock.ratio;
  const step = session.sim.scheduler.stepOf('fire', 1);
  const ignite = (cell: Vec3, strength = burn.ignitionStrength + 1) => session.igniteTerrainCell(cell, strength);
  const block = (cell: Vec3) => registry.blocks[terrain.getBlock(...cell)]!.id;
  const tick = (seconds: number) => session.sim.scheduler.advance(seconds);
  const snapshot = () => session.snapshot({ worldId: 'fire-fixture', characterId: 'fire-character' });
  return { registry, world, terrain, session, burn, duration, step, ignite, block, tick, snapshot, edited };
};

const reload = async (f: ReturnType<typeof fixture>) => {
  const decoded = await decodeSave(await encodeFixture(f.snapshot()), {
    version: formatVersion,
    contentLookup: (...query) => contentLookup(f.registry, ...query),
  });
  return fixture(decoded.snapshot);
};

const settle = (f: ReturnType<typeof fixture>) => {
  for (let tick = 0; f.world.support.cascading && tick < 100; tick++) {
    f.tick(f.step);
  }
  if (f.world.support.cascading) {
    throw new Error('Fire fixture support did not settle');
  }
};

describe('cell fire owner', () => {
  it('uses a block burn override to preserve an oriented member instead of the material cube', () => {
    const f = fixture();
    const source = 'fixture_oriented_source';
    const result = 'fixture_oriented_char';
    const yieldId = 'fixture_char_yield';
    f.registry.items.set(yieldId, {
      id: yieldId,
      name: 'Fixture offcut',
      category: 'material',
      size: [1, 1],
      weight: 1,
      workInProgress: false,
    });
    for (const [id, material] of [
      [source, WOOD],
      [result, CHAR],
    ] as const) {
      f.registry.blockIds.set(id, f.registry.blocks.length);
      f.registry.blocks.push({
        id,
        material,
        name: id,
        color: '#555555',
        solid: true,
        opaque: false,
        loadPath: { kind: 'strut', bearing: '-z' },
        strut: { rise: '+z', widthBlocks: 0.2 },
        fallsTo: { yields: [{ item: yieldId, count: 1 }] },
        ...(id === source ? { burnsTo: result } : {}),
      });
    }
    f.world.setBlock(...POST, f.registry.blockIds.get(source)!);
    expect(f.ignite(POST)).toBe(true);
    f.world.fire.tick(f.terrain, f.registry, gameSeconds(f.burn.burnDurationGameMinutes), 1);
    expect(f.block(POST)).toBe(result);
    expect(f.registry.blocks[f.terrain.getBlock(...POST)]!.strut?.rise).toBe('+z');
  });
  it('ignites only above the authored material strength, including a non-timber material but not liquid or metal', () => {
    const f = fixture();
    expect(f.ignite(POST, f.burn.ignitionStrength)).toBe(false);
    expect(f.ignite(POST, f.burn.ignitionStrength / 2)).toBe(false);
    expect(f.ignite([3, 1, 8], Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(f.ignite([4, 1, 8], Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(f.world.fire.burning).toBe(false);
    expect(f.ignite(POST)).toBe(true);
    expect(f.ignite(OTHER)).toBe(true);
    expect(f.ignite(POST)).toBe(false);
  });

  it('burns for the material duration on the game clock and invalidates meshes on exhaustion', () => {
    const f = fixture();
    expect(f.ignite(POST)).toBe(true);
    f.tick(f.duration / 2);
    expect(f.world.fire.has(POST)).toBe(true);
    expect(f.block(POST)).toBe(WOOD);
    expect(f.edited).toEqual([]);
    f.tick(f.duration / 2 + f.step);
    expect(f.block(POST)).toBe(CHAR);
    expect(f.world.fire.has(POST)).toBe(false);
    expect(f.edited.length).toBeGreaterThan(0);
  });

  it('keeps a grounded burnt post but drops a burnt beam through ordinary support and clears char through take-apart', () => {
    const f = fixture();
    expect(f.ignite(POST)).toBe(true);
    expect(f.ignite(BEAM)).toBe(true);
    f.tick(f.duration + f.step);
    settle(f);
    expect(f.block(POST)).toBe(CHAR);
    expect(f.terrain.getBlock(...BEAM)).toBe(0);
    const fallen: Vec3 = [BEAM[0], 1, BEAM[2]];
    expect(f.block(fallen)).toBe(CHAR);
    const preview = f.session.crafting.previewTakeApartCell(fallen);
    expect(preview.refusal).toBeUndefined();
    expect(f.session.crafting.takeApartCell(fallen, preview.identity!)).toBeUndefined();
    const work = f.session.inventory.hands.right?.work;
    expect(work?.kind).toBe('cellDisassembly');
    f.tick(work!.duration / f.session.sim.clock.ratio + f.session.sim.scheduler.stepOf('long-action', 1));
    expect(f.terrain.getBlock(...fallen)).toBe(0);
  });

  it('caps visits and carries unvisited expired cells forward without starving the queue', () => {
    const f = fixture();
    const cap = [...f.registry.fireTuning.values()][0]!.cellsPerTick;
    expect(PATCH.length).toBeGreaterThan(cap);
    for (const cell of PATCH) {
      expect(f.ignite(cell)).toBe(true);
    }
    const first = f.world.fire.tick(f.terrain, f.registry, gameSeconds(0), cap);
    expect(first.visited).toBe(cap);
    const reordered = f.world.fire.snapshotState().entries.map((entry) => entry.cell);
    expect(reordered[0]).toEqual(PATCH[cap]);
    const expired = f.world.fire.tick(f.terrain, f.registry, f.burn.burnDurationGameMinutes, cap);
    expect(expired.visited).toBe(cap);
    expect(PATCH.filter((cell) => f.block(cell) === CHAR)).toHaveLength(cap);
    let visits = cap;
    for (let ticks = 0; f.world.fire.burning && ticks < PATCH.length; ticks++) {
      const result = f.world.fire.tick(f.terrain, f.registry, gameSeconds(0), cap);
      expect(result.visited).toBeLessThanOrEqual(cap);
      visits += result.visited;
    }
    expect(visits).toBe(PATCH.length);
    expect(f.world.fire.burning).toBe(false);
    expect(PATCH.every((cell) => f.block(cell) === CHAR)).toBe(true);
  });

  it('round-trips burning cells, capped queue order and remaining burn time independently of render residency', async () => {
    const live = fixture();
    for (const cell of PATCH) {
      expect(live.ignite(cell)).toBe(true);
    }
    live.tick(live.duration / 2);
    expect(live.world.isTouched(0, 0)).toBe(true);
    const saved = live.world.fire.snapshotState();
    const restored = await reload(live);
    expect(restored.world.fire.snapshotState()).toEqual(saved);
    const advance = live.duration / 2 + live.step * PATCH.length;
    live.tick(advance);
    restored.tick(advance);
    expect(restored.world.fire.burning).toBe(false);
    expect(restored.world.fire.snapshotState()).toEqual(live.world.fire.snapshotState());
    expect(PATCH.map(restored.block)).toEqual(PATCH.map(live.block));
    expect(PATCH.every((cell) => restored.block(cell) === CHAR)).toBe(true);
  });

  it('clears burning when another gameplay mutation replaces the cell', () => {
    const f = fixture();
    expect(f.ignite(POST)).toBe(true);
    expect(f.session.strikeTerrainCell(POST, { strength: 1000, kind: 'blunt' })).toBe(true);
    expect(f.world.fire.has(POST)).toBe(false);
  });
});
