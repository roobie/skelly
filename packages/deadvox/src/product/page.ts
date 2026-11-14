// What play asks of the game page, built from the one URL reader, so presentation never reads the URL.

import type { StartDef } from '@skelly/engine/content';
import type { PlayPage } from '@skelly/presentation/play';
import { type HashState, writeHash } from '../hashState.ts';
import { pageUrl } from '../pageUrl.ts';

/** The hash keys the practice link keeps from the page it is on. */
export const tutorialHash = ({ radius, actors }: HashState): string =>
  writeHash({ ...(radius === undefined ? {} : { radius }), ...(actors === undefined ? {} : { actors }) });

const clockText = (secondsOfDay: number): string => {
  const minutes = Math.round(secondsOfDay / 60);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

/**
 * `start-mod` data for a link that starts from `start`, a loaded row the caller has given a new id, at `time`
 * ("HH:MM") or the row's own time. Loading turned the row's time into seconds, so it is written back as authored
 * text. The row is no longer its site's default, since a second default for a site is a content error.
 */
export const linkStartMod = (
  id: string,
  { defaultForSite: _defaultForSite, startTimeGameTimeOfDay, ...start }: StartDef,
  time = startTimeGameTimeOfDay === undefined ? undefined : clockText(startTimeGameTimeOfDay),
): string =>
  JSON.stringify({
    id,
    version: '1',
    tier: 'scenario',
    product: false,
    dependencies: [],
    overrides: [],
    starts: [{ ...start, ...(time === undefined ? {} : { startTimeGameTimeOfDay: time }) }],
  });

/** The page for a new world from `seed`: the same query, and the hash with the new seed. */
export const newWorldHref = (href: string, hash: HashState, seed: number): string => {
  const url = new URL(href);
  url.hash = writeHash({ ...hash, seed });
  return url.href;
};

/** The page again with debug on and the camera and freeze dropped, so a stashed replay starts from its own view. */
export const replayHref = (href: string, { cam: _cam, freeze: _freeze, ...hash }: HashState): string => {
  const url = new URL(href);
  url.hash = writeHash({ ...hash, debug: true });
  return url.href;
};

/** The game page. */
export const playPage = (): PlayPage => {
  const { query, hash } = pageUrl();
  return {
    debugError: query.get('debug-error') === '1',
    // The hash is read again at each link, so it carries what the debug tools wrote back since startup.
    newWorld: (seed) => location.assign(newWorldHref(location.href, pageUrl().hash, seed)),
    reloadForReplay: () => location.assign(replayHref(location.href, pageUrl().hash)),
    reviewMapHref: new URL('map.html', location.href).href,
    probes: {
      torchspill: hash.torchspill,
      gpuRays: hash.gpuRays,
      mannequin: hash.mannequin,
      mannequinWear: hash.mannequinWear,
      avatarStudy: hash.avatarStudy,
    },
  };
};
