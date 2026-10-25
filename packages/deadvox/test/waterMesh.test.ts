import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHUNK } from '../src/core/coords.ts';
import { buildMesh, type MeshData } from '../src/core/mesher.ts';
import { PADDED, paddedIndex } from '../src/core/meshInput.ts';
import { OCCLUSION_RADIUS, WIDE, wideIndex } from '../src/core/occlusion.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { Streamer } from '../src/game/streamer.ts';
import type { ToMesher } from '../src/worker/protocol.ts';
import { baseTerrainShape } from './baseRegistry.ts';
import { unitFaces } from './meshFaces.ts';

const ROCK = 3;
const WATER = 5;
const SAND = 1;
const LAKE = 2;

describe('liquid enclosure', () => {
  const posted: ToMesher[] = [];
  class RecordingWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    postMessage(message: ToMesher): void {
      posted.push(message);
    }
    terminate(): void {
      // Nothing to release.
    }
  }
  afterEach(() => {
    posted.length = 0;
    vi.unstubAllGlobals();
  });

  // Every column is rock to the top of chunk layer 1; `water` fills layer 2, or rock does.
  const meshRequests = (top: 'water' | 'rock') => {
    vi.stubGlobal('Worker', RecordingWorker);
    const liquids = new Uint8Array(256);
    liquids[WATER] = 1;
    const world = new World();
    const streamer = new Streamer({
      world,
      meshes: { keys: () => [], set: vi.fn(), remove: vi.fn(), setRevealedColumns: vi.fn() } as never,
      seed: 17,
      terrain: { grass: 1, dirt: 2, rock: ROCK, sand: 4, water: WATER },
      shape: { ...baseTerrainShape(), dirtDepthMetres: 0 },
      colors: new Uint8Array(256 * 3),
      patterns: new Uint8Array(256),
      weatherable: new Uint8Array(256),
      liquids,
      scale: makeScale(0.5),
      structures: [],
      radius: 0,
      surface: {
        height: () => (top === 'water' ? 2 * CHUNK - 1 : 3 * CHUNK - 1),
        top: () => ROCK,
        water: () => (top === 'water' ? 3 * CHUNK : undefined),
      },
    });
    for (let attempt = 0; attempt < 32 && !streamer.isReady(0, 0); attempt += 1) {
      streamer.update(0, 0);
    }
    streamer.update(0, 0);
    const init = posted.find((message) => message.type === 'init');
    const bed = posted.find((message) => message.type === 'mesh' && message.key === '0,1,0');
    const layers = [1, 2].map((cy) => world.getChunk(0, cy, 0)?.uniformId);
    return { init, bed, layers };
  };

  it('meshes a uniform bed chunk under uniform water, with its top faces and open wide occlusion above', () => {
    const { init, bed, layers } = meshRequests('water');
    expect(layers).toEqual([ROCK, WATER]);
    if (bed?.type !== 'mesh' || init?.type !== 'init') {
      throw new Error('the bed chunk never reached the worker');
    }
    const mesh = buildMesh(bed.padded, init.colors, { liquids: init.liquids, wireMeshes: init.wireMeshes });
    const tops = [...unitFaces(mesh)].filter((face) => {
      const [, y, , axis, sign] = face.split(',').map(Number);
      return y === CHUNK - 1 && axis === 1 && sign === 1;
    });
    expect(tops.length).toBe(CHUNK * CHUNK);
    const r = OCCLUSION_RADIUS;
    expect(bed.wide[wideIndex(r + 4, r + CHUNK, r + 4)]).toBe(0);
    expect(bed.wide[wideIndex(r + 4, r + CHUNK - 1, r + 4)]).toBe(1);
    expect(bed.wide.length).toBe(WIDE ** 3);
  });

  it('still drops the same chunk when rock stands where the water was', () => {
    const { bed, layers } = meshRequests('rock');
    expect(layers).toEqual([ROCK, ROCK]);
    expect(bed).toBeUndefined();
  });
});

