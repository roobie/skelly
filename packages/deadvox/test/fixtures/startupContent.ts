import {
  makeConfig as buildConfig,
  type DeveloperState,
  configFromUrl as readConfig,
  siteFromUrl as readSite,
} from '@skelly/engine/session';
import { ragdollSweepViewer } from '../../src/product/ragdoll.ts';
import { startupContent } from '../baseRegistry.ts';

export const content = startupContent();
export const configFromUrl = (query: URLSearchParams | string = '', hash: DeveloperState = {}) =>
  readConfig(typeof query === 'string' ? new URLSearchParams(query) : query, hash, content, ragdollSweepViewer);
export const makeConfig = (seed: number, radiusM: number, blockSize?: number) =>
  buildConfig(seed, radiusM, content, blockSize);
export const siteFromUrl = (
  params: URLSearchParams,
  fallback: string,
  registry: Parameters<typeof readSite>[2] = content.registry,
  debug = false,
) => readSite(params, fallback, registry, debug);
