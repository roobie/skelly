import type { DebugStart } from '@skelly/engine/session';
import ragdoll from '../config/ragdoll.json' with { type: 'json' };
import type { RagdollConfig } from '../presentation/entries/play.ts';

/** The product's corpse physics tuning; the entry passes it to presentation, which names no product path. */
export const ragdollConfig: RagdollConfig = ragdoll;

/** The debug ragdoll sweep's layout and cuts. */
export const ragdollSweep = ragdoll.sweep;

/** Where the product's ragdoll sweep places the viewer; the entry passes it to `configFromUrl`. */
export const ragdollSweepViewer: DebugStart = ragdoll.sweep.viewer;
