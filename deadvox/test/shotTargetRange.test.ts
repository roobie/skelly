import { describe, expect, it } from 'vitest';
import { rangeToNearestShotTargetMetres } from '../src/debug/shotTargetRange.ts';

describe('debug shot-target range', () => {
  it('measures to the nearest flagged target center and converts blocks to metres', () => {
    const entities = [
      { pos: [1, 1, 0], size: [1, 2, 1], shotTarget: true },
      { pos: [0, 1, 0], size: [1, 2, 1], shotTarget: false },
      { pos: [7, 1, 0], size: [1, 2, 1], shotTarget: true },
    ] as const;
    const feet: [number, number, number] = [0, 0, 0];
    const blocks = rangeToNearestShotTargetMetres(feet, 2, 1, entities);
    const metres = rangeToNearestShotTargetMetres(feet, 2, 0.5, entities);
    expect(blocks).toBeCloseTo(Math.hypot(1.5, 1, 0.5));
    expect(metres).toBeCloseTo(blocks! * 0.5);
  });

  it('hides the range when no entity is designated as a shot target', () => {
    expect(
      rangeToNearestShotTargetMetres([0, 0, 0], 2, 0.5, [{ pos: [1, 0, 0], size: [1, 1, 1], shotTarget: false }]),
    ).toBeUndefined();
  });
});
