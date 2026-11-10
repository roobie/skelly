import { bundledModIdsFromUrl } from './bundledMods.ts';
import type { DebugStart, GameConfig } from './config.ts';

/** The ragdoll sweep runs only in the debug test house with its debug mod loaded, from the developer state's seed. */
export const sweepFromUrl = (
  query: URLSearchParams,
  ragdollSweep: number | undefined,
  config: GameConfig,
  viewer: DebugStart,
): Partial<GameConfig> => {
  if (
    config.debug &&
    config.site === 'testHouse' &&
    bundledModIdsFromUrl(query).includes('skelly.deadvox.scenario.test-house.debug') &&
    ragdollSweep !== undefined &&
    Number.isSafeInteger(ragdollSweep)
  ) {
    return { ragdollSweep, debugStart: { ...viewer } };
  }
  return {};
};
