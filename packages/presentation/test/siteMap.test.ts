import { yawFromBearing } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { marchingSquares, siteMapPixels, siteMapWorldToRaster } from '../src/siteMap.ts';

it('shades topographic ground cover as a continuous tone without altering satellite block colors', () => {
  const inputs = {
    heights: [0, 0, 0],
    blockIds: [0, 0, 0],
    blockColors: new Uint8Array([120, 150, 110]),
    shades: [1, 1, 1],
    width: 3,
    height: 1,
  };
  const cover = { groundCover: [0, 0.5, 1], coverTone: { color: [20, 40, 20] as const, strength: 1 } };
  const pixels = siteMapPixels({ ...inputs, ...cover, view: 'topographic' });
  const open = siteMapPixels({ ...inputs, view: 'topographic' });
  expect(pixels.slice(0, 4)).toEqual(open.slice(0, 4));
  expect(pixels[4]).toBeLessThan(pixels[0]!);
  expect(pixels[8]).toBeLessThan(pixels[4]!);
  expect([...pixels.slice(8, 11)]).toEqual([...cover.coverTone.color]);
  expect(siteMapPixels({ ...inputs, ...cover, view: 'satellite' })).toEqual(
    siteMapPixels({ ...inputs, view: 'satellite' }),
  );
});

const forwardFromBearing = (bearing: number): [number, number] => {
  const yaw = yawFromBearing(bearing);
  return [-Math.sin(yaw), -Math.cos(yaw)];
};

describe('site map orientation', () => {
  it('places compass north above and east right in raster coordinates', () => {
    const grid = { originX: 0, originZ: 0, cellSize: 1 };
    const origin = siteMapWorldToRaster(12, 18, grid);
    const [northX, northZ] = forwardFromBearing(0);
    const northPoint = siteMapWorldToRaster(12 + northX, 18 + northZ, grid);
    const [eastX, eastZ] = forwardFromBearing(90);
    const eastPoint = siteMapWorldToRaster(12 + eastX, 18 + eastZ, grid);

    expect(northPoint.row).toBeLessThan(origin.row);
    expect(eastPoint.column).toBeGreaterThan(origin.column);
  });
});

describe('site map contours', () => {
  it('traces a closed ring around an interior cone', () => {
    const width = 7;
    const height = 7;
    const values = Float32Array.from({ length: width * height }, (_, index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      return 10 - Math.hypot(x - 3, y - 3);
    });
    const segments = marchingSquares(values, width, height, 7.5);
    const endpointDegrees = new Map<string, number>();
    for (let i = 0; i < segments.length; i += 4) {
      for (const [x, y] of [
        [segments[i]!, segments[i + 1]!],
        [segments[i + 2]!, segments[i + 3]!],
      ]) {
        const key = `${x!.toFixed(4)},${y!.toFixed(4)}`;
        endpointDegrees.set(key, (endpointDegrees.get(key) ?? 0) + 1);
      }
    }

    expect(segments.length).toBeGreaterThan(0);
    expect([...endpointDegrees.values()].every((degree) => degree === 2)).toBe(true);
    expect(
      [...endpointDegrees.keys()].every((point) => {
        const [x, y] = point.split(',').map(Number);
        return x! > 0 && x! < width - 1 && y! > 0 && y! < height - 1;
      }),
    ).toBe(true);
  });
});
