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

describe('gauntlet lab acid zombies', () => {
  it(
    'holds as many acid zombies on each lab storey as its depth',
    () => {
      for (const scenario of gauntlets) {
        const site = new GauntletSite({ seed: 1, registry, scale, scenario });
        const acid = site.placements.flatMap(placedSpawns).filter(({ zombie }) => zombie === 'acid_zombie');
        const perLevel = new Map<number, number>();
        for (const { pos } of acid) {
          perLevel.set(pos[1], (perLevel.get(pos[1]) ?? 0) + 1);
        }
        const counts = [...perLevel].sort(([a], [b]) => b - a).map(([, count]) => count);
        expect(counts.length, `${scenario.id} has acid zombies on more than one storey`).toBeGreaterThan(1);
        expect(counts, `${scenario.id} adds one acid zombie per storey down`).toEqual(
          counts.map((_, depth) => depth + 1),
        );
      }
    },
    gauntlets.length * GAUNTLET_SITE_MS,
  );
});
