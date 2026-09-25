// Axis-aligned box movement against the voxel grid.

import type { Vec3 } from './coords.ts';
import type { SolidAt } from './raycast.ts';

export interface Body {
  /** Centre of the box's bottom face. */
  pos: Vec3;
  vel: Vec3;
  halfWidth: number;
  height: number;
  onGround: boolean;
}

export const GRAVITY = 28;
const EPS = 1e-4;
const MAX_STEP = 0.45; // per-axis move per substep; below 1 so only one new block layer is touched

type Axis = 0 | 1 | 2;

const offsets = (body: Body, axis: Axis): [number, number] =>
  axis === 1 ? [0, body.height] : [-body.halfWidth, body.halfWidth];

const overlapsSolid = (body: Body, isSolid: SolidAt): boolean => {
  const [x, y, z] = body.pos;
  const w = body.halfWidth;
  for (let by = Math.floor(y); by < Math.ceil(y + body.height); by++)
    for (let bz = Math.floor(z - w); bz < Math.ceil(z + w); bz++)
      for (let bx = Math.floor(x - w); bx < Math.ceil(x + w); bx++) if (isSolid(bx, by, bz)) return true;
  return false;
};

/** Moves along one axis; on contact, snaps to the block face and stops. Returns true on contact. */
const moveAxis = (body: Body, axis: Axis, delta: number, isSolid: SolidAt): boolean => {
  if (delta === 0) return false;
  body.pos[axis] += delta;
  if (!overlapsSolid(body, isSolid)) return false;
  const [lo, hi] = offsets(body, axis);
  body.pos[axis] =
    delta > 0 ? Math.ceil(body.pos[axis]! + hi) - 1 - hi - EPS : Math.floor(body.pos[axis]! + lo) + 1 - lo + EPS;
  body.vel[axis] = 0;
  return true;
};

/** Applies gravity and velocity for dt seconds, resolving collisions axis by axis (y first). */
export const stepBody = (body: Body, dt: number, isSolid: SolidAt): void => {
  body.vel[1] -= GRAVITY * dt;
  const largest = Math.max(...body.vel.map((v) => Math.abs(v * dt)));
  const substeps = Math.max(1, Math.ceil(largest / MAX_STEP));
  const h = dt / substeps;
  body.onGround = false;
  for (let i = 0; i < substeps; i++) {
    const falling = body.vel[1] < 0;
    if (moveAxis(body, 1, body.vel[1] * h, isSolid) && falling) body.onGround = true;
    moveAxis(body, 0, body.vel[0] * h, isSolid);
    moveAxis(body, 2, body.vel[2] * h, isSolid);
  }
};

/** True if the box at pos would overlap the given block (used to stop placing blocks inside the player). */
export const bodyOverlapsBlock = (body: Body, block: Vec3): boolean => {
  const [x, y, z] = body.pos;
  const w = body.halfWidth;
  return (
    block[0] + 1 > x - w && block[0] < x + w &&
    block[1] + 1 > y && block[1] < y + body.height &&
    block[2] + 1 > z - w && block[2] < z + w
  );
};
