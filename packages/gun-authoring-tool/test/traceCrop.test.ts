import { expect, it } from 'vitest';
import { cropGrid, cropToSource, sourceToCrop, type TraceCrop, validateCrop } from '../src/gun/traceCrop.ts';

const crop: TraceCrop = { x: 7, y: 11, width: 13, height: 9, zoom: 4, gridStep: 3 };

it('maps crop-grid labels back to source pixels after translation and zoom', () => {
  validateCrop(crop, 30, 30);
  expect(sourceToCrop([crop.x, crop.y], crop)).toEqual([0, 0]);
  expect(sourceToCrop([crop.x + crop.width, crop.y + crop.height], crop)).toEqual([
    crop.width * crop.zoom,
    crop.height * crop.zoom,
  ]);
  const grid = cropGrid(crop);
  expect(grid.x.length).toBeGreaterThan(1);
  expect(grid.y.length).toBeGreaterThan(1);
  for (const line of grid.x) {
    expect(line.source % crop.gridStep).toBe(0);
    expect(cropToSource([line.position, 0], crop)[0]).toBe(line.source);
    expect(line.position).toBeGreaterThanOrEqual(0);
    expect(line.position).toBeLessThanOrEqual(crop.width * crop.zoom);
  }
  for (const line of grid.y) {
    expect(line.source % crop.gridStep).toBe(0);
    expect(cropToSource([0, line.position], crop)[1]).toBe(line.source);
    expect(line.position).toBeGreaterThanOrEqual(0);
    expect(line.position).toBeLessThanOrEqual(crop.height * crop.zoom);
  }
  const pixelCentre = [crop.x + 2.5, crop.y + 5.5] as const;
  const displayed = sourceToCrop(pixelCentre, crop);
  expect(cropToSource(displayed, crop)).toEqual(pixelCentre);
  const doubledZoom = sourceToCrop(pixelCentre, { ...crop, zoom: crop.zoom * 2 });
  expect(doubledZoom).toEqual(displayed.map((coordinate) => coordinate * 2));
});

it('rejects out-of-bounds regions and invalid grids instead of clipping or looping', () => {
  expect(() => validateCrop(crop, crop.x + crop.width - 1, 30)).toThrow('inside the source image');
  expect(() => validateCrop({ ...crop, y: -1 }, 30, 30)).toThrow(RangeError);
  expect(() => validateCrop({ ...crop, zoom: 1.5 }, 30, 30)).toThrow(RangeError);
  expect(() => cropGrid({ ...crop, gridStep: 0 })).toThrow(RangeError);
});
