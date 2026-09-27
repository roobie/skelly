import type { Vec3 } from './coords.ts';
import { countSolidRuns, type SolidAt } from './raycast.ts';

const GAIN_PER_SOLID_RUN = 0.55;
const CUTOFF_PER_SOLID_RUN = 0.4;
const MIN_CUTOFF_HZ = 650;
const CLEAR_CUTOFF_HZ = 18_000;

export interface SoundOcclusion {
  wallRuns: number;
  gain: number;
  cutoffHz: number;
}

/** The player's positional sound follows the hearing ray's solid-run count. */
export const soundOcclusion = (listener: Vec3, source: Vec3, isSolid: SolidAt): SoundOcclusion => {
  const wallRuns = countSolidRuns(listener, source, isSolid);
  return {
    wallRuns,
    gain: GAIN_PER_SOLID_RUN ** wallRuns,
    cutoffHz: Math.max(MIN_CUTOFF_HZ, CLEAR_CUTOFF_HZ * CUTOFF_PER_SOLID_RUN ** wallRuns),
  };
};
