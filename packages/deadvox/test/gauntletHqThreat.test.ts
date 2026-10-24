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
    'holds as many acid zombies on each numbered lab storey as its depth, and none in the sewer or elsewhere',
    () => {
      for (const scenario of gauntlets) {
        const site = new GauntletSite({ seed: 1, registry, scale, scenario });
        // The scenario's storey anchors number the lab from the entry down, independently of any marker, so a
        // storey that lost all its acid zombies still appears with its expected count.
        const storeys = site.plan.composition?.storeys ?? [];
        expect(storeys.length, `${scenario.id} numbers more than one lab storey`).toBeGreaterThan(1);
        const isAcid = ({ zombie }: { zombie: string }) => zombie === 'acid_zombie';
        const lab = site.placements.filter((placement) => placement.template.id === scenario.serviceTemplate);
        expect(lab.length, `${scenario.id} places the lab`).toBe(1);
        const labAcid = lab.flatMap(placedSpawns).filter(isAcid);
        storeys.forEach((storey, index) => {
          const count = labAcid.filter(({ pos }) => pos[1] === storey.standing[1]).length;
          expect(count, `${scenario.id} storey ${storey.id} at depth ${index + 1}`).toBe(index + 1);
        });
        const numbered = new Set(storeys.map((storey) => storey.standing[1]));
        expect(
          labAcid.filter(({ pos }) => !numbered.has(pos[1])).map(({ pos }) => pos[1]),
          `${scenario.id} acid zombies on unnumbered lab levels`,
        ).toEqual([]);
        const sewer = site.placements.filter((placement) => placement.template.id.includes('sewer'));
        const sewerMarkers = sewer.flatMap(placedSpawns);
        expect(sewerMarkers.length, `${scenario.id} sewer has threat markers to exclude`).toBeGreaterThan(0);
        expect(sewerMarkers.filter(isAcid).length, `${scenario.id} sewer acid zombies`).toBe(0);
        const outside = site.placements.filter((placement) => !(lab.includes(placement) || sewer.includes(placement)));
        expect(outside.flatMap(placedSpawns).filter(isAcid).length, `${scenario.id} acid zombies outside the lab`).toBe(
          0,
        );
      }
    },
    gauntlets.length * GAUNTLET_SITE_MS,
  );
});
