import { describe, expect, it } from 'vitest';
import { debugGameHref } from '../src/siteMapGameLink.ts';

const at = { x: 1.5, z: -2 };

describe('site map debug-game link', () => {
  it('opens the game beside the map page, not at the origin root', () => {
    const href = new URL(
      debugGameHref(
        'https://example.test/skelly/map.html?view=satellite',
        { site: 'city', seed: 73, storeys: 4, density: 0.5 },
        at,
      ),
    );

    expect(href.pathname).toBe('/skelly/');
  });

  it('carries the site parameters the map was built from', () => {
    const href = new URL(
      debugGameHref('https://example.test/skelly/map.html', { site: 'city', seed: 73, storeys: 4, density: 0.5 }, at),
    );

    expect(Object.fromEntries(href.searchParams)).toEqual({
      site: 'city',
      seed: '73',
      debug: '1',
      at: '1.5,-2',
      storeys: '4',
      density: '0.5',
    });
  });

  it('omits density when the game uses the seeded field', () => {
    const href = new URL(
      debugGameHref('https://example.test/skelly/map.html', { site: 'city', seed: 73, storeys: 1, density: null }, at),
    );

    expect(href.searchParams.has('density')).toBe(false);
  });
});
