import { expect, it } from 'vitest';
import {
  overlayBounds,
  projectionDepth,
  projectPoint,
  scaleBarPixels,
  type TraceProjection,
} from '../src/gun/traceProjection.ts';
import { uToMm } from '../src/gun/units.ts';

const projection: TraceProjection = {
  view: 'right',
  modelDatum: [2, 3, 4],
  photoDatum: [100, 80],
  mmPerPixel: 2,
};

it('registers the explicit landmark exactly and ignores depth in orthographic side projection', () => {
  expect(projectPoint(projection.modelDatum, projection)).toEqual(projection.photoDatum);
  expect(projectPoint([5, 6, -200], projection)).toEqual(projectPoint([5, 6, 200], projection));
  const translated = { ...projection, modelDatum: [12, 13, 14] as const };
  expect(projectPoint([15, 16, 17], translated)).toEqual(projectPoint([5, 6, 7], projection));
});

it('preserves physical length at the requested scale and flips handedness between sides', () => {
  const right = projectPoint([5, 7, 4], projection);
  const left = projectPoint([5, 7, 4], { ...projection, view: 'left' });
  const [x, y] = projection.photoDatum;
  expect(right[0] - x).toBeCloseTo(x - left[0]);
  expect(right[1]).toBe(left[1]);
  expect(right[1]).toBeLessThan(y);
  expect(Math.hypot(right[0] - x, right[1] - y) * projection.mmPerPixel).toBeCloseTo(uToMm(5));
  const smaller = projectPoint([5, 7, 4], { ...projection, mmPerPixel: projection.mmPerPixel * 2 });
  expect(smaller[0] - x).toBeCloseTo((right[0] - x) / 2);
  expect(smaller[1] - y).toBeCloseTo((right[1] - y) / 2);
});

it('orders nearer depth last for either side without changing projection scale', () => {
  expect(projectionDepth([0, 0, 5], 'right')).toBeGreaterThan(projectionDepth([0, 0, -5], 'right'));
  expect(projectionDepth([0, 0, 5], 'left')).toBeLessThan(projectionDepth([0, 0, -5], 'left'));
  expect(scaleBarPixels(uToMm(3), projection.mmPerPixel)).toBeCloseTo(
    projectPoint([5, 3, 4], projection)[0] - projection.photoDatum[0],
  );
});

it('expands the canvas to retain model points outside the photo without rescaling them', () => {
  const points = [
    [-50, 12],
    [200, -30],
    [10, 150],
  ] as const;
  const bounds = overlayBounds(100, 80, points);
  for (const [x, y] of [...points, [0, 0], [100, 80]]) {
    expect(x).toBeGreaterThan(bounds.minX);
    expect(x).toBeLessThan(bounds.maxX);
    expect(y).toBeGreaterThan(bounds.minY);
    expect(y).toBeLessThan(bounds.maxY);
  }
});

it('refuses nonfinite datums and nonpositive scales rather than fitting a usable view', () => {
  expect(() => projectPoint([0, 0, 0], { ...projection, mmPerPixel: 0 })).toThrow(RangeError);
  expect(() => projectPoint([Number.POSITIVE_INFINITY, 0, 0], projection)).toThrow(RangeError);
  expect(() => scaleBarPixels(10, -2)).toThrow(RangeError);
});
