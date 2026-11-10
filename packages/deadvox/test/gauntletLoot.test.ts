import { describe, expect, it } from 'vitest';
import { lootPointStream, lootPointsByColumn, rollLootParts } from '../../engine/src/core/loot.ts';
import { ScenarioCitySite } from '../../engine/src/core/scenarioCity.ts';
import { lootSourcesOf } from '../../engine/src/core/site.ts';
import { magazineFits } from '../../engine/src/inventory.ts';
import { BLOCK_SIZE, makeScale } from '../../engine/src/world.ts';
import { firearmModelForType } from '../src/game/firearmHandling.ts';
import { startupContent } from './baseRegistry.ts';
import { defaultStartOf } from './fixtures/scenario.ts';

const { registry } = startupContent();
const scale = makeScale(BLOCK_SIZE);
const gauntlets = [...registry.scenarios.values()].filter((scenario) => scenario.kind === 'assembledCity');
const SEED = 1;

/** Everything a run's loot points deliver, fixed or rolled, as item types with their stack counts. */
const placedStacks = (seed: number, scenario: (typeof gauntlets)[number]): { type: string; count: number }[] => {
  const site = new ScenarioCitySite({ seed, registry, scale, scenario, start: defaultStartOf(registry, scenario) });
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
    return [...fixed, ...rolled].map(({ type, count }) => ({ type, count }));
  });
};

/** The calibre a type loads as, whether a loose cartridge or a box of them. */
const ammoCalibreOf = (type: string): string | undefined => {
  const item = registry.items.get(type);
  return item?.ammo?.calibre ?? registry.items.get(item?.unpack?.item ?? '')?.ammo?.calibre;
};

/** How many cartridges a stack delivers once unpacked. */
const roundsOf = ({ type, count }: { type: string; count: number }): number =>
  count * (registry.items.get(type)?.unpack?.count ?? 1);

// Rifle calibres are Military-only, so a table that names them under another context drops those rows silently.
describe('gauntlet loot reachability', () => {
  it('places compatible magazines and ammunition for every rifle it places, and a stab vest', () => {
    expect(gauntlets.length, 'the registry has a gauntlet scenario').toBeGreaterThan(0);
    for (const scenario of gauntlets) {
      const stacks = placedStacks(SEED, scenario);
      const placed = stacks.map(({ type }) => type);
      const rounds = new Map<string | undefined, number>();
      for (const stack of stacks) {
        const calibre = ammoCalibreOf(stack.type);
        rounds.set(calibre, (rounds.get(calibre) ?? 0) + roundsOf(stack));
      }
      const rifles = placed.filter((type) => registry.items.get(type)?.firearm?.handling?.magazine !== undefined);
      expect(rifles.length, `${scenario.id} places a rifle`).toBeGreaterThan(0);
      for (const rifle of rifles) {
        const calibre = firearmModelForType(rifle, registry)?.gun?.calibre;
        expect(calibre, `${rifle} has a calibre`).toBeDefined();
        const magazines = placed.filter((type) => magazineFits(registry, rifle, type));
        expect(magazines.length, `${scenario.id} places a magazine for ${rifle}`).toBeGreaterThan(0);
        expect(rounds.get(calibre) ?? 0, `${scenario.id} places ${calibre} ammunition for ${rifle}`).toBeGreaterThan(0);
      }
      expect(placed, `${scenario.id} places a stab vest`).toContain('stab_vest');
    }
  });
});
