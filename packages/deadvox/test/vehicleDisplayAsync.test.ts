import type { Mesh } from 'three';
import { expect, it } from 'vitest';
import { BlockEntities, type BlockEntity } from '../src/core/blockEntities.ts';
import { FurnitureMeshes } from '../src/render/furniture.ts';
import { buildShape } from '../src/render/vehicleShape.ts';
import { type ShapePort, VehicleShapes } from '../src/render/vehicleShapes.ts';
import { type VehicleLook, vehicleModel } from '../src/render/workshopVehicle.ts';
import { BLUEPRINTS } from '../src/vehicles/catalogue.ts';
import { baseRegistry } from './baseRegistry.ts';

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

const meshesIn = ({ group }: FurnitureMeshes) => {
  let count = 0;
  group.traverse((part) => {
    count += (part as Mesh).isMesh === true ? 1 : 0;
  });
  return count;
};

it('never shows a vehicle piece that was removed before its mesh arrived', () => {
  const registry = baseRegistry();
  const def = [...registry.furniture.values()].find((candidate) => candidate.vehicle)!;
  const { shapes, requests, reply } = heldPort();
  const meshes = new FurnitureMeshes(1, undefined, shapes);
  const entities = new BlockEntities(registry);
  const place = (x: number) => entities.add({ type: def.id, pos: [x, 0, 0], size: def.size, facing: 'n' })!;
  const removed = place(0);
  meshes.sync(entities);
  entities.remove(removed);
  place(100);
  meshes.sync(entities);
  expect(requests).toHaveLength(1);
  reply();

  const standing = meshesIn(meshes);
  expect(standing).toBeGreaterThan(0);
  const alone = new FurnitureMeshes(1, undefined, new VehicleShapes());
  const lone = new BlockEntities(registry);
  lone.add({ type: def.id, pos: [100, 0, 0], size: def.size, facing: 'n' });
  alone.sync(lone);
  expect(standing).toBe(meshesIn(alone));
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
