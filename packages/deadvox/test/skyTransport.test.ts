import { expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { worldOpaque } from '../src/core/collision.ts';
import { toChunk, type Vec3 } from '../src/core/coords.ts';
import { skyIndex } from '../src/core/skylight.ts';
import { buildSkylight } from './fixtures/skyOracle.ts';
import { captureSky, containsSky, growSky, SKY_HALO, type SkySnapshot } from '../src/core/skySnapshot.ts';
import { buildSkyResult } from '../src/core/skyTransport.ts';
import { skyFixture } from './fixtures/sky.ts';
import { fixtureBox } from './fixtures/skyWorld.ts';

type Opacity = (x: number, y: number, z: number) => boolean;
const inFurniture = (input: SkySnapshot, point: Vec3) => input.furniture.some((box) => containsSky(box, point));
function referenceHeight(input: SkySnapshot, [opaque, blockOpaque]: [Opacity, Opacity], x: number, z: number): number {
  for (let y = input.top; y >= input.bottom; y--) {
    if (opaque(x, y, z)) {
      let top = y;
      while (!blockOpaque(x, top, z) && inFurniture(input, [x, top, z])) {
        top -= 1;
      }
      return top;
    }
  }
  return input.bottom - 1;
}
function referenceHeights(input: SkySnapshot, opaque: Opacity, blockOpaque: Opacity): Float32Array {
  const bounds = growSky(input.bounds, SKY_HALO);
  const [x0, , z0] = bounds.min;
  const result = new Float32Array((bounds.max[0] - x0) * (bounds.max[2] - z0));
  for (let z = z0; z < bounds.max[2]; z++) {
    for (let x = x0; x < bounds.max[0]; x++) {
      result[x - x0 + (bounds.max[0] - x0) * (z - z0)] = referenceHeight(input, [opaque, blockOpaque], x, z);
    }
  }
  return result;
}
const roofAdmits = (input: SkySnapshot, heights: Float32Array, [x, y, z]: Vec3) => {
  const bounds = growSky(input.bounds, SKY_HALO);
  return y > heights[x - bounds.min[0] + (bounds.max[0] - bounds.min[0]) * (z - bounds.min[2])]!;
};

it('lets the roof fallback reach a column’s topmost furniture but not the air beneath it or a block-roofed room', () => {
  const fixture = skyFixture();
  // A two-cell stack outside the room's wall stands over air; another piece sits under the room's roof.
  for (const pos of [
    [13, 3, 8],
    [13, 4, 8],
    [8, 2, 8],
  ] satisfies Vec3[]) {
    fixture.entities.add({ type: 'fixture_door', pos, size: [1, 1, 1], facing: 'n' });
  }
  const { input } = fixture.capture();
  const { heights } = buildSkyResult(input);
  expect(roofAdmits(input, heights, [13, 4, 8])).toBe(true);
  expect(roofAdmits(input, heights, [13, 3, 8])).toBe(true);
  expect(roofAdmits(input, heights, [13, 2, 8])).toBe(false);
  expect(roofAdmits(input, heights, [8, 2, 8])).toBe(false);
  expect(roofAdmits(input, heights, [8, 3, 8])).toBe(false);
});

it('matches generous-domain transport and opaque-column heights with foliage and furniture', () => {
  const fixture = skyFixture();
  fixture.world.setBlock(8, 9, 8, fixture.registry.blockIds.get('fixture_leaves')!);
  fixture.world.setBlock(4, 5, 8, 0);
  // Furniture over air, and a furniture stack whose lower cell also holds a wall block.
  for (const pos of [
    [15, 15, 8],
    [14, 15, 8],
    [14, 16, 8],
  ] satisfies Vec3[]) {
    fixture.entities.add({ type: 'fixture_door', pos, size: [1, 1, 1], facing: 'n' });
  }
  fixture.world.setBlock(14, 15, 8, fixture.wall);
  const captured = fixture.capture();
  const result = buildSkyResult(captured.input);
  expect(result.complete).toBe(true);
  const volume = result.volume!;
  expect(volume.light.length).toBeGreaterThan(0);
  const oracle = buildSkylight(growSky(captured.input.bounds, SKY_HALO * 2), 31, fixture.knownOpaque);
  const [x0, y0, z0] = volume.min;
  for (let y = y0; y < volume.max[1]; y++) {
    for (let z = z0; z < volume.max[2]; z++) {
      for (let x = x0; x < volume.max[0]; x++) {
        expect(volume.light[skyIndex(volume.size, x - volume.min[0], y - volume.min[1], z - volume.min[2])]).toBe(
          oracle.light[skyIndex(oracle.size, x - oracle.min[0], y - oracle.min[1], z - oracle.min[2])],
        );
      }
    }
  }
  const blockOpaque = worldOpaque(fixture.world, fixture.registry, new BlockEntities(fixture.registry));
  expect(result.heights).toEqual(referenceHeights(captured.input, fixture.knownOpaque, blockOpaque));
});

it('copies transfer buffers and rejects a revision change between continuation steps', () => {
  const fixture = skyFixture();
  const iterator = captureSky(fixture, growSky(fixtureBox, 1), { bottom: 0, top: 31 });
  let next = iterator.next();
  fixture.world.setBlock(-1, 2, -1, fixture.wall);
  while (!next.done) {
    next = iterator.next();
  }
  expect(next.value.current()).toBe(false);
  const fresh = fixture.capture();
  const chunk = fixture.world.getChunk(0, 0, 0)!;
  const before = chunk.toArray();
  structuredClone(fresh.input, {
    transfer: fresh.input.chunks.flatMap((entry) => (entry.raw ? [entry.raw.buffer as ArrayBuffer] : [])),
  });
  expect(chunk.toArray()).toEqual(before);
  expect(chunk.raw()?.byteLength).toBeGreaterThan(0);
  expect(fresh.current()).toBe(true);
  const cx = toChunk(fixtureBox.min[0]);
  fixture.world.removeChunk(cx, 0, 0);
  expect(fresh.current()).toBe(false);
  expect(buildSkyResult(fixture.capture().input).complete).toBe(false);
});
