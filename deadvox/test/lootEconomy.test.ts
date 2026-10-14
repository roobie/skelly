import { safeParse } from 'valibot';
import { describe, expect, it } from 'vitest';
import {
  economyEligible,
  ItemEconomySchema,
  type LootContext,
  LootContextSchema,
  type LootPointSource,
  lootPointStream,
  lootPointsByColumn,
  lootSpawnPoint,
  militaryOnlyEconomy,
} from '../src/core/loot.ts';

const context: LootContext = { usage: ['Medical'], tier: 'Tier2' };
const source = (building: string, height: number): LootPointSource => ({
  site: 'fixture-site',
  building,
  anchor: [1, height, 2],
  channel: 'container',
  position: [1, height, 2],
  destination: [1, height, 2],
  context,
  supply: { kind: 'empty' },
  required: false,
});

describe('loot economy descriptions', () => {
  it('requires intersecting usage and exact tier membership, including explicit empty pools', () => {
    for (const row of [
      { usage: ['Medical'], tiers: ['Tier2'], eligible: true },
      { usage: ['Military', 'Medical'], tiers: ['Tier1', 'Tier2'], eligible: true },
      { usage: ['Industrial'], tiers: ['Tier2'], eligible: false },
      { usage: ['Medical'], tiers: ['Tier1', 'Tier3'], eligible: false },
      { usage: [], tiers: ['Tier2'], eligible: false },
      { usage: ['Medical'], tiers: [], eligible: false },
    ]) {
      const economy = safeParse(ItemEconomySchema, { usage: row.usage, tiers: row.tiers });
      expect(economy.success).toBe(true);
      if (!economy.success) {
        throw new Error('invalid fixture');
      }
      expect(economyEligible(economy.output, context)).toBe(row.eligible);
    }
  });

  it('rejects unknown, duplicate and missing authored metadata', () => {
    for (const economy of [
      { usage: ['Unknown'], tiers: ['Tier1'] },
      { usage: ['Medical', 'Medical'], tiers: ['Tier1'] },
      { usage: ['Medical'], tiers: ['Tier1', 'Tier1'] },
      { usage: ['Medical'], tiers: ['Unknown'] },
      { usage: ['Medical'] },
      { tiers: ['Tier1'] },
    ]) {
      expect(safeParse(ItemEconomySchema, economy).success).toBe(false);
    }
    expect(safeParse(LootContextSchema, { usage: ['Medical'] }).success).toBe(false);
  });

  it('does not classify multi-usage supplies as military-only', () => {
    expect(militaryOnlyEconomy({ usage: ['Military'], tiers: ['Tier2'] })).toBe(true);
    expect(militaryOnlyEconomy({ usage: ['Military', 'Medical'], tiers: ['Tier2'] })).toBe(false);
    expect(militaryOnlyEconomy({ usage: [], tiers: [] })).toBe(false);
  });

  it('keeps empty stacked points and their streams independent of enumeration order', () => {
    const sources = [source('first', 1), source('first', 5), source('second', 1)];
    const read = (input: readonly LootPointSource[]) =>
      [...lootPointsByColumn(input).values()]
        .flat()
        .map((point) => ({
          id: point.id,
          value: lootPointStream(43, point).next(),
          supply: point.supply,
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
    const forward = read(sources);
    expect(forward).toHaveLength(sources.length);
    expect(new Set(forward.map((point) => point.id)).size).toBe(sources.length);
    expect(forward.every((point) => point.supply.kind === 'empty')).toBe(true);
    expect(read([...sources].reverse())).toEqual(forward);
    expect(() => lootPointsByColumn([sources[0]!, sources[0]!])).toThrow('duplicate loot spawn point');
  });

  it('separates channels and preserves inherited tier under an explicit empty usage override', () => {
    const base = source('first', 1);
    const container = lootSpawnPoint(base);
    const surface = lootSpawnPoint({ ...base, channel: 'surface', usage: [] });
    expect(surface.id).not.toBe(container.id);
    expect(surface.context).toEqual({ usage: [], tier: base.context.tier });
  });
});
