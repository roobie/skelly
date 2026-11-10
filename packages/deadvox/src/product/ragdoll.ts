import type { DebugStart } from '@skelly/engine/session';
import type { RagdollConfig } from '../../../presentation/src/play.ts';
import ragdoll from '../config/ragdoll.json' with { type: 'json' };

/**
 * The product's corpse physics tuning; the entry passes it to presentation, which names no product path. The
 * physics step and crawl fall run on the real clock; a swept corpse lies for simulated time.
 */
export const ragdollConfig: RagdollConfig = {
  ...ragdoll,
  timestepRealSeconds: ragdoll.timestep,
  crawlFall: {
    ...ragdoll.crawlFall,
    fallRealSeconds: ragdoll.crawlFall.fallSeconds,
    blendRealSeconds: ragdoll.crawlFall.blendSeconds,
  },
  sweep: { capacity: ragdoll.sweep.capacity, lieSimSeconds: ragdoll.sweep.lieSeconds },
};

/** The debug ragdoll sweep's layout and cuts. */
export const ragdollSweep = ragdoll.sweep;

/** Where the product's ragdoll sweep places the viewer; the entry passes it to `configFromUrl`. */
export const ragdollSweepViewer: DebugStart = ragdoll.sweep.viewer;
