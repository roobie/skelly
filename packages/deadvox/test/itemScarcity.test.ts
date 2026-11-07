import { describe, expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { buildRegistry } from '../src/core/content.ts';
import { type LootSpawnPoint, rollLoot } from '../src/core/loot.ts';
import { Rng } from '../src/core/random.ts';

describe('product item scarcity', () => {
  it('derives an empty not-loot row from the unavailable-view mark, for an item no scarcity list names', () => {
    const { itemEconomy } = JSON.parse(
      compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/unavailable-view-economy.jsonnet'),
    ) as { itemEconomy: unknown };
    expect(itemEconomy).toEqual([{ id: 'fixture_unavailable_view_optic', notLoot: true, usage: [], tiers: [] }]);
  });

  it('rolls only the authored item row in its context while an item without a row still places by hand', () => {
    const stocked = 'fixture_stocked';
    const placed = 'fixture_hand_placed';
    const { registry, issues } = buildRegistry([
      {
        source: 'theme',
        data: {
          items: [stocked, placed].map((id) => ({
            id,
            name: id,
            category: 'misc',
            weight: 1,
            size: [1, 1],
            workInProgress: false,
          })),
          loot: [stocked, placed].map((id) => ({
            id,
            rolls: [1, 1],
            entries: [{ item: id, weight: 1 }],
          })),
        },
      },
      {
        source: 'product',
        data: { itemEconomy: [{ id: stocked, usage: ['Medical'], tiers: ['Tier2'], notLoot: false }] },
      },
    ]);
    expect(issues).toEqual([]);
    const point: LootSpawnPoint = {
      id: 'fixture_point',
      channel: 'ground',
      position: [0, 0, 0],
      destination: [0, 0, 0],
      context: { usage: ['Medical'], tier: 'Tier2' },
      supply: { kind: 'table', table: stocked },
      required: false,
    };
    const roll = (source: LootSpawnPoint) =>
      rollLoot(registry, source, Rng.stream(1, 'fixture')).map(({ type }) => type);
    expect(roll(point)).toEqual([stocked]);
    expect(roll({ ...point, context: { usage: ['Residential'], tier: 'Tier2' } })).toEqual([]);
    expect(roll({ ...point, context: { usage: ['Medical'], tier: 'Tier1' } })).toEqual([]);
    expect(roll({ ...point, supply: { kind: 'table', table: placed } })).toEqual([]);
    expect(roll({ ...point, supply: { kind: 'fixed', items: [{ item: placed }] }, required: true })).toEqual([placed]);
  });
});
