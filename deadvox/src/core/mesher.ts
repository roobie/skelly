// Greedy voxel mesher with per-vertex ambient occlusion.
// Pure: takes a padded block array (see world.ts) and returns typed arrays for the GPU.
//
// Visible faces are collected slice by slice into a 32 × 32 mask, keyed by block id
// and the AO of the face's four corners. Neighbouring faces with the same key merge
// into one quad, but only along an axis the AO doesn't change on, so a merged quad
// shades exactly like the separate faces would. Per-block colour variation happens
// in the fragment shader (render/chunks.ts), so it doesn't stop faces merging.
//
// Each face corner also gets a wide-radius occlusion level (occlusion.ts), kept in a second mask
// with the same merge rule. It is the ambient factor only; it never touches the vertex colours.

import { CHUNK, type Vec3 } from './coords.ts';
import { BEDROCK, PADDED, paddedIndex } from './meshInput.ts';
import {
  boxSum,
  buildSums,
  makeSums,
  OCCLUSION_RADIUS,
  OPEN_LEVEL,
  occlusionByte,
  occlusionLevel,
  WIDE,
  wideIndex,
} from './occlusion.ts';

export interface MeshData {
  positions: Float32Array; // chunk-local, 3 per vertex
  normals: Int8Array; // 3 per vertex, -1/0/1
  colors: Uint8Array; // RGB, 3 per vertex
  patterns: Uint8Array; // surface pattern id (schema.ts BLOCK_PATTERNS), 1 per vertex; constant per quad
  occlusion: Uint8Array; // wide-radius ambient factor, normalized (255 = 1), 1 per vertex
  weathering: Float32Array; // rain exposure and nearby ground, 2 per vertex
  indices: Uint32Array;
}

type Axis = 0 | 1 | 2;

interface Face {
  /** Axis the face points along, its sign, and the two in-plane axes (u × v points along +d). */
  d: Axis;
  u: Axis;
  v: Axis;
  s: 1 | -1;
  normal: Vec3;
  /** Corners as (u, v) in {0, 1}, counter-clockwise seen from outside. */
  uv: [number, number][];
  /** Offsets in the padded array: to the cell in front of the face, and per corner to its two side cells. */
  front: number;
  side1: number[];
  side2: number[];
  /** Index into `uv` (and so into the per-corner key fields) of the corner at (cu, cv), at cu + 2 * cv. */
  cornerAt: number[];
}

/** Padded-array index step along x, y and z (see paddedIndex). */
const STRIDE: readonly number[] = [1, PADDED * PADDED, PADDED];

const FACES: Face[] = [];
for (const d of [0, 1, 2] as const) {
  const u = ((d + 1) % 3) as Axis;
  const v = ((d + 2) % 3) as Axis;
  for (const s of [1, -1] as const) {
    const uv: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    if (s < 0) {
      uv.reverse();
    }
    const normal: Vec3 = [0, 0, 0];
    normal[d] = s;
    FACES.push({
      d,
      u,
      v,
      s,
      normal,
      uv,
      front: s * STRIDE[d]!,
      side1: uv.map(([cu]) => (cu ? 1 : -1) * STRIDE[u]!),
      side2: uv.map(([, cv]) => (cv ? 1 : -1) * STRIDE[v]!),
      cornerAt: [0, 1, 2, 3].map((i) => uv.findIndex(([a, b]) => a + 2 * b === i)),
    });
  }
}

/** Vertex brightness for 0..3 unoccluded neighbours. */
const AO_LEVELS = [0.5, 0.68, 0.84, 1];

/**
 * Two masks describe a face. Mask keys: block id in the high bits, then 2 bits of AO per corner in
 * `uv` order. Occlusion keys: 3 bits of occlusion level per corner in `uv` order (6 levels fit). Faces
 * merge only when both keys are equal.
 */
const aoAt = (key: number, corner: number): number => (key >> (2 * corner)) & 3;
const OCC_BITS = 3;
const occAt = (occ: number, corner: number): number => (occ >> (OCC_BITS * corner)) & ((1 << OCC_BITS) - 1);

/**
 * Whether AO and occlusion are the same at both ends along u (then the quad may grow along u), or
 * along v. Corners are read as (cu, cv) pairs: u-flat means (0,0)=(1,0) and (0,1)=(1,1).
 */
