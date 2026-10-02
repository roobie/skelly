// Units and axes of the gun GLB export (PROJECT.md 3.4). Kept beside the gun exporter so no domain semantics leak into core.

import { IDENTITY_M, type Mat3, mulMV, transpose, type Vec3 } from '../core/math.ts';

/**
 * Metres per gungen unit in the gun domain (`GUN_UNITS.metresPerUnit`); the export scales by the resolved
 * domain's `units.metresPerUnit`. The STANAG top depth of 5.5u is about 63 mm, so 1u = 11.5 mm
 * (PROJECT.md section 4).
 */
export const METRES_PER_UNIT = 0.0115;

/**
 * How gungen assembly axes map to the exported file's axes: `file = FILE_FROM_GUNGEN * gungen`.
 *
 * gungen's frame is right-handed with +X forward (the bore), +Y up and +Z right. glTF is right-handed and
 * Y-up, and the exported model keeps +X along the bore, so the file's axes are gungen's: identity. The
 * vertices are the assembly-space points times `METRES_PER_UNIT`, with no swap.
 */
export const FILE_FROM_GUNGEN: Mat3 = IDENTITY_M;

/** Held-model axes: +X forward along the bore, +Y up, +Z right (the right-handed completion). */
export const GUN_EXPORT_FORWARD: Vec3 = [1, 0, 0];
export const GUN_EXPORT_UP: Vec3 = [0, 1, 0];

/** Applies `FILE_FROM_GUNGEN` to a point or direction. */
export const toFileAxes = (v: Vec3, mapping: Mat3 = FILE_FROM_GUNGEN): Vec3 => mulMV(mapping, v);

const DEGREES = 180 / Math.PI;

/** Rounds away numerical noise and negative zero, so `turn` is exact for exact mappings. */
const clean = (x: number): number => {
  const r = Math.round(x * 1e6) / 1e6;
  return r === 0 ? 0 : r;
};

/** Euler angles in degrees, in the engine's order (three.js 'XYZ', matrix = Rx * Ry * Rz), of a rotation matrix. */
export const eulerXyzDegrees = (m: Mat3): Vec3 => {
  const m13 = Math.min(1, Math.max(-1, m[2]));
  const y = Math.asin(m13);
  if (Math.abs(m13) < 0.999_999_9) {
    return [clean(Math.atan2(-m[5], m[8]) * DEGREES), clean(y * DEGREES), clean(Math.atan2(-m[1], m[0]) * DEGREES)];
  }
  return [clean(Math.atan2(m[7], m[4]) * DEGREES), clean(y * DEGREES), 0];
};

/**
 * Held-model `grip.turn` for a model written with `fileFromGungen`: the fixed rotation that carries the
 * exported file's axes onto the held axes (+X forward, +Y up).
 *
 * BR ruling (2026-09-29): this is NOT the hold frame's orientation. A grip is raked, and the hold frame leans
 * with it, but `turn` says how the model file is oriented, not how the hand sits. The tilted frame stays in
 * gun anchor data for future hand posing. This function takes no anchor.
 */
export const gripTurn = (fileFromGungen: Mat3 = FILE_FROM_GUNGEN): Vec3 => eulerXyzDegrees(transpose(fileFromGungen));
