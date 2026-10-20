import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import type { ItemEconomy, LootContext, LootSpawnPoint } from '../src/core/loot.ts';

export const fixtureEconomy = (): ItemEconomy => ({
  usage: ['Residential', 'Industrial', 'Medical', 'Hunting', 'Police', 'Military', 'Infected'],
  tiers: ['Tier1', 'Tier2', 'Tier3'],
});
export const fixtureLootContext = (): LootContext => ({ usage: ['Residential'], tier: 'Tier1' });

export const fixtureLootPoint = (
  supply: LootSpawnPoint['supply'],
  context: LootContext = fixtureLootContext(),
): LootSpawnPoint => ({
  id: 'fixture-point',
  channel: 'container',
  position: [0, 0, 0],
  destination: [0, 0, 0],
  context,
  supply,
  required: supply.kind === 'fixed',
});

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const fixtureEntry = (entry: unknown, section: string): unknown => {
  if (!object(entry)) {
    return entry;
  }
  if (section === 'items') {
    return { economy: fixtureEconomy(), ...entry };
  }
  if (section === 'templates') {
    return { lootContext: fixtureLootContext(), ...entry };
  }
  const { buildings } = entry;
  return {
    lootContext: fixtureLootContext(),
    ...entry,
    ...(Array.isArray(buildings)
      ? {
          buildings: buildings.map((building: unknown) =>
            object(building) ? { lootContext: fixtureLootContext(), ...building } : building,
          ),
        }
      : {}),
  };
};

/** Admission tests bypass this builder so missing metadata cannot be concealed. */
export const buildFixtureRegistry = (sources: readonly ContentSource[]) =>
  buildRegistry(
    sources.map((source) => {
      if (!object(source.data)) {
        return source;
      }
      const data = { ...source.data };
      for (const section of ['items', 'templates', 'layouts']) {
        const entries = data[section];
        if (Array.isArray(entries)) {
          data[section] = entries.map((entry: unknown) => fixtureEntry(entry, section));
        }
      }
      return { ...source, data };
    }),
  );
