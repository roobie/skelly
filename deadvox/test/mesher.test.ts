import { describe, expect, it } from 'vitest';
import { buildMesh } from '../src/core/mesher.ts';
import { hash3 } from '../src/core/random.ts';
import { PADDED, paddedIndex } from '../src/core/world.ts';
import { culledFaces, unitFaces } from './meshFaces.ts';

const colors = new Uint8Array([0, 0, 0, 200, 100, 50, 50, 100, 200]);
const padded = (...blocks: [number, number, number][]) => {
  const out = new Uint16Array(PADDED ** 3);
  // chunk-local coordinates; +1 for the border
  for (const [x, y, z] of blocks) {
    out[paddedIndex(x + 1, y + 1, z + 1)] = 1;
  }
  return out;
};
const quads = (m: ReturnType<typeof buildMesh>) => m.indices.length / 6;
const area = (m: ReturnType<typeof buildMesh>) => unitFaces(m).size;

describe('buildMesh', () => {
  it('emits six faces for a lone block and nothing for an empty chunk', () => {
    expect(quads(buildMesh(padded(), colors))).toBe(0);
    const m = buildMesh(padded([3, 3, 3]), colors);
    expect(quads(m)).toBe(6);
    expect(m.positions.length).toBe(6 * 4 * 3);
  });

  it('culls the shared face between neighbours and merges the rest', () => {
    const m = buildMesh(padded([3, 3, 3], [4, 3, 3]), colors);
    expect(area(m)).toBe(10);
    expect(quads(m)).toBe(6); // top, bottom and both sides each merge into one quad
  });

  it('covers a flat floor with one quad per side', () => {
    const floor: [number, number, number][] = [];
    for (let x = 0; x < 32; x++) {
      for (let z = 0; z < 32; z++) {
        floor.push([x, 0, z]);
      }
    }
    const m = buildMesh(padded(...floor), colors);
    expect(quads(m)).toBe(6);
    expect(area(m)).toBe(2 * 32 * 32 + 4 * 32);
  });

  it('draws the same faces as plain face culling (random chunks)', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const p = new Uint16Array(PADDED ** 3);
      const density = 0.15 + seed * 0.08;
      for (let i = 0; i < p.length; i++) {
        const h = hash3(seed, i, 0, 0);
        p[i] = h < density ? 1 + Math.floor((h / density) * 2) : 0; // ids 1..2, border included
      }
      expect(unitFaces(buildMesh(p, colors))).toEqual(culledFaces(p));
    }
  });

  it('culls against blocks in the border from a neighbouring chunk', () => {
    const p = padded([0, 3, 3]);
    p[paddedIndex(0, 4, 4)] = 1; // x = -1: the neighbour chunk
    expect(area(buildMesh(p, colors))).toBe(5);
  });

  it('winds every triangle counter-clockwise around its normal', () => {
    const m = buildMesh(padded([3, 3, 3]), colors);
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!].map((i) => [
        m.positions[i * 3]!,
        m.positions[i * 3 + 1]!,
        m.positions[i * 3 + 2]!,
      ]) as [number[], number[], number[]];
      const e1 = a.map((v, k) => b[k]! - v);
      const e2 = a.map((v, k) => c[k]! - v);
      const cross = [
        e1[1]! * e2[2]! - e1[2]! * e2[1]!,
        e1[2]! * e2[0]! - e1[0]! * e2[2]!,
        e1[0]! * e2[1]! - e1[1]! * e2[0]!,
      ];
      const first = m.indices[t]!;
      const n = [m.normals[first * 3]!, m.normals[first * 3 + 1]!, m.normals[first * 3 + 2]!];
      expect(cross[0]! * n[0]! + cross[1]! * n[1]! + cross[2]! * n[2]!).toBeGreaterThan(0);
    }
  });

  it('darkens top-face corners next to a taller neighbour (ambient occlusion)', () => {
    const lone = buildMesh(padded([3, 3, 3]), colors);
    const walled = buildMesh(padded([3, 3, 3], [4, 4, 3]), colors);
    const topReds = (m: ReturnType<typeof buildMesh>) => {
      const out: number[] = [];
      for (let v = 0; v < m.normals.length / 3; v++) {
        if (m.normals[v * 3 + 1] === 1 && m.positions[v * 3 + 1] === 4) {
          out.push(m.colors[v * 3]!);
        }
      }
      return out;
    };
    const loneTop = topReds(lone).slice(0, 4);
    const walledTop = topReds(walled).slice(0, 4);
    expect(new Set(loneTop).size).toBe(1); // all corners equally lit
    expect(Math.min(...walledTop)).toBeLessThan(loneTop[0]!);
  });
});
