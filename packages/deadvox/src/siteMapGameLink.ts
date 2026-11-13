import type { StartDef } from '@skelly/engine/content';
import { writeHash } from './hashState.ts';
import { linkStartMod } from './product/page.ts';

export interface DebugGameSite {
  /** The loaded default start of the site the map shows. */
  start: StartDef;
  seed: number;
}

/**
 * The debug game the map's "Open a fresh debug game here" link opens at a map point. The game sits beside the map page,
 * so the link resolves against the page rather than the origin, and carries the site's start as a start mod in the
 * query and the seed, debug switch and start point in the hash, as the game reads them.
 */
export const debugGameHref = (pageHref: string, game: DebugGameSite, at: { x: number; z: number }): string => {
  const url = new URL('./', pageHref);
  url.searchParams.set('start-mod', linkStartMod('link.site-map', { ...game.start, id: 'site_map_start' }));
  url.hash = writeHash({ debug: true, seed: game.seed, at: [at.x, at.z] });
  return url.href;
};
