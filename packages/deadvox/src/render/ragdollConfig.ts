// biome-ignore lint/correctness/noUndeclaredDependencies: @mobgen is a workspace source alias.
import ragdoll from '@mobgen/mob/ragdoll.json' with { type: 'json' };
import type { GameConfig } from '../game/config.ts';

export const sweepFromUrl = (params: URLSearchParams, config: GameConfig): Partial<GameConfig> => {
  if (config.debug && config.site === 'testHouse' && params.has('ragdollSweep')) {
    const seed = Number(params.get('ragdollSweep'));
    if (Number.isSafeInteger(seed)) {
      return { ragdollSweep: seed, debugStart: { ...ragdoll.sweep.viewer } };
    }
  }
  return {};
};
