import { describe, expect, it, vi } from 'vitest';
import type { EntitySpec } from '../src/core/blockEntities.ts';
import { CanonicalTerrain } from '../src/core/canonicalTerrain.ts';
import { createColumnSupply } from '../src/core/columnSupply.ts';
import { CHUNK, toChunk, type Vec3 } from '../src/core/coords.ts';
import { ruinFurniture } from '../src/core/furnitureMove.ts';
import { Inventory } from '../src/core/inventory.ts';
import { PILE_GRID } from '../src/core/inventoryScale.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { makeScale } from '../src/core/scale.ts';
import { type ColumnSource, type FurnitureSpawn, SupplyFootprints } from '../src/core/site.ts';
import { simSeconds } from '../src/core/time.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { baseRegistry } from './baseRegistry.ts';
import { fixtureBlockMaterial } from './blockMaterialFixture.ts';
import { FIXTURE_MATERIAL, fixtureLootPoint } from './economyFixtures.ts';
import { capture, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const shelf: EntitySpec = { type: 'supply_fixture_shelf', pos: [CHUNK - 1, 2, 3], size: [3, 1, 1], facing: 'n' };
const second: EntitySpec = { ...shelf, pos: [CHUNK + 4, 2, 3] };
const loot = { type: 'supply_fixture_stock', count: 1, condition: 0.6 };
const ground = {
  ...fixtureLootPoint({ kind: 'fixed', items: [{ item: loot.type, count: 1 }] }),
  id: 'supply_fixture_ground',
  channel: 'ground' as const,
  position: [CHUNK + 5, 2, 4] as Vec3,
  destination: [CHUNK + 5, 2, 4] as Vec3,
};
const registryFixture = () => {
  const registry = baseRegistry();
  registry.blockIds.set('supply_fixture_floor', registry.blocks.length);
  registry.blocks.push({
    id: 'supply_fixture_floor',
    name: 'Floor',
    material: FIXTURE_MATERIAL,
    solid: true,
    color: '#888888',
  });
  registry.blockMaterials.set(FIXTURE_MATERIAL, fixtureBlockMaterial('supply_fixture_floor'));
  registry.items.set(loot.type, {
    id: loot.type,
    name: 'Stock',
    category: 'material',
    size: [1, 1],
    weight: 1,
    economy: { usage: [], tiers: [] },
    workInProgress: false,
    notLoot: false,
  });
  registry.furniture.set(shelf.type, {
    id: shelf.type,
    name: 'Shelf',
    size: shelf.size,
    color: '#888888',
    massKg: 1,
    breach: { minimumStrength: 1, durability: 8 },
    material: FIXTURE_MATERIAL,
    container: { pockets: [{ grid: [4, 2], handlingSimSeconds: simSeconds(0.1) }] },
  });
  return registry;
};
const fixture = () => {
  const registry = registryFixture();
  const inventory = new Inventory(registry);
  const consumed = new Set<string>();
  const owner = createColumnSupply(inventory, consumed, 7, 0.5);
  const spawns: FurnitureSpawn[] = [
    { spec: shelf, loot: [loot], fixedCount: 1, surfaceLoot: [{ ...loot, condition: 0.8 }], wear: 0.25 },
    { spec: second, loot: [loot], fixedCount: 1, wear: 0.5 },
  ];
  const footprints = new SupplyFootprints(
    spawns.map(({ spec }) => spec),
    [ground],
  );
  const source: ColumnSource = {
    furnitureIn: (cx, cz) => spawns.filter(({ spec }) => toChunk(spec.pos[0]) === cx && toChunk(spec.pos[2]) === cz),
    lootPointsIn: (cx, cz) => (toChunk(ground.destination[0]) === cx && cz === 0 ? [ground] : []),
    supplySourcesIn: (area) => footprints.in(area),
    zombiesIn: () => [],
  };
  return { registry, inventory, consumed, owner, source };
};
const owners = (inventory: Inventory) => ({
  state: inventory.snapshotState(),
  version: inventory.version,
  entityVersion: inventory.entities.version,
  standing: inventory.entities.standing,
});
const region = { x0: CHUNK, x1: CHUNK + 1, z0: 3, z1: 4 };

describe('authored supply projection', () => {
  it('closes a border footprint and projects all contents, wear, surfaces and ground without live writes', () => {
    const { inventory, consumed, owner, source } = fixture();
    const before = owners(inventory);
    expect(source.supplySourcesIn(region)).toEqual([[0, 0]]);
    const projection = owner.project(source);
    expect(projection.read(region)).toBe(true);
    const piece = projection.entity(projection.handle(0, 0, 0))!;
    expect(piece.pos).toEqual(shelf.pos);
    expect(piece.damage).toBe(2);
    expect(piece.pockets?.[0]?.[0]?.item).toMatchObject(loot);
    expect([...projection.inventory.piles.values()].map(({ items }) => items[0]!.item.condition)).toEqual([0.8, 1]);
    expect(projection.inventory.entities.at(...second.pos)).toBeDefined();
    expect(projection.read(region)).toBe(false);
    expect(owners(inventory)).toEqual(before);
    expect([...consumed]).toEqual([]);
  });

  it('discards speculative changes and allocations on refusal, then arrival generates the original supply once', () => {
    const refused = fixture();
    const supplied = fixture();
    supplied.owner.arrive(0, 0, supplied.source);
    supplied.owner.arrive(1, 0, supplied.source);
    const before = owners(refused.inventory);
    const projection = refused.owner.project(refused.source);
    projection.read(region);
    const piece = projection.entity(projection.handle(0, 0, 0))!;
    expect(piece.pockets?.[0]).toHaveLength(1);
    // Discard a private candidate, including an allocation a rejected planner made.
    projection.inventory.entities.destroy(piece);
    projection.inventory.create(loot.type);
    expect(owners(refused.inventory)).toEqual(before);
    expect([...refused.consumed]).toEqual([]);
    refused.owner.arrive(0, 0, refused.source);
    refused.owner.arrive(1, 0, refused.source);
    const state = refused.inventory.snapshotState();
    refused.owner.arrive(0, 0, refused.source);
    expect(refused.inventory.snapshotState()).toEqual(state);
    expect(state).toEqual(supplied.inventory.snapshotState());
  });

  it('refuses the same no-room ruin before or after supply arrival without consuming speculative keys', () => {
    const runs = [false, true].map((arriveFirst) => {
      const f = fixture();
      const large = 'supply_fixture_large_stock';
      const itemSize: [number, number] = [PILE_GRID.w + 1, PILE_GRID.h + 1];
      f.registry.items.set(large, { ...f.registry.items.get(loot.type)!, id: large, size: itemSize });
      const spec = { ...shelf, size: [10, 10, 1] as Vec3 };
      f.registry.furniture.set(shelf.type, {
        ...f.registry.furniture.get(shelf.type)!,
        size: spec.size,
        container: { pockets: [{ grid: itemSize, handlingSimSeconds: simSeconds(0.1) }] },
      });
      const source: ColumnSource = {
        ...f.source,
        furnitureIn: (cx, cz) =>
          cx === 0 && cz === 0 ? [{ spec, loot: [{ ...loot, type: large }], fixedCount: 1 }] : [],
        supplySourcesIn: (area) => new SupplyFootprints([spec], [ground]).in(area),
      };
      if (arriveFirst) {
        f.owner.arrive(0, 0, source);
        f.owner.arrive(1, 0, source);
      }
      const before = owners(f.inventory);
      const keysBefore = [...f.consumed];
      const projection = f.owner.project(source);
      projection.readColumn(1, 0);
      const piece = projection.inventory.entities.at(...spec.pos);
      const admitted =
        piece === undefined ||
        ruinFurniture(
          {
            inventory: projection.inventory,
            terrainSolid: (_x, y) => y < spec.pos[1],
            blockSize: 0.5,
            player: { pos: [-30, 2, 0], vel: [0, 0, 0], halfWidth: 0.4, height: 3.6, onGround: true },
            others: [],
            stamina: 100,
          },
          piece,
        ) !== undefined;
      expect(owners(f.inventory)).toEqual(before);
      expect([...f.consumed]).toEqual(keysBefore);
      expect(admitted).toBe(false);
      f.owner.arrive(0, 0, source);
      f.owner.arrive(1, 0, source);
      return f.inventory.snapshotState();
    });
    expect(runs[0]).toEqual(runs[1]);
  });

  it('rebuilds closure in source order and resolves stable entity and item handles to eventual owners', () => {
    const { inventory, owner, source } = fixture();
    const existing = inventory.furnish({ ...shelf, pos: [-4, 2, 3] }, [loot])!;
    const alias = existing.pockets![0]![0]!.item;
    const projection = owner.project(source);
    projection.include(1, 0);
    const handle = projection.handle(1, 0, 0);
    const itemHandle = projection.itemHandle(1, 0, 0);
    const firstUid = projection.entity(handle)!.uid;
    const earlierRevision = projection.revision;
    expect(projection.include(0, 0)).toBe(true);
    expect(() => projection.publish(earlierRevision, () => undefined)).toThrow('Supply closure changed');
    expect(projection.entity(handle)!.uid).not.toBe(firstUid);
    const expected = projection.inventory.snapshotState();
    const expectedItem = projection.item(itemHandle)!;
    const ensure = vi.fn();
    projection.publish(projection.revision, ensure, (live) => {
      expect(projection.entity(handle, live)).toBe(live.entities.at(...second.pos));
      expect(projection.item(itemHandle, live)).toBe(live.itemByUid(expectedItem.uid));
    });
    expect(ensure.mock.calls).toEqual([
      [0, 0],
      [1, 0],
    ]);
    expect(inventory.snapshotState()).toEqual(expected);
    expect(inventory.entities.byUid(existing.uid)).toBe(existing);
    expect(inventory.itemByUid(alias.uid)).toBe(alias);
    expect(existing.pockets![0]![0]!.item).toBe(alias);
  });

  it('matches the existing add refusal on collision without allocating contents, surface loot or wear', () => {
    const outcomes = [false, true].map((arriveFirst) => {
      const { inventory, consumed, owner, source } = fixture();
      const occupant = inventory.furnish(shelf, [{ ...loot, condition: 0.3 }])!;
      const before = owners(inventory);
      if (arriveFirst) {
        owner.arrive(0, 0, source);
      }
      const projection = owner.project(source);
      projection.include(0, 0);
      expect(projection.entity(projection.handle(0, 0, 0))).toBeUndefined();
      expect(owners(inventory)).toEqual(before);
      projection.publish(projection.revision, () => undefined);
      owner.arrive(0, 0, source);
      expect(inventory.entities.byUid(occupant.uid)).toBe(occupant);
      expect(inventory.piles.size).toBe(0);
      expect(inventory.factory.next).toBe(before.state.nextItemUid);
      expect(inventory.entities.next).toBe(before.state.entities.nextUid);
      expect(occupant.damage).toBeUndefined();
      expect([...consumed]).toEqual(['0,0']);
      return inventory.snapshotState();
    });
    expect(outcomes[0]).toEqual(outcomes[1]);
  });

  it('rejects stale publication before installing or allocating and leaves generation errors isolated', () => {
    const { inventory, consumed, owner, source } = fixture();
    const projection = owner.project(source);
    projection.include(0, 0);
    inventory.furnish({ ...shelf, pos: [-4, 2, 3] });
    const before = owners(inventory);
    const ensure = vi.fn();
    expect(() => projection.publish(projection.revision, ensure)).toThrow('Stale supply projection');
    expect(ensure).not.toHaveBeenCalled();
    expect(owners(inventory)).toEqual(before);
    const invalid = owner.project({
      ...source,
      furnitureIn: () => [
        {
          spec: shelf,
          loot: [{ ...loot, type: 'supply_fixture_missing' }],
          fixedCount: 1,
        },
      ],
    });
    expect(() => invalid.include(0, 0)).toThrow();
    expect(() => invalid.include(0, 0)).toThrow();
    expect(owners(inventory)).toEqual(before);
    expect([...consumed]).toEqual([]);
  });

  it('publishes an emptied source and empty keys, saves before arrival and never resurrects them', async () => {
    const { registry, source } = fixture();
    const runtime = createRuntime(undefined, false, [[8, 8]], { registry });
    const floor = registry.blockIds.get('supply_fixture_floor')!;
    const canonical = new CanonicalTerrain(runtime.world, {
      seed: 7,
      scale: makeScale(0.5),
      blocks: { grass: floor, dirt: floor, rock: floor, sand: floor, water: floor },
      shape: {
        minHeightMetres: 0.5,
        maxHeightMetres: 0.5,
        beachBelowMetres: 0,
        dirtDepthMetres: 1,
        featureSizeMetres: 1,
        octaves: 1,
      },
    });
    const projection = runtime.session.projectSupply(source);
    projection.read(region);
    projection.include(2, 0);
    const handle = projection.handle(0, 0, 0);
    const planned = projection.entity(handle)!;
    const contentUid = planned.pockets![0]![0]!.item.uid;
    const target: Vec3 = [3, 2, 3];
    const destination = projection.inventory.planAdd(planned.pockets![0]![0]!.item, { kind: 'pile', pos: target });
    expect(destination.ok).toBe(true);
    if (!(destination.ok && destination.at)) {
      throw new Error('Fixture drop has no destination');
    }
    projection.publish(
      projection.revision,
      (cx, cz) => canonical.ensureColumn(cx, cz),
      (live) => {
        const piece = projection.entity(handle, live)!;
        const placed = piece.pockets![0]![0]!;
        live.entities.destroy(piece);
        live.landLoose([{ placed, to: target, at: destination.at! }]);
      },
    );
    const saved = capture(runtime);
    expect(saved.world.rolledColumns).toEqual(expect.arrayContaining(['0,0', '1,0', '2,0']));
    const bytes = await encodeFixture(saved);
    const decoded = await decodeSave(bytes, {
      version: formatVersion,
      contentLookup: (kind, id, item) => contentLookup(registry, kind, id, item),
    });
    const restored = createRuntime(decoded.snapshot, false, [[8, 8]], { registry });
    const before = restored.inventory.snapshotState();
    expect(restored.world.snapshotColumns((id) => registry.blocks[id]!.id)).toEqual(saved.world.columns);
    for (const cx of [0, 1, 2]) {
      expect(restored.world.isTouched(cx, 0)).toBe(true);
    }
    const furnish = vi.spyOn(source, 'furnitureIn');
    for (const cx of [0, 1, 2]) {
      restored.session.onColumn(cx, 0, source);
    }
    expect(furnish).not.toHaveBeenCalled();
    expect(restored.inventory.snapshotState()).toEqual(before);
    expect(restored.inventory.entities.at(...shelf.pos)).toBeUndefined();
    expect(restored.inventory.itemByUid(contentUid)).toMatchObject(loot);
    expect([...restored.inventory.items()].filter(({ item }) => item.type === loot.type)).toHaveLength(4);
    expect(restored.inventory.entities.at(...second.pos)?.damage).toBe(4);
  });
});
