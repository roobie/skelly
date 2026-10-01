import { describe, expect, it } from 'vitest';
import { CHUNK } from '../src/core/coords.ts';
import { buildMesh, type MeshData } from '../src/core/mesher.ts';
import {
  BOX_VOLUME,
  boxSum,
  buildSums,
  makeSums,
  OCCLUSION_FLOOR,
  OCCLUSION_LEVELS,
  OCCLUSION_RADIUS,
  OPEN_LEVEL,
  occlusionByte,
  occlusionLevel,
  WIDE,
  wideIndex,
} from '../src/core/occlusion.ts';
import { hash3 } from '../src/core/random.ts';
import { PADDED, paddedIndex } from '../src/core/world.ts';
import { unitFaces } from './meshFaces.ts';

const R = OCCLUSION_RADIUS;
const colors = new Uint8Array([0, 0, 0, 200, 100, 50]);
type Solid = (x: number, y: number, z: number) => boolean;
type Vec = [number, number, number];

/** The padded array for a scene given as a predicate over chunk-local coordinates (the border is negative / >= CHUNK). */
const paddedOf = (solid: Solid): Uint16Array => {
  const padded = new Uint16Array(PADDED ** 3);
  for (let i = 0; i < padded.length; i++) {
    const [x, y, z] = [i % PADDED, Math.floor(i / PADDED ** 2), Math.floor(i / PADDED) % PADDED];
    padded[paddedIndex(x, y, z)] = solid(x - 1, y - 1, z - 1) ? 1 : 0;
  }
  return padded;
};

/** The wide solidity array for the same kind of predicate. */
const wideOf = (solid: Solid): Uint8Array => {
  const wide = new Uint8Array(WIDE ** 3);
  for (let i = 0; i < wide.length; i++) {
    const [x, y, z] = [i % WIDE, Math.floor(i / WIDE ** 2), Math.floor(i / WIDE) % WIDE];
    wide[wideIndex(x, y, z)] = solid(x - R, y - R, z - R) ? 1 : 0;
  }
  return wide;
};

const meshOf = (solid: Solid): MeshData => buildMesh(paddedOf(solid), colors, undefined, wideOf(solid));

interface Corner {
  pos: number[];
  normal: number[];
  byte: number;
}

/** The four corners of every quad in the mesh (a quad's vertices are consecutive). */
const quadsOf = (mesh: MeshData): Corner[][] =>
  Array.from({ length: mesh.occlusion.length / 4 }, (_, q) =>
    [0, 1, 2, 3].map((i) => {
      const v = q * 4 + i;
      const at = (a: ArrayLike<number>) => [0, 1, 2].map((k) => a[v * 3 + k]!);
      return { pos: at(mesh.positions), normal: at(mesh.normals), byte: mesh.occlusion[v]! };
    }),
  );

/** Whether the quad faces `normal` and its rectangle contains the point `pos` on its plane. */
const quadHolds = (corners: Corner[], pos: Vec, normal: Vec): boolean =>
  corners[0]!.normal.every((n, k) => n === normal[k]) &&
  [0, 1, 2].every((k) => {
    const coords = corners.map((c) => c.pos[k]!);
    const at = pos[k]!;
    return normal[k] === 0 ? at >= Math.min(...coords) && at <= Math.max(...coords) : coords[0] === at;
  });

const distance = (a: number[], b: number[]) => a.reduce((sum, v, k) => sum + Math.abs(v - b[k]!), 0);

/**
 * Occlusion byte at the mesh position `pos` facing `normal`, which may be a vertex of a unit face inside
 * a merged quad. A merged quad is flat along the axes it merged on, so its corner nearest the point
 * carries the value the unmerged faces would have there.
 */
const vertexByte = (mesh: MeshData, pos: Vec, normal: Vec): number => {
  const quad = quadsOf(mesh).find((corners) => quadHolds(corners, pos, normal));
  if (!quad) {
    throw new Error(`no quad covers ${pos} facing ${normal}`);
  }
  return quad.reduce((best, c) => (distance(c.pos, pos) < distance(best.pos, pos) ? c : best)).byte;
};

