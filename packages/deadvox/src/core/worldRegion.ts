// World regions: the unit saves are split by, and the unit of the block of nine regions simulated around the
// player (`docs/decisions/0008-deterministic-world.md`, "Decision").

import type { Vec3 } from './coords.ts';

export const WORLD_REGION_METRES = 512;

/** The region along one axis that a block coordinate lies in. */
export const regionIndex = (blockCoordinate: number, blockSize: number): number =>
  Math.floor((blockCoordinate * blockSize) / WORLD_REGION_METRES);

/**
 * Whether a point lies in the player's region or one of its eight neighbours. It depends on positions only, so
 * whether a column is loaded or drawn never decides it.
 */
export const inPlayerBlock = (point: Readonly<Vec3>, player: Readonly<Vec3>, blockSize: number): boolean =>
  [0, 2].every((axis) => Math.abs(regionIndex(point[axis]!, blockSize) - regionIndex(player[axis]!, blockSize)) <= 1);
