// Axis-aligned box movement against the voxel grid and other moving bodies.

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
  /** Other bodies block horizontal motion only; vertical motion always resolves against terrain. */
  obstacles?: readonly Body[];
}

/** Separation from a contacted voxel face, in blocks; not physical travel. */
export const CONTACT_SKIN = 1e-4;
const MAX_STEP = 0.45; // per-axis move per substep; below 1 so only one new block layer is touched

type Axis = 0 | 1 | 2;

const offsets = (body: Body, axis: Axis): [number, number] =>
  axis === 1 ? [0, body.height] : [-body.halfWidth, body.halfWidth];

const overlapsBlock = (body: Body, block: Vec3): boolean => {
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

const overlapsTerrain = (body: Body, isSolid: SolidAt): boolean => {
  const [x, y, z] = body.pos;
  const w = body.halfWidth;
  for (let by = Math.floor(y); by < Math.ceil(y + body.height); by++) {
    for (let bz = Math.floor(z - w); bz < Math.ceil(z + w); bz++) {
      for (let bx = Math.floor(x - w); bx < Math.ceil(x + w); bx++) {
        if (isSolid(bx, by, bz) && overlapsBlock(body, [bx, by, bz])) {
          return true;
        }
      }
    }
  }
  return false;
};

const overlapsBody = (body: Body, other: Body): boolean =>
  body.pos[0] - body.halfWidth < other.pos[0] + other.halfWidth &&
  body.pos[0] + body.halfWidth > other.pos[0] - other.halfWidth &&
  body.pos[1] < other.pos[1] + other.height &&
  body.pos[1] + body.height > other.pos[1] &&
  body.pos[2] - body.halfWidth < other.pos[2] + other.halfWidth &&
  body.pos[2] + body.halfWidth > other.pos[2] - other.halfWidth;

const overlapsSolid = (body: Body, isSolid: SolidAt, bodies: readonly Body[]): boolean =>
  overlapsTerrain(body, isSolid) || bodies.some((other) => overlapsBody(body, other));

interface CollisionContext {
  isSolid: SolidAt;
  bodies?: readonly Body[];
}

const bodyContact = (body: Body, other: Body, axis: Axis, delta: number): number => {
  const bodyCenter = body.pos[axis]! - delta + (axis === 1 ? body.height / 2 : 0);
  const otherCenter = other.pos[axis]! + (axis === 1 ? other.height / 2 : 0);
  const onNegativeSide = bodyCenter < otherCenter || (bodyCenter === otherCenter && delta < 0);
  if (axis === 1) {
    return onNegativeSide ? other.pos[1] - body.height : other.pos[1] + other.height;
  }
  const halfWidths = body.halfWidth + other.halfWidth;
  return onNegativeSide ? other.pos[axis] - halfWidths : other.pos[axis] + halfWidths;
};

/** Moves along one axis; on contact, snaps to the nearest obstacle face. Returns true on contact. */
const moveAxis = (body: Body, axis: Axis, delta: number, { isSolid, bodies = [] }: CollisionContext): boolean => {
  if (delta === 0) {
    return false;
  }
  const alreadyOverlapping = new Set(bodies.filter((other) => overlapsBody(body, other)));
  body.pos[axis] += delta;
  const terrainHit = overlapsTerrain(body, isSolid);
  const bodyHits = bodies.filter((other) => !alreadyOverlapping.has(other) && overlapsBody(body, other));
  if (!terrainHit && bodyHits.length === 0) {
    return false;
  }
  let contact: number | undefined;
  if (terrainHit) {
    const [lo, hi] = offsets(body, axis);
    contact =
      delta > 0
        ? Math.ceil(body.pos[axis]! + hi) - 1 - hi - CONTACT_SKIN
        : Math.floor(body.pos[axis]! + lo) + 1 - lo + CONTACT_SKIN;
  }
  for (const other of bodyHits) {
    const face = bodyContact(body, other, axis, delta);
    if (contact === undefined) {
      contact = face;
    } else if (delta > 0) {
      contact = Math.min(contact, face);
    } else {
      contact = Math.max(contact, face);
    }
  }
  body.pos[axis] = contact!;
  body.vel[axis] = 0;
  return true;
};

/** What a horizontal move needs besides the axis and distance. */
interface MoveContext {
  body: Body;
  isSolid: SolidAt;
  stepHeight: number;
  grounded: boolean;
  bodies: readonly Body[];
}

/** Tries to move along a horizontal axis from a raised position, then settles back down. */
const tryStepUp = ({ body, isSolid, stepHeight, bodies }: MoveContext, axis: Axis, delta: number): boolean => {
  body.pos[1] += stepHeight;
  if (overlapsTerrain(body, isSolid)) {
    body.pos[1] -= stepHeight;
    return false;
  }
  body.pos[axis] += delta;
  if (overlapsSolid(body, isSolid, bodies)) {
    body.pos[axis] -= delta;
    body.pos[1] -= stepHeight;
    return false;
  }
  moveAxis(body, 1, -stepHeight, { isSolid }); // lands on terrain, never a body
  return true;
};

/** Horizontal move that climbs terrain ledges up to stepHeight when grounded, never bodies. */
const moveHorizontal = (ctx: MoveContext, axis: Axis, delta: number): void => {
  const { body, isSolid, stepHeight, grounded, bodies } = ctx;
  const start = body.pos[axis]!;
  const speed = body.vel[axis]!;
  if (!(moveAxis(body, axis, delta, { isSolid, bodies }) && grounded) || stepHeight <= 0) {
    return;
  }
  // Blocked: retry the whole move from a raised position.
  body.pos[axis] = start;
  body.vel[axis] = speed;
  if (!tryStepUp(ctx, axis, delta)) {
    moveAxis(body, axis, delta, { isSolid, bodies });
  }
};

/** Applies gravity and velocity for dt seconds, resolving collisions axis by axis (y first). */
export const stepBody = (body: Body, dt: number, isSolid: SolidAt, params: PhysicsParams): void => {
  const obstacles = params.obstacles ?? [];
  const wasGrounded = body.onGround;
  body.vel[1] -= params.gravity * dt;
  const largest = Math.max(...body.vel.map((v) => Math.abs(v * dt)));
  const substeps = Math.max(1, Math.ceil(largest / MAX_STEP));
  const h = dt / substeps;
  body.onGround = false;
  for (let i = 0; i < substeps; i++) {
    const falling = body.vel[1] < 0;
    if (moveAxis(body, 1, body.vel[1] * h, { isSolid }) && falling) {
      body.onGround = true;
    }
    const ctx: MoveContext = {
      body,
      isSolid,
      stepHeight: params.stepHeight,
      grounded: wasGrounded || body.onGround,
      bodies: obstacles,
    };
    moveHorizontal(ctx, 0, body.vel[0] * h);
    moveHorizontal(ctx, 2, body.vel[2] * h);
    if (body.onGround) {
      body.onGround = moveAxis(body, 1, -2 * CONTACT_SKIN, { isSolid });
    }
  }
};

/** Moves a grounded actor horizontally in collision-bounded substeps without running gravity. */
export const stepBodyHorizontal = (
  body: Body,
  movement: { dx: number; dz: number; isSolid: SolidAt; params: PhysicsParams },
): void => {
  const { dx, dz, isSolid, params } = movement;
  const largest = Math.max(Math.abs(dx), Math.abs(dz));
  const substeps = Math.max(1, Math.ceil(largest / MAX_STEP));
  for (let i = 0; i < substeps; i++) {
    const ctx: MoveContext = {
      body,
      isSolid,
      stepHeight: params.stepHeight,
      grounded: body.onGround,
      bodies: params.obstacles ?? [],
    };
    moveHorizontal(ctx, 0, dx / substeps);
    moveHorizontal(ctx, 2, dz / substeps);
    if (body.onGround) {
      body.onGround = moveAxis(body, 1, -2 * CONTACT_SKIN, { isSolid });
    }
  }
};

const separatePair = (first: Body, second: Body, maxPushBlocks: number, collision: CollisionContext): void => {
  if (!overlapsBody(first, second)) {
    return;
  }
  const deltaX = second.pos[0] - first.pos[0];
  const deltaZ = second.pos[2] - first.pos[2];
  const overlapX = first.halfWidth + second.halfWidth - Math.abs(deltaX);
  const overlapZ = first.halfWidth + second.halfWidth - Math.abs(deltaZ);
  if (overlapX <= 0 || overlapZ <= 0) {
    return;
  }
  const axis: Axis = overlapX <= overlapZ ? 0 : 2;
  const overlap = axis === 0 ? overlapX : overlapZ;
  const component = axis === 0 ? deltaX : deltaZ;
  const direction = component === 0 ? 1 : Math.sign(component);
  const push = Math.min(overlap / 2, maxPushBlocks);
  const firstStart = [...first.pos] as Vec3;
  const secondStart = [...second.pos] as Vec3;
  moveAxis(first, axis, -direction * push, collision);
  moveAxis(second, axis, direction * push, collision);

  const firstMoved = Math.abs(first.pos[axis]! - firstStart[axis]!);
  const secondMoved = Math.abs(second.pos[axis]! - secondStart[axis]!);
  if (firstMoved >= push - CONTACT_SKIN && secondMoved >= push - CONTACT_SKIN) {
    return;
  }
  const otherAxis: Axis = axis === 0 ? 2 : 0;
  const otherOverlap = otherAxis === 0 ? overlapX : overlapZ;
  if (otherOverlap <= 0) {
    return;
  }
  const otherComponent = second.pos[otherAxis]! - first.pos[otherAxis]!;
  const otherDirection = otherComponent === 0 ? 1 : Math.sign(otherComponent);
  const otherPush = Math.min(otherOverlap / 2, maxPushBlocks);
  const firstBudget = Math.max(0, maxPushBlocks - firstMoved);
  const secondBudget = Math.max(0, maxPushBlocks - secondMoved);
  if (firstBudget > 0) {
    moveAxis(first, otherAxis, -otherDirection * Math.min(otherPush, firstBudget), collision);
  }
  if (secondBudget > 0) {
    moveAxis(second, otherAxis, otherDirection * Math.min(otherPush, secondBudget), collision);
  }
};

/** Pairwise horizontal shambler separation, capped per push and clipped against terrain and supplied blockers. */
export const separateBodyPair = ({
  first,
  second,
  dt,
  isSolid,
  blockSize,
  obstacles = [],
}: {
  first: Body;
  second: Body;
  dt: number;
  isSolid: SolidAt;
  blockSize: number;
  obstacles?: readonly Body[];
}): void => {
  separatePair(first, second, dt / blockSize, { isSolid, bodies: obstacles });
};

export const separateBodies = ({
  bodies,
  dt,
  isSolid,
  blockSize,
  obstacles = [],
}: {
  bodies: readonly Body[];
  dt: number;
  isSolid: SolidAt;
  blockSize: number;
  obstacles?: readonly Body[];
}): void => {
  for (let i = 0; i < bodies.length; i++) {
    const first = bodies[i]!;
    for (let j = i + 1; j < bodies.length; j++) {
      const second = bodies[j]!;
      separateBodyPair({ first, second, dt, isSolid, blockSize, obstacles });
    }
  }
};

/** True if the box at pos would overlap the given block (used to stop placing blocks inside the player). */
export const bodyOverlapsBlock = (body: Body, block: Vec3): boolean => overlapsBlock(body, block);