/** The box in front of the face at vertex `pos`, by the design's definition, as [lo, hi) per axis in chunk-local cells. */
const boxIn = (pos: number[], normal: number[]): [number[], number[]] => {
  const d = normal.findIndex((n) => n !== 0);
  const forward = normal[d]! > 0;
  const lo = pos.map((p, k) => (k === d && forward ? p : p - R));
  const hi = pos.map((p, k) => (k === d && !forward ? p : p + R));
  return [lo, hi];
};

const bruteCount = (wide: Uint8Array, [lo, hi]: [number[], number[]]): number => {
  let count = 0;
  for (let y = lo[1]!; y < hi[1]!; y++) {
    for (let z = lo[2]!; z < hi[2]!; z++) {
      for (let x = lo[0]!; x < hi[0]!; x++) {
        count += wide[wideIndex(x + R, y + R, z + R)]! === 0 ? 0 : 1;
      }
    }
  }
  return count;
};

const randomGrid = (seed: number, density: number): Uint8Array => {
  const wide = new Uint8Array(WIDE ** 3);
  for (let i = 0; i < wide.length; i++) {
    wide[i] = hash3(seed, i, 1, 0) < density ? 1 + (i % 3) : 0; // any non-zero id counts as solid
  }
  return wide;
};

/** A random half-open box inside the grid, as the limits boxSum takes. */
const randomLimits = (seed: number): number[] => {
  const pair = (k: number) => {
    const a = Math.floor(hash3(seed, k, 2, 0) * (WIDE + 1));
    const b = Math.floor(hash3(seed, k + 3, 2, 0) * (WIDE + 1));
    return [Math.min(a, b), Math.max(a, b)];
  };
  return [...pair(0), ...pair(1), ...pair(2)];
};

const bruteBox = (wide: Uint8Array, [x0, x1, y0, y1, z0, z1]: number[]): number => {
  let count = 0;
  for (let y = y0!; y < y1!; y++) {
    for (let z = z0!; z < z1!; z++) {
      for (let x = x0!; x < x1!; x++) {
        count += wide[wideIndex(x, y, z)]! === 0 ? 0 : 1;
      }
    }
  }
  return count;
};

describe('summed-volume box sums', () => {
  it('match a brute-force count on random grids', () => {
    const sums = makeSums();
    for (let seed = 1; seed <= 4; seed++) {
      const wide = randomGrid(seed, 0.1 + seed * 0.2);
      buildSums(wide, sums);
      let wrong = 0;
      for (let q = 0; q < 60; q++) {
        const limits = randomLimits(seed * 100 + q);
        wrong += boxSum(sums, limits) === bruteBox(wide, limits) ? 0 : 1;
      }
      expect(wrong).toBe(0);
      expect(boxSum(sums, [0, WIDE, 0, WIDE, 0, WIDE])).toBe(wide.filter((c) => c !== 0).length);
    }
  });

  it('is exact again after the table is reused for a different grid', () => {
    const sums = makeSums();
    buildSums(new Uint8Array(WIDE ** 3).fill(1), sums);
    buildSums(new Uint8Array(WIDE ** 3), sums);
    expect(boxSum(sums, [0, WIDE, 0, WIDE, 0, WIDE])).toBe(0);
  });
});

describe('occlusion levels', () => {
  it('map an empty box to fully open, a full box to the floor, and never rise with more solid cells', () => {
    expect(occlusionLevel(0)).toBe(OPEN_LEVEL);
    expect(occlusionByte(OPEN_LEVEL)).toBe(255);
    expect(occlusionLevel(BOX_VOLUME)).toBe(0);
    expect(occlusionByte(0)).toBe(Math.round(OCCLUSION_FLOOR * 255));
    const levels = Array.from({ length: BOX_VOLUME + 1 }, (_, count) => occlusionLevel(count));
    expect(levels).toEqual([...levels].sort((a, b) => b - a));
    expect(new Set(levels).size).toBe(OCCLUSION_LEVELS);
  });

  it('turn into bytes that rise with the level', () => {
    const bytes = Array.from({ length: OCCLUSION_LEVELS }, (_, level) => occlusionByte(level));
    expect(bytes).toEqual([...bytes].sort((a, b) => a - b));
    expect(new Set(bytes).size).toBe(OCCLUSION_LEVELS);
  });
});

