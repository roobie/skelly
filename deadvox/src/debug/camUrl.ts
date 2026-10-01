// The camera pose as a URL query parameter (`?debug=1` only), so the operator can come back to a screenshot angle.
//
//   cam=x,y,z,yaw,pitch,roll
//
// x, y, z are the player's FEET (the body's position, which is what the game stores and what a restore sets)
// in metres, 2 decimals; yaw, pitch, roll are degrees, 1 decimal. The eye and camera sit at fixed offsets from
// the feet (plus a transient step smoothing), so the feet restore the view exactly. Roll only comes from damage
// feedback; it is written but ignored on restore. Anything unparseable reads as absent.

import type { Vec3 } from '../core/coords.ts';

export interface CamPose {
  /** Feet position, metres. */
  position: Vec3;
  /** Radians, as `Input` holds them. */
  yaw: number;
  pitch: number;
  roll: number;
}

const PARAM = 'cam';
const DEG = 180 / Math.PI;
/** Wait at least this long between URL writes while the pose drifts. */
export const CAM_WRITE_INTERVAL_MS = 500;
/** A pose counts as changed past this much: 1 cm, or 0.1 degree, the precision written. */
const EPSILON_M = 0.01;
const EPSILON_RAD = 0.1 / DEG;

const wrapDegrees = (degrees: number): number => ((((degrees + 180) % 360) + 360) % 360) - 180;

/** The `cam` value for `pose`: yaw wrapped to [-180, 180). */
export const camValue = (pose: CamPose): string =>
  [
    ...pose.position.map((v) => v.toFixed(2)),
    wrapDegrees(pose.yaw * DEG).toFixed(1),
    (pose.pitch * DEG).toFixed(1),
    (pose.roll * DEG).toFixed(1),
  ].join(',');

/** The pose in `params`, or undefined when `cam` is absent or not six finite numbers. Never throws. */
export const parseCamParam = (params: URLSearchParams): CamPose | undefined => {
  const text = params.get(PARAM);
  if (text === null) {
    return undefined;
  }
  const parts = text.split(',');
  if (parts.length !== 6 || parts.some((part) => part.trim() === '')) {
    return undefined;
  }
  const numbers = parts.map(Number);
  if (!numbers.every(Number.isFinite)) {
    return undefined;
  }
  const [x, y, z, yaw, pitch, roll] = numbers as [number, number, number, number, number, number];
  return {
    position: [x, y, z],
    yaw: yaw / DEG,
    // The same limit as the mouse look (input.ts), so a hand-edited value can't flip the camera over.
    pitch: Math.max(-1.55, Math.min(1.55, pitch / DEG)),
    roll: roll / DEG,
  };
};

/** `href` with `cam` set to `pose`; everything else is kept. ',' and ':' stay readable. */
export const camUrl = (href: string, pose: CamPose): string => {
  const url = new URL(href);
  const params = new URLSearchParams(url.searchParams);
  params.set(PARAM, camValue(pose));
  url.search = params.toString().replace(/%3A/g, ':').replace(/%2C/g, ',');
  return url.toString();
};

/** Whether `next` differs from `last` by more than the written precision. */
export const poseChanged = (last: CamPose | undefined, next: CamPose): boolean =>
  last === undefined ||
  next.position.some((v, i) => Math.abs(v - last.position[i]!) > EPSILON_M) ||
  Math.abs(wrapDegrees((next.yaw - last.yaw) * DEG)) > EPSILON_RAD * DEG ||
  Math.abs(next.pitch - last.pitch) > EPSILON_RAD ||
  Math.abs(next.roll - last.roll) > EPSILON_RAD;

/** Whether a URL write is due: the pose moved and `CAM_WRITE_INTERVAL_MS` has passed, or `force` (pause, freeze). */
export const camWriteDue = (last: CamPose | undefined, next: CamPose, sinceWriteMs: number, force = false): boolean =>
  last === undefined || (poseChanged(last, next) && (force || sinceWriteMs >= CAM_WRITE_INTERVAL_MS));
