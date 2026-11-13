import type { StartupContent } from '@skelly/engine/packs';
import {
  makeConfig as buildConfig,
  type DeveloperState,
  configFromUrl as readConfig,
  siteFromUrl as readSite,
  startForSite,
} from '@skelly/engine/session';
import { ragdollSweepViewer } from '../../src/product/ragdoll.ts';
import { startupContent } from '../baseRegistry.ts';

export const content = startupContent();
export const configFromUrl = (query: URLSearchParams | string = '', hash: DeveloperState = {}) =>
  readConfig(typeof query === 'string' ? new URLSearchParams(query) : query, hash, content, ragdollSweepViewer);
/**
 * `built` with its run starting from the default row of `site`, the content an admitted start mod copying that row
 * gives. Admitting a real start mod rebuilds the whole registry, so only a case that also admits other mods pays for it,
 * through `test/fixtures/siteRun.ts`, `siteRun`.
 */
export const startedOn = (built: StartupContent, site: string, debug = false): StartupContent => ({
  ...built,
  startModStart: startForSite(built, site, debug).id,
});
/** A run on `site`; `query` carries any other game parameters, such as `mods`. */
export const configOnSite = (site: string, hash: DeveloperState = {}, query = '') =>
  readConfig(new URLSearchParams(query), hash, startedOn(content, site, hash.debug === true), ragdollSweepViewer);
export const makeConfig = (seed: number, radiusM: number, blockSize?: number) =>
  buildConfig(seed, radiusM, content, blockSize);
export const siteFromUrl = (
  params: URLSearchParams,
  fallback: string,
  registry: Parameters<typeof readSite>[2] = content.registry,
  debug = false,
) => readSite(params, fallback, registry, debug);