const flatAlong = (face: Face, key: number, occ: number, axis: 'u' | 'v'): boolean => {
  const c = face.cornerAt;
  const [a, b, d, e] = axis === 'u' ? [c[0]!, c[1]!, c[2]!, c[3]!] : [c[0]!, c[2]!, c[1]!, c[3]!];
  return (
    aoAt(key, a) === aoAt(key, b) &&
    aoAt(key, d) === aoAt(key, e) &&
    occAt(occ, a) === occAt(occ, b) &&
    occAt(occ, d) === occAt(occ, e)
  );
};

interface Context {
  padded: Uint16Array;
  /** Summed-volume table over the wide solidity array, or undefined when none was given (no occlusion). */
  sums: Int32Array | undefined;
  colors: Uint8Array;
  patterns: Uint8Array;
  mask: Int32Array;
  occMask: Int32Array;
  /** Occlusion level per vertex of the current slice, (CHUNK + 1)² of them; see occlusionKey. */
  vertexLevels: Uint8Array;
  positions: number[];
  normals: number[];
  vcolors: number[];
  vpatterns: number[];
  voccs: number[];
  vweather: number[];
  indices: number[];
  wide: Uint8Array | undefined;
}

/** Reused between builds: one worker builds one mesh at a time. */
const SUMS = makeSums();
/** Scratch for a box query: [lo, hi) per axis, x y z. */
const RANGE = new Int32Array(6);

/** 1 if the padded cell holds a block that hides faces next to it, else 0. */
const solid = (padded: Uint16Array, index: number): number => (padded[index]! === 0 ? 0 : 1);

/**
 * Mask key for one face of the block at padded index `base`, or 0 if that face is
 * hidden. Hot path: index arithmetic only, no allocation.
 */
const faceKey = (padded: Uint16Array, face: Face, base: number): number => {
  const id = padded[base]!;
  if (id === 0 || id === BEDROCK) {
    return 0;
  }
  const front = base + face.front;
  if (padded[front]! !== 0) {
    return 0;
  }
  let key = id << 8;
  for (let corner = 0; corner < 4; corner++) {
    const a = face.side1[corner]!;
    const b = face.side2[corner]!;
    const s1 = solid(padded, front + a);
    const s2 = solid(padded, front + b);
    const level = s1 && s2 ? 0 : 3 - (s1 + s2 + solid(padded, front + a + b));
    key |= level << (2 * corner);
  }
  return key;
};

/**
 * Occlusion key for the unit face at (slice, u, v): the level at each corner, from the solid fraction of
 * the box in front of the face. The box starts at the front cell and runs R cells along the normal, and
 * spans R cells either side of the corner on both tangent axes (a half-space, centred on the vertex).
 * It depends only on the vertex and the normal, so the faces around a vertex agree on its value and a
 * merged quad's corners equal what separate faces would get. Hot path: no allocation.
 *
 * The solidity array has a border of R, so chunk-local coordinate c is c + R in it; box limits below are
 * already shifted. Along the normal: a + face (s > 0) covers local [plane, plane + R), a - face covers
 * [plane - R, plane).
 */
const vertexOcclusion = (sums: Int32Array, face: Face, slice: number, vertex: number): number => {
  const r = OCCLUSION_RADIUS;
  const vu = vertex % (CHUNK + 1);
  const vv = Math.floor(vertex / (CHUNK + 1));
  const plane = slice + (face.s > 0 ? 1 : 0);
  const along = face.s > 0 ? plane + r : plane;
  RANGE[2 * face.d] = along;
  RANGE[2 * face.d + 1] = along + r;
  RANGE[2 * face.u] = vu;
  RANGE[2 * face.u + 1] = vu + 2 * r;
  RANGE[2 * face.v] = vv;
  RANGE[2 * face.v + 1] = vv + 2 * r;
  return occlusionLevel(boxSum(sums, RANGE));
};

/** Marks a vertex of the slice's grid whose level hasn't been computed yet. */
const UNSET = 255;

/**
 * Occlusion key of the unit face at `cell` (u + CHUNK * v) of a slice: the level at each corner. The
 * four faces around a vertex share its level, so levels are computed once per vertex per slice and
 * cached in `ctx.vertexLevels` (cleared by fillMask).
 */
