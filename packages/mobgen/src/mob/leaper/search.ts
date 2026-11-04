// The leaper's seed search. A seed is usable only when both the gameplay body and its far-LOD
// re-voxelization validate: the far LOD's draw cost depends on the seed's shading as much as on its
// shape, so some otherwise valid seeds exceed the far-LOD triangle cap and are skipped here.

import {
  FAR_LOD_HALF_BLOCK_VOXEL_SIZE,
  generateValid,
  type LodRealization,
  realizeLod,
  type ValidGeneration,
  type ValidSearchOptions,
} from '../../core/generate.ts';
import { LEAPER_TEMPLATE } from './plan.ts';

export interface LeaperGeneration {
  readonly full: ValidGeneration;
  readonly far: LodRealization;
}

/** Tries seed, seed + direction, ... until one passes at the template grid and at far LOD. */
export const generateValidLeaper = (
  seed: number,
  { maxAttempts = 100, direction = 1 }: ValidSearchOptions = {},
): LeaperGeneration | undefined => {
  for (let tried = 0; tried < maxAttempts; ) {
    const full = generateValid(LEAPER_TEMPLATE, seed + direction * tried, {
      maxAttempts: maxAttempts - tried,
      direction,
    });
    if (!full) {
      return undefined;
    }
    tried = Math.abs(full.seed - seed) + 1;
    const far = realizeLod(full, FAR_LOD_HALF_BLOCK_VOXEL_SIZE);
    if (far.realized.report.ok) {
      return { full, far };
    }
  }
  return undefined;
};
