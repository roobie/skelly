import { describe, expect, it } from 'vitest';
import type { ItemDef } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { type Item, weightOf } from '../src/core/items.ts';
import { simSeconds } from '../src/core/time.ts';
import { baseRegistry } from './baseRegistry.ts';
import { FIXTURE_MATERIAL, fixtureBreach } from './economyFixtures.ts';

const base = baseRegistry();
const pocket = (owner: Item) => ({ kind: 'pocket', owner, pocket: 0 }) as const;
const fixture = () => {
  const registry = { ...base, items: new Map(base.items), furniture: new Map(base.furniture) };
  const plain: ItemDef = {
    id: 'fixture_plain',
    name: 'Plain',
    category: 'material',
    weight: 3,
    size: [1, 1],
    economy: { usage: [], tiers: [] },
  };
  for (const [id, size, grid, rigid] of [
    ['fixture_bag', [2, 2], [4, 4], false],
    ['fixture_case', [2, 2], [2, 2], true],
    ['fixture_large_case', [4, 4], [4, 4], true],
  ] as const) {
    registry.items.set(id, {
      ...plain,
      id,
      name: id,
      size: [...size],
      container: { rigid, pockets: [{ grid: [...grid], handlingSimSeconds: simSeconds(0.1) }] },
    });
  }
  registry.items.set(plain.id, plain);
  registry.furniture.set('fixture_cabinet', {
    id: 'fixture_cabinet',
    name: 'Cabinet',
    size: [1, 1, 1],
    color: '#ffffff',
    container: { pockets: [{ grid: [4, 4], handlingSimSeconds: simSeconds(0.1) }] },
    breach: fixtureBreach(),
    material: FIXTURE_MATERIAL,
  });
  const inv = new Inventory(registry);
  const floor = (type: string) => {
    const item = inv.create(type);
    if (!inv.add(item, { kind: 'pile', pos: [inv.piles.size, 0, 0] })) {
      throw new Error('Cannot place nesting fixture');
    }
    return item;
  };
  const furniture = inv.entities.add({ type: 'fixture_cabinet', pos: [0, 0, 1], size: [1, 1, 1], facing: 'n' })!;
  inv.entities.markSearched(furniture);
  return { inv, registry, floor, furniture };
};

describe('container nesting', () => {
  it('moves a loaded rigid case between a bag and furniture, preserving contents and weight through a save', () => {
    const { inv, registry, floor, furniture } = fixture();
    const bag = floor('fixture_bag');
    const hardCase = floor('fixture_case');
    const plain = floor('fixture_plain');
    const expectedWeight = [bag, hardCase, plain].reduce((sum, item) => sum + weightOf(registry, item), 0);
    expect(inv.move(plain, pocket(hardCase)).ok).toBe(true);
    expect(inv.move(hardCase, pocket(bag)).ok).toBe(true);
    expect(inv.locate(plain)).toMatchObject({ kind: 'pocket', owner: hardCase });
    expect(weightOf(registry, bag)).toBe(expectedWeight);
    const restored = Inventory.restoreState(registry, inv.snapshotState());
    expect(restored.snapshotState()).toEqual(inv.snapshotState());
    expect(inv.move(hardCase, { kind: 'furniture', entity: furniture, pocket: 0 }).ok).toBe(true);
    expect(inv.move(hardCase, pocket(bag)).ok).toBe(true);
  });

  it('refuses loaded soft bags in bags and furniture but allows them in piles', () => {
    const { inv, floor, furniture } = fixture();
    const bag = floor('fixture_bag');
    const other = floor('fixture_bag');
    const plain = floor('fixture_plain');
    expect(inv.move(plain, pocket(bag)).ok).toBe(true);
    expect(inv.move(bag, pocket(other)).ok).toBe(false);
    expect(inv.move(bag, { kind: 'furniture', entity: furniture, pocket: 0 }).ok).toBe(false);
    expect(inv.move(bag, { kind: 'pile', pos: [10, 0, 0] }).ok).toBe(true);
    expect(inv.move(plain, { kind: 'pile', pos: [11, 0, 0] }).ok).toBe(true);
    expect(inv.move(bag, pocket(other)).ok).toBe(true);
    expect(inv.move(plain, pocket(bag)).ok).toBe(false);
  });

  it('refuses a loaded case inside a case even when both footprints fit', () => {
    const { inv, floor } = fixture();
    const outer = floor('fixture_large_case');
    const inner = floor('fixture_case');
    expect(inv.move(floor('fixture_plain'), pocket(inner)).ok).toBe(true);
    const before = inv.snapshotState();
    expect(inv.move(inner, pocket(outer)).ok).toBe(false);
    expect(inv.snapshotState()).toEqual(before);
  });

  it.each(['fixture_case', 'fixture_bag'])('refuses filling an empty %s already inside a case', (type) => {
    const { inv, floor } = fixture();
    const outer = floor('fixture_large_case');
    const inner = floor(type);
    expect(inv.move(inner, pocket(outer)).ok).toBe(true);
    expect(inv.move(floor('fixture_plain'), pocket(inner)).ok).toBe(false);
  });

  it('lets a case already in a bag take plain items but not loaded containers', () => {
    const { inv, floor } = fixture();
    const bag = floor('fixture_bag');
    const outer = floor('fixture_large_case');
    const inner = floor('fixture_case');
    expect(inv.move(outer, pocket(bag)).ok).toBe(true);
    expect(inv.move(floor('fixture_plain'), pocket(outer)).ok).toBe(true);
    expect(inv.move(floor('fixture_plain'), pocket(inner)).ok).toBe(true);
    expect(inv.move(inner, pocket(outer)).ok).toBe(false);
  });

  it('applies loaded-case rules to swaps as well as empty-cell placement', () => {
    const { inv, floor } = fixture();
    const bag = floor('fixture_bag');
    const outer = floor('fixture_large_case');
    const inner = floor('fixture_case');
    const bagToken = floor('fixture_plain');
    const caseToken = floor('fixture_plain');
    expect(inv.move(bagToken, pocket(bag)).ok).toBe(true);
    expect(inv.move(caseToken, pocket(outer)).ok).toBe(true);
    expect(inv.move(floor('fixture_plain'), pocket(inner)).ok).toBe(true);
    const at = { x: 0, y: 0, rotated: false };
    expect(inv.move(inner, { ...pocket(bag), at }).ok).toBe(true);
    expect(inv.locate(bagToken)?.kind).toBe('pile');
    expect(inv.move(inner, { ...pocket(outer), at }).ok).toBe(false);
    expect(inv.locate(caseToken)).toMatchObject({ kind: 'pocket', owner: outer });
  });

  it('refuses oversized containers and ownership cycles', () => {
    const { inv, floor } = fixture();
    const outer = floor('fixture_large_case');
    const inner = floor('fixture_case');
    expect(inv.move(outer, pocket(inner)).ok).toBe(false);
    expect(inv.move(inner, pocket(inner)).ok).toBe(false);
    expect(inv.move(inner, pocket(outer)).ok).toBe(true);
    expect(inv.move(outer, pocket(inner)).ok).toBe(false);
  });
});
