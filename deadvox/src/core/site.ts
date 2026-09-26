// What stands near spawn: the hamlet, or the stress-test city. A site shapes the
// ground, writes its buildings into chunks and says what furniture each column has.
// Everything is a pure function of the seed and position, so chunks can generate in
// any order.

import type { EntitySpec } from './blockEntities.ts';
import type { Chunk } from './chunk.ts';
import type { Registry } from './content.ts';
import { toChunk, type Vec3 } from './coords.ts';
import { type Rolled, rollLoot } from './loot.ts';
import { Rng } from './random.ts';
import { type Placement, placedPieces } from './templates.ts';
import type { Surface } from './worldgen.ts';

/** A rectangle of block columns. */
export interface Rect {
  x0: number;
  z0: number;
  /** Exclusive. */
  x1: number;
  z1: number;
}

export const smoothstep = (t: number): number => t * t * (3 - 2 * t);

/** Blocks from a column to a rectangle; 0 inside. */
export const rectDistance = (r: Rect, x: number, z: number): number => {
  const dx = x < r.x0 ? r.x0 - x : Math.max(0, x - (r.x1 - 1));
  const dz = z < r.z0 ? r.z0 - z : Math.max(0, z - (r.z1 - 1));
  return Math.hypot(dx, dz);
};

export const grow = (r: Rect, by: number): Rect => ({ x0: r.x0 - by, z0: r.z0 - by, x1: r.x1 + by, z1: r.z1 + by });

/** A piece of furniture and what worldgen put in it. */
export interface FurnitureSpawn {
  spec: EntitySpec;
  loot: Rolled[];
}

export interface Site {
  /** The ground under the site, blended into the natural ground around it. */
  readonly surface: Surface;
  /** Where the player starts: feet in metres, and a yaw. */
  readonly spawn: { pos: Vec3; yaw: number };
  /** Writes the site's blocks that fall inside a chunk. */
  stamp: (chunk: Chunk) => void;
  /** Furniture anchored in the column (cx, cz), with its loot. */
  furnitureIn: (cx: number, cz: number) => FurnitureSpawn[];
}

/**
 * The furniture of a placed template that's anchored in a column, with loot rolled
 * for each container from a stream of its own, keyed by where it is.
 */
export const furnitureOf = (
  { seed, registry }: { seed: number; registry: Registry },
  placement: Placement,
  [cx, cz]: readonly [number, number],
): FurnitureSpawn[] =>
  placedPieces(placement)
    .filter((piece) => toChunk(piece.pos[0]) === cx && toChunk(piece.pos[2]) === cz)
    .map((piece) => ({
      spec: { type: piece.furniture, pos: piece.pos, size: piece.size, facing: piece.facing },
      loot:
        piece.loot === undefined ? [] : rollLoot(registry, piece.loot, Rng.stream(seed, `loot:${piece.pos.join(',')}`)),
    }));
