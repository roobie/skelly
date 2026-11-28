import type { Vec3 } from './coords.ts';

export interface RayHit {
  block: Vec3;
  /** Face that was hit, pointing out of the block. Zero if the ray starts inside it. */
  normal: Vec3;
  distance: number;
}

/** The axis whose next grid boundary is closest along the ray. */
const nearestAxis = (tMax: Vec3): 0 | 1 | 2 => {
  if (tMax[0] < tMax[1]) {
    return tMax[0] < tMax[2] ? 0 : 2;
  }
  return tMax[1] < tMax[2] ? 1 : 2;
};

export type SolidAt = (x: number, y: number, z: number) => boolean;

/** Intersects a bounded cell-local shape; distances remain parameters of the original ray. */
export type RayShape = (
  origin: Vec3,
  direction: Vec3,
  maximum: number,
) => Pick<RayHit, 'distance' | 'normal'> | undefined;
export type RayAt = (x: number, y: number, z: number) => boolean | RayShape;

const hitCell = (
  query: boolean | RayShape,
  cell: Vec3,
  ray: { origin: Vec3; dir: Vec3; enter: number; exit: number; normal: Vec3 },
): RayHit | undefined => {
  const candidate = query;
  if (!candidate) {
    return undefined;
  }
  if (candidate === true) {
    return { block: [...cell], normal: ray.normal, distance: ray.enter };
  }
  const local = ray.origin.map((v, axis) => v - cell[axis]!) as Vec3;
  const hit = candidate(local, ray.dir, ray.exit);
  // A shape bounded by its cell cannot be entered before the cell.
  return hit && hit.distance <= ray.exit
    ? { block: [...cell], ...hit, distance: Math.max(hit.distance, ray.enter) }
    : undefined;
};

/** Walks the voxel grid along a ray (Amanatides & Woo) and returns the first solid block. */
export const raycast = (origin: Vec3, dir: Vec3, maxDistance: number, isSolid: RayAt): RayHit | undefined => {
  const pos: Vec3 = [Math.floor(origin[0]), Math.floor(origin[1]), Math.floor(origin[2])];
  const step: Vec3 = [0, 0, 0];
  const tMax: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const tDelta: Vec3 = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  for (let a = 0; a < 3; a++) {
    const d = dir[a]!;
    if (d > 0) {
      step[a] = 1;
      tDelta[a] = 1 / d;
      tMax[a] = (pos[a]! + 1 - origin[a]!) / d;
    } else if (d < 0) {
      step[a] = -1;
      tDelta[a] = -1 / d;
      tMax[a] = (origin[a]! - pos[a]!) / -d;
    }
  }

  const initial = hitCell(isSolid(...pos), pos, {
    origin,
    dir,
    enter: 0,
    exit: Math.min(maxDistance, ...tMax),
    normal: [0, 0, 0],
  });
  if (initial) {
    return initial;
  }

  for (;;) {
    const a = nearestAxis(tMax);
    const t = tMax[a];
    if (t > maxDistance) {
      return undefined;
    }
    pos[a] += step[a];
    tMax[a] += tDelta[a];
    const candidate = isSolid(...pos);
    if (!candidate) {
      continue;
    }
    const normal: Vec3 = [0, 0, 0];
    normal[a] = -step[a];
    const hit = hitCell(candidate, pos, { origin, dir, enter: t, exit: Math.min(maxDistance, ...tMax), normal });
    if (hit) {
      return hit;
    }
  }
};

/** Every cell whose open interior the box between two corners reaches. */
function* cellsReached(low: Readonly<Vec3>, high: Readonly<Vec3>): Generator<Vec3> {
  const [x0, y0, z0] = low.map(Math.floor);
  const [x1, y1, z1] = high.map((value) => Math.ceil(value) - 1);
  for (let x = x0!; x <= x1!; x++) {
    for (let y = y0!; y <= y1!; y++) {
      for (let z = z0!; z <= z1!; z++) {
        yield [x, y, z];
      }
    }
  }
}

/** The fractions of a move along one axis during which a cube's open span overlaps a cell's. */
const axisOverlap = (
  start: number,
  delta: number,
  cell: number,
  halfExtent: number,
): readonly [number, number] | undefined => {
  const low = cell - halfExtent - start;
  const high = cell + 1 + halfExtent - start;
  if (delta === 0) {
    return low < 0 && high > 0 ? [Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY] : undefined;
  }
  const a = low / delta;
  const b = high / delta;
  return a < b ? [a, b] : [b, a];
};

/**
 * The fraction of a move at which a cube first touches a cell: negative when it overlaps the cell from the start,
 * undefined when it does not reach the cell within the move.
 */
const cellContact = (
  from: Readonly<Vec3>,
  delta: Readonly<Vec3>,
  cell: Readonly<Vec3>,
  halfExtent: number,
): number | undefined => {
  let enter = Number.NEGATIVE_INFINITY;
  let exit = Number.POSITIVE_INFINITY;
  for (let axis = 0; axis < 3; axis++) {
    const overlap = axisOverlap(from[axis]!, delta[axis]!, cell[axis]!, halfExtent);
    if (!overlap) {
      return undefined;
    }
    enter = Math.max(enter, overlap[0]);
    exit = Math.min(exit, overlap[1]);
  }
  return enter < exit && exit > 0 && enter < 1 ? enter : undefined;
};

/**
 * How far, as a fraction of the way from `from` to `to`, an axis-aligned cube travels before it first touches a solid
 * cell; undefined when it already overlaps one at `from`. A cube meets axis-aligned cells exactly, so the clearance
 * it keeps does not shrink with the angle of approach the way a margin taken back along a ray does.
 */
export const sweepCube = (
  from: Readonly<Vec3>,
  to: Readonly<Vec3>,
  halfExtent: number,
  isSolid: SolidAt,
): number | undefined => {
  const delta: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const low = from.map((value, axis) => Math.min(value, to[axis]!) - halfExtent) as Vec3;
  const high = from.map((value, axis) => Math.max(value, to[axis]!) + halfExtent) as Vec3;
  let travelled = 1;
  for (const cell of cellsReached(low, high)) {
    const contact = isSolid(...cell) ? cellContact(from, delta, cell, halfExtent) : undefined;
    if (contact !== undefined && contact < 0) {
      return undefined;
    }
    travelled = Math.min(travelled, contact ?? 1);
  }
  return travelled;
};
