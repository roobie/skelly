import type { Vec3 } from '../core/coords.ts';

/** Gameplay targeting uses the input angles directly; hit-feedback roll cannot alter aim. */
export function aimDirection(pitch: number, yaw: number): Vec3 {
  const horizontal = Math.cos(pitch);
  return [-Math.sin(yaw) * horizontal, Math.sin(pitch), -Math.cos(yaw) * horizontal];
}
