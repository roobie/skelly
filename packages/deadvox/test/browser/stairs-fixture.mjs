// The stairs scene fixtures. The camo and lighting stages share theirs with the main first-mesh reference, so every
// run that compares their evidence lands on the same authored geometry. The main reference boots main's code
// over branch content, so its fixture reaches the branch-owned site stamper and scenario templates, not any
// overlay; see `test/browser/sky-main-arrival.mjs`, `measureMainFirstMesh`.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: imperative browser contract assertions.
import assert from 'node:assert/strict';

/** @import { Vec3 } from '@skelly/engine/world' */

/** @typedef {{ template: string; position: Vec3; rotation: number }} SiteFixture */

const SITE_STAMP_ANCHOR = '    const s = scale.blockSize;';

/** @type {SiteFixture} */
export const RAISED_CABIN = { template: 'stairs_cabin', position: [82, 27, 55], rotation: 0 };
// Keep the witness near the stairs lighting route; the remote wall incurred chunk streaming before its captures.
/** @type {SiteFixture} */
export const CAMO_WITNESS = { template: 'stairs_camo_witness', position: [75, 21, 60], rotation: 0 };

// The traversal stage's door checks need a doorway no actor can reach; see `TROUBLESHOOTING.md`, "Browser stages".
/** @type {SiteFixture} */
export const DOOR_WITNESS = { template: 'stairs_door_witness', position: [56, 21, 49], rotation: 0 };

/**
 * Add `template` to the stairs scenario's templates, so a fixture building can load it.
 * @param {string} source
 * @param {Record<string, unknown>} template
 */
const addTemplate = (source, template) => {
  const content = JSON.parse(source);
  content.templates.push({ lootContext: { usage: ['Residential'], tier: 'Tier1' }, ...template });
  return JSON.stringify(content);
};

/**
 * Add the camo witness template to the stairs scenario's templates, so the fixture building can load it.
 * @param {string} source
 */
export function addCamoWitnessTemplate(source) {
  const floor = new Array(8).fill('########');
  const walls = ['########', ...new Array(6).fill('c......#'), '########'];
  return addTemplate(source, {
    id: CAMO_WITNESS.template,
    size: [8, 4, 8],
    palette: { '#': 'stone', c: 'camo_woodland', '.': 'air' },
    layers: [floor, walls, walls, new Array(8).fill('........')],
  });
}

/**
 * Add the door witness template: one ordinary door in a free-standing wall, on a floor wide enough for the stage's
 * approach on either side.
 * @param {string} source
 */
export function addDoorWitnessTemplate(source) {
  const open = new Array(7).fill('......');
  /** @param {string} wall */
  const wallLayer = (wall) => open.map((row, index) => (index === 3 ? wall : row));
  return addTemplate(source, {
    id: DOOR_WITNESS.template,
    size: [6, 6, 7],
    palette: { '#': 'stone', w: 'brick', D: { furniture: 'wood_door' }, '.': 'air' },
    layers: [new Array(7).fill('######'), ...new Array(4).fill(wallLayer('wwDDww')), wallLayer('wwwwww')],
  });
}

/**
 * Append `fixture` to the stamped site layout, as one more authored building.
 * @param {string} source
 * @param {SiteFixture} fixture
 */
export function injectSiteFixture(source, fixture) {
  assert.equal(source.split(SITE_STAMP_ANCHOR).length, 2);
  return source.replace(
    SITE_STAMP_ANCHOR,
    `${SITE_STAMP_ANCHOR}\n    const siteFixture = ${JSON.stringify(fixture)};\n    layout = {...layout, buildings: [...layout.buildings, siteFixture]};`,
  );
}
