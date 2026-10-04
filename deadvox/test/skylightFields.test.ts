import { Scene } from 'three';
import { expect, it, vi } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Skylight } from '../src/render/skylight.ts';

const { registry } = buildRegistry([
  {
    source: 'fixture.json',
    data: { furniture: [{ id: 'door', name: 'Door', size: [1, 4, 2], color: '#99794c', door: { handling: 0.6 } }] },
  },
]);
const box = { min: [0, 0, 0] as Vec3, max: [8, 10, 8] as Vec3 };
const volumeCells = 12 * 14 * 12; // two-cell padding, never the gap to another placement
const aboveCells = 12 * 12 * 21; // world top 32 through box top 12 inclusive

it('allocates only a nearby placement and never samples the gap between cellars 100 m apart', () => {
  const sky = new Skylight([box, { min: [200, 0, 0], max: [208, 10, 8] }], 0.5, 32);
  const scene = new Scene();
  const entities = new BlockEntities(registry);
  const opaque = vi.fn((_x: number, _y: number, _z: number) => false);
  const update = (position: Vec3) => sky.update(scene, position, { meshVersion: 0, entities }, opaque);
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
  const sky = new Skylight([box], 0.5, 32);
  const scene = new Scene();
  const entities = new BlockEntities(registry);
  const opaque = vi.fn((_x: number, _y: number, _z: number) => false);
  const traverse = vi.spyOn(scene, 'traverse');
  const update = (meshVersion: number) => sky.update(scene, [4, 2, 4], { meshVersion, entities }, opaque);
  update(0);
  opaque.mockClear();
  traverse.mockClear();
  update(0);
  expect(opaque).not.toHaveBeenCalled();
  expect(traverse).not.toHaveBeenCalled();
  sky.chunkChanged([192, 0, 192]);
  update(1);
  expect(opaque).not.toHaveBeenCalled();
  sky.chunkChanged([0, 0, 0]);
  update(2);
  expect(opaque).toHaveBeenCalledTimes(volumeCells + aboveCells);
});

it('rebuilds on local door opacity changes with cached sky columns, not distant or searched entity changes', () => {
  const sky = new Skylight([box], 0.5, 32);
  const scene = new Scene();
  const entities = new BlockEntities(registry);
  const opaque = vi.fn((_x: number, _y: number, _z: number) => false);
  const update = () => sky.update(scene, [4, 2, 4], { meshVersion: 0, entities }, opaque);
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
