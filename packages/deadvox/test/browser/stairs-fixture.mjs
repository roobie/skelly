// The stairs scene fixture shared by the camo and lighting stages and the main first-mesh reference, so every
// run that compares their evidence lands on the same authored geometry. The main reference boots main's code
// over branch content, so its fixture reaches the branch-owned site stamper and scenario templates, not any
// overlay; see `test/browser/sky-main-arrival.mjs`, `measureMainFirstMesh`.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative browser contract assertions.
import assert from 'node:assert/strict';

const SITE_STAMP_ANCHOR = '    const s = scale.blockSize;';

export const RAISED_CABIN = { template: 'stairs_cabin', position: [82, 27, 55], rotation: 0 };
// Keep the witness near the stairs lighting route; the remote wall incurred chunk streaming before its captures.
export const CAMO_WITNESS = { template: 'stairs_camo_witness', position: [75, 21, 60], rotation: 0 };

/** Add the camo witness template to the stairs scenario's templates, so the fixture building can load it. */
export function addCamoWitnessTemplate(source) {
  const content = JSON.parse(source);
  const floor = new Array(8).fill('########');
  const walls = ['########', ...new Array(6).fill('c......#'), '########'];
  content.templates.push({
    id: 'stairs_camo_witness',
    lootContext: { usage: ['Residential'], tier: 'Tier1' },
    size: [8, 4, 8],
    palette: { '#': 'stone', c: 'camo_woodland', '.': 'air' },
    layers: [floor, walls, walls, new Array(8).fill('........')],
  });
  return JSON.stringify(content);
}

/** Append `fixture` to the stamped site layout, as one more authored building. */
export function injectSiteFixture(source, fixture) {
  assert.equal(source.split(SITE_STAMP_ANCHOR).length, 2);
  return source.replace(
    SITE_STAMP_ANCHOR,
    `${SITE_STAMP_ANCHOR}\n    const siteFixture = ${JSON.stringify(fixture)};\n    layout = {...layout, buildings: [...layout.buildings, siteFixture]};`,
  );
}
