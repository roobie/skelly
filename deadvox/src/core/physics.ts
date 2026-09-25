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

/** Physical constants in block units (convert from metres with the block size). */
export interface PhysicsParams {
  /** Blocks per second squared. */
  gravity: number;
  /** Tallest ledge a grounded body walks up without jumping, in blocks. 0 disables. */
  stepHeight: number;
}

const EPS = 1e-4;
const MAX_STEP = 0.45; // per-axis move per substep; below 1 so only one new block layer is touched

type Axis = 0 | 1 | 2;

const offsets = (body: Body, axis: Axis): [number, number] =>
  axis === 1 ? [0, body.height] : [-body.halfWidth, body.halfWidth];

const overlapsSolid = (body: Body, isSolid: SolidAt): boolean => {
  const [x, y, z] = body.pos;
  const w = body.halfWidth;
  for (let by = Math.floor(y); by < Math.ceil(y + body.height); by++) {
    for (let bz = Math.floor(z - w); bz < Math.ceil(z + w); bz++) {
      for (let bx = Math.floor(x - w); bx < Math.ceil(x + w); bx++) {
        if (isSolid(bx, by, bz)) {
          return true;
        }
      }
    }
  }
  return false;
};

/** Moves along one axis; on contact, snaps to the block face and stops. Returns true on contact. */
const moveAxis = (body: Body, axis: Axis, delta: number, isSolid: SolidAt): boolean => {
  if (delta === 0) {
    return false;
  }
  body.pos[axis] += delta;
  if (!overlapsSolid(body, isSolid)) {
    return false;
  }
  const [lo, hi] = offsets(body, axis);
  body.pos[axis] =
    delta > 0 ? Math.ceil(body.pos[axis]! + hi) - 1 - hi - EPS : Math.floor(body.pos[axis]! + lo) + 1 - lo + EPS;
  body.vel[axis] = 0;
  return true;
};

/** What a horizontal move needs besides the axis and distance. */
interface MoveContext {
  body: Body;
  isSolid: SolidAt;
  stepHeight: number;
  grounded: boolean;
}

/** Tries to move along a horizontal axis from a raised position, then settles back down. */
const tryStepUp = ({ body, isSolid, stepHeight }: MoveContext, axis: Axis, delta: number): boolean => {
  body.pos[1] += stepHeight;
  if (overlapsSolid(body, isSolid)) {
    body.pos[1] -= stepHeight;
    return false;
  }
  body.pos[axis] += delta;
  if (overlapsSolid(body, isSolid)) {
    body.pos[axis] -= delta;
    body.pos[1] -= stepHeight;
    return false;
  }
  moveAxis(body, 1, -stepHeight, isSolid); // lands on the step, or back where it was
  return true;
};

/** Horizontal move that climbs ledges up to stepHeight when grounded. */
const moveHorizontal = (ctx: MoveContext, axis: Axis, delta: number): void => {
  const { body, isSolid, stepHeight, grounded } = ctx;
  const start = body.pos[axis]!;
  const speed = body.vel[axis]!;
  if (!(moveAxis(body, axis, delta, isSolid) && grounded) || stepHeight <= 0) {
    return;
  }
  // Blocked: retry the whole move from a raised position.
  body.pos[axis] = start;
  body.vel[axis] = speed;
  if (!tryStepUp(ctx, axis, delta)) {
    moveAxis(body, axis, delta, isSolid);
  }
};

/** Applies gravity and velocity for dt seconds, resolving collisions axis by axis (y first). */
export const stepBody = (body: Body, dt: number, isSolid: SolidAt, params: PhysicsParams): void => {
  const wasGrounded = body.onGround;
  body.vel[1] -= params.gravity * dt;
  const largest = Math.max(...body.vel.map((v) => Math.abs(v * dt)));
  const substeps = Math.max(1, Math.ceil(largest / MAX_STEP));
  const h = dt / substeps;
  body.onGround = false;
  for (let i = 0; i < substeps; i++) {
    const falling = body.vel[1] < 0;
    if (moveAxis(body, 1, body.vel[1] * h, isSolid) && falling) {
      body.onGround = true;
    }
    const ctx: MoveContext = { body, isSolid, stepHeight: params.stepHeight, grounded: wasGrounded || body.onGround };
    moveHorizontal(ctx, 0, body.vel[0] * h);
    moveHorizontal(ctx, 2, body.vel[2] * h);
  }
};

/** True if the box at pos would overlap the given block (used to stop placing blocks inside the player). */
export const bodyOverlapsBlock = (body: Body, block: Vec3): boolean => {
  const [x, y, z] = body.pos;
  const w = body.halfWidth;
  return (
    block[0] + 1 > x - w &&
    block[0] < x + w &&
    block[1] + 1 > y &&
    block[1] < y + body.height &&
    block[2] + 1 > z - w &&
    block[2] < z + w
  );
};
