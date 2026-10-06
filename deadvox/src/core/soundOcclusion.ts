import type { Vec3 } from './coords.ts';
import { raycast, type SolidAt } from './raycast.ts';

export const WALL_HEARING_RANGE_FACTOR = 0.5;

const CLEAR_GAIN = 1;
const WALL_GAIN = 0.55;
const CLEAR_CUTOFF_HZ = 18_000;
const WALL_CUTOFF_HZ = 1800;

export interface SoundOcclusion {
  occluded: boolean;
  gain: number;
  cutoffHz: number;
}

export interface SoundWallTuning {
  gain: number;
  cutoffHz: number;
}

/** A solid on the direct source-listener ray selects one step; positional audio may tune its strength per sound. */
export const soundOcclusion = (
  listener: Vec3,
  source: Vec3,
  isSolid: SolidAt,
  wall?: SoundWallTuning,
): SoundOcclusion => {
  const delta: Vec3 = [source[0] - listener[0], source[1] - listener[1], source[2] - listener[2]];
  const distance = Math.hypot(...delta);
  const direction: Vec3 = distance > 0 ? [delta[0] / distance, delta[1] / distance, delta[2] / distance] : [0, 0, 0];
  const occluded = raycast(listener, direction, distance, isSolid) !== undefined;
  const wallTuning = wall ?? { gain: WALL_GAIN, cutoffHz: WALL_CUTOFF_HZ };
  return {
    occluded,
    gain: occluded ? wallTuning.gain : CLEAR_GAIN,
    cutoffHz: occluded ? wallTuning.cutoffHz : CLEAR_CUTOFF_HZ,
  };
};
