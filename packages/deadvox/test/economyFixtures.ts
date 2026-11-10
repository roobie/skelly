import baseItemWear from '../../mods/skelly.inventory/item-wear.json' with { type: 'json' };
import naturalSounds from '../../mods/skelly.natural-world/natural-sounds.json' with { type: 'json' };
import playerFamilies from '../../mods/skelly.sound-families/sound-families.json' with { type: 'json' };
import baseUi from '../../mods/skelly.ui/ui.json' with { type: 'json' };
import baseUiSounds from '../../mods/skelly.ui/ui-sounds.json' with { type: 'json' };
import baseSounds from '../mods/skelly.deadvox.actors/actors-sounds.json' with { type: 'json' };
import type { ItemEconomy, LootContext, LootSpawnPoint } from '../src/core/loot.ts';
import { simSeconds } from '../src/core/time.ts';
import { buildRegistry, type ContentSource } from '../src/engine/content.ts';
import { fixtureBlockMaterial } from './blockMaterialFixture.ts';

import { fixtureDamageContent } from './fixtures/damageKinds.ts';

export const fixtureEconomy = (): ItemEconomy => ({
  usage: ['Residential', 'Industrial', 'Medical', 'Hunting', 'Police', 'Military', 'Infected'],
  tiers: ['Tier1', 'Tier2', 'Tier3'],
});
/** Scarcity rows admitting `ids` in every fixture context; a fixture item without one never spawns randomly. */
export const fixtureItemEconomy = (...ids: readonly string[]) =>
  ids.map((id) => ({ id, ...fixtureEconomy(), notLoot: false }));
export const fixtureLootContext = (): LootContext => ({ usage: ['Residential'], tier: 'Tier1' });
/** A breach for fixture furniture whose strength no test reads; content needs one on every piece. */
export const fixtureBreach = () => ({ minimumStrength: 1, durability: 1 });
/** A material for fixture furniture whose damage look no test reads; content needs one on every piece. */
export const FIXTURE_MATERIAL = 'fixture_material';
/** The material table entry `FIXTURE_MATERIAL` names, for a fixture registry built without base content. */
export const fixtureMaterials = () => [
  { id: FIXTURE_MATERIAL, blowSound: FIXTURE_BLOW_SOUND, drops: { default: FIXTURE_BLOW_SOUND }, methods: [] },
];
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
/**
 * Base content's core UI entry and the refusal sound it names: the game reads its action text from there, and
 * copying the lines into a fixture would only drift. JSON imports keep this module loadable by browser proofs.
 */
const BASE_UI = (() => {
  const [ui] = baseUi.ui;
  const sound = baseUiSounds.sounds.find(({ id }) => id === ui!.refusalSound)!;
  return { ui: [ui], sound };
})();
const fixtureUi = () => structuredClone(BASE_UI);
/** `fixtureMaterials` and the core UI entry, to go first so a fixture that authors its own overrides them. */
export const fixtureMaterialSource = (): ContentSource => {
  const { ui, sound } = fixtureUi();
  return {
    source: 'fixture-materials.json',
    data: {
      ...fixtureDamageContent(),
      soundFamilies: structuredClone([...playerFamilies.soundFamilies, ...baseSounds.soundFamilies]),
      furnitureMaterials: fixtureMaterials(),
      itemWear: structuredClone(baseItemWear.itemWear),
      sounds: [...fixtureSounds(), sound, naturalSounds.sounds.find((entry) => entry.id === 'item_drop_wood')!],
      ui,
      recipeCategories: [{ id: 'fixture_category', label: 'Fixture', order: 0 }],
    },
  };
};

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

const FIXTURE_ID = /^[a-z0-9_]+$/;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const fixtureEntry = (entry: unknown, section: string): unknown => {
  if (!object(entry)) {
    return entry;
  }
  if (section === 'blocks') {
    return { material: FIXTURE_MATERIAL, drops: { default: FIXTURE_BLOW_SOUND }, ...entry };
  }
  if (section === 'recipes') {
    return { category: 'fixture_category', tags: [], searchTerms: [], ...entry };
  }
  if (section === 'items') {
    return {
      workInProgress: false,
      ...entry,
      ...(object(entry.vehicle) ? { vehicle: { drops: { default: FIXTURE_BLOW_SOUND }, ...entry.vehicle } } : {}),
    };
  }
  if (section === 'templates') {
    return { lootContext: fixtureLootContext(), ...entry };
  }
  if (section === 'furniture') {
    return { breach: fixtureBreach(), material: FIXTURE_MATERIAL, massKg: 1, ...entry };
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
    if (
      Array.isArray(data.blocks) &&
      data.blocks.some((entry: unknown) => object(entry) && entry.material === undefined)
    ) {
      const solid = data.blocks.find(
        (entry: unknown) =>
          object(entry) && entry.solid === true && typeof entry.id === 'string' && FIXTURE_ID.test(entry.id),
      );
      if (object(solid) && typeof solid.id === 'string') {
        data.blockMaterials ??= [fixtureBlockMaterial(solid.id)];
      }
    }
    for (const section of ['blocks', 'items', 'templates', 'layouts', 'furniture', 'recipes']) {
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
