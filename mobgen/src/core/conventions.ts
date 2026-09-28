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
export const FORWARD: Vec3 = [0, 0, -1];
export const RIGHT: Vec3 = [1, 0, 0];

/**
 * Voxel grid. Voxel size `v` is per template (default 0.5 / 12 m, chosen so
 * a ~1.75 m figure's head is about 50 voxels — see mobgen/reference/README.md).
 *
 * Voxel centres sit at:
 *   x = i * v   (the midline x = 0 is a voxel centre, so a nose or spine can
 *                be one voxel wide and left/right mirror symmetry is exact)
 *   y = (j + 0.5) * v   (the ground, y = 0, is a voxel's bottom face)
 *   z = k * v
 * A voxel at index (i, j, k) therefore spans:
 *   x: [(i - 0.5) * v, (i + 0.5) * v]
 *   y: [j * v, (j + 1) * v]
 *   z: [(k - 0.5) * v, (k + 0.5) * v]
 */
export const DEFAULT_VOXEL_SIZE = 0.5 / 12;
