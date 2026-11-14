import { CanonicalTerrain, installColumn } from '@skelly/engine/internal/core/canonicalTerrain.ts';
import { blockId } from '@skelly/engine/internal/core/content.ts';
import { coreMessage } from '@skelly/engine/internal/core/coreText.ts';
import { rubbleClearWork } from '@skelly/engine/internal/core/rubble.ts';
import type { ColumnSource } from '@skelly/engine/internal/core/site.ts';
import type { BlockBox } from '@skelly/engine/internal/core/structure.ts';
import { PILE_GRID } from '@skelly/engine/inventory';
import { decodeSave, type SaveSnapshot } from '@skelly/engine/save';
import { createSession, IDLE } from '@skelly/engine/session';
import { CHUNK, createTerrainEvaluator, type TerrainPlan, toChunk, type Vec3, World } from '@skelly/engine/world';
import { contentLookup } from '@skelly/presentation/ui';
import { expect, it } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { fixtureBlockMaterial } from './blockMaterialFixture.ts';
import { encodeFixture, formatVersion } from './snapshotTestSupport.ts';

// One wall and its fallen form share a material, as authored rubble does: the wall names the rubble block in
// `fallsTo`, the rubble block's break yield is the material's, and only the rubble block clears by take apart.
const wallType = 'rubble_fixture_wall';
const rubbleType = 'rubble_fixture_rubble';
const stock = 'rubble_fixture_stock';
const crateType = 'rubble_fixture_crate';
const scale = { blockSize: 0.5, minCy: 0, maxCy: 0 };
const cell: Vec3 = [CHUNK - 4, 1, 7];
const above: Vec3 = [cell[0], cell[1] + 1, cell[2]];
const spawn: Vec3 = [CHUNK - 4, 1, 8];

const fixtureRegistry = () => {
  const registry = baseRegistry();
  for (const [id, name, color] of [
    [wallType, 'Wall', '#888888'],
    [rubbleType, 'Rubble', '#777777'],
  ] as const) {
    registry.blockIds.set(id, registry.blocks.length);
    registry.blocks.push({ id, name, material: 'rubble_fixture', solid: true, color });
  }
  registry.blockMaterials.set('rubble_fixture', {
    ...fixtureBlockMaterial(rubbleType),
    breakable: true,
    rubble: [{ item: stock, count: 1 }],
  });
  registry.items.set(stock, {
    id: stock,
    name: 'Stock',
    category: 'material',
    size: [PILE_GRID.w, PILE_GRID.h],
    weight: 1,
    workInProgress: false,
  });
  registry.furniture.set(crateType, {
    id: crateType,
    name: 'Crate',
    size: [1, 1, 1],
    color: '#888888',
    massKg: 1,
    breach: { minimumStrength: 1, durability: 8 },
    material: 'wood',
  });
  return registry;
};

const fixture = (restored?: Readonly<SaveSnapshot>) => {
  const registry = fixtureRegistry();
  const world = new World();
  const rubble = blockId(registry, rubbleType);
  const structures: BlockBox[] = [{ min: cell, max: [cell[0] + 1, cell[1] + 1, cell[2] + 1], block: rubble }];
  const terrain: TerrainPlan = {
    seed: 7,
    scale,
    blocks: {
      grass: blockId(registry, wallType),
      dirt: blockId(registry, wallType),
      rock: blockId(registry, wallType),
      sand: blockId(registry, wallType),
      water: blockId(registry, wallType),
    },
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
        concrete: blockId(registry, wallType),
        structures: [],
      },
    },
    structures,
  };
  const evaluator = createTerrainEvaluator(terrain);
  const canonical = new CanonicalTerrain(world, evaluator);
  const source: ColumnSource = {
    furnitureIn: () => [],
    lootPointsIn: () => [],
    supplySourcesIn: () => [],
    actorsIn: () => [],
  };
  const issues: string[] = [];
  const session = createSession({
    registry,
    actorFigureFiles: stackActorFigureFiles(registry),
    world,
    scale,
    seed: 7,
    start: 43_200,
    spawn,
    terrainDestruction: { terrain: canonical, source },
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
    onRestoreIssue: (issue) => issues.push(issue),
    ...(restored ? { restore: restored } : {}),
  });
  const { inventory } = session;
  if (restored) {
    session.sim.paused = false;
  } else {
    installColumn(world, evaluator.generateColumn(toChunk(cell[0]), toChunk(cell[2])));
  }
  const snapshot = () => session.snapshot({ worldId: 'rubble-fixture', characterId: 'rubble-character' });
  const roundTrip = async () => {
    const decoded = await decodeSave(await encodeFixture(snapshot()), {
      version: formatVersion,
      contentLookup: (kind, id, item) => contentLookup(registry, kind, id, item),
    });
    return decoded.snapshot;
  };
  return { registry, world, session, inventory, rubble, snapshot, roundTrip, issues };
};

const stockCount = (inventory: ReturnType<typeof fixture>['inventory']): number =>
  [...inventory.items()].filter(({ item }) => item.type === stock).reduce((total, { item }) => total + item.count, 0);