const occlusionKey = (ctx: Context, face: Face, slice: number, cell: number): number => {
  const u = cell % CHUNK;
  const v = Math.floor(cell / CHUNK);
  let occ = 0;
  for (let corner = 0; corner < 4; corner++) {
    const uv = face.uv[corner]!;
    const vertex = u + uv[0]! + (CHUNK + 1) * (v + uv[1]!);
    let level = ctx.vertexLevels[vertex]!;
    if (level === UNSET) {
      level = vertexOcclusion(ctx.sums!, face, slice, vertex);
      ctx.vertexLevels[vertex] = level;
    }
    occ |= level << (OCC_BITS * corner);
  }
  return occ;
};

/** The occlusion key of a face with no occlusion data: every corner fully open. */
const OPEN_KEY = [0, 1, 2, 3].reduce((key, corner) => key | (OPEN_LEVEL << (OCC_BITS * corner)), 0);

const wideSolidAt = (wide: Uint8Array, [x, y, z]: Vec3): boolean =>
  x >= 0 && x < WIDE && y >= 0 && y < WIDE && z >= 0 && z < WIDE && wide[wideIndex(x, y, z)] !== 0;

const shelteredFromRain = (wide: Uint8Array, face: Face, [x, y, z]: Vec3): boolean => {
  const across = face.d === 0 ? 2 : 0;
  for (let height = 0; height < 3; height++) {
    for (let side = -1; side <= 1; side++) {
      const cell: Vec3 = [x + (across === 0 ? side : 0), y + height, z + (across === 2 ? side : 0)];
      if (wideSolidAt(wide, cell)) {
        return true;
      }
    }
  }
  return false;
};

const groundProximity = (wide: Uint8Array, [x, y, z]: Vec3): number => {
  for (let down = 0; down < OCCLUSION_RADIUS; down++) {
    if (wideSolidAt(wide, [x, y - down - 1, z])) {
      return 1 - down / OCCLUSION_RADIUS;
    }
  }
  return 0;
};

/** Grid-derived rain exposure and ground proximity at a face vertex; the shader supplies patch detail. */
const weatherAt = (wide: Uint8Array | undefined, face: Face, pos: Vec3): [number, number] => {
  if (!wide || face.d === 1) {
    return [1, 0];
  }
  const r = OCCLUSION_RADIUS;
  const x = Math.floor(pos[0] + face.normal[0] * 0.5) + r;
  const y = Math.floor(pos[1]) + r;
  const z = Math.floor(pos[2] + face.normal[2] * 0.5) + r;
  const cell: Vec3 = [x, y, z];
  return [shelteredFromRain(wide, face, cell) ? 0.25 : 1, groundProximity(wide, cell)];
};

/** Fills the masks for one slice of one face direction. Returns whether any face is visible. */
const fillMask = (ctx: Context, face: Face, slice: number): boolean => {
  let any = false;
  const start = paddedIndex(1, 1, 1) + slice * STRIDE[face.d]!;
  const du = STRIDE[face.u]!;
  const dv = STRIDE[face.v]!;
  ctx.vertexLevels.fill(UNSET);
  for (let v = 0; v < CHUNK; v++) {
    for (let u = 0; u < CHUNK; u++) {
      const key = faceKey(ctx.padded, face, start + u * du + v * dv);
      ctx.mask[u + CHUNK * v] = key;
      if (key !== 0) {
        ctx.occMask[u + CHUNK * v] = ctx.sums ? occlusionKey(ctx, face, slice, u + CHUNK * v) : OPEN_KEY;
        any = true;
      }
    }
  }
  return any;
};

/** A face's two mask keys: [block id and AO, occlusion]. */
type Keys = readonly [number, number];

/** Appends one quad covering [u0, u0 + w) × [v0, v0 + h) of a slice. */
const emitQuad = (ctx: Context, face: Face, [key, occ]: Keys, [slice, u0, v0, w, h]: number[]): void => {
  const base = ctx.positions.length / 3;
  const id = key >> 8;
  const pos: Vec3 = [0, 0, 0];
  pos[face.d] = slice! + (face.s > 0 ? 1 : 0);
  const [nx, ny, nz] = face.normal;
  for (let corner = 0; corner < 4; corner++) {
    const [cu, cv] = face.uv[corner]!;
    pos[face.u] = u0! + cu * w!;
    pos[face.v] = v0! + cv * h!;
    const k = AO_LEVELS[aoAt(key, corner)]!;
    ctx.positions.push(pos[0], pos[1], pos[2]);
    ctx.normals.push(nx, ny, nz);
    ctx.vcolors.push(ctx.colors[id * 3]! * k, ctx.colors[id * 3 + 1]! * k, ctx.colors[id * 3 + 2]! * k);
    ctx.vpatterns.push(ctx.patterns[id] ?? 0);
    ctx.voccs.push(occlusionByte(occAt(occ, corner)));
    ctx.vweather.push(...weatherAt(ctx.wide, face, pos));
  }
  // Split along the brighter diagonal so AO interpolates without a seam; on a tie, the diagonal with the
  // more open occlusion.
  const ao = aoAt(key, 0) + aoAt(key, 2) - (aoAt(key, 1) + aoAt(key, 3));
  const wide = occAt(occ, 0) + occAt(occ, 2) - (occAt(occ, 1) + occAt(occ, 3));
  if (ao > 0 || (ao === 0 && wide >= 0)) {
    ctx.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  } else {
    ctx.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  }
};

