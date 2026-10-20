// Conventions every body plan, voxelizer and mesher is authored against.

import type { Vec3 } from './math.ts';

/**
 * World frame. Right-handed, Y up, metres — this matches three.js and
 * deadvox (yaw 0 faces -Z).
 *   +X  the figure's right when facing -Z (so the figure's left is -X)
 *   +Y  up
 *   +Z  the figure's back; figures face -Z
 * Ground is at y = 0.
 */
export const UP: Vec3 = [0, 1, 0];
export const RIGHT: Vec3 = [1, 0, 0];
