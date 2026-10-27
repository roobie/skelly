export interface DebugGameSite {
  site: string;
  seed: number;
  storeys: number;
  density: number | null;
}

/**
 * The debug game the map's "Open a fresh debug game here" link opens at a map point. The game sits beside the map page,
 * so the link resolves against the page rather than the origin, and carries the site parameters the map was built from.
 */
export const debugGameHref = (pageHref: string, game: DebugGameSite, at: { x: number; z: number }): string => {
  const url = new URL('./', pageHref);
  url.searchParams.set('site', game.site);
  url.searchParams.set('seed', String(game.seed));
  url.searchParams.set('storeys', String(game.storeys));
  if (game.density !== null) {
    url.searchParams.set('density', String(game.density));
  }
  url.searchParams.set('debug', '1');
  url.searchParams.set('at', `${at.x},${at.z}`);
  return url.href;
};