/** Width then height of the largest rectangle of `key` and `occ` starting at (u0, v0). */
const growRect = (ctx: Context, face: Face, [key, occ]: Keys, [u0, v0]: [number, number]): [number, number] => {
  const same = (u: number, v: number) => ctx.mask[u + CHUNK * v] === key && ctx.occMask[u + CHUNK * v] === occ;
  let w = 1;
  if (flatAlong(face, key, occ, 'u')) {
    while (u0 + w < CHUNK && same(u0 + w, v0)) {
      w += 1;
    }
  }
  let h = 1;
  const rowMatches = (v: number) => {
    for (let k = 0; k < w; k++) {
      if (!same(u0 + k, v)) {
        return false;
      }
    }
    return true;
  };
  if (flatAlong(face, key, occ, 'v')) {
    while (v0 + h < CHUNK && rowMatches(v0 + h)) {
      h += 1;
    }
  }
  return [w, h];
};

/** Turns the masks into as few quads as the greedy scan finds. */
const mergeMask = (ctx: Context, face: Face, slice: number): void => {
  for (let v0 = 0; v0 < CHUNK; v0++) {
    for (let u0 = 0; u0 < CHUNK; u0++) {
      const key = ctx.mask[u0 + CHUNK * v0]!;
      if (key === 0) {
        continue;
      }
      const keys: Keys = [key, ctx.occMask[u0 + CHUNK * v0]!];
      const [w, h] = growRect(ctx, face, keys, [u0, v0]);
      emitQuad(ctx, face, keys, [slice, u0, v0, w, h]);
      for (let v = v0; v < v0 + h; v++) {
        ctx.mask.fill(0, u0 + CHUNK * v, u0 + w + CHUNK * v);
      }
    }
  }
};

/**
 * Builds a mesh for one chunk.
 * @param padded block ids for the chunk plus a 1-block border (see extractPadded)
 * @param colors RGB per block id (3 bytes each)
 * @param patterns surface pattern id per block id; omitted means every block is unpatterned
 * @param wide solidity (0 air, else solid) of the chunk plus an OCCLUSION_RADIUS border (see extractWide);
 *   omitted means no wide occlusion: every vertex is fully open
 */
export const buildMesh = (
  padded: Uint16Array,
  colors: Uint8Array,
  patterns: Uint8Array = new Uint8Array(0),
  wide?: Uint8Array,
): MeshData => {
  if (wide) {
    buildSums(wide, SUMS);
  }
  const ctx: Context = {
    padded,
    sums: wide ? SUMS : undefined,
    colors,
    patterns,
    mask: new Int32Array(CHUNK * CHUNK),
    occMask: new Int32Array(CHUNK * CHUNK),
    vertexLevels: new Uint8Array((CHUNK + 1) ** 2),
    positions: [],
    normals: [],
    vcolors: [],
    vpatterns: [],
    voccs: [],
    vweather: [],
    indices: [],
    wide,
  };
  for (const face of FACES) {
    for (let slice = 0; slice < CHUNK; slice++) {
      if (fillMask(ctx, face, slice)) {
        mergeMask(ctx, face, slice);
      }
    }
  }
  return {
    positions: new Float32Array(ctx.positions),
    normals: new Int8Array(ctx.normals),
    colors: new Uint8Array(ctx.vcolors),
    patterns: new Uint8Array(ctx.vpatterns),
    occlusion: new Uint8Array(ctx.voccs),
    weathering: new Float32Array(ctx.vweather),
    indices: new Uint32Array(ctx.indices),
  };
};