describe('wide occlusion in the mesh', () => {
  const FloorTop = 8;
  const Up: Vec = [0, 1, 0];
  const floor = (y: number) => y < FloorTop;

  it('leaves an open floor fully open, and so a mesh built without a wide array', () => {
    const solid: Solid = (_x, y) => floor(y);
    expect(new Set(meshOf(solid).occlusion)).toEqual(new Set([255]));
    expect(new Set(buildMesh(paddedOf(solid), colors).occlusion)).toEqual(new Set([255]));
  });

  it('darkens the inside corner of two walls more than the foot of one wall, and far-off floor not at all', () => {
    const mesh = meshOf((x, y, z) => floor(y) || x < 4 || z < 4);
    const corner = vertexByte(mesh, [4, FloorTop, 4], Up);
    const oneWall = vertexByte(mesh, [4, FloorTop, 20], Up);
    const away = vertexByte(mesh, [28, FloorTop, 28], Up);
    expect(away).toBe(255);
    expect(oneWall).toBeLessThan(away);
    expect(corner).toBeLessThan(oneWall);
  });

  it('darkens the floor under an overhang, and not the top of the overhang', () => {
    const mesh = meshOf((_x, y) => floor(y) || (y >= 12 && y < 14));
    expect(vertexByte(mesh, [10, FloorTop, 10], Up)).toBeLessThan(255);
    expect(vertexByte(mesh, [10, 14, 10], Up)).toBe(255);
  });

  it('reads past the chunk edge: a wall in the border darkens the floor beside it', () => {
    const mesh = meshOf((x, y) => floor(y) || x < -2);
    expect(vertexByte(mesh, [0, FloorTop, 10], Up)).toBeLessThan(255);
    expect(vertexByte(mesh, [CHUNK, FloorTop, 10], Up)).toBe(255);
  });

  it('measures the box below a face that points down', () => {
    const mesh = meshOf((_x, y) => y >= 24); // a ceiling with open air below it
    expect(vertexByte(mesh, [10, 24, 10], [0, -1, 0])).toBe(255);
    const lowCeiling = meshOf((_x, y) => y >= 24 || y < 20); // ... and a floor 4 below it
    expect(vertexByte(lowCeiling, [10, 24, 10], [0, -1, 0])).toBeLessThan(255);
  });

  // Merging must not change what a face looks like: every vertex of every quad, merged or not, equals
  // the value from a brute-force count of the box in front of that vertex.
  it('gives every merged-quad corner the per-vertex value (random terrain)', () => {
    for (let seed = 1; seed <= 2; seed++) {
      const solid: Solid = (x, y, z) =>
        y < Math.floor(6 + hash3(seed, Math.floor(x / 5), Math.floor(z / 5), 0) * 14) ||
        hash3(seed + 9, x, y, z) < 0.004;
      const wide = wideOf(solid);
      const mesh = buildMesh(paddedOf(solid), colors, undefined, wide);
      expect(mesh.indices.length / 6).toBeLessThan(unitFaces(mesh).size); // merging happened
      let wrong = 0;
      for (let v = 0; v < mesh.occlusion.length; v++) {
        const pos = [0, 1, 2].map((k) => mesh.positions[v * 3 + k]!);
        const normal = [0, 1, 2].map((k) => mesh.normals[v * 3 + k]!);
        const expected = occlusionByte(occlusionLevel(bruteCount(wide, boxIn(pos, normal))));
        wrong += mesh.occlusion[v] === expected ? 0 : 1;
      }
      expect(wrong).toBe(0);
    }
  }, 30_000); // a brute-force count per vertex; 30s absorbs CI parallelism

  it('stops faces merging across a change in occlusion that the 3-neighbour AO cannot see', () => {
    const topQuads = (m: MeshData) =>
      Array.from({ length: m.indices.length / 6 }, (_, q) => m.normals[m.indices[q * 6]! * 3 + 1]).filter(
        (ny) => ny === 1,
      ).length;
    expect(topQuads(meshOf((_x, y) => floor(y)))).toBe(1);
    expect(topQuads(meshOf((x, y) => floor(y) || x < -1))).toBeGreaterThan(1);
  });
});
