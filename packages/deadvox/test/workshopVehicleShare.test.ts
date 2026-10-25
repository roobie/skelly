import type { BufferAttribute, Mesh } from 'three';
import { expect, it, vi } from 'vitest';
import type { BlockEntity } from '../src/core/blockEntities.ts';
import { type VehicleLook, vehicleModel } from '../src/render/workshopVehicle.ts';
import { BLUEPRINTS } from '../src/vehicles/catalogue.ts';
import { meshGrid } from '../src/vehicles/voxels.ts';

vi.mock('../src/vehicles/voxels.ts', async (original) => {
  const actual = await original<typeof import('../src/vehicles/voxels.ts')>();
  return { ...actual, meshGrid: vi.fn(actual.meshGrid) };
});

const entity = {
  uid: 1,
  type: 'fixture_car',
  origin: [0, 0, 0],
  pos: [0, 0, 0],
  size: [4, 4, 9],
  facing: 'n',
  carried: false,
  searched: false,
  open: false,
} satisfies BlockEntity;

const solidOf = (look: VehicleLook) => vehicleModel(entity, look, 4).children[0] as Mesh;

it('meshes looks that differ only in paint and dirt once, and colours each by its own paint', () => {
  const blueprint = Object.keys(BLUEPRINTS)[0]!;
  const clean = { blueprint, body: '#ff0000', dirt: 0, removed: [], solidFill: 0.4 };
  const grimy = { blueprint, body: '#0000ff', dirt: 1, removed: [], solidFill: 0.4 };

  const [first, second] = [solidOf(clean), solidOf(grimy)];

  expect(vi.mocked(meshGrid)).toHaveBeenCalledTimes(1);
  expect(second.geometry.getAttribute('position')).toBe(first.geometry.getAttribute('position'));
  expect(second.geometry.index).toBe(first.geometry.index);
  const { solid } = vi.mocked(meshGrid).mock.results[0]!.value as ReturnType<typeof meshGrid>;
  const paintQuad = solid.materials.indexOf('paint');
  expect(paintQuad).toBeGreaterThanOrEqual(0);
  const colourAt = (mesh: Mesh) => {
    const colour = mesh.geometry.getAttribute('color') as BufferAttribute;
    return [colour.getX(paintQuad * 4), colour.getY(paintQuad * 4), colour.getZ(paintQuad * 4)];
  };
  const [red, , blue] = colourAt(first);
  const [red2, , blue2] = colourAt(second);
  expect(red).toBeGreaterThan(blue!);
  expect(blue2).toBeGreaterThan(red2!);
});
