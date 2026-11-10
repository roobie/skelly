// A bounded voxel approximation to diffuse sky transport. Direct sun/torch light remains shadowed separately.
import type { Vec3 } from './coords.ts';

export interface SkyBounds {
  min: Vec3;
  max: Vec3;
}
export interface SkyVolume extends SkyBounds {
  size: Vec3;
  light: Uint8Array;
  /**
   * The same transport with furniture taken out. Light glows fade by this: they cast no furniture
   * shadows, so fading them by furniture-blocked sky would light the wall behind a piece brighter
   * than the open wall beside it.
   */
  unfurnished: Uint8Array;
}
export type SkyChannel = 'light' | 'unfurnished';
/** Diffuse transport loses this much per half-metre air cell; never passes through an opaque voxel. */
export const SKY_LOSS = 24;
export const skyIndex = ([sx, , sz]: Vec3, x: number, y: number, z: number): number => x + sx * (z + sz * y);
