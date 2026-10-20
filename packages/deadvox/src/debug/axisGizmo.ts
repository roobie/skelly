import type { Vec3 } from '../core/coords.ts';

export type Quaternion = readonly [x: number, y: number, z: number, w: number];

export interface ProjectedAxis {
  readonly label: 'X' | 'Y' | 'Z';
  readonly color: string;
  /** Camera-plane direction; canvas y is positive down. */
  readonly x: number;
  readonly y: number;
  readonly depth: number;
}

const AXES = [
  { label: 'X', color: '#ef5350', direction: [1, 0, 0] },
  { label: 'Y', color: '#66bb6a', direction: [0, 1, 0] },
  { label: 'Z', color: '#42a5f5', direction: [0, 0, 1] },
] as const;

/** Format world positions in metres with explicit game-axis labels. */
export function formatPosition(position: Vec3): string {
  return `X=${position[0].toFixed(1)} m · Y=${position[1].toFixed(1)} m · Z=${position[2].toFixed(1)} m`;
}

/** Yaw zero looks north (-Z); positive yaw turns west, matching aimDirection. */
export function compassDirection(yaw: number): string {
  const directions = ['N', 'NW', 'W', 'SW', 'S', 'SE', 'E', 'NE'] as const;
  const normalized = ((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return directions[Math.round(normalized / (Math.PI / 4)) % directions.length]!;
}

export function formatFacing(yaw: number, pitch: number): string {
  return `yaw ${((yaw * 180) / Math.PI).toFixed(1)}° · ${compassDirection(yaw)} · pitch ${((pitch * 180) / Math.PI).toFixed(1)}°`;
}

/** Rotate world-space positive axes by the inverse camera quaternion for an overlay gizmo. */
export function projectPositiveAxes(quaternion: Quaternion): ProjectedAxis[] {
  const length = Math.hypot(...quaternion);
  const [x, y, z, w] = quaternion.map((component) => component / length) as [number, number, number, number];
  // The inverse rotation is the conjugate of a normalized quaternion.
  const ix = -x;
  const iy = -y;
  const iz = -z;
  return AXES.map(({ label, color, direction }) => {
    const [vx, vy, vz] = direction as Vec3;
    const tx = 2 * (iy * vz - iz * vy);
    const ty = 2 * (iz * vx - ix * vz);
    const tz = 2 * (ix * vy - iy * vx);
    const cameraX = vx + w * tx + iy * tz - iz * ty;
    const cameraY = vy + w * ty + iz * tx - ix * tz;
    const cameraZ = vz + w * tz + ix * ty - iy * tx;
    const screenX = cameraX;
    const screenY = -cameraY;
    const cleanZero = (value: number): number => (Math.abs(value) < 1e-12 ? 0 : value);
    return { label, color, x: cleanZero(screenX), y: cleanZero(screenY), depth: cleanZero(cameraZ) };
  });
}

/** Quaternion for the game's camera Euler order (YXZ), handy for deterministic orientation tests. */
export function cameraQuaternion(yaw: number, pitch: number, roll = 0): Quaternion {
  const cy = Math.cos(yaw / 2);
  const sy = Math.sin(yaw / 2);
  const cx = Math.cos(pitch / 2);
  const sx = Math.sin(pitch / 2);
  const cz = Math.cos(roll / 2);
  const sz = Math.sin(roll / 2);
  return [
    cy * sx * cz + sy * cx * sz,
    sy * cx * cz - cy * sx * sz,
    cy * cx * sz - sy * sx * cz,
    cy * cx * cz + sy * sx * sz,
  ];
}
