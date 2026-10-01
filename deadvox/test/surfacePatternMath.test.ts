import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SURFACE_PATTERN_GLSL } from '../src/render/surfacePatterns.ts';

// Pure mirrors of the helpers in surfacePatterns.ts (GLSL can't run here).
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const featureFade = (fw: number, period: number): number => 1 - smoothstep(0.1, 0.35, fw / period);
const safeFootprint = (fw: number): number => (fw >= 0 && fw < 1e4 ? Math.max(fw, 1e-5) : 1e4);
const safeShade = (s: number): number => (Number.isNaN(s) ? 1 : clamp(s, 0.6, 1.25));
const lineMask = (d: number, hw: number, fw: number): number => {
  const w = Math.max(0.5 * fw, 1e-6);
  return 1 - smoothstep(hw - w, hw + w, d);
};

describe('surface pattern numeric safety', () => {
  it('keeps the octave fade within [0, 1], full when resolved and gone by 3 px per period', () => {
    for (const fw of [0, 1e-6, 0.01, 0.1, 1, 100, 1e4]) {
      const f = featureFade(safeFootprint(fw), 0.15);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
    expect(featureFade(0.01, 0.9)).toBe(1);
    expect(featureFade(0.35 * 0.15, 0.15)).toBe(0);
  });

  it('fades an octave to its mean without extrapolating', () => {
    for (const fw of [0, 0.02, 0.05, 0.3, 50]) {
      for (const noise of [0, 0.5, 1]) {
        const v = 0.5 + (noise - 0.5) * featureFade(fw, 0.15);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    // Fully faded: every lattice value collapses to the 0.5 mean.
    expect(0.5 + (0 - 0.5) * featureFade(10, 0.15)).toBe(0.5);
    expect(0.5 + (1 - 0.5) * featureFade(10, 0.15)).toBe(0.5);
  });

  it('sanitises footprints: NaN, negative, infinite and zero', () => {
    expect(safeFootprint(Number.NaN)).toBe(1e4);
    expect(safeFootprint(-1)).toBe(1e4);
    expect(safeFootprint(Number.POSITIVE_INFINITY)).toBe(1e4);
    expect(safeFootprint(0)).toBe(1e-5);
    expect(safeFootprint(0.02)).toBe(0.02);
  });

  it('bounds the final multiplier and removes NaN', () => {
    expect(safeShade(Number.NaN)).toBe(1);
    expect(safeShade(Number.POSITIVE_INFINITY)).toBe(1.25);
    expect(safeShade(Number.NEGATIVE_INFINITY)).toBe(0.6);
    expect(safeShade(1e9)).toBe(1.25);
    expect(safeShade(-3)).toBe(0.6);
    expect(safeShade(0.97)).toBe(0.97);
  });

  it('gives a defined line mask for a zero footprint', () => {
    for (const d of [0, 0.001, 0.005, 1]) {
      const m = lineMask(d, 0.004, 0);
      expect(Number.isFinite(m)).toBe(true);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the shader in step with the mirrors', () => {
    expect(SURFACE_PATTERN_GLSL).toContain('return 1.0 - smoothstep(0.1, 0.35, fw / period);');
    expect(SURFACE_PATTERN_GLSL).toContain('return isnan(s) ? 1.0 : clamp(s, 0.6, 1.25);');
    expect(SURFACE_PATTERN_GLSL).toContain('float w = max(0.5 * fw, 1e-6);');
    expect(SURFACE_PATTERN_GLSL).toContain('return (fw >= 0.0 && fw < 1e4) ? max(fw, 1e-5) : 1e4;');
  });

  it('insets the per-block cell along the normalised face normal', () => {
    const chunks = readFileSync(new URL('../src/render/chunks.ts', import.meta.url), 'utf8');
    expect(chunks).toContain('position - normalize(normal) * 0.5');
  });
});
