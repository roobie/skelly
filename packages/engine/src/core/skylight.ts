// A bounded voxel approximation to diffuse sky transport. Direct sun/torch light remains shadowed separately.
import type { Vec3 } from './coords.ts';

export interface SkyBounds {
  min: Vec3;
  max: Vec3;
}
/**
 * A blocker the sky reads besides blocks, in blocks. `shade` is the share of diffuse sky light each of its cells
 * stops: 1 for an opaque piece, less for a body such as a car's, whose coarse cells are mostly air between thin panels.
 */
export interface SkyBlocker extends SkyBounds {
  shade: number;
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
/**
 * Diffuse transport loses this much per half-metre cell it enters, after a blocker's cell takes its `shade`; it never
 * passes through an opaque voxel.
 */
export const SKY_LOSS = 24;
export const skyIndex = ([sx, , sz]: Vec3, x: number, y: number, z: number): number => x + sx * (z + sz * y);
