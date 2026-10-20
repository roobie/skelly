import {
  makeConfig as buildConfig,
  configFromUrl as readConfig,
  siteFromUrl as readSite,
} from '../../src/game/config.ts';
import { startupContent } from '../baseRegistry.ts';

export const content = startupContent();
export const configFromUrl = (params: URLSearchParams) => readConfig(params, content);
export const makeConfig = (seed: number, radiusM: number, blockSize?: number) =>
  buildConfig(seed, radiusM, content, blockSize);
export const siteFromUrl = (
  params: URLSearchParams,
  fallback: string,
  registry: Parameters<typeof readSite>[2] = content.registry,
) => readSite(params, fallback, registry);
