// Greedy voxel mesher with per-vertex ambient occlusion.
// Pure: takes a padded block array (see world.ts) and returns typed arrays for the GPU.
//
// Visible faces are collected slice by slice into a 32 × 32 mask, keyed by block id
// and the AO of the face's four corners. Neighbouring faces with the same key merge
// into one quad, but only along an axis the AO doesn't change on, so a merged quad
// shades exactly like the separate faces would. Per-block colour variation happens
// in the fragment shader (render/chunks.ts), so it doesn't stop faces merging.

import { CHUNK, type Vec3 } from './coords.ts';
import { BEDROCK, paddedIndex } from './world.ts';

export interface MeshData {
  positions: Float32Array; // chunk-local, 3 per vertex
  normals: Int8Array; // 3 per vertex, -1/0/1
  colors: Uint8Array; // RGB, 3 per vertex
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
}

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
    FACES.push({ d, u, v, s, normal, uv });
  }
}

/** Vertex brightness for 0..3 unoccluded neighbours. */
const AO_LEVELS = [0.5, 0.68, 0.84, 1];

/** Mask keys: block id in the high bits, then 2 bits of AO per corner in `uv` order. */
const aoAt = (key: number, corner: number): number => (key >> (2 * corner)) & 3;

/** Whether the AO is the same at both ends along u (then the quad may grow along u), or along v. */
const flatAlong = (face: Face, key: number, axis: 'u' | 'v'): boolean => {
  const ao = (cu: number, cv: number) =>
    aoAt(
      key,
      face.uv.findIndex(([a, b]) => a === cu && b === cv),
    );
  return axis === 'u' ? ao(0, 0) === ao(1, 0) && ao(0, 1) === ao(1, 1) : ao(0, 0) === ao(0, 1) && ao(1, 0) === ao(1, 1);
};

interface Context {
  padded: Uint16Array;
  colors: Uint8Array;
  mask: Int32Array;
  positions: number[];
  normals: number[];
  vcolors: number[];
  indices: number[];
}

/** 1 if the padded position holds a block that hides faces next to it, else 0. */
const solidAt = (padded: Uint16Array, p: Vec3): number => (padded[paddedIndex(p[0], p[1], p[2])]! === 0 ? 0 : 1);

/** Mask key for the face of the block at chunk-local `p`, or 0 if that face is hidden. */
const faceKey = (padded: Uint16Array, face: Face, p: Vec3): number => {
  const id = padded[paddedIndex(p[0] + 1, p[1] + 1, p[2] + 1)]!;
  if (id === 0 || id === BEDROCK) {
    return 0;
  }
  // The cell in front of the face, in padded coordinates.
  const front: Vec3 = [p[0] + 1 + face.normal[0], p[1] + 1 + face.normal[1], p[2] + 1 + face.normal[2]];
  if (solidAt(padded, front)) {
    return 0;
  }
  let key = id << 8;
  face.uv.forEach(([cu, cv], corner) => {
    const side1: Vec3 = [...front];
    const side2: Vec3 = [...front];
    side1[face.u] += cu ? 1 : -1;
    side2[face.v] += cv ? 1 : -1;
    const diagonal: Vec3 = [...side1];
    diagonal[face.v] = side2[face.v];
    const s1 = solidAt(padded, side1);
    const s2 = solidAt(padded, side2);
    const level = s1 && s2 ? 0 : 3 - (s1 + s2 + solidAt(padded, diagonal));
    key |= level << (2 * corner);
  });
  return key;
};

/** Fills the mask for one slice of one face direction. Returns whether any face is visible. */
const fillMask = (ctx: Context, face: Face, slice: number): boolean => {
  let any = false;
  const p: Vec3 = [0, 0, 0];
  p[face.d] = slice;
  for (let v = 0; v < CHUNK; v++) {
    for (let u = 0; u < CHUNK; u++) {
      p[face.u] = u;
      p[face.v] = v;
      const key = faceKey(ctx.padded, face, p);
      ctx.mask[u + CHUNK * v] = key;
      any ||= key !== 0;
    }
  }
  return any;
};

/** Appends one quad covering [u0, u0 + w) × [v0, v0 + h) of a slice. */
const emitQuad = (ctx: Context, face: Face, key: number, [slice, u0, v0, w, h]: number[]): void => {
  const base = ctx.positions.length / 3;
  const id = key >> 8;
  face.uv.forEach(([cu, cv], corner) => {
    const pos: Vec3 = [0, 0, 0];
    pos[face.d] = slice! + (face.s > 0 ? 1 : 0);
    pos[face.u] = u0! + cu * w!;
    pos[face.v] = v0! + cv * h!;
    const k = AO_LEVELS[aoAt(key, corner)]!;
    ctx.positions.push(...pos);
    ctx.normals.push(...face.normal);
    ctx.vcolors.push(ctx.colors[id * 3]! * k, ctx.colors[id * 3 + 1]! * k, ctx.colors[id * 3 + 2]! * k);
  });
  // Split along the brighter diagonal so AO interpolates without a seam.
  if (aoAt(key, 0) + aoAt(key, 2) >= aoAt(key, 1) + aoAt(key, 3)) {
    ctx.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  } else {
    ctx.indices.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  }
};

/** Width then height of the largest rectangle of `key` starting at (u0, v0). */
const growRect = (ctx: Context, face: Face, key: number, [u0, v0]: [number, number]): [number, number] => {
  const at = (u: number, v: number) => ctx.mask[u + CHUNK * v];
  let w = 1;
  if (flatAlong(face, key, 'u')) {
    while (u0 + w < CHUNK && at(u0 + w, v0) === key) {
      w += 1;
    }
  }
  let h = 1;
  const rowMatches = (v: number) => Array.from({ length: w }, (_, k) => at(u0 + k, v)).every((c) => c === key);
  if (flatAlong(face, key, 'v')) {
    while (v0 + h < CHUNK && rowMatches(v0 + h)) {
      h += 1;
    }
  }
  return [w, h];
};

/** Turns the mask into as few quads as the greedy scan finds. */
const mergeMask = (ctx: Context, face: Face, slice: number): void => {
  for (let v0 = 0; v0 < CHUNK; v0++) {
    for (let u0 = 0; u0 < CHUNK; u0++) {
      const key = ctx.mask[u0 + CHUNK * v0]!;
      if (key === 0) {
        continue;
      }
      const [w, h] = growRect(ctx, face, key, [u0, v0]);
      emitQuad(ctx, face, key, [slice, u0, v0, w, h]);
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
 */
export const buildMesh = (padded: Uint16Array, colors: Uint8Array): MeshData => {
  const ctx: Context = {
    padded,
    colors,
    mask: new Int32Array(CHUNK * CHUNK),
    positions: [],
    normals: [],
    vcolors: [],
    indices: [],
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
    indices: new Uint32Array(ctx.indices),
  };
};