describe('liquid faces', () => {
  const colors = new Uint8Array([0, 0, 0, 200, 180, 120, 60, 110, 140]);
  const liquids = new Uint8Array([0, 0, 1]);
  // A sand floor at y = 0 over [4, 12)², walls two blocks high around it, and the inside filled
  // with two layers of `inside` (the lake, or air for the dry control).
  const basin = (inside: number) => {
    const out = new Uint16Array(PADDED ** 3);
    for (let x = 4; x < 12; x++) {
      for (let z = 4; z < 12; z++) {
        out[paddedIndex(x + 1, 1, z + 1)] = SAND;
        const wall = x === 4 || x === 11 || z === 4 || z === 11;
        for (let y = 1; y <= 2; y++) {
          out[paddedIndex(x + 1, y + 1, z + 1)] = wall ? SAND : inside;
        }
      }
    }
    return out;
  };
  const inner = (y: number, axis: number, sign: number) => {
    const out: string[] = [];
    for (let x = 5; x < 11; x++) {
      for (let z = 5; z < 11; z++) {
        out.push(`${x},${y},${z},${axis},${sign}`);
      }
    }
    return out;
  };
  const wet = buildMesh(basin(LAKE), colors, { liquids });
  const dry = buildMesh(basin(0), colors, { liquids });
  const faces = unitFaces(wet);

  it('keeps the bed top and the basin walls under water', () => {
    const bedTop = inner(0, 1, 1);
    expect(bedTop.filter((face) => faces.has(face))).toEqual(bedTop);
    expect(bedTop.filter((face) => unitFaces(dry).has(face))).toEqual(bedTop);
    for (let y = 1; y <= 2; y++) {
      for (let z = 5; z < 11; z++) {
        expect(faces.has(`4,${y},${z},0,1`)).toBe(true);
        expect(faces.has(`11,${y},${z},0,-1`)).toBe(true);
      }
    }
  });

  it('draws no face between two water blocks and one surface face per column, seen from both sides', () => {
    const isWater = (x: number, y: number, z: number) =>
      x >= 5 && x < 11 && z >= 5 && z < 11 && (y === 1 || y === 2);
    for (const face of faces) {
      const [x, y, z, axis, sign] = face.split(',').map(Number) as [number, number, number, number, number];
      if (isWater(x, y, z)) {
        const front = [x, y, z];
        front[axis]! += sign;
        expect(isWater(front[0]!, front[1]!, front[2]!), face).toBe(false);
      }
    }
    const up = inner(2, 1, 1);
    expect(up.filter((face) => faces.has(face))).toEqual(up);
    // The underside belongs to the cell above the surface, facing down at the same plane.
    const down = inner(3, 1, -1);
    expect(down.filter((face) => faces.has(face))).toEqual(down);
    expectCounterClockwise(wet);
  });

  it('shades the bed under water with the same corner AO as under air', () => {
    expect(bedTopColours(wet)).toEqual(bedTopColours(dry));
  });
});

/** Vertex colours of every upward vertex on the bed's top plane (y = 1), with their positions, sorted. */
const bedTopColours = (mesh: MeshData): string[] => {
  const out: string[] = [];
  for (let v = 0; v < mesh.normals.length / 3; v++) {
    if (mesh.normals[v * 3 + 1] === 1 && mesh.positions[v * 3 + 1] === 1) {
      out.push(`${mesh.positions.subarray(v * 3, v * 3 + 3).join(',')}:${mesh.colors.subarray(v * 3, v * 3 + 3).join(',')}`);
    }
  }
  return out.sort();
};

const expectCounterClockwise = (mesh: MeshData): void => {
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t]!, mesh.indices[t + 1]!, mesh.indices[t + 2]!].map((i) =>
      Array.from(mesh.positions.subarray(i * 3, i * 3 + 3)),
    ) as [number[], number[], number[]];
    const e1 = a.map((v, k) => b[k]! - v);
    const e2 = a.map((v, k) => c[k]! - v);
    const cross = [
      e1[1]! * e2[2]! - e1[2]! * e2[1]!,
      e1[2]! * e2[0]! - e1[0]! * e2[2]!,
      e1[0]! * e2[1]! - e1[1]! * e2[0]!,
    ];
    const first = mesh.indices[t]!;
    const n = Array.from(mesh.normals.subarray(first * 3, first * 3 + 3));
    expect(cross[0]! * n[0]! + cross[1]! * n[1]! + cross[2]! * n[2]!).toBeGreaterThan(0);
  }
};
