import { describe, expect, it } from 'vitest';
import { CLOUD_COVER_GLSL } from '../src/render/skyCloudCover.ts';

interface CloudCover {
  layeredCover: (noise: number, coverage: number, softness: number) => number;
  scatterCoverage: (coverage: number, region: number, strength: number) => number;
}

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** The shader's own source run as JavaScript: its functions take and return plain floats, so only the types go. */
const cloudCover = (): CloudCover => {
  const script = CLOUD_COVER_GLSL.replaceAll(
    /\bfloat (\w+) \(([^)]*)\)/g,
    (_, name: string, params: string) => `function ${name}(${params.replaceAll('float ', '')})`,
  ).replaceAll(/\bfloat /g, 'const ');
  const build = new Function(
    'clamp',
    'smoothstep',
    'min',
    'max',
    `${script}\nreturn { layeredCover, scatterCoverage };`,
  ) as (...helpers: unknown[]) => CloudCover;
  return build(clamp, smoothstep, Math.min, Math.max);
};

const { layeredCover, scatterCoverage } = cloudCover();
const steps = (from: number, to: number, count: number): number[] =>
  Array.from({ length: count + 1 }, (_, index) => from + ((to - from) * index) / count);
// Wider than either kind's noise reaches, so no peak escapes.
const NOISES = steps(-0.3, 1.3, 32);
const SLIVER = 0.001;

describe('the layered field', () => {
  it('draws only a sliver of cloud at a sliver of cover, however high its noise rises', () => {
    const drawn = Math.max(...NOISES.map((noise) => layeredCover(noise, SLIVER, 0.3)));
    expect(drawn).toBeLessThan(0.01);
  });
});

describe('the scatter kind', () => {
  it('covers only a sliver of sky at a sliver of cover, wherever its region swings', () => {
    const covered = Math.max(...NOISES.map((region) => scatterCoverage(SLIVER, region, 0.5)));
    expect(covered).toBeLessThan(0.01);
  });

  it('keeps its region gaps clear as a thin cover thins', () => {
    expect(scatterCoverage(0.05, -0.5, 0.2)).toBe(0);
  });

  it('takes the whole swing of its region once the cover reaches the region strength', () => {
    expect(scatterCoverage(0.6, 0.5, 0.2)).toBeCloseTo(0.7, 12);
    expect(scatterCoverage(0.6, -0.5, 0.2)).toBeCloseTo(0.5, 12);
  });
});
