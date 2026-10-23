import { describe, expect, it } from 'vitest';
import { GauntletSite } from '../src/core/gauntlet.ts';
import { BLOCK_SIZE, makeScale } from '../src/core/scale.ts';
import { placedGroundLoot, placedSpawns } from '../src/core/templates.ts';
import { startupContent } from './baseRegistry.ts';
import { GAUNTLET_SITE_MS } from './siteTimeouts.ts';

const { registry } = startupContent();
const scale = makeScale(BLOCK_SIZE);
const gauntlets = [...registry.scenarios.values()].filter((scenario) => scenario.kind === 'gauntlet');

describe('gauntlet crisis HQ threat and supplies', () => {
  it(
    'is guarded mostly by soldiers and has loot piles lying in its rooms',
    () => {
      expect(gauntlets.length, 'the registry has a gauntlet scenario').toBeGreaterThan(0);
      for (const scenario of gauntlets) {
        const site = new GauntletSite({ seed: 1, registry, scale, scenario });
        const hq = site.placements.filter((placement) => placement.template.id.includes('crisis_hq'));
        expect(hq.length, `${scenario.id} places the HQ`).toBeGreaterThan(0);
        const markers = hq.flatMap(placedSpawns);
        const soldiers = markers.filter(({ zombie }) => zombie === 'military_shambler').length;
        expect(soldiers, `${scenario.id} HQ soldier markers`).toBeGreaterThan(markers.length - soldiers);
        expect(hq.flatMap(placedGroundLoot).length, `${scenario.id} HQ loot piles`).toBeGreaterThan(0);
      }
    },
    gauntlets.length * GAUNTLET_SITE_MS,
  );
});
