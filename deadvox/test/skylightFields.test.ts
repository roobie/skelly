import { BoxGeometry, Mesh, MeshLambertMaterial } from 'three';
import { expect, it, vi } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { buildSkylight } from '../src/core/skylight.ts';
import { growSky, SKY_HALO } from '../src/core/skySnapshot.ts';
import { sampleSky } from '../src/core/skyTransport.ts';
import { skyFixture } from './fixtures/sky.ts';
import { fixtureBox } from './fixtures/skyWorld.ts';

it('keeps a pending eligible room dark but preserves the old estimate under a noncandidate canopy', () => {
  const fixture = skyFixture();
  for (let z = 6; z <= 8; z++) {
    for (let x = 24; x <= 26; x++) {
      fixture.world.setBlock(x, 9, z, fixture.wall);
    }
  }
  const canopy: Vec3 = [25.5, 7.5, 7.5];
  const oracle = buildSkylight(growSky(fixtureBox, SKY_HALO * 2), 31, fixture.knownOpaque);
  expect(sampleSky(oracle, canopy)).toBeGreaterThan(0);
  expect(sampleSky(oracle, canopy)).toBeLessThan(1);
  fixture.update();
  expect(fixture.pending.length).toBeGreaterThan(0);
  expect(fixture.sky.at([8.5, 4.5, 8.5])).toBe(0);
  expect(fixture.sky.at(canopy)).toBe(1);
  const { uniforms } = fixture.shader();
  const { data } = uniforms.uSkyRegions!.value.image;
  expect(data[3]).toBe(0);
  expect(uniforms.uSkyGrid!.value.image.data.some((value: number) => value > 0)).toBe(true);
  fixture.complete();
  fixture.update();
  expect(fixture.sky.stats.accepted).toBeGreaterThan(0);
  expect(fixture.sky.at([8.5, 4.5, 8.5])).toBe(0);
  expect(fixture.sky.at([8.5, 10.5, 8.5])).toBe(1);
  expect(fixture.sky.at(canopy)).toBe(1);
  expect(data[3]).toBe(1);
});

it('patches a late lit mesh without a geometry or entity revision', () => {
  const fixture = skyFixture();
  fixture.update();
  fixture.complete();
  fixture.update();
  const material = new MeshLambertMaterial();
  fixture.scene.add(new Mesh(new BoxGeometry(), material));
  fixture.update();
  const shader = {
    uniforms: {} as Parameters<typeof material.onBeforeCompile>[0]['uniforms'],
    vertexShader: '#include <common>\n#include <worldpos_vertex>',
    fragmentShader: '#include <common>\n#include <lights_fragment_end>',
  };
  material.onBeforeCompile(shader as never, null as never);
  expect(shader.uniforms.uSkyRegions!.value).toBe(fixture.shader().uniforms.uSkyRegions!.value);
});

it('checks preparation admission after each chunk copy using an injected work clock', () => {
  let spent = 0;
  const fixture = skyFixture(undefined, () => spent);
  const copies = [...fixture.world.chunks.values()].map((chunk) => {
    const raw = chunk.raw.bind(chunk);
    return vi.spyOn(chunk, 'raw').mockImplementation(() => {
      spent += 1000;
      return raw();
    });
  });
  fixture.update();
  expect(copies.reduce((sum, spy) => sum + spy.mock.calls.length, 0)).toBe(1);
  expect(fixture.pending).toHaveLength(0);
  for (let step = 0; step < fixture.world.chunks.size + 2 && fixture.pending.length === 0; step++) {
    fixture.update();
  }
  expect(fixture.pending.length).toBeGreaterThan(0);
  for (const spy of copies) {
    spy.mockRestore();
  }
});

it('discards a worker completion after a roof edit instead of publishing stale full sky', () => {
  const fixture = skyFixture();
  for (let z = 4; z < 13; z++) {
    for (let x = 4; x < 13; x++) {
      fixture.world.setBlock(x, 9, z, 0);
    }
  }
  fixture.update();
  expect(fixture.pending.length).toBeGreaterThan(0);
  fixture.world.setBlock(8, 9, 8, fixture.wall);
  fixture.complete();
  fixture.update();
  expect(fixture.sky.stats.accepted).toBe(0);
  expect(fixture.sky.stats.discarded).toBeGreaterThan(0);
  expect(fixture.sky.at([8.5, 8.5, 8.5])).toBe(0);
  fixture.complete();
  fixture.update();
  expect(fixture.sky.stats.accepted).toBeGreaterThan(0);
  expect(fixture.sky.at([8.5, 8.5, 8.5])).toBeLessThan(1);
});

it('retains CPU results across GPU eviction and reentry without a bright fallback or rebuild', () => {
  const boxes = Array.from({ length: 5 }, (_, index) => ({
    min: fixtureBox.min.map((value, axis) => value + (axis === 0 ? index * 32 : 0)) as Vec3,
    max: fixtureBox.max.map((value, axis) => value + (axis === 0 ? index * 32 : 0)) as Vec3,
  }));
  const fixture = skyFixture(boxes);
  for (const box of boxes) {
    const position: Vec3 = [box.min[0] + 4, 4, 8];
    fixture.update(position);
    fixture.complete();
    fixture.update(position);
  }
  expect(fixture.sky.stats.accepted).toBe(boxes.length);
  const { requested } = fixture.sky.stats;
  expect(fixture.sky.at([8.5, 4.5, 8.5])).toBe(0);
  fixture.update([8, 4, 8]);
  expect(fixture.sky.stats.requested).toBe(requested);
  expect(fixture.sky.at([8.5, 4.5, 8.5])).toBe(0);
});

it('invalidates geometry above the field on a blocking door change, but not on search state', () => {
  const fixture = skyFixture();
  fixture.update();
  fixture.complete();
  fixture.update();
  const door = fixture.entities.add({ type: 'fixture_door', pos: [8, 20, 8], size: [1, 1, 1], facing: 'n' })!;
  fixture.update();
  expect(fixture.pending.length).toBeGreaterThan(0);
  fixture.complete();
  fixture.update();
  const { requested } = fixture.sky.stats;
  fixture.entities.markSearched(door);
  fixture.update();
  expect(fixture.sky.stats.requested).toBe(requested);
  fixture.entities.setOpen(door, true);
  fixture.update();
  expect(fixture.sky.stats.requested).toBeGreaterThan(requested);
});
