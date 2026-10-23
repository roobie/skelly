import { BoxGeometry, Mesh, MeshLambertMaterial } from 'three';
import { expect, it, vi } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { skyFixture } from './fixtures/sky.ts';
import { fixtureBox } from './fixtures/skyWorld.ts';

const inside: Vec3 = [8.5, 4.5, 8.5];

/** The bytes the view uploaded for its resident volumes. */
const uploaded = (fixture: ReturnType<typeof skyFixture>) =>
  fixture.shader().uniforms.uSkyVolume!.value.image.data as Uint8Array;

it('draws the simulation field for a box: the same result object and its volume bytes', () => {
  const fixture = skyFixture();
  fixture.update();
  fixture.complete();
  fixture.update();
  const result = fixture.fields.current(0);
  expect(result?.volume).toBeDefined();
  expect(fixture.sky.inspect()[0]!.current).toBe(true);
  expect(uploaded(fixture)).toEqual(result!.volume!.light);
  expect(fixture.sky.at(inside)).toBe(fixture.fields.visibilityAt(inside));
  expect(fixture.fields.current(0)).toBe(result);
});

it('draws a field the simulation built first without asking for another build', () => {
  const fixture = skyFixture();
  const answer = fixture.fields.visibilityAt(inside);
  fixture.update();
  expect(fixture.pending).toHaveLength(0);
  expect(fixture.sky.stats.requested).toBe(0);
  expect(uploaded(fixture)).toEqual(fixture.fields.current(0)!.volume!.light);
  expect(fixture.sky.at(inside)).toBe(answer);
});

it('draws open sky for a field the cache has not built, then the built result', () => {
  const fixture = skyFixture();
  fixture.update();
  expect(fixture.pending.length).toBeGreaterThan(0);
  expect(fixture.sky.at(inside)).toBe(1);
  const { uniforms } = fixture.shader();
  const { data } = uniforms.uSkyRegions!.value.image;
  expect(data[3]).toBe(0);
  fixture.complete();
  fixture.update();
  expect(fixture.sky.stats.accepted).toBeGreaterThan(0);
  expect(fixture.sky.at(inside)).toBe(0);
  expect(fixture.sky.at([8.5, 10.5, 8.5])).toBe(1);
  expect(data[3]).toBe(1);
});

it('certifies only current, published proximity lighting while leaving distant fields unbuilt', () => {
  const fixture = skyFixture([fixtureBox, { min: [80, 1, 4], max: [88, 9, 12] }]);
  const position: Vec3 = [8, 4, 8];
  expect(fixture.sky.loadingReadiness(position).ready).toBe(false);
  fixture.update(position);
  expect(fixture.pending).toHaveLength(1);
  fixture.complete();
  expect(fixture.sky.loadingReadiness(position).ready).toBe(false);
  fixture.update(position);
  expect(fixture.sky.loadingReadiness(position).ready).toBe(true);
  expect(fixture.sky.inspect()[0]!.resident).toBe(true);
  expect(fixture.sky.inspect()[1]!.complete).toBe(false);
  fixture.world.setBlock(4, 5, 8, 0);
  expect(fixture.sky.loadingReadiness(position).ready).toBe(false);
  fixture.update(position);
  fixture.complete();
  fixture.update(position);
  expect(fixture.sky.loadingReadiness(position).ready).toBe(true);
});

it('does not request unavailable lighting dependencies in a partial recorded world', () => {
  const fixture = skyFixture();
  fixture.world.removeChunk(0, 0, 0);
  fixture.sky.setRecordedTerrain();
  fixture.update();
  expect(fixture.pending).toHaveLength(0);
  expect(fixture.sky.loadingReadiness([8, 4, 8]).ready).toBe(true);
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
  expect(fixture.fields.latest(0)).toBeUndefined();
  fixture.complete();
  fixture.update();
  expect(fixture.sky.stats.accepted).toBeGreaterThan(0);
  expect(fixture.sky.at([8.5, 8.5, 8.5])).toBeLessThan(1);
});

it('prepares the next independent snapshot while the first worker request is outstanding', () => {
  const fixture = skyFixture([fixtureBox, { min: [40, 1, 4], max: [48, 9, 12] }]);
  const chunks = vi.spyOn(fixture.world, 'getChunk');
  fixture.update([24, 4, 8]);
  expect(fixture.pending).toHaveLength(1);
  const firstSource = new Set(
    fixture.pending[0]!.input.chunks.map((chunk) => [chunk.cx, chunk.cy, chunk.cz].join(',')),
  );
  fixture.update([24, 4, 8]);
  expect(fixture.pending).toHaveLength(1);
  expect(chunks.mock.calls.some((coords) => !firstSource.has(coords.join(',')))).toBe(true);
  chunks.mockRestore();
});

it('keeps a resident room dark during an opening edit and swaps only the accepted replacement', () => {
  const fixture = skyFixture();
  const point: Vec3 = [5.5, 5.5, 8.5];
  fixture.update();
  fixture.complete();
  fixture.update();
  const before = fixture.sky.at(point);
  expect(before).toBe(0);
  fixture.world.setBlock(4, 5, 8, 0);
  fixture.update();
  expect(fixture.pending.length).toBeGreaterThan(0);
  expect(fixture.sky.at(point)).toBe(before);
  expect(fixture.sky.inspect()[0]!.current).toBe(false);
  fixture.complete();
  fixture.update();
  expect(fixture.sky.inspect()[0]!.current).toBe(true);
  expect(fixture.sky.at(point)).toBeGreaterThan(before);
  expect(fixture.sky.at(point)).toBeLessThan(1);
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
  expect(fixture.sky.at(inside)).toBe(0);
  fixture.update([8, 4, 8]);
  expect(fixture.sky.stats.requested).toBe(requested);
  expect(fixture.sky.at(inside)).toBe(0);
});

it('shares one furniture bounds scan across fields until standing geometry changes', () => {
  const fixture = skyFixture([fixtureBox, { min: [40, 1, 4], max: [48, 9, 12] }]);
  const door = fixture.entities.add({ type: 'fixture_door', pos: [8, 20, 8], size: [1, 1, 1], facing: 'n' })!;
  const boxes = vi.spyOn(fixture.entities, 'blockingBoxes');
  try {
    fixture.fields.visibilityAt(inside);
    fixture.fields.visibilityAt([44.5, 4.5, 8.5]);
    expect(boxes.mock.calls).toEqual([[door]]);
    fixture.entities.markSearched(door);
    fixture.fields.visibilityAt(inside);
    expect(boxes.mock.calls).toEqual([[door]]);

    fixture.entities.setOpen(door, true);
    fixture.fields.visibilityAt(inside);
    expect(boxes.mock.calls).toEqual([[door], [door]]);
  } finally {
    boxes.mockRestore();
  }
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
