// Conventions every part and assembly is authored against (PROJECT.md §4).

import type { Vec3 } from './math.ts';

/**
 * Assembly frame. Right-handed, Y up, which matches three.js.
 *   +X  forward: along the main axis, toward the front (for guns, the muzzle)
 *   +Y  up
 *   +Z  right, from the point of view of someone holding the assembly
 * The root part is placed at the origin with an identity rotation.
 */
export const FORWARD: Vec3 = [1, 0, 0];
export const UP: Vec3 = [0, 1, 0];
export const RIGHT: Vec3 = [0, 0, 1];

/**
 * The main axis: the line through the origin along +X. Domains name it; for
 * gungen it is the bore line.
 */
export const MAIN_AXIS = { origin: [0, 0, 0] as Vec3, dir: FORWARD };

/**
 * Lengths are in u, an abstract unit. It only sets proportions: 1 u is roughly
 * a centimetre, so models look right, but it is not a measurement.
 * Authored positions and extents sit on this grid.
 */
export const GRID = 0.25;

/** Size classes. Each part family maps them to u in its own tables. */
export const SIZE_CLASSES = ['S', 'M', 'L'] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number];

export const TOLERANCE = {
  /** Two positions closer than this are the same point (u). */
  position: 0.01,
  /** Two directions closer than this are the same direction (degrees). */
  angle: 0.5,
  /** Penetration below this is contact, not overlap (u). */
  contact: 1e-6,
  /** How far directly connected parts may nest into each other (u). */
  interface: 0.75,
} as const;
