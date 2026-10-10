// Axis-aligned box movement against the voxel grid and other moving bodies. A body may carry an exact
// shape (`BodyShape`), which terrain and other bodies meet instead of its box.

import type { Vec3 } from './coords.ts';
import type { SolidAt } from './raycast.ts';

export interface Body {
  /** Centre of the box's bottom face. */
  pos: Vec3;
  vel: Vec3;
  halfWidth: number;
  /** Half extent along Z; omitted for square bodies. */
  halfDepth?: number;
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
  /** The exact shape of a body that has one, for the moving body and its obstacles alike. */
  shapeOf?: ShapeOf | undefined;
}

/**
 * A body's exact shape. Terrain and other bodies meet it instead of the body's box; the box still answers
 * whatever only needs the body's size.
 */
export interface BodyShape {
  /** Whether the shape, with its base centre at `pos`, overlaps a solid block. */
  overlapsTerrain: (pos: Vec3) => boolean;
  /** Whether it overlaps the box from `min` to `max`. */
  overlapsBox: (pos: Vec3, min: Vec3, max: Vec3) => boolean;
}

export type ShapeOf = (body: Body) => BodyShape | undefined;

/** Separation from a contacted voxel face, in blocks; not physical travel. */
export const CONTACT_SKIN = 1e-4;
/**
 * How close a shaped body's sideways contact is found, in blocks (1 cm at 0.5 m blocks). A shape has no flat
 * face to snap to, so contact is a search; a shaped body lands to within CONTACT_SKIN, so its ground probe
 * still finds the floor.
 */
const SHAPE_CONTACT_STEP = 0.02;
const MAX_STEP = 0.45; // per-axis move per substep; below 1 so only one new block layer is touched

type Axis = 0 | 1 | 2;

const halfExtent = (body: Body, axis: Axis): number =>
  axis === 2 ? (body.halfDepth ?? body.halfWidth) : body.halfWidth;
const offsets = (body: Body, axis: Axis): [number, number] =>
  axis === 1 ? [0, body.height] : [-halfExtent(body, axis), halfExtent(body, axis)];

const overlapsBlock = (body: Body, block: Vec3): boolean => {
  const [x, y, z] = body.pos;
  const halfX = body.halfWidth;
  const halfZ = body.halfDepth ?? halfX;
  return (
    block[0] + 1 > x - halfX &&
    block[0] < x + halfX &&
    block[1] + 1 > y &&
    block[1] < y + body.height &&
    block[2] + 1 > z - halfZ &&
    block[2] < z + halfZ
  );
};