const handWork = (inventory: ReturnType<typeof fixture>['inventory']) =>
  [inventory.hands.left, inventory.hands.right]
    .filter((item) => item !== undefined)
    .find((item) => item.work?.kind === 'cellDisassembly')?.work;

it('clearing a rubble cell yields its material break yield and frees the cell', () => {
  const f = fixture();
  const work = rubbleClearWork(f.registry, rubbleType);
  expect(work).toBeDefined();
  // Rubble is a full solid cell until it is cleared: it blocks paths and sight like any wall.
  expect(f.world.getBlock(...cell)).toBe(f.rubble);
  expect(f.registry.blocks[f.rubble]!.solid).toBe(true);
  expect(f.session.crafting.takeApartCell(cell)).toBeUndefined();
  const clear = handWork(f.inventory)!;
  expect(clear.kind).toBe('cellDisassembly');
  f.session.sim.scheduler.advance(Math.ceil(clear.duration / f.session.sim.clock.ratio) + 1);
  expect(f.world.getBlock(...cell)).toBe(0);
  expect(f.world.rubble.snapshotState().entries).toEqual([]);
  expect(stockCount(f.inventory)).toBe(work!.outputs.reduce((total, output) => total + output.count, 0));
  expect(handWork(f.inventory)).toBeUndefined();
});

it('keeps a clearing paused while something rests on the rubble', () => {
  const f = fixture();
  expect(f.session.crafting.takeApartCell(cell)).toBeUndefined();
  const clear = handWork(f.inventory)!;
  const crate = f.inventory.furnish({ type: crateType, pos: [...above], size: [1, 1, 1], facing: 'n' });
  expect(crate).toBeDefined();
  f.session.sim.scheduler.advance(Math.ceil(clear.duration / f.session.sim.clock.ratio) + 1);
  // The crate above keeps its floor: the clearing waits in hand until the crate leaves.
  expect(f.world.getBlock(...cell)).toBe(f.rubble);
  expect(handWork(f.inventory)).toBe(clear);
  f.inventory.entities.remove(crate!);
  const { uid } = [f.inventory.hands.left, f.inventory.hands.right]
    .filter((item) => item !== undefined)
    .find((item) => item.work?.kind === 'cellDisassembly')!;
  expect(f.session.crafting.act(uid, 'continue')).toBeUndefined();
  f.session.sim.scheduler.advance(Math.ceil(clear.duration / f.session.sim.clock.ratio) + 1);
  expect(f.world.getBlock(...cell)).toBe(0);
  expect(stockCount(f.inventory)).toBeGreaterThan(0);
});

it('ends a pinned episode when any block change replaces the cell', () => {
  const f = fixture();
  expect(f.session.crafting.takeApartCell(cell)).toBeUndefined();
  f.world.setBlock(cell[0], cell[1], cell[2], blockId(f.registry, wallType));
  const clear = handWork(f.inventory)!;
  f.session.sim.scheduler.advance(Math.ceil(clear.duration / f.session.sim.clock.ratio) + 1);
  // The wall that replaced the rubble is not rubble: the job's target is gone, and no new job starts on the wall.
  expect(f.world.getBlock(...cell)).toBe(blockId(f.registry, wallType));
  expect(handWork(f.inventory)).toBe(clear);
  expect(f.session.crafting.takeApartCell(cell)).toBe(coreMessage(f.registry, 'rubbleGone'));
});

it('restores a clearing job and its pinned episode through a save round-trip', async () => {
  const f = fixture();
  expect(f.session.crafting.takeApartCell(cell)).toBeUndefined();
  const clear = handWork(f.inventory)!;
  f.session.sim.scheduler.advance(clear.duration / f.session.sim.clock.ratio / 2);
  const saved = await f.roundTrip();
  const reloaded = fixture(saved);
  // The pinned episode survived the round-trip: the job still names it, and the cell still stands rubble.
  const restored = handWork(reloaded.inventory)!;
  expect(restored).toEqual(clear);
  expect(reloaded.world.getBlock(...cell)).toBe(reloaded.rubble);
  reloaded.session.sim.scheduler.advance(Math.ceil(clear.duration / reloaded.session.sim.clock.ratio) + 1);
  expect(reloaded.world.getBlock(...cell)).toBe(0);
  expect(stockCount(reloaded.inventory)).toBeGreaterThan(0);
});

it('drops restored rubble episodes that no longer stand on rubble', async () => {
  const f = fixture();
  expect(f.session.crafting.takeApartCell(cell)).toBeUndefined();
  const saved = structuredClone(await f.roundTrip());
  // The forged entry is corrupt only in where it stands: its epoch is valid and unused below `nextEpoch`,
  // so the standing-rubble check is the only rule that can drop it.
  saved.world.rubble = {
    nextEpoch: saved.world.rubble.nextEpoch + 1,
    entries: [...saved.world.rubble.entries, { cell: [cell[0], 5, cell[2]], epoch: saved.world.rubble.nextEpoch }],
  };
  const reloaded = fixture(saved);
  expect(reloaded.world.rubble.snapshotState().entries).toEqual([{ cell: [...cell], epoch: 1 }]);
  expect(reloaded.issues.some((issue) => issue.includes('rubble episode'))).toBe(true);
});
