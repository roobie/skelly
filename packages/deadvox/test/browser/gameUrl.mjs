// The one place browser scripts build a game page URL, so the query and hash format lives here; why:
// `packages/deadvox/docs/url-mods.md`, "Browser scripts and CI". Each stage owns the start data it passes.

import { writeHash } from '../../src/hashState.ts';

/** A mod that supplies exactly one start row, for the game's `start-mod` query parameter. */
export const inlineStartMod = (id, start) => ({
  id,
  version: '1',
  tier: 'scenario',
  product: false,
  dependencies: [],
  overrides: [],
  starts: [start],
});

/**
 * The game page at `page`, an origin or the page's own address. `startMod` is inline mod data or a mod id; `mods`
 * lists committed mods by id; `harness` holds the other query switches; `hash` is the developer state.
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
  url.hash = writeHash(hash);
  return url.href;
};
