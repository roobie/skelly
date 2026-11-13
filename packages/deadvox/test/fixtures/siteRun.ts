import { bundledModIdsFromUrl, selectBundledMods, startModFromUrl } from '@skelly/engine/packs';
import { configFromUrl, type DeveloperState, type GameConfig, startForSite } from '@skelly/engine/session';
import { productModIntake } from '../../src/product/mods.ts';
import { linkStartMod } from '../../src/product/page.ts';
import { ragdollSweepViewer } from '../../src/product/ragdoll.ts';
import { withReusedBuilds } from '../bundledContentReuse.ts';
import { content } from './startupContent.ts';

interface SiteRunOptions {
  /** "HH:MM"; without it the run keeps the site default row's own time. */
  readonly time?: string;
  /** Bundled mods the link also names in `mods`. */
  readonly mods?: readonly string[];
  /** Further mod data admitted beside them. */
  readonly additional?: Parameters<typeof selectBundledMods>[2];
}

/**
 * A run on `site`, started the way a stage or launcher link starts one: a `start-mod` copying the site's default row,
 * admitted with any `mods` through bundled-mod selection. A refused mod throws, so a case never runs the default world
 * by accident. A case that admits no other mod uses the cheaper `test/fixtures/startupContent.ts`, `configOnSite`.
 * This lives apart from that fixture because it loads the product's bundled packs.
 */
export const siteRun = (
  site: string,
  hash: DeveloperState = {},
  { time, mods = [], additional = [] }: SiteRunOptions = {},
): GameConfig => {
  const query = new URLSearchParams(mods.length > 0 ? { mods: mods.join(',') } : {});
  const start = { ...startForSite(content, site, true), id: 'test_site_start' };
  query.set('start-mod', linkStartMod('test.site-start', start, time));
  const { issues, content: admitted } = withReusedBuilds(() =>
    selectBundledMods(productModIntake, bundledModIdsFromUrl(query), additional, startModFromUrl(query)),
  );
  if (issues.length > 0) {
    throw new Error(`Run on ${site} refused: ${JSON.stringify(issues)}`);
  }
  const config = configFromUrl(query, hash, admitted, ragdollSweepViewer);
  if (config.site !== site) {
    throw new Error(`Run meant for ${site} started on ${config.site}`);
  }
  return config;
};
