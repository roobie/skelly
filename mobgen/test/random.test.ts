import { describe, expect, it } from 'vitest';
import { noise3, seededRng } from '../src/core/random.ts';

describe('seededRng', () => {
  // mulberry32's published sequence for seed 1 (matches gungen's core/random.ts test).
  it('is stable across runs and machines', () => {
    const rng = seededRng(1);
    expect([rng(), rng(), rng()].map((x) => x.toFixed(6))).toEqual(['0.627074', '0.002736', '0.527447']);
  });

  it('is deterministic for a given seed', () => {
    const a = seededRng(42);
    const b = seededRng(42);
    expect(Array.from({ length: 10 }, () => a())).toEqual(Array.from({ length: 10 }, () => b()));
  });
});

describe('noise3', () => {
  it('is deterministic: same inputs, same output', () => {
    expect(noise3(1.23, 4.56, 7.89, 5)).toBe(noise3(1.23, 4.56, 7.89, 5));
  });

  it('is in [0, 1) over a grid of sample points', () => {
    for (let x = 0; x < 5; x += 0.37) {
      for (let y = 0; y < 5; y += 0.53) {
        const n = noise3(x, y, 1.1, 7);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThan(1);
      }
    }
  });

  it('varies with position', () => {
    const values = new Set(Array.from({ length: 20 }, (_, i) => noise3(i * 0.31, i * 0.17, i * 0.53, 1)));
    expect(values.size).toBeGreaterThan(10);
  });

  it('varies with seed', () => {
    expect(noise3(1.1, 2.2, 3.3, 1)).not.toBe(noise3(1.1, 2.2, 3.3, 2));
  });
});
