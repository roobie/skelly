import { Euler } from 'three';
import type { Vec3 } from '../core/coords.ts';

/** The visual camera follows the same input angles and adds only presentation roll. */
export const cameraRotation = (pitch: number, yaw: number, roll: number): Euler => new Euler(pitch, yaw, roll, 'YXZ');

/** Gameplay targeting uses the input angles directly; hit-feedback roll cannot alter aim. */
export function aimDirection(pitch: number, yaw: number): Vec3 {
  const horizontal = Math.cos(pitch);
  return [-Math.sin(yaw) * horizontal, Math.sin(pitch), -Math.cos(yaw) * horizontal];
}
