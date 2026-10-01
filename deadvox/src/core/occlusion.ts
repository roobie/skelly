// Wide-radius ambient occlusion from the voxel grid. Pure: the mesher asks, per quad corner, how
// much of the half-space in front of the face is solid, and gets back a small quantized level.
//
// The mesher is handed a solidity array that reaches OCCLUSION_RADIUS blocks beyond the chunk
// (world.ts `extractWide`), and a summed-volume table over it, so every box query is 8 lookups
// whatever the radius. This is the crude "how enclosed is this spot" term (rooms, canyons, under
// overhangs); the 3-neighbour corner AO baked into vertex colours (mesher.ts) stays as it is.

import { CHUNK } from './coords.ts';

/** Radius R in blocks (4 m at 0.5 m blocks). The solidity array has this border on every side. */
export const OCCLUSION_RADIUS = 8;

/** Side of the solidity array: the chunk plus the border on both sides. */
export const WIDE = CHUNK + 2 * OCCLUSION_RADIUS;

export const wideIndex = (x: number, y: number, z: number): number => x + WIDE * (z + WIDE * y);

// Tuning. Everything that shapes the look of the term is here.
/** Number of quantized levels (0 = most occluded). Fewer levels merge more quads. 6 makes 255 / 5 = 51 per step. */
export const OCCLUSION_LEVELS = 6;
/** Ambient factor at full occlusion. Never fully black: a closed room still has some bounce light. */
export const OCCLUSION_FLOOR = 0.35;
/** Exponent on openness (1 - solid fraction); above 1 darkens partly-enclosed spots more, below 1 less. */
export const OCCLUSION_GAMMA = 1;

/** Cells in a query box: R along the normal, 2R across each tangent axis. */
export const BOX_VOLUME = OCCLUSION_RADIUS * (2 * OCCLUSION_RADIUS) ** 2;

/** Level for each possible solid count in a box. Open ground is the top level. */
const LEVEL_OF_COUNT = new Uint8Array(BOX_VOLUME + 1);
for (let count = 0; count <= BOX_VOLUME; count++) {
  const openness = 1 - count / BOX_VOLUME;
  LEVEL_OF_COUNT[count] = Math.round(openness ** OCCLUSION_GAMMA * (OCCLUSION_LEVELS - 1));
}

/** Vertex attribute byte (normalized to the ambient factor) for each level: floor at level 0, 1 at the top. */
const BYTE_OF_LEVEL = new Uint8Array(OCCLUSION_LEVELS);
for (let level = 0; level < OCCLUSION_LEVELS; level++) {
  const factor = OCCLUSION_FLOOR + ((1 - OCCLUSION_FLOOR) * level) / (OCCLUSION_LEVELS - 1);
  BYTE_OF_LEVEL[level] = Math.round(factor * 255);
}

/** The quantized level (0..OCCLUSION_LEVELS - 1) for a box holding `solidCount` solid cells. */
export const occlusionLevel = (solidCount: number): number => LEVEL_OF_COUNT[solidCount]!;

/** The vertex attribute byte for a level. */
export const occlusionByte = (level: number): number => BYTE_OF_LEVEL[level]!;

/** Level meaning "not occluded"; what a mesh gets when no solidity array was supplied. */
export const OPEN_LEVEL = OCCLUSION_LEVELS - 1;

/** Side of the summed-volume table: one more than the solidity array, so the low edge is a zero plane. */
const SUMS = WIDE + 1;

/** A table for `buildSums` to fill. Allocate once and reuse; its zero planes at index 0 are never written. */
export const makeSums = (): Int32Array => new Int32Array(SUMS * SUMS * SUMS);

const sumsIndex = (x: number, y: number, z: number): number => x + SUMS * (z + SUMS * y);

/**
 * Fills `sums` so that sums[x, y, z] is the number of non-zero cells of `wide` with all three
 * coordinates below (x, y, z). One pass: each entry is its cell plus the three entries one step
 * back along an axis, minus the three back along two axes, plus the one back along all three
 * (inclusion-exclusion).
 */
export const buildSums = (wide: Uint8Array, sums: Int32Array): void => {
  for (let y = 0; y < WIDE; y++) {
    for (let z = 0; z < WIDE; z++) {
      const row = wideIndex(0, y, z);
      for (let x = 0; x < WIDE; x++) {
        const at = sumsIndex(x + 1, y + 1, z + 1);
        sums[at] =
          (wide[row + x]! === 0 ? 0 : 1) +
          sums[at - 1]! +
          sums[at - SUMS]! +
          sums[at - SUMS * SUMS]! -
          sums[at - 1 - SUMS]! -
          sums[at - 1 - SUMS * SUMS]! -
          sums[at - SUMS - SUMS * SUMS]! +
          sums[at - 1 - SUMS - SUMS * SUMS]!;
      }
    }
  }
};

/**
 * Solid cells in the half-open box [x0, x1) × [y0, y1) × [z0, z1) of the solidity array, with the
 * limits given as `[x0, x1, y0, y1, z0, z1]` (an array so the mesher can reuse one: no allocation).
 */
export const boxSum = (sums: Int32Array, limits: ArrayLike<number>): number => {
  const x0 = limits[0]!;
  const x1 = limits[1]!;
  const y0 = limits[2]!;
  const y1 = limits[3]!;
  const z0 = limits[4]!;
  const z1 = limits[5]!;
  return (
    sums[sumsIndex(x1, y1, z1)]! -
    sums[sumsIndex(x0, y1, z1)]! -
    sums[sumsIndex(x1, y0, z1)]! -
    sums[sumsIndex(x1, y1, z0)]! +
    sums[sumsIndex(x0, y0, z1)]! +
    sums[sumsIndex(x0, y1, z0)]! +
    sums[sumsIndex(x1, y0, z0)]! -
    sums[sumsIndex(x0, y0, z0)]!
  );
};
