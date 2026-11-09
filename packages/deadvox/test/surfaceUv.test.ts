import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SURFACE_PATTERN_GLSL } from '../src/render/surfacePatterns.ts';

describe('surface pattern face coordinates', () => {
  it('keeps the shader in step with the mirror', () => {
    expect(SURFACE_PATTERN_GLSL).toContain('if (a.y > 0.5) return w.xz;');
    expect(SURFACE_PATTERN_GLSL).toContain('if (a.x > 0.5) return vec2(w.z, w.y);');
    // Chunk normals upload as normalised int8, so the shader sees a length of 1/127. That never passes the
    // 0.5 face tests above, so the vertex shader must normalise the normal first.
    const chunks = readFileSync(new URL('../src/render/chunks.ts', import.meta.url), 'utf8');
    expect(chunks).toContain('vFaceN = normalize(normal);');
  });
});
