// What stands near spawn: the hamlet, or the stress-test city. A site shapes the
// ground, writes its buildings into chunks and says what furniture each column has.
// Everything is a pure function of the seed and position, so chunks can generate in
// any order.

import { rectDistance as cellDistance } from './authoredTerrain.mjs';
import type { EntitySpec } from './blockEntities.ts';
import type { Chunk } from './chunk.ts';
import type { SpawnTimeWindow } from './clock.ts';
import type { Registry } from './content.ts';
import { toChunk, type Vec3 } from './coords.ts';
import { type Rolled, rollLoot } from './loot.ts';
import { Rng } from './random.ts';
import type { SkyBounds } from './skylight.ts';
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

/** Blocks from a column to a rectangle; 0 inside. */
export const rectDistance = (r: Rect, x: number, z: number): number => cellDistance(r, x + 0.5, z + 0.5, 1);

export const grow = (r: Rect, by: number): Rect => ({ x0: r.x0 - by, z0: r.z0 - by, x1: r.x1 + by, z1: r.z1 + by });

/** A piece of furniture and what worldgen put in it. */
export interface FurnitureSpawn {
  spec: EntitySpec;
  loot: Rolled[];
}

export interface ZombieSpawn {
  type: string;
  /** Feet position in world blocks. */
  pos: Vec3;
  "window"?: SpawnTimeWindow;
}

export interface Site {
  /** Bounded authored cellar interiors needing voxel sky visibility instead of unoccluded hemisphere light. */
  readonly skyBounds?: readonly SkyBounds[];
  /** The ground under the site, blended into the natural ground around it. */
  readonly surface: Surface;
  /** Where the player starts: feet in metres, and a yaw. */
  readonly spawn: { pos: Vec3; yaw: number };
  /** Writes the site's blocks that fall inside a chunk. */
  stamp: (chunk: Chunk) => void;
  /** Furniture anchored in the column (cx, cz), with its loot. */
  furnitureIn: (cx: number, cz: number) => FurnitureSpawn[];
  /** Zombie spawns anchored in the column, deterministic for the site seed. */
  zombiesIn: (cx: number, cz: number) => ZombieSpawn[];
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
      spec: {
        type: piece.furniture,
        pos: piece.pos,
        size: piece.size,
        facing: piece.facing,
        ...(piece.lock ? { lock: piece.lock } : {}),
      },
      loot:
        piece.loot === undefined ? [] : rollLoot(registry, piece.loot, Rng.stream(seed, `loot:${piece.pos.join(',')}`)),
    }));
