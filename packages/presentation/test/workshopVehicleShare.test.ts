import { BLUEPRINTS, type ShapeData } from '@skelly/engine/vehicles';
import type { BlockEntity } from '@skelly/engine/world';
import type { BufferAttribute, Mesh } from 'three';
import { expect, it } from 'vitest';
import { VehicleShapes } from '../src/render/vehicleShapes.ts';
import { type VehicleLook, vehicleModel } from '../src/render/workshopVehicle.ts';

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

// One painted quad stands in for a meshed vehicle: meshing a real blueprint is CPU-heavy enough to time out under load.
const onePaintedQuad: ShapeData = {
  solidBaseY: 0,
  solid: {
    attributes: [{ name: 'position', array: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), itemSize: 3 }],
    index: new Uint32Array([0, 1, 2, 0, 2, 3]),
    materials: ['paint'],
    quads: 1,
    sphere: { center: [0.5, 0.5, 0], radius: 1 },
  },
  clear: undefined,
};

it('meshes looks that differ only in paint and dirt once, and colours each by its own paint', () => {
  let requests = 0;
  const shapes: VehicleShapes = new VehicleShapes({
    post: ({ key }) => {
      requests += 1;
      shapes.receive({ type: 'vehicle', key, shape: onePaintedQuad });
    },
  });
  const solidOf = (look: VehicleLook) => vehicleModel(entity, look, 4, { shapes }).children[0] as Mesh;
  const blueprint = Object.keys(BLUEPRINTS)[0]!;
  const clean = { blueprint, body: '#ff0000', dirt: 0, removed: [], solidFill: 0.4 };
  const grimy = { blueprint, body: '#0000ff', dirt: 1, removed: [], solidFill: 0.4 };

  const [first, second] = [solidOf(clean), solidOf(grimy)];

  expect(requests).toBe(1);
  expect(second.geometry.getAttribute('position')).toBe(first.geometry.getAttribute('position'));
  expect(second.geometry.index).toBe(first.geometry.index);
  const colourAt = (mesh: Mesh) => {
    const colour = mesh.geometry.getAttribute('color') as BufferAttribute;
    return [colour.getX(0), colour.getY(0), colour.getZ(0)];
  };
  const [red, , blue] = colourAt(first);
  const [red2, , blue2] = colourAt(second);
  expect(red).toBeGreaterThan(blue!);
  expect(blue2).toBeGreaterThan(red2!);
});
