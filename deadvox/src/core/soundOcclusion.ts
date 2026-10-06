import type { Vec3 } from './coords.ts';
import { raycast, type SolidAt } from './raycast.ts';
import type { SenseDef } from './schema.ts';

export interface SoundOcclusion {
  occluded: boolean;
  gain: number;
  cutoffHz: number;
}

type SoundWallTuning = NonNullable<import('./schema.ts').SoundDef['wall']>;

/** A solid on the direct source-listener ray selects one step; positional audio may tune its strength per sound. */
export interface SoundOcclusionOptions {
  listener: Vec3;
  source: Vec3;
  isSolid: SolidAt;
  globalWall: SenseDef['wall'];
  soundWall?: SoundWallTuning | undefined;
}

export const soundOcclusion = ({
  listener,
  source,
  isSolid,
  globalWall,
  soundWall,
}: SoundOcclusionOptions): SoundOcclusion => {
  const delta: Vec3 = [source[0] - listener[0], source[1] - listener[1], source[2] - listener[2]];
  const distance = Math.hypot(...delta);
  const direction: Vec3 = distance > 0 ? [delta[0] / distance, delta[1] / distance, delta[2] / distance] : [0, 0, 0];
  const occluded = raycast(listener, direction, distance, isSolid) !== undefined;
  return {
    occluded,
    gain: occluded ? (soundWall?.gain ?? globalWall.gain) : globalWall.clearGain,
    cutoffHz: occluded ? (soundWall?.cutoffHz ?? globalWall.cutoffHz) : globalWall.clearCutoffHz,
  };
};
