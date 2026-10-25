import { expect, it } from 'vitest';
import type { BlockEntity } from '../src/core/blockEntities.ts';
import { buildShape } from '../src/render/vehicleShape.ts';
import { type ShapePort, VehicleShapes } from '../src/render/vehicleShapes.ts';
import { type VehicleLook, vehicleModel } from '../src/render/workshopVehicle.ts';
import { BLUEPRINTS } from '../src/vehicles/catalogue.ts';

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

const look = (): VehicleLook => ({
  blueprint: Object.keys(BLUEPRINTS)[0]!,
  body: '#ff0000',
  dirt: 0,
  removed: [],
  solidFill: 0.4,
});

/** A port that holds requests until the test answers them, as a worker would. */
const heldPort = () => {
  const requests: Parameters<ShapePort['post']>[0][] = [];
  const shapes = new VehicleShapes({ post: (message) => requests.push(message) });
  const reply = (index = 0) => {
    const { key, blueprint, removed } = requests[index]!;
    shapes.receive({ type: 'vehicle', key, shape: buildShape(blueprint, removed) });
  };
  return { shapes, requests, reply };
};

it('gives a pending vehicle piece its mesh when the worker replies', () => {
  const { shapes, requests, reply } = heldPort();

  const group = vehicleModel(entity, look(), 4, { shapes });
  expect(group.children).toHaveLength(0);
  expect(requests).toHaveLength(1);

  reply();

  expect(group.children.length).toBeGreaterThan(0);
});

it('never shows a vehicle piece that was dropped before its mesh arrived', () => {
  const { shapes, reply } = heldPort();
  const scene = new Set<ReturnType<typeof vehicleModel>>();
  const pending = vehicleModel(entity, look(), 4, { shapes });
  scene.add(pending);

  scene.delete(pending);
  const replacement = vehicleModel(entity, look(), 4, { shapes });
  scene.add(replacement);
  reply();

  expect([...scene]).toEqual([replacement]);
  expect(replacement.children.length).toBeGreaterThan(0);
});

it('asks the worker once for pieces that share a shape and fills them all on the reply', () => {
  const { shapes, requests, reply } = heldPort();

  const groups = [
    vehicleModel(entity, look(), 4, { shapes }),
    vehicleModel(entity, { ...look(), body: '#0000ff' }, 4, { shapes }),
  ];
  reply();

  expect(requests).toHaveLength(1);
  for (const group of groups) {
    expect(group.children.length).toBeGreaterThan(0);
  }
});

it('meshes at once, without waiting, for a piece drawn away from the world', () => {
  const { shapes, requests } = heldPort();

  const group = vehicleModel(entity, look(), 4, { shapes, wait: false });

  expect(group.children.length).toBeGreaterThan(0);
  expect(requests).toHaveLength(0);
});
