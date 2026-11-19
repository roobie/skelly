// The one place browser scripts build a game page URL, so the query and hash format lives here; why:
// `packages/deadvox/docs/url-mods.md`, "Browser scripts and CI". Each stage owns the start data it passes.

import { VIEW_RADIUS_BOUNDS_M } from '@skelly/engine/session';
import { writeHash } from '../../src/hashState.ts';

/** @import { HashState } from '../../src/hashState.ts' */

/** The smallest view radius a page accepts, so startup generates the fewest columns. */
export const minimumViewRadiusM = VIEW_RADIUS_BOUNDS_M.min;

/**
 * Refuses a hash radius the page would not apply: the page silently loads its default world instead, so the stage
 * would pay for a world it did not ask for and check the wrong one.
 * @param {number | undefined} radius
 */
const assertViewRadiusApplies = (radius) => {
  const { min, max } = VIEW_RADIUS_BOUNDS_M;
  if (radius !== undefined && !(radius >= min && radius <= max)) {
    throw new RangeError(`A hash radius of ${radius} m is outside the page's ${min} to ${max} m view radii`);
  }
};

/**
 * @typedef {object} InlineStartMod
 * @property {string} id
 * @property {string} version
 * @property {'scenario'} tier
 * @property {false} product
 * @property {readonly string[]} dependencies
 * @property {[]} overrides
 * @property {[Record<string, unknown>]} starts
 * @property {readonly Record<string, unknown>[]} [layouts]
 */

/**
 * @typedef {object} InlineStartContent
 * @property {readonly string[]} [dependencies] The packs whose content the start's rows name.
 * @property {readonly Record<string, unknown>[]} [layouts] Site layouts the start's own rows add.
 */

/**
 * @typedef {object} GameUrlParts
 * @property {InlineStartMod | string} [startMod]
 * @property {readonly string[]} [mods]
 * @property {Readonly<Record<string, string | number>>} [harness]
 * @property {HashState} [hash]
 */

/**
 * A mod that supplies exactly one start row, for the game's `start-mod` query parameter.
 * @param {string} id
 * @param {Record<string, unknown>} start
 * @param {InlineStartContent} [content]
 * @returns {InlineStartMod}
 */
export const inlineStartMod = (id, start, { dependencies = [], layouts } = {}) => ({
  id,
  version: '1',
  tier: 'scenario',
  product: false,
  dependencies,
  overrides: [],
  starts: [start],
  ...(layouts ? { layouts } : {}),
});

/**
 * The hash keys a pixel stage that does not test the look sets, so the shipped look defaults do not decide its
 * cost. Weathering is per-fragment noise on every weatherable surface, which software rendering runs slowly
 * enough to push a render-heavy stage past its step limit; a stage that measures weathering sets its own value.
 * @type {Readonly<Pick<HashState, 'weathering'>>}
 */
export const stageLookBaseline = { weathering: 0 };

/**
 * The game page at `page`, an origin or the page's own address. `startMod` is inline mod data or a mod id; `mods`
 * lists committed mods by id; `harness` holds the other query switches; `hash` is the developer state.
 * @param {string} page
 * @param {GameUrlParts} [parts]
 * @returns {string}
 */
export const gameUrl = (page, { startMod, mods = [], harness = {}, hash = {} } = {}) => {
  const url = new URL(page);
  url.search = '';
  if (startMod !== undefined) {
    url.searchParams.set('start-mod', typeof startMod === 'string' ? startMod : JSON.stringify(startMod));
  }
  if (mods.length > 0) {
    url.searchParams.set('mods', mods.join(','));
  }
  for (const [name, value] of Object.entries(harness)) {
    url.searchParams.set(name, String(value));
  }
  assertViewRadiusApplies(hash.radius);
  url.hash = writeHash(hash);
  return url.href;
};
