import { expect, it } from 'vitest';
import { toChunk } from '../src/core/coords.ts';
import { buildSkylight, skyIndex } from '../src/core/skylight.ts';
import { captureSky, growSky, SKY_HALO, type SkySnapshot } from '../src/core/skySnapshot.ts';
import { buildSkyResult } from '../src/core/skyTransport.ts';
import { skyFixture } from './fixtures/sky.ts';
import { fixtureBox } from './fixtures/skyWorld.ts';

function referenceHeights(input: SkySnapshot, opaque: (x: number, y: number, z: number) => boolean): Float32Array {
  const bounds = growSky(input.bounds, SKY_HALO);
  const [x0, , z0] = bounds.min;
  const result = new Float32Array((bounds.max[0] - x0) * (bounds.max[2] - z0));
  for (let z = z0; z < bounds.max[2]; z++) {
    for (let x = x0; x < bounds.max[0]; x++) {
      let top = input.bottom - 1;
      for (let y = input.top; y >= input.bottom; y--) {
        if (opaque(x, y, z)) {
          top = y;
          break;
        }
      }
      result[x - x0 + (bounds.max[0] - x0) * (z - z0)] = top;
    }
  }
  return result;
}

it('matches generous-domain transport and opaque-column heights with foliage and furniture', () => {
  const fixture = skyFixture();
  fixture.world.setBlock(8, 9, 8, fixture.registry.blockIds.get('fixture_leaves')!);
  fixture.world.setBlock(4, 5, 8, 0);
  fixture.entities.add({ type: 'fixture_door', pos: [14, 15, 8], size: [1, 1, 1], facing: 'n' });
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
  expect(result.heights).toEqual(referenceHeights(captured.input, fixture.knownOpaque));
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
