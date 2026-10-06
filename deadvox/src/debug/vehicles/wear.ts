/**
 * Paint wear: a fitting's paint and seam voxels recoloured into a few worn shades, seeded by the
 * fitting's id so the same vehicle always looks the same. The shades are whole materials rather than
 * per-voxel tints, so the greedy mesher still merges runs of one shade.
 */
import { keyVoxel, type Vec3i, type VoxelGrid, voxelKey } from './voxels.ts';

/** Materials wear writes; a palette may name them, or `wearPalette` derives them from its paint. */
export const WEAR_MATERIALS = ['paint-worn', 'scratch', 'dirt', 'rust'] as const;

const WORN_MATERIALS: ReadonlySet<string> = new Set(['paint', 'seam']);

/** Dirt fades out by this height above the ground, in voxels. */
const DIRT_LINE = 18;
/** Dirt reaches this many voxels out from a wheel's tyre. */
const ARCH_REACH = 7;

/** Where a fitting sits, for the wear that depends on the vehicle rather than the part. */
export interface WearSite {
  /** The fitting's local origin in vehicle voxels. */
  readonly origin: Vec3i;
  /** Each wheel's centre and radius in vehicle voxels, across x and y. */
  readonly wheels: readonly (readonly [x: number, y: number, radius: number])[];
}

const seedOf = (id: string): number => {
  let h = 2_166_136_261;
  for (let i = 0; i < id.length; i += 1) {
    h = Math.imul(h ^ id.charCodeAt(i), 16_777_619);
  }
  return h >>> 0;
};

/** A uniform value in [0, 1) from a seed and a voxel. */
const hash = (seed: number, x: number, y: number, z: number): number => {
  let h = seed ^ Math.imul(x, 0x27_d4_eb_2d) ^ Math.imul(y, 0x16_56_67_b1) ^ Math.imul(z, 0x1b_87_35_93);
  h = Math.imul(h ^ (h >>> 15), 0x2c_1b_3c_6d);
  h = Math.imul(h ^ (h >>> 12), 0x29_7a_2d_39);
  return ((h ^ (h >>> 15)) >>> 0) / 4_294_967_296;
};

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

/** How worn one fitting is at a vehicle's wear level: parts differ, the same part always the same. */
export const fittingWear = (fittingId: string, level: number): number =>
  clamp01(level * (0.55 + 0.9 * hash(seedOf(fittingId), 0, 0, 0)));

const OFFSETS = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
] as const;

/** The axes along which a voxel has an open face: an edge has two, a flat face one, a buried voxel none. */
const openAxes = (grid: VoxelGrid, [x, y, z]: Vec3i): Set<number> => {
  const axes = new Set<number>();
  for (const [k, offset] of OFFSETS.entries()) {
    if (!grid.has(voxelKey(x + offset[0], y + offset[1], z + offset[2]))) {
      axes.add(k >> 1);
    }
  }
  return axes;
};

interface Streak {
  readonly x0: number;
  readonly y0: number;
  readonly length: number;
  readonly slope: number;
}

/** Short, nearly level scratches across the fitting's side faces, as a key or a door edge leaves them. */
const scratchStreaks = (grid: VoxelGrid, seed: number, amount: number): Streak[] => {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let sideFaces = 0;
  for (const [key, mat] of grid) {
    const voxel = keyVoxel(key);
    if (mat === 'paint' && openAxes(grid, voxel).has(2)) {
      sideFaces += 1;
      minX = Math.min(minX, voxel[0]);
      maxX = Math.max(maxX, voxel[0]);
      minY = Math.min(minY, voxel[1]);
      maxY = Math.max(maxY, voxel[1]);
    }
  }
  const count = Math.round((amount * sideFaces) / 320);
  return Array.from({ length: count }, (_, s) => ({
    x0: minX + Math.floor(hash(seed, s, 1, 0) * (maxX - minX + 1)),
    y0: minY + Math.floor(hash(seed, s, 2, 0) * (maxY - minY + 1)),
    length: 4 + Math.floor(hash(seed, s, 3, 0) * 9),
    slope: (hash(seed, s, 4, 0) - 0.5) * 0.35,
  }));
};