const overlapsTerrain = (body: Body, isSolid: SolidAt): boolean => {
  const [x, y, z] = body.pos;
  const halfX = body.halfWidth;
  const halfZ = body.halfDepth ?? halfX;
  for (let by = Math.floor(y); by < Math.ceil(y + body.height); by++) {
    for (let bz = Math.floor(z - halfZ); bz < Math.ceil(z + halfZ); bz++) {
      for (let bx = Math.floor(x - halfX); bx < Math.ceil(x + halfX); bx++) {
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
  body.pos[2] - (body.halfDepth ?? body.halfWidth) < other.pos[2] + (other.halfDepth ?? other.halfWidth) &&
  body.pos[2] + (body.halfDepth ?? body.halfWidth) > other.pos[2] - (other.halfDepth ?? other.halfWidth);

const boxMin = (body: Body): Vec3 => [
  body.pos[0] - body.halfWidth,
  body.pos[1],
  body.pos[2] - (body.halfDepth ?? body.halfWidth),
];
const boxMax = (body: Body): Vec3 => [
  body.pos[0] + body.halfWidth,
  body.pos[1] + body.height,
  body.pos[2] + (body.halfDepth ?? body.halfWidth),
];

/** Two bodies overlap where a shape meets the other's box; two shaped bodies meet as shape and box. */
const bodiesOverlap = (body: Body, other: Body, shapeOf: ShapeOf | undefined): boolean => {
  const own = shapeOf?.(body);
  if (own) {
    return own.overlapsBox(body.pos, boxMin(other), boxMax(other));
  }
  const theirs = shapeOf?.(other);
  return theirs ? theirs.overlapsBox(other.pos, boxMin(body), boxMax(body)) : overlapsBody(body, other);
};

const terrainHits = (body: Body, isSolid: SolidAt, shapeOf: ShapeOf | undefined): boolean => {
  const shape = shapeOf?.(body);
  return shape ? shape.overlapsTerrain(body.pos) : overlapsTerrain(body, isSolid);
};

const overlapsSolid = (body: Body, isSolid: SolidAt, bodies: readonly Body[], shapeOf: ShapeOf | undefined): boolean =>
  terrainHits(body, isSolid, shapeOf) || bodies.some((other) => bodiesOverlap(body, other, shapeOf));

/** Whether a shaped body rests on terrain: its shape a skin's depth lower would meet it. */
const shapeSupported = (body: Body, shape: BodyShape): boolean => {
  const [, y] = body.pos;
  body.pos[1] = y - 2 * CONTACT_SKIN;
  const supported = shape.overlapsTerrain(body.pos);
  body.pos[1] = y;
  return supported;
};

interface CollisionContext {
  isSolid: SolidAt;
  bodies?: readonly Body[];
  shapeOf?: ShapeOf | undefined;
}

const bodyContact = (body: Body, other: Body, axis: Axis, delta: number): number => {
  const bodyCenter = body.pos[axis]! - delta + (axis === 1 ? body.height / 2 : 0);
  const otherCenter = other.pos[axis]! + (axis === 1 ? other.height / 2 : 0);
  const onNegativeSide = bodyCenter < otherCenter || (bodyCenter === otherCenter && delta < 0);
  if (axis === 1) {
    return onNegativeSide ? other.pos[1] - body.height : other.pos[1] + other.height;
  }
  const halfWidths = halfExtent(body, axis) + halfExtent(other, axis);
  return onNegativeSide ? other.pos[axis] - halfWidths : other.pos[axis] + halfWidths;
};

/** Where a box that moved `delta` into a block layer stops: against that layer's face. */
const boxTerrainContact = (body: Body, axis: Axis, delta: number): number => {
  const [lo, hi] = offsets(body, axis);
  return delta > 0
    ? Math.ceil(body.pos[axis]! + hi) - 1 - hi - CONTACT_SKIN
    : Math.floor(body.pos[axis]! + lo) + 1 - lo + CONTACT_SKIN;
};

/** A move along one axis from `start` by `delta`. */
interface AxisMove {
  readonly axis: Axis;
  readonly start: number;
  readonly delta: number;
}

/**
 * The furthest a move from the free `start` gets before `blocked`, found by halving: to within
 * SHAPE_CONTACT_STEP sideways and CONTACT_SKIN vertically. Leaves the body at `start + delta`.
 */
const searchContact = (body: Body, { axis, start, delta }: AxisMove, blocked: () => boolean): number => {
  const tolerance = (axis === 1 ? CONTACT_SKIN : SHAPE_CONTACT_STEP) / Math.abs(delta);
  let free = 0;
  let hit = 1;
  while (hit - free > tolerance) {
    const middle = (free + hit) / 2;
    body.pos[axis] = start + middle * delta;
    if (blocked()) {
      hit = middle;
    } else {
      free = middle;
    }
  }
  body.pos[axis] = start + delta;
  return start + free * delta;
};

/**
 * Where a shaped body that moved into terrain stops. One already in terrain where it started (spawned or
 * restored there) moves as its box would, so it is neither held in place nor let sink.
 */
const shapeTerrainContact = (body: Body, shape: BodyShape, move: AxisMove, isSolid: SolidAt): number => {
  const { axis, start, delta } = move;
  body.pos[axis] = start;
  const stuck = shape.overlapsTerrain(body.pos);
  body.pos[axis] = start + delta;
  if (stuck) {
    return overlapsTerrain(body, isSolid) ? boxTerrainContact(body, axis, delta) : start + delta;
  }
  return searchContact(body, move, () => shape.overlapsTerrain(body.pos));
};

/** Moves along one axis; on contact, stops at the nearest obstacle. Returns true on contact. */
const moveAxis = (
  body: Body,
  axis: Axis,
  delta: number,
  { isSolid, bodies = [], shapeOf }: CollisionContext,
): boolean => {
  if (delta === 0) {
    return false;
  }
  const shape = shapeOf?.(body);
  const alreadyOverlapping = new Set(bodies.filter((other) => bodiesOverlap(body, other, shapeOf)));
  const move: AxisMove = { axis, start: body.pos[axis]!, delta };
  body.pos[axis] = move.start + delta;
  const terrainHit = shape ? shape.overlapsTerrain(body.pos) : overlapsTerrain(body, isSolid);
  const bodyHits = bodies.filter((other) => !alreadyOverlapping.has(other) && bodiesOverlap(body, other, shapeOf));
  if (!terrainHit && bodyHits.length === 0) {
    return false;
  }
  const contacts: number[] = [];
  if (terrainHit) {
    contacts.push(shape ? shapeTerrainContact(body, shape, move, isSolid) : boxTerrainContact(body, axis, delta));
  }
  for (const other of bodyHits) {
    contacts.push(
      shape || shapeOf?.(other)
        ? searchContact(body, move, () => bodiesOverlap(body, other, shapeOf))
        : bodyContact(body, other, axis, delta),
    );
  }
  body.pos[axis] = delta > 0 ? Math.min(...contacts) : Math.max(...contacts);
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
  shapeOf: ShapeOf | undefined;
}

/** Tries to move along a horizontal axis from a raised position, then settles back down. */
const tryStepUp = ({ body, isSolid, stepHeight, bodies, shapeOf }: MoveContext, axis: Axis, delta: number): boolean => {
  body.pos[1] += stepHeight;
  if (terrainHits(body, isSolid, shapeOf)) {
    body.pos[1] -= stepHeight;
    return false;
  }
  body.pos[axis] += delta;
  if (overlapsSolid(body, isSolid, bodies, shapeOf)) {
    body.pos[axis] -= delta;
    body.pos[1] -= stepHeight;
    return false;
  }
  moveAxis(body, 1, -stepHeight, { isSolid, shapeOf }); // lands on terrain, never a body
  return true;
};

/** Horizontal move that climbs terrain ledges up to stepHeight when grounded, never bodies. */
const moveHorizontal = (ctx: MoveContext, axis: Axis, delta: number): void => {
  const { body, isSolid, stepHeight, grounded, bodies, shapeOf } = ctx;
  const start = body.pos[axis]!;
  const speed = body.vel[axis]!;
  if (!(moveAxis(body, axis, delta, { isSolid, bodies, shapeOf }) && grounded) || stepHeight <= 0) {
    return;
  }
  // Blocked: retry the whole move from a raised position.
  body.pos[axis] = start;
  body.vel[axis] = speed;
  if (!tryStepUp(ctx, axis, delta)) {
    moveAxis(body, axis, delta, { isSolid, bodies, shapeOf });
  }
};

/**
 * Whether a body stays on the ground at the end of a step. A box drops by two skins to find out; a shape
 * that rests on terrain is only tested there, since a contact search to within a skin costs several tests.
 */
const groundProbe = (body: Body, isSolid: SolidAt, shape: BodyShape | undefined): boolean =>
  shape ? shapeSupported(body, shape) : moveAxis(body, 1, -2 * CONTACT_SKIN, { isSolid });

/** Applies gravity and velocity for dt seconds, resolving collisions axis by axis (y first). */
export const stepBody = (body: Body, dt: number, isSolid: SolidAt, params: PhysicsParams): void => {
  const obstacles = params.obstacles ?? [];
  const { shapeOf } = params;
  const shape = shapeOf?.(body);
  const wasGrounded = body.onGround;
  body.vel[1] -= params.gravity * dt;
  const largest = Math.max(...body.vel.map((v) => Math.abs(v * dt)));
  const substeps = Math.max(1, Math.ceil(largest / MAX_STEP));
  const h = dt / substeps;
  body.onGround = false;
  for (let i = 0; i < substeps; i++) {
    const falling = body.vel[1] < 0;
    if (shape && falling && (wasGrounded || body.onGround) && shapeSupported(body, shape)) {
      // Resting on terrain: gravity's pull would only start a contact search back to here.
      body.vel[1] = 0;
      body.onGround = true;
    } else if (moveAxis(body, 1, body.vel[1] * h, { isSolid, shapeOf }) && falling) {
      body.onGround = true;
    }
    const ctx: MoveContext = {
      body,
      isSolid,
      stepHeight: params.stepHeight,
      grounded: wasGrounded || body.onGround,
      bodies: obstacles,
      shapeOf,
    };
    moveHorizontal(ctx, 0, body.vel[0] * h);
    moveHorizontal(ctx, 2, body.vel[2] * h);
    if (body.onGround) {
      body.onGround = groundProbe(body, isSolid, shape);
    }
  }
};

/** Moves a grounded actor horizontally in collision-bounded substeps without running gravity. */
export const stepBodyHorizontal = (
  body: Body,
  movement: { dx: number; dz: number; isSolid: SolidAt; params: PhysicsParams },
): void => {
  const { dx, dz, isSolid, params } = movement;
  const { shapeOf } = params;
  const shape = shapeOf?.(body);
  const largest = Math.max(Math.abs(dx), Math.abs(dz));
  const substeps = Math.max(1, Math.ceil(largest / MAX_STEP));
  for (let i = 0; i < substeps; i++) {
    const ctx: MoveContext = {
      body,
      isSolid,
      stepHeight: params.stepHeight,
      grounded: body.onGround,
      bodies: params.obstacles ?? [],
      shapeOf,
    };
    moveHorizontal(ctx, 0, dx / substeps);
    moveHorizontal(ctx, 2, dz / substeps);
    if (body.onGround) {
      body.onGround = groundProbe(body, isSolid, shape);
    }
  }
};

const pushPairAlongAxis = ({
  first,
  second,
  axis,
  direction,
  push,
  collision,
}: {
  first: Body;
  second: Body;
  axis: Axis;
  direction: number;
  push: number;
  collision: CollisionContext;
}): readonly [number, number] => {
  const firstStart = first.pos[axis]!;
  const secondStart = second.pos[axis]!;
  moveAxis(first, axis, -direction * push, collision);
  moveAxis(second, axis, direction * push, collision);
  return [Math.abs(first.pos[axis]! - firstStart), Math.abs(second.pos[axis]! - secondStart)];
};

const separateOnOtherAxis = ({
  first,
  second,
  axis,
  overlapX,
  overlapZ,
  firstMoved,
  secondMoved,
  maxPushBlocks,
  collision,
}: {
  first: Body;
  second: Body;
  axis: Axis;
  overlapX: number;
  overlapZ: number;
  firstMoved: number;
  secondMoved: number;
  maxPushBlocks: number;
  collision: CollisionContext;
}): void => {
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

interface PairContext extends CollisionContext {
  /** Whether the pair overlaps by its shapes or only by its boxes; pushes always clip by shape. */
  meetShapes: boolean;
}

const separatePair = (first: Body, second: Body, maxPushBlocks: number, collision: PairContext): void => {
  if (!(collision.meetShapes ? bodiesOverlap(first, second, collision.shapeOf) : overlapsBody(first, second))) {
    return;
  }
  const deltaX = second.pos[0] - first.pos[0];
  const deltaZ = second.pos[2] - first.pos[2];
  const overlapX = first.halfWidth + second.halfWidth - Math.abs(deltaX);
  const overlapZ = (first.halfDepth ?? first.halfWidth) + (second.halfDepth ?? second.halfWidth) - Math.abs(deltaZ);
  if (overlapX <= 0 || overlapZ <= 0) {
    return;
  }
  const axis: Axis = overlapX <= overlapZ ? 0 : 2;
  const overlap = axis === 0 ? overlapX : overlapZ;
  const component = axis === 0 ? deltaX : deltaZ;
  const direction = component === 0 ? 1 : Math.sign(component);
  const push = Math.min(overlap / 2, maxPushBlocks);
  const [firstMoved, secondMoved] = pushPairAlongAxis({ first, second, axis, direction, push, collision });
  if (firstMoved < push - CONTACT_SKIN || secondMoved < push - CONTACT_SKIN) {
    separateOnOtherAxis({
      first,
      second,
      axis,
      overlapX,
      overlapZ,
      firstMoved,
      secondMoved,
      maxPushBlocks,
      collision,
    });
  }
};

interface Separation {
  dt: number;
  isSolid: SolidAt;
  blockSize: number;
  obstacles?: readonly Body[];
  shapeOf?: ShapeOf | undefined;
}

/**
 * Pairwise horizontal separation, capped per push and clipped against terrain and supplied blockers. A pair
 * with a shaped body overlaps only where the shape meets the other's box, so the player can stand against an
 * amalgam's flesh.
 */
export const separateBodyPair = ({
  first,
  second,
  dt,
  isSolid,
  blockSize,
  obstacles = [],
  shapeOf,
}: Separation & { first: Body; second: Body }): void => {
  separatePair(first, second, dt / blockSize, { isSolid, bodies: obstacles, shapeOf, meetShapes: true });
};

/** Separates zombies from each other by their boxes, the cheap test a crowd needs; pushes clip by shape. */
export const separateBodies = ({
  bodies,
  dt,
  isSolid,
  blockSize,
  obstacles = [],
  shapeOf,
}: Separation & { bodies: readonly Body[] }): void => {
  for (let i = 0; i < bodies.length; i++) {
    const first = bodies[i]!;
    for (let j = i + 1; j < bodies.length; j++) {
      const second = bodies[j]!;
      separatePair(first, second, dt / blockSize, { isSolid, bodies: obstacles, shapeOf, meetShapes: false });
    }
  }
};

/** True if the box at pos would overlap the given block (used to stop placing blocks inside the player). */
export const bodyOverlapsBlock = (body: Body, block: Vec3): boolean => overlapsBlock(body, block);

/** True if the box at pos would overlap any solid block (used to check room before the player stands up). */
export const bodyOverlapsTerrain = (body: Body, isSolid: SolidAt): boolean => overlapsTerrain(body, isSolid);
