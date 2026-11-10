import { bundledModIdsFromUrl } from './bundledMods.ts';
import type { DebugStart, GameConfig } from './config.ts';

export const sweepFromUrl = (params: URLSearchParams, config: GameConfig, viewer: DebugStart): Partial<GameConfig> => {
  if (
    config.debug &&
    config.site === 'testHouse' &&
    bundledModIdsFromUrl(params).includes('skelly.deadvox.scenario.test-house.debug') &&
    params.has('ragdollSweep')
  ) {
    const seed = Number(params.get('ragdollSweep'));
    if (Number.isSafeInteger(seed)) {
      return { ragdollSweep: seed, debugStart: { ...viewer } };
    }
  }
  return {};
};
