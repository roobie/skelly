import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('surface shader interpolation contracts', () => {
  it('insets the per-block cell along the normalised face normal', () => {
    const chunks = readFileSync(new URL('../src/render/chunks.ts', import.meta.url), 'utf8');
    expect(chunks).toContain('position - normalize(normal) * 0.5');
  });

  it('declares the shading varyings centroid (vColor included) and the pattern id flat', () => {
    const chunks = readFileSync(new URL('../src/render/chunks.ts', import.meta.url), 'utf8');
    for (const decl of [
      'centroid varying vec4 vColor;',
      'centroid varying vec3 vCell;',
      'centroid varying vec3 vWorld;',
      'centroid varying vec3 vFaceN;',
      'flat varying float vPattern;',
      "'#include <color_pars_vertex>'",
      "'#include <color_pars_fragment>'",
    ]) {
      expect(chunks).toContain(decl);
    }
  });
});
