import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { soundOcclusion } from '../src/core/soundOcclusion.ts';

const listener: Vec3 = [0.5, 1.5, 0.5];
const source: Vec3 = [5.5, 1.5, 0.5];

describe('positional sound occlusion', () => {
  it('muffles a sound by solid-run count, not wall thickness', () => {
    const clear = soundOcclusion(listener, source, () => false);
    const oneWall = soundOcclusion(listener, source, (x, y) => x >= 2 && x <= 3 && y === 1);

    expect(clear.wallRuns).toBe(0);
    expect(oneWall.wallRuns).toBe(1);
    expect(oneWall.gain).toBeLessThan(clear.gain);
    expect(oneWall.gain).toBeGreaterThan(0.2);
    expect(oneWall.cutoffHz).toBeLessThan(clear.cutoffHz);
    expect(oneWall.cutoffHz).toBeGreaterThan(1000);
  });
});
