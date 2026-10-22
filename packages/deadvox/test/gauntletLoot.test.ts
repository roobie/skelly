import { describe, expect, it } from 'vitest';
import { GauntletSite } from '../src/core/gauntlet.ts';
import { lootPointStream, lootPointsByColumn, rollLootParts } from '../src/core/loot.ts';
import { BLOCK_SIZE, makeScale } from '../src/core/scale.ts';
import { lootSourcesOf } from '../src/core/site.ts';
import { firearmModelForType } from '../src/game/firearmHandling.ts';
import { startupContent } from './baseRegistry.ts';
import { GAUNTLET_SITE_MS } from './siteTimeouts.ts';

const { registry } = startupContent();
const scale = makeScale(BLOCK_SIZE);
const gauntlets = [...registry.scenarios.values()].filter((scenario) => scenario.kind === 'gauntlet');
const SEED = 1;

/** Everything a run's loot points deliver, fixed or rolled, as item type ids. */
const placedTypes = (seed: number, scenario: (typeof gauntlets)[number]): string[] => {
  const site = new GauntletSite({ seed, registry, scale, scenario });
  const sources = site.placements.flatMap((placement) =>
    lootSourcesOf(
      registry,
      'city',
      placement,
      site.plan.composition?.lootSources.find((source) => source.placement === placement)?.fixedLoot,
    ),
  );
  return [...lootPointsByColumn(sources).values()].flat().flatMap((point) => {
    const { fixed, rolled } = rollLootParts(registry, point, lootPointStream(seed, point));
    return [...fixed, ...rolled].map(({ type }) => type);
  });
};

// Rifle calibres are Military-only, so a table that names them under another context drops those rows silently.
describe('gauntlet loot reachability', () => {
  it(
    'places ammunition for every rifle it places, and a stab vest',
    () => {
      for (const scenario of gauntlets) {
        const placed = placedTypes(SEED, scenario);
        const ammoCalibres = new Set(
          placed.map((type) => {
            const item = registry.items.get(type);
            return item?.ammo?.calibre ?? registry.items.get(item?.unpack?.item ?? '')?.ammo?.calibre;
          }),
        );
        const rifles = placed.filter((type) => registry.items.get(type)?.firearm?.handling?.magazine !== undefined);
        expect(rifles.length, `${scenario.id} places a rifle`).toBeGreaterThan(0);
        for (const rifle of rifles) {
          const calibre = firearmModelForType(rifle, registry)?.gun?.calibre;
          expect(calibre, `${rifle} has a calibre`).toBeDefined();
          expect(ammoCalibres.has(calibre), `${scenario.id} places ${calibre} ammunition for ${rifle}`).toBe(true);
        }
        expect(placed, `${scenario.id} places a stab vest`).toContain('stab_vest');
      }
    },
    gauntlets.length * GAUNTLET_SITE_MS,
  );
});
