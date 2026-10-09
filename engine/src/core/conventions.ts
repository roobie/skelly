// Shared coordinate conventions for authored assemblies.

import type { Vec3 } from './math.ts';

/**
 * Assembly frame. Right-handed, Y up, which matches three.js.
 *   +X  forward: along the main axis, toward the front
 *   +Y  up
 *   +Z  right, from the point of view of someone holding the assembly
 * The root part is placed at the origin with an identity rotation.
 */
const FORWARD: Vec3 = [1, 0, 0];

/**
 * The main axis: the line through the origin along +X.
 */
export const MAIN_AXIS = { origin: [0, 0, 0] as Vec3, dir: FORWARD };

/**
 * Default construction grid step for authored geometry. A domain may provide
 * its own step through `Domain.units`.
 */
export const GRID = 0.25;

/** Shared size classes; each part family maps them into its domain's units. */
export const SIZE_CLASSES = ['S', 'M', 'L'] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number];

export const TOLERANCE = {
  /** Two positions closer than this are the same point (u). */
  position: 0.01,
  /** Two directions closer than this are the same direction (degrees). */
  angle: 0.5,
  /** Penetration below this is contact, not overlap (u). */
  contact: 1e-6,
  /** Fallback nesting allowance for directly connected parts (u). */
  interface: 0.75,
} as const;
