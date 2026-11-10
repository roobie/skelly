import ragdoll from '../config/ragdoll.json' with { type: 'json' };
import type { DebugStart } from '../game/entries/session.ts';

/** Where the product's ragdoll sweep places the viewer; the entry passes it to `configFromUrl`. */
export const ragdollSweepViewer: DebugStart = ragdoll.sweep.viewer;
