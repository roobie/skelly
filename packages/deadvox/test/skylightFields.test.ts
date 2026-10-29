import { BoxGeometry, Mesh, MeshLambertMaterial } from 'three';
import { expect, it, vi } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { graphicsTuningOf } from '../src/core/graphicsTuning.ts';
// biome-ignore lint/performance/noNamespaceImport: module namespace is required to spy on the synchronous build.
import * as skyTransport from '../src/core/skyTransport.ts';
import { skyFixture } from './fixtures/sky.ts';
import { fixtureBox } from './fixtures/skyWorld.ts';

const inside: Vec3 = [8.5, 4.5, 8.5];

/** The two channels the view uploaded for its resident volume, split back out of the interleaved texture. */
const uploaded = (fixture: ReturnType<typeof skyFixture>) => {
  const data = fixture.shader().uniforms.uSkyVolume!.value.image.data as Uint8Array;
  const channel = (offset: number) => Uint8Array.from({ length: data.length / 2 }, (_, i) => data[i * 2 + offset]!);
  return { light: channel(0), unfurnished: channel(1) };
};

it('draws the simulation field for a box: the same result object and its volume bytes', () => {
  const fixture = skyFixture();
  fixture.update();
  fixture.complete();
  fixture.update();
  const result = fixture.fields.current(0);
  expect(result?.volume).toBeDefined();
  expect(fixture.sky.inspect()[0]!.current).toBe(true);
  const { light, unfurnished } = result!.volume!;
  expect(uploaded(fixture)).toEqual({ light, unfurnished });
  expect(fixture.sky.at(inside)).toBe(fixture.fields.visibilityAt(inside));
  expect(fixture.fields.current(0)).toBe(result);
});

it('draws a field the simulation built first without asking for another build', () => {
  const fixture = skyFixture();
  const answer = fixture.fields.visibilityAt(inside);
  fixture.update();
  expect(fixture.pending).toHaveLength(0);
  expect(fixture.sky.stats.requested).toBe(0);
  const { light, unfurnished } = fixture.fields.current(0)!.volume!;
  expect(uploaded(fixture)).toEqual({ light, unfurnished });
  expect(fixture.sky.at(inside)).toBe(answer);
});

it('draws dimmed sky, at or below the cap, for a field the cache has not built, then the built result', () => {
  const fixture = skyFixture();
  fixture.update();
  expect(fixture.pending.length).toBeGreaterThan(0);
  expect(fixture.sky.at(inside)).toBeGreaterThan(0);
  expect(fixture.sky.at(inside)).toBeLessThanOrEqual(fixture.unbuiltSkyCap);
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

it('certifies only current, published proximity lighting while prebuilding distant loaded fields', () => {
  const fixture = skyFixture([fixtureBox, { min: [80, 1, 4], max: [88, 9, 12] }]);
  const position: Vec3 = [8, 4, 8];
  expect(fixture.sky.loadingReadiness(position).ready).toBe(false);
  fixture.update(position);
  expect(fixture.pending).toHaveLength(2);
  fixture.complete();
  fixture.complete();
  expect(fixture.sky.loadingReadiness(position).ready).toBe(false);
  fixture.update(position);
  expect(fixture.sky.loadingReadiness(position).ready).toBe(true);
  expect(fixture.sky.inspect()[0]!.resident).toBe(true);
  expect(fixture.sky.inspect()[1]!.complete).toBe(true);
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

it('prebuilds loaded fields nearest the reveal edge first with concurrent jobs bounded by content', () => {
  const boxes = Array.from({ length: 5 }, (_, index) => ({
    min: [4 + index * 24, 1, 4] as Vec3,
    max: [13 + index * 24, 10, 13] as Vec3,
  }));
  const fixture = skyFixture(boxes);
  fixture.update();
  expect(fixture.pending.length).toBeGreaterThan(1);
  expect(fixture.pending.length).toBe(graphicsTuningOf(fixture.registry).skyJobsInFlight);
  expect(fixture.pending.length).toBeLessThan(boxes.length);
  const submitted = fixture.pending.map(({ input }) => input.bounds.min[0]);
  expect(submitted).toEqual([...submitted].sort((a, b) => b - a));
  expect(submitted[0]).toBe(fixture.fields.fields.at(-1)!.bounds.min[0]);
  const outstanding = fixture.pending.length;
  fixture.update();
  expect(fixture.pending).toHaveLength(outstanding);
  fixture.complete();
  fixture.update();
  expect(fixture.pending).toHaveLength(outstanding);
});

it.each(['ready', 'missing'] as const)('finishes at reveal only when the worker answer is %s', (state) => {
  const fixture = skyFixture();
  fixture.update();
  if (state === 'ready') {
    fixture.complete();
  }
  const build = vi.spyOn(skyTransport, 'buildSkyResult');
  try {
    fixture.fields.finishColumn(0, 0);
    expect(build).toHaveBeenCalledTimes(Number(state === 'missing'));
    const answer = fixture.fields.current(0);
    expect(answer?.complete).toBe(true);
    fixture.update();
    expect(fixture.sky.inspect()[0]!.current).toBe(true);
    expect(fixture.sky.at(inside)).toBe(fixture.fields.visibilityAt(inside));
    expect(fixture.sky.at(inside)).toBeLessThan(fixture.unbuiltSkyCap);
    if (state === 'missing') {
      fixture.complete();
      expect(fixture.fields.current(0)).toBe(answer);
      expect(fixture.sky.stats.discarded).toBeGreaterThan(0);
    }
  } finally {
    build.mockRestore();
  }
});

it('leaves unavailable reveal neighbours to the residency policy without caching an incomplete answer', () => {
  const fixture = skyFixture();
  fixture.world.removeChunk(0, 0, 0);
  fixture.fields.finishColumn(0, 0);
  expect(fixture.fields.current(0)).toBeUndefined();
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
    while (fixture.pending.length > 0) {
      fixture.complete();
      fixture.update(position);
    }
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
