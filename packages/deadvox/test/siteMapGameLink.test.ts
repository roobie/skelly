import { selectBundledMods, startModFromUrl } from '@skelly/engine/packs';
import { startForSite } from '@skelly/engine/session';
import { describe, expect, it } from 'vitest';
import { readPageUrl } from '../src/pageUrl.ts';
import { productModIntake } from '../src/product/mods.ts';
import { debugGameHref } from '../src/siteMapGameLink.ts';
import { configFromUrl, content } from './fixtures/startupContent.ts';

const at = { x: 1.5, z: -2 };
const start = startForSite(content, 'playtest', true);

describe('site map debug-game link', () => {
  it('opens the game beside the map page, not at the origin root', () => {
    const href = new URL(debugGameHref('https://example.test/skelly/map.html?view=satellite', { start, seed: 73 }, at));

    expect(href.pathname).toBe('/skelly/');
  });

  it('opens a link the game accepts, with the site start, seed and start point the map was built from', () => {
    const href = new URL(debugGameHref('https://example.test/skelly/map.html', { start, seed: 73 }, at));
    const { query, hash, refused } = readPageUrl(href.search, href.hash);
    expect(refused).toBeUndefined();
    const selection = selectBundledMods(productModIntake, [], [], startModFromUrl(query));
    expect(selection.issues).toEqual([]);
    const linked = selection.content.registry.starts.get(selection.content.startModStart!)!;
    expect(linked).toMatchObject({ site: start.site, kit: start.kit });
    expect(linked.startTimeGameTimeOfDay).toBe(start.startTimeGameTimeOfDay);
    expect(configFromUrl(query, hash)).toMatchObject({
      seed: 73,
      debug: true,
      debugStart: { x: at.x, z: at.z },
    });
  });
});
