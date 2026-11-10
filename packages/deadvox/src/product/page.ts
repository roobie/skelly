// What play asks of the game page, built from the one URL reader, so presentation never reads the URL.

import type { PlayPage } from '@skelly/presentation/play';
import { tutorialUrl } from '@skelly/presentation/tutorialUrl';
import { type HashState, writeHash } from '../hashState.ts';
import { pageUrl } from '../pageUrl.ts';

/** The hash keys the practice tutorial keeps from the page it leaves or enters. */
export const tutorialHash = ({ radius, actors }: HashState): string =>
  writeHash({ ...(radius === undefined ? {} : { radius }), ...(actors === undefined ? {} : { actors }) });

/** The page for a new world from `seed`: the query without its start time, and the hash with the new seed. */
export const newWorldHref = (href: string, hash: HashState, seed: number): string => {
  const url = new URL(href);
  url.searchParams.delete('time');
  url.hash = writeHash({ ...hash, seed });
  return url.href;
};

/** The page again with debug on and the camera and freeze dropped, so a stashed replay starts from its own view. */
export const replayHref = (href: string, { cam: _cam, freeze: _freeze, ...hash }: HashState): string => {
  const url = new URL(href);
  url.hash = writeHash({ ...hash, debug: true });
  return url.href;
};

export const playPage = (): PlayPage => {
  const { query, hash } = pageUrl();
  return {
    debugError: query.get('debug-error') === '1',
    // The hash is read again at each link, so it carries what the debug tools wrote back since startup.
    leaveTutorial: () => location.assign(tutorialUrl(location.href, false, tutorialHash(pageUrl().hash))),
    newWorld: (seed) => location.assign(newWorldHref(location.href, pageUrl().hash, seed)),
    reloadForReplay: () => location.assign(replayHref(location.href, pageUrl().hash)),
    reviewMapHref: new URL('map.html', location.href).href,
    probes: {
      torchspill: hash.torchspill,
      mannequin: hash.mannequin,
      mannequinWear: hash.mannequinWear,
      avatarStudy: hash.avatarStudy,
    },
  };
};
