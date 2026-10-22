import { describe, expect, it } from 'vitest';
import { GauntletSite } from '../src/core/gauntlet.ts';
import { economyEligible, type LootContext, withLootDepth } from '../src/core/loot.ts';
import { BLOCK_SIZE, makeScale } from '../src/core/scale.ts';
import { placedGroundLoot, placedPieces } from '../src/core/templates.ts';
import { startupContent } from './baseRegistry.ts';
import { GAUNTLET_SITE_MS } from './siteTimeouts.ts';

const { registry } = startupContent();
const scale = makeScale(BLOCK_SIZE);
const TIERS = ['Tier1', 'Tier2', 'Tier3'] as const;

/** The tiers a source in this context can roll, found by asking whether an item of each tier alone would be admitted. */
const rollableTiers = (context: LootContext): string[] =>
  TIERS.filter((tier) => economyEligible({ usage: context.usage, tiers: [tier] }, context));

describe('gauntlet lab loot tiers by depth', () => {
  it(
    'lets a deeper level roll the lowest tier and a higher one besides, while level one rolls the lowest alone',
    () => {
      const scenario = [...registry.scenarios.values()].find((candidate) => candidate.kind === 'gauntlet')!;
      const site = new GauntletSite({ seed: 1, registry, scale, scenario });
      const sources = site.placements
        .flatMap((placement) =>
          [...placedPieces(placement), ...placedGroundLoot(placement)]
            .filter((source) => source.lootDepth !== undefined)
            .map((source) => ({
              y: source.pos[1],
              tiers: rollableTiers(
                withLootDepth(placement.lootContext ?? placement.template.lootContext, source.lootDepth),
              ),
            })),
        )
        .sort((a, b) => b.y - a.y);
      expect(sources.length, 'lab sources carry a tier range').toBeGreaterThan(0);
      const top = sources[0]!;
      const bottom = sources.at(-1)!;
      expect(top.tiers, 'the top level rolls the lowest tier alone').toEqual([TIERS[0]]);
      expect(bottom.tiers.length, 'a deeper level rolls a higher tier').toBeGreaterThan(top.tiers.length);
      for (const tier of top.tiers) {
        expect(bottom.tiers, 'a deeper level keeps the lower tiers').toContain(tier);
      }
    },
    GAUNTLET_SITE_MS,
  );
});
