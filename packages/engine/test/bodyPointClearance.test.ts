import { expect, it } from 'vitest';
import { clearBodyPoint, type SolidAt, type Vec3 } from '../src/world.ts';

const body = { pos: [0.5, 0, 0.5] as Vec3, height: 4 };
const marginBlocks = 0.1;
// Rounding the swept stop back into the world may land a cube's face a few ulps over its contact.
const ROUNDING = 1e-9;

/** The Chebyshev distance from a point to the nearest solid cell within a block of reach beyond the margin. */
const clearance = (point: Readonly<Vec3>, isSolid: SolidAt): number => {
  let nearest = Number.POSITIVE_INFINITY;
  const [cx, cy, cz] = point.map(Math.floor) as Vec3;
  for (let x = cx - 1; x <= cx + 1; x++) {
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let z = cz - 1; z <= cz + 1; z++) {
        if (isSolid(x, y, z)) {
          const gaps = [x, y, z].map((cell, axis) => Math.max(cell - point[axis]!, point[axis]! - cell - 1, 0));
          nearest = Math.min(nearest, Math.max(...gaps));
        }
      }
    }
  }
  return nearest;
};

it('keeps the whole margin from a wall the point meets at a grazing angle', () => {
  const isSolid: SolidAt = (x) => x >= 1;
  const point: Vec3 = [1.05, 1.5, 5.5];
  const cleared = clearBodyPoint({ body, point, marginBlocks, isSolid });
  expect(cleared[2]).toBeGreaterThan(body.pos[2]);
  expect(clearance(cleared, isSolid)).toBeGreaterThanOrEqual(marginBlocks - ROUNDING);
});

it('keeps a point posed clear beyond a thin wall on the body side', () => {
  const isSolid: SolidAt = (_x, _y, z) => z === 2;
  const cleared = clearBodyPoint({ body, point: [0.5, 1.5, 3.5], marginBlocks, isSolid });
  expect(cleared[2]).toBeLessThan(2);
  expect(clearance(cleared, isSolid)).toBeGreaterThanOrEqual(marginBlocks - ROUNDING);
});

it('leaves a point with a clear sweep where the pose put it', () => {
  const point: Vec3 = [1.2, 3.7, 0.1];
  expect(clearBodyPoint({ body, point, marginBlocks, isSolid: (_x, y) => y < 0 })).toEqual(point);
});

it('returns the anchor when the sweep starts blocked', () => {
  const isSolid: SolidAt = (x, y, z) => x === 0 && y === 1 && z === 0;
  expect(clearBodyPoint({ body, point: [1.2, 1.5, 0.5], marginBlocks, isSolid })).toEqual([0.5, 1.5, 0.5]);
});
