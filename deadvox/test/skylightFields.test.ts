import { BoxGeometry, Mesh, MeshLambertMaterial, Scene } from 'three';
import { expect, it, vi } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import type { SkyBounds } from '../src/core/skylight.ts';
import { Skylight } from '../src/render/skylight.ts';

const { registry } = buildRegistry([
  {
    source: 'fixture.json',
    data: { furniture: [{ id: 'door', name: 'Door', size: [1, 4, 2], color: '#99794c', door: { handling: 0.6 } }] },
  },
]);
const box: SkyBounds = { min: [0, 0, 0], max: [8, 10, 8] };
const makeSky = (boxes: SkyBounds[] = [box]) => new Skylight(boxes, 0.5, 32, 32);
const volumeCells = 12 * 14 * 12;
const aboveCells = 12 * 12 * 21;

it('allocates only a nearby placement and never samples the gap between cellars 100 m apart', () => {
  const sky = makeSky([box, { min: [200, 0, 0], max: [208, 10, 8] }]);
  const scene = new Scene();
  const entities = new BlockEntities(registry);
  const opaque = vi.fn((_x: number, _y: number, _z: number) => false);
  const update = (position: Vec3) => sky.update(scene, position, { entities }, opaque);
  update([4, 2, 4]);
  expect(opaque).toHaveBeenCalledTimes(volumeCells + aboveCells);
  opaque.mockClear();
  update([204, 2, 4]);
  expect(opaque).toHaveBeenCalledTimes(volumeCells + aboveCells);
  expect(opaque.mock.calls.every(([x]) => x! >= 198)).toBe(true);
  opaque.mockClear();
  update([100, 2, 100]);
  expect(opaque).not.toHaveBeenCalled();
  expect(sky.at([2, 1, 2])).toBe(1);
});

it('ignores distant chunk churn and frame updates, but invalidates a local column including sky above', () => {
  const sky = makeSky();
  const scene = new Scene();
  const entities = new BlockEntities(registry);
  const opaque = vi.fn((_x: number, _y: number, _z: number) => false);
  const update = () => sky.update(scene, [4, 2, 4], { entities }, opaque);
  update();
  opaque.mockClear();
  update();
  expect(opaque).not.toHaveBeenCalled();
  sky.chunkChanged([192, 0, 192]);
  update();
  expect(opaque).not.toHaveBeenCalled();
  sky.chunkChanged([0, 0, 0]);
  update();
  expect(opaque).toHaveBeenCalledTimes(volumeCells + aboveCells);
});

it('patches a late lit mesh without chunk or entity revision changes', () => {
  const sky = makeSky();
  const scene = new Scene();
  const entities = new BlockEntities(registry);
  sky.update(scene, [4, 2, 4], { entities }, () => false);
  const material = new MeshLambertMaterial();
  scene.add(new Mesh(new BoxGeometry(), material));
  sky.update(scene, [4, 2, 4], { entities }, () => false);
  expect(material.customProgramCacheKey()).toContain('bounded-voxel-skylight');
});

it('keeps both cellars resident across a nearest-cellar switch and packs their different strides', () => {
  const sky = makeSky([box, { min: [20, 0, 0], max: [30, 14, 12] }]);
  const scene = new Scene();
  const entities = new BlockEntities(registry);
  const opaque = vi.fn((x: number, y: number) => y === (x < 12 ? 6 : 8));
  const material = new MeshLambertMaterial();
  scene.add(new Mesh(new BoxGeometry(), material));
  const update = (position: Vec3) => sky.update(scene, position, { entities }, opaque);
  update([4, 2, 4]);
  expect(sky.at([2, 1, 2])).toBe(0);
  expect(sky.at([12, 1, 2])).toBe(0);
  opaque.mockClear();
  update([24, 2, 4]);
  expect(sky.at([2, 1, 2])).toBe(0);
  expect(sky.at([12, 1, 2])).toBe(0);
  expect(opaque).not.toHaveBeenCalled();
  const shader = {
    uniforms: {} as Parameters<typeof material.onBeforeCompile>[0]['uniforms'],
    vertexShader: '#include <common>\n#include <worldpos_vertex>',
    fragmentShader: '#include <common>\n#include <lights_fragment_end>',
  };
  material.onBeforeCompile(shader as never, null as never);
  const { data, width, height, depth } = shader.uniforms.uSkyVolume!.value.image;
  expect([width, height, depth]).toEqual([14, 16, 32]);
  expect(data[6 + width * (6 + height * 9)]).toBe(255);
  expect(data[6 + width * (6 + height * (14 + 9))]).toBe(0);
  expect(shader.uniforms.uSkyAtlasOffset!.value[1]).toBe(14 / depth);
});

it('caps residency at four and follows the actual view radius rather than a fixed 32 m', () => {
  const boxes: SkyBounds[] = Array.from({ length: 5 }, (_, index) => ({
    min: [index * 20, 0, 0],
    max: [index * 20 + 8, 10, 8],
  }));
  const scene = new Scene();
  const entities = new BlockEntities(registry);
  const sky = new Skylight(boxes, 0.5, 32, 64);
  const opaque = (_x: number, y: number) => y === 6;
  sky.update(scene, [44, 2, 4], { entities }, opaque);
  expect(sky.at([2, 1, 2])).toBe(0);
  expect(sky.at([42, 1, 2])).toBe(1);
  sky.update(scene, [84, 2, 4], { entities }, opaque);
  expect(sky.at([2, 1, 2])).toBe(1);
  expect(sky.at([42, 1, 2])).toBe(0);
  const narrow = new Skylight(boxes, 0.5, 32, 16);
  narrow.update(scene, [4, 2, 4], { entities }, opaque);
  expect(narrow.at([22, 1, 2])).toBe(1);
});

it('rebuilds on local door opacity changes with cached sky columns, not distant or searched entity changes', () => {
  const sky = makeSky();
  const scene = new Scene();
  const entities = new BlockEntities(registry);
  const opaque = vi.fn((_x: number, _y: number, _z: number) => false);
  const update = () => sky.update(scene, [4, 2, 4], { entities }, opaque);
  update();
  opaque.mockClear();
  entities.add({ type: 'door', pos: [128, 1, 128], size: [1, 4, 2], facing: 'n' });
  update();
  expect(opaque).not.toHaveBeenCalled();
  const local = entities.add({ type: 'door', pos: [2, 1, 2], size: [1, 4, 2], facing: 'n' })!;
  update();
  expect(opaque).toHaveBeenCalledTimes(volumeCells);
  opaque.mockClear();
  entities.markSearched(local);
  update();
  expect(opaque).not.toHaveBeenCalled();
  entities.setOpen(local, true);
  update();
  expect(opaque).toHaveBeenCalledTimes(volumeCells);
});
