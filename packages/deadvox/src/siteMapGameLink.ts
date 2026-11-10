import { writeHash } from './hashState.ts';

export interface DebugGameSite {
  site: string;
  seed: number;
  storeys: number;
  density: number | null;
}

/**
 * The debug game the map's "Open a fresh debug game here" link opens at a map point. The game sits beside the map page,
 * so the link resolves against the page rather than the origin, and carries the site parameters the map was built from:
 * the site setup in the query, and the seed, debug switch and start point in the hash, as the game reads them.
 */
export const debugGameHref = (pageHref: string, game: DebugGameSite, at: { x: number; z: number }): string => {
  const url = new URL('./', pageHref);
  url.searchParams.set('site', game.site);
  url.searchParams.set('storeys', String(game.storeys));
  if (game.density !== null) {
    url.searchParams.set('density', String(game.density));
  }
  url.hash = writeHash({ debug: true, seed: game.seed, at: [at.x, at.z] });
  return url.href;
};
