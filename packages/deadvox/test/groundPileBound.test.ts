import { describe, expect, it } from 'vitest';
import type { ItemDef, Registry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { PILE_GRID } from '../src/core/inventoryScale.ts';
import type { LootContext } from '../src/core/loot.ts';
import { groundPileIssue } from '../src/core/pileBound.ts';
import { groundLootSupplyIssues } from '../src/core/placementLoot.ts';
import type { CompiledTemplate } from '../src/core/templates.ts';
import { baseRegistry } from './baseRegistry.ts';

type LootDef = typeof base.loot extends Map<string, infer T> ? T : never;

const base = baseRegistry();
const context: LootContext = { usage: ['Residential'], tier: 'Tier1' };
const economy = { usage: ['Residential'], tiers: ['Tier1'] } as ItemDef['economy'];
const cells = PILE_GRID.w * PILE_GRID.h;
const STACK_LIMIT = 20;
const CAP = 65_536;

const item = (id: string, size: [number, number], stack?: number): ItemDef =>
  ({ id, name: id, category: 'misc', weight: 1, size, economy, ...(stack === undefined ? {} : { stack }) }) as ItemDef;
const table = (id: string, rolls: [number, number], entries: LootDef['entries']): LootDef => ({ id, rolls, entries });

const registry: Registry = {
  ...base,
  items: new Map([
    ...base.items,
    ...[
      item('pile_fixture_unit', [1, 1]),
      item('pile_fixture_wide', [2, 1]),
      item('pile_fixture_tall', [1, 2]),
      item('pile_fixture_block', [PILE_GRID.w, PILE_GRID.h]),
      item('pile_fixture_stackable', [1, 1], STACK_LIMIT),
    ].map((def): [string, ItemDef] => [def.id, def]),
  ]),
  loot: new Map([
    ...base.loot,
    ...[
      table('pile_fixture_two_blocks', [2, 2], [{ item: 'pile_fixture_block', weight: 1 }]),
      table('pile_fixture_few_units', [3, 3], [{ item: 'pile_fixture_unit', weight: 1 }]),
      table(
        'pile_fixture_mixed_shapes',
        [4, 4],
        [
          { item: 'pile_fixture_wide', weight: 1 },
          { item: 'pile_fixture_tall', weight: 1 },
        ],
      ),
    ].map((def): [string, LootDef] => [def.id, def]),
  ]),
};

const issue = (supply: Parameters<typeof groundPileIssue>[1], stateCap = CAP) =>
  groundPileIssue(registry, supply, context, stateCap);

describe('ground pile bound', () => {
  it('refuses a supply whose worst case overfills one pile and names its table', () => {
    const message = issue({ kind: 'table', table: 'pile_fixture_two_blocks' });
    expect(message).toContain('pile_fixture_two_blocks');
    expect(message).toContain('overfill');
  });

  it('accepts a supply that fits one pile', () => {
    expect(issue({ kind: 'table', table: 'pile_fixture_few_units' })).toBeUndefined();
  });

  it('reports a supply past the state cap as unproven, never accepted', () => {
    const message = issue({ kind: 'table', table: 'pile_fixture_mixed_shapes' }, 3);
    expect(message).toContain('unproven');
    expect(issue({ kind: 'table', table: 'pile_fixture_mixed_shapes' })).toBeUndefined();
  });

  it('refuses fixed stock of one stackable that play would merge, because merging is not credited', () => {
    const stock = Array.from({ length: cells + 1 }, () => ({ item: 'pile_fixture_stackable' }));
    const inventory = new Inventory(registry);
    const pos: [number, number, number] = [0, 0, 0];
    for (const { item: type } of stock) {
      expect(inventory.add(inventory.create(type), { kind: 'pile', pos })).toBe(true);
    }
    const message = issue({ kind: 'fixed', items: stock });
    expect(message).toContain('overfill');
    expect(message).toContain('does not credit stack merging');
    expect(issue({ kind: 'fixed', items: stock.slice(1) })).toBeUndefined();
  });

  it('counts hand-placed fixed stock that never spawns, alone and beside a table roll', () => {
    const never = { ...item('pile_fixture_never', [1, 1]), economy: { usage: [], tiers: [] } } as ItemDef;
    const withNever: Registry = { ...registry, items: new Map([...registry.items, [never.id, never]]) };
    const stocked = (count: number, rolled?: string) =>
      groundPileIssue(
        withNever,
        { kind: 'fixed', items: [{ item: never.id, count }], ...(rolled === undefined ? {} : { table: rolled }) },
        context,
        CAP,
      );
    expect(stocked(cells)).toBeUndefined();
    expect(stocked(cells + 1)).toContain('overfill');
    // The table's three units no longer fit beside stock that already fills all but two cells.
    expect(stocked(cells - 3, 'pile_fixture_few_units')).toBeUndefined();
    expect(stocked(cells - 2, 'pile_fixture_few_units')).toContain('overfill');
  });

  it('reports an overfilling ground anchor through template validation', () => {
    const anchored = (tableId: string) =>
      groundLootSupplyIssues(registry, {
        lootContext: context,
        groundLoot: [{ pos: [0, 0, 0], supply: { kind: 'table', table: tableId } }],
      } as unknown as CompiledTemplate);
    expect(anchored('pile_fixture_few_units')).toEqual([]);
    const issues = anchored('pile_fixture_two_blocks');
    expect(issues.map(([path]) => path)).toEqual(['.groundLoot[0].supply']);
    expect(issues[0]![1]).toContain('overfill');
  });
});
