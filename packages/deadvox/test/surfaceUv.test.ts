import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SURFACE_PATTERN_GLSL } from '../src/render/surfacePatterns.ts';

// Pure mirror of surfaceUV() in surfacePatterns.ts (GLSL can't run here).
type V3 = readonly [number, number, number];
const surfaceUV = (w: V3, n: V3): [number, number] => {
  if (Math.abs(n[1]) > 0.5) {
    return [w[0], w[2]];
  }
  if (Math.abs(n[0]) > 0.5) {
    return [w[2], w[1]];
  }
  return [w[0], w[1]];
};

// Chunk normals are an Int8Array(-1/0/1) uploaded normalised, so the shader sees +-1/127.
const asSeenByShader = (n: V3): V3 => n.map((c) => c / 127) as unknown as V3;
const normalize = (n: V3): V3 => {
  const len = Math.hypot(...n);
  return n.map((c) => c / len) as unknown as V3;
};

describe('surface pattern face coordinates', () => {
  it('uses the in-plane horizontal axis of every vertical face', () => {
    expect(surfaceUV([1, 2, 3], [1, 0, 0])).toEqual([3, 2]);
    expect(surfaceUV([1, 2, 3], [-1, 0, 0])).toEqual([3, 2]);
    expect(surfaceUV([1, 2, 3], [0, 0, 1])).toEqual([1, 2]);
    expect(surfaceUV([1, 2, 3], [0, 0, -1])).toEqual([1, 2]);
    expect(surfaceUV([1, 2, 3], [0, 1, 0])).toEqual([1, 3]);
  });

  it('needs the normal normalised first: the raw normalised-int8 value never passes the 0.5 tests', () => {
    expect(surfaceUV([1, 2, 3], asSeenByShader([1, 0, 0]))).toEqual([1, 2]);
    expect(surfaceUV([1, 2, 3], normalize(asSeenByShader([1, 0, 0])))).toEqual([3, 2]);
    expect(surfaceUV([1, 2, 3], normalize(asSeenByShader([0, 1, 0])))).toEqual([1, 3]);
  });

  it('keeps the shader in step with the mirror', () => {
    expect(SURFACE_PATTERN_GLSL).toContain('if (a.y > 0.5) return w.xz;');
    expect(SURFACE_PATTERN_GLSL).toContain('if (a.x > 0.5) return vec2(w.z, w.y);');
    const chunks = readFileSync(new URL('../src/render/chunks.ts', import.meta.url), 'utf8');
    expect(chunks).toContain('vFaceN = normalize(normal);');
  });
});
