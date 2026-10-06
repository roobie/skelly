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

/** One solid hit on the direct source-listener ray selects the same coarse step for every sense. */
export const soundOcclusion = (listener: Vec3, source: Vec3, isSolid: SolidAt): SoundOcclusion => {
  const delta: Vec3 = [source[0] - listener[0], source[1] - listener[1], source[2] - listener[2]];
  const distance = Math.hypot(...delta);
  const direction: Vec3 = distance > 0 ? [delta[0] / distance, delta[1] / distance, delta[2] / distance] : [0, 0, 0];
  const occluded = raycast(listener, direction, distance, isSolid) !== undefined;
  return {
    occluded,
    gain: occluded ? WALL_GAIN : CLEAR_GAIN,
    cutoffHz: occluded ? WALL_CUTOFF_HZ : CLEAR_CUTOFF_HZ,
  };
};