const onStreak = (streaks: readonly Streak[], x: number, y: number): boolean =>
  streaks.some(
    (streak) =>
      x >= streak.x0 && x < streak.x0 + streak.length && y === Math.round(streak.y0 + streak.slope * (x - streak.x0)),
  );

/** Dirt is likelier low down and around the wheel arches. */
const dirtChance = (site: WearSite, x: number, y: number): number => {
  const low = clamp01(1 - (y + site.origin[1]) / DIRT_LINE) ** 1.5;
  const arch = Math.max(
    0,
    ...site.wheels.map(([wx, wy, radius]) => {
      const out = Math.hypot(x + site.origin[0] - wx, y + site.origin[1] - wy) - radius;
      return out < 0 ? 0 : clamp01(1 - out / ARCH_REACH) * 0.8;
    }),
  );
  return Math.max(low, arch);
};

/**
 * A fitting's local grid with wear applied at `amount` (0 leaves it as it is). Only paint and seam
 * voxels change, and only into `WEAR_MATERIALS`, so wear never changes a part's shape.
 */
export const wearGrid = (grid: VoxelGrid, fittingId: string, amount: number, site: WearSite): VoxelGrid => {
  if (amount <= 0) {
    return grid;
  }
  const seed = seedOf(fittingId);
  const streaks = scratchStreaks(grid, seed, amount);
  const worn: VoxelGrid = new Map();
  for (const [key, mat] of grid) {
    worn.set(key, WORN_MATERIALS.has(mat) ? wornMaterial(grid, { key, mat, seed, amount, site, streaks }) : mat);
  }
  return worn;
};

interface WornVoxel {
  readonly key: number;
  readonly mat: string;
  readonly seed: number;
  readonly amount: number;
  readonly site: WearSite;
  readonly streaks: readonly Streak[];
}

const wornMaterial = (grid: VoxelGrid, { key, mat, seed, amount, site, streaks }: WornVoxel): string => {
  const voxel = keyVoxel(key);
  const [x, y, z] = voxel;
  const open = openAxes(grid, voxel);
  if (open.size === 0) {
    return mat;
  }
  if (mat === 'seam') {
    const low = clamp01(1 - (y + site.origin[1]) / (DIRT_LINE * 2));
    // Rust starts low, where water and road salt sit.
    return hash(seed, x, y, z) < amount * (0.03 + 0.4 * low ** 2) ? 'rust' : mat;
  }
  // Dirt clumps in two-voxel blocks, so it reads as grime and keeps the mesher's merges long.
  if (hash(seed ^ 0x5b_d1, x >> 1, y >> 1, z >> 1) < amount * dirtChance(site, x, y)) {
    return 'dirt';
  }
  if (open.has(2) && onStreak(streaks, x, y)) {
    return 'scratch';
  }
  if (open.size >= 2 && hash(seed, x, y, z) < amount * 0.45) {
    return 'paint-worn';
  }
  return mat;
};

const mix = (from: string, to: string, t: number): string => {
  const channel = (hex: string, at: number): number => Number.parseInt(hex.slice(at, at + 2), 16);
  return `#${[1, 3, 5]
    .map((at) =>
      Math.round(channel(from, at) + (channel(to, at) - channel(from, at)) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};

/** Wear colours from a vehicle's paint: chalky worn edges, bright primer scratches, road grime and rust. */
export const wearPalette = (paint: string): Readonly<Record<(typeof WEAR_MATERIALS)[number], string>> => ({
  'paint-worn': mix(paint, '#dcd6c8', 0.3),
  scratch: mix(paint, '#d8d4cb', 0.4),
  dirt: mix(paint, '#4b4134', 0.6),
  rust: '#7d4a2b',
});
