import { expect, it } from 'vitest';
import { pileDropSound } from '../src/core/dropSounds.ts';
import { Inventory } from '../src/core/inventory.ts';
import { settleCell } from '../src/core/itemThrow.ts';
import { World } from '../src/core/world.ts';
import { spawnDebugItem } from '../src/debug/spawnItem.ts';
import { baseRegistry } from './baseRegistry.ts';

const fixture = (floor: boolean) => {
  const registry = baseRegistry();
  const type = 'fixture_debug_item';
  registry.items.set(type, {
    id: type,
    name: 'Fixture item',
    category: 'misc',
    size: [1, 1],
    weight: 1,
    workInProgress: false,
  });
  const inventory = new Inventory(registry);
  const world = new World();
  const block = registry.blocks.findIndex((entry) => entry.solid);
  if (floor) {
    world.setBlock(2, 0, 2, block);
  }
  const solid = (x: number, y: number, z: number) => registry.blocks[world.getBlock(x, y, z)]!.solid;
  inventory.landing = (cell) => settleCell(cell, 1, 0, solid);
  return { registry, type, inventory, world, solid };
};

it('debug spawning above air leaves a pile with an admitted sound receiver below', () => {
  const f = fixture(true);
  spawnDebugItem(f.inventory, f.type, [2, 5, 2]);
  const location = [...f.inventory.items()].find(({ item }) => item.type === f.type)?.location;
  expect(location?.kind).toBe('pile');
  if (location?.kind !== 'pile') {
    throw new Error('Fixture item was not spawned');
  }
  const { pos } = location.pile;
  expect(f.solid(pos[0], pos[1] - 1, pos[2])).toBe(true);
  expect(() =>
    pileDropSound(f.registry, f.type, pos, {
      blockIdAt: (x, y, z) => f.world.getBlock(x, y, z),
      entities: f.inventory.entities,
      vehicles: f.inventory.vehicles,
      blockSize: 1,
    }),
  ).not.toThrow();
});

it('debug spawn with no ground refuses without changing items or allocators', () => {
  const f = fixture(false);
  const before = f.inventory.snapshotState();
  spawnDebugItem(f.inventory, f.type, [2, 5, 2]);
  expect(f.inventory.snapshotState()).toEqual(before);
});
