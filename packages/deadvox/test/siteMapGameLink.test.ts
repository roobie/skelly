import { describe, expect, it } from 'vitest';
import { readPageUrl } from '../src/pageUrl.ts';
import { debugGameHref } from '../src/siteMapGameLink.ts';
import { configFromUrl } from './fixtures/startupContent.ts';

const at = { x: 1.5, z: -2 };

describe('site map debug-game link', () => {
  it('opens the game beside the map page, not at the origin root', () => {
    const href = new URL(
      debugGameHref('https://example.test/skelly/map.html?view=satellite', { site: 'city', seed: 73 }, at),
    );

    expect(href.pathname).toBe('/skelly/');
  });

  it('opens a link the game accepts, with the site, seed and start point the map was built from', () => {
    const href = new URL(debugGameHref('https://example.test/skelly/map.html', { site: 'city', seed: 73 }, at));
    const { query, hash, refused } = readPageUrl(href.search, href.hash);
    expect(refused).toBeUndefined();
    expect(configFromUrl(query, hash)).toMatchObject({
      site: 'city',
      seed: 73,
      debug: true,
      debugStart: { x: at.x, z: at.z },
    });
  });
});
