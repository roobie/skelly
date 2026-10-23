import { buildRegistry, type ContentSource } from '../src/core/content.ts';
import type { ItemEconomy, LootContext, LootSpawnPoint } from '../src/core/loot.ts';
import { simSeconds } from '../src/core/time.ts';

export const fixtureEconomy = (): ItemEconomy => ({
  usage: ['Residential', 'Industrial', 'Medical', 'Hunting', 'Police', 'Military', 'Infected'],
  tiers: ['Tier1', 'Tier2', 'Tier3'],
});
export const fixtureLootContext = (): LootContext => ({ usage: ['Residential'], tier: 'Tier1' });
/** A breach for fixture furniture whose strength no test reads; content needs one on every piece. */
export const fixtureBreach = () => ({ minimumStrength: 1, durability: 1 });
/** A material for fixture furniture whose damage look no test reads; content needs one on every piece. */
export const FIXTURE_MATERIAL = 'fixture_material';
/** The material table entry `FIXTURE_MATERIAL` names, for a fixture registry built without base content. */
export const fixtureMaterials = () => [{ id: FIXTURE_MATERIAL, blowSound: FIXTURE_BLOW_SOUND, methods: [] }];
/** The sound a blow on fixture furniture makes; materials must name one that alerts hearing. */
export const FIXTURE_BLOW_SOUND = 'fixture_blow';
export const fixtureSounds = () => [
  {
    id: FIXTURE_BLOW_SOUND,
    description: 'fixture blow',
    variants: ['assets/audio/fixture-blow.ogg'],
    gain: 1,
    pitchJitter: [1, 1] as [number, number],
    gainJitter: [1, 1] as [number, number],
    minIntervalSimSeconds: simSeconds(0),
    category: 'world' as const,
    noise: { enabled: true, radiusMetres: 10 },
  },
];
/** A content file holding only `fixtureMaterials`, to go first so a fixture that authors its own overrides it. */
export const fixtureMaterialSource = (): ContentSource => ({
  source: 'fixture-materials.json',
  data: { furnitureMaterials: fixtureMaterials(), sounds: fixtureSounds() },
});

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
    return { economy: fixtureEconomy(), workInProgress: false, notLoot: false, ...entry };
  }
  if (section === 'templates') {
    return { lootContext: fixtureLootContext(), ...entry };
  }
  if (section === 'furniture') {
    return { breach: fixtureBreach(), material: FIXTURE_MATERIAL, ...entry };
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

/** The fixture material file, then `sources` with the metadata content requires filled in. */
export const fixtureSources = (sources: readonly ContentSource[]): ContentSource[] => [
  fixtureMaterialSource(),
  ...sources.map((source) => {
    if (!object(source.data)) {
      return source;
    }
    const data = { ...source.data };
    for (const section of ['items', 'templates', 'layouts', 'furniture']) {
      const entries = data[section];
      if (Array.isArray(entries)) {
        data[section] = entries.map((entry: unknown) => fixtureEntry(entry, section));
      }
    }
    return { ...source, data };
  }),
];

/** Admission tests bypass this builder so missing metadata cannot be concealed. */
export const buildFixtureRegistry = (sources: readonly ContentSource[]) => buildRegistry(fixtureSources(sources));
