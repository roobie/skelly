import { expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { worldSolid } from '../src/core/collision.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { type FurnitureMover, placement } from '../src/core/furnitureMove.ts';
import { Inventory } from '../src/core/inventory.ts';
import { settleCell } from '../src/core/itemThrow.ts';
import { bodyOverlapsTerrain } from '../src/core/physics.ts';
import { makeScale } from '../src/core/scale.ts';
import { type BrickOut, brickHas, worldBricks } from '../src/core/solidBricks.ts';
import { spawnOverlappingSolidBlock } from '../src/core/spawnClearance.ts';
import { projectVehicleParts, VehicleOccupancy } from '../src/core/vehicleProjection.ts';
import { World } from '../src/core/world.ts';
import { baseRegistry } from './baseRegistry.ts';
import { createPlayerBody } from './playerFixture.ts';

const registry = baseRegistry();
const scale = makeScale(0.5);

const cellsOf = ({ min, max }: { min: Readonly<Vec3>; max: Readonly<Vec3> }): Vec3[] => {
  const cells: Vec3[] = [];
  for (let y = Math.floor(min[1] / scale.blockSize); y < Math.ceil(max[1] / scale.blockSize); y += 1) {
    for (let z = Math.floor(min[2] / scale.blockSize); z < Math.ceil(max[2] / scale.blockSize); z += 1) {
      for (let x = Math.floor(min[0] / scale.blockSize); x < Math.ceil(max[0] / scale.blockSize); x += 1) {
        cells.push([x, y, z]);
      }
    }
  }
  return cells;
};

it('updates physical cells, bricks, navigation clearance and landing after an occupied fitting is removed', () => {
  const inventory = new Inventory(registry);
  const id = inventory.registerVehicle({
    blueprint: 'hatchback',
    placementKey: 'vehicle-occupancy',
    origin: [0, 0, 0],
    facing: 'n',
  });
  const vehicle = inventory.vehicles.get(id)!;
  const parts = projectVehicleParts(registry, id, vehicle, scale.blockSize);
  const occupancy = new Map<string, number>();
  for (const part of parts) {
    for (const box of part.boxes) {
      for (const cell of cellsOf(box)) {
        const key = cell.join(',');
        occupancy.set(key, (occupancy.get(key) ?? 0) + 1);
      }
    }
  }
  const removed = parts.find((part) =>
    part.boxes.some((box) => cellsOf(box).some((candidate) => occupancy.get(candidate.join(',')) === 1)),
  );
  if (!removed) {
    throw new Error('Fixture vehicle has no independently occupied fitting cell');
  }
  const cell = removed.boxes.flatMap(cellsOf).find((candidate) => occupancy.get(candidate.join(',')) === 1)!;
  const world = new World();
  const entities = new BlockEntities(registry);
  const physical = { vehicles: inventory.vehicles, blockSize: scale.blockSize };
  const solid = worldSolid(world, registry, entities, physical);
  const bricks = worldBricks(world, registry, entities, physical);
  const brick: BrickOut = { lo: 0, hi: 0 };
  const [x, y, z] = cell;

  expect(solid(x, y, z)).toBe(true);
  expect(bricks.brick(x >> 2, y >> 2, z >> 2, brick)).toBe(true);
  expect(brickHas(brick, x & 3, y & 3, z & 3)).toBe(true);
  expect(spawnOverlappingSolidBlock([x + 0.5, y + 0.5, z + 0.5], { halfWidth: 0.1, height: 0.1 }, solid)).toEqual(cell);
  expect(settleCell(cell, scale.blockSize, -10, solid)).toBeUndefined();

  inventory.vehicles.replace(registry, id, {
    ...vehicle,
    fittings: vehicle.fittings.filter((fitting) => fitting.id !== removed.fittingId),
  });

  expect(solid(x, y, z)).toBe(false);
  bricks.brick(x >> 2, y >> 2, z >> 2, brick);
  expect(brickHas(brick, x & 3, y & 3, z & 3)).toBe(false);
  expect(
    spawnOverlappingSolidBlock([x + 0.5, y + 0.5, z + 0.5], { halfWidth: 0.1, height: 0.1 }, solid),
  ).toBeUndefined();
  expect(settleCell(cell, scale.blockSize, -10, solid)).toEqual(cell);
});

it('refuses furniture placement in an occupied fitting and permits it after the fitting is removed', () => {
  const inventory = new Inventory(registry);
  const id = inventory.registerVehicle({
    blueprint: 'hatchback',
    placementKey: 'vehicle-placement',
    origin: [0, 0, 0],
    facing: 'n',
  });
  const vehicle = inventory.vehicles.get(id)!;
  const cell = projectVehicleParts(registry, id, vehicle, scale.blockSize).flatMap((part) =>
    part.boxes.flatMap(cellsOf),
  )[0]!;
  const crate = inventory.furnish({
    type: 'crate',
    pos: [-10, 1, -10],
    size: [...registry.furniture.get('crate')!.size],
    facing: 'n',
  })!;
  inventory.entities.lift(crate);
  const occupancy = new VehicleOccupancy(registry, inventory.vehicles, scale.blockSize);
  const mover: FurnitureMover = {
    inventory,
    terrainSolid: (x, y, z) => y < 0 || occupancy.isSolid(x, y, z),
    blockSize: scale.blockSize,
    player: { pos: [-20, 1, -20], vel: [0, 0, 0], halfWidth: 0.4, height: 1.8, onGround: true },
    others: [],
    stamina: 100,
  };
  const aimed: Vec3 = [cell[0] + Math.floor(crate.size[0] / 2), cell[1], cell[2] + Math.floor(crate.size[2] / 2)];

  expect(placement(mover, aimed)).toEqual({
    refusal: registry.ui.get(CORE_CONTENT_IDS.coreUi)!.furnitureMoveMessages.noRoom,
  });

  inventory.vehicles.replace(registry, id, { ...vehicle, fittings: [] });

  expect(placement(mover, aimed)).toEqual({ pos: expect.any(Array) });
});

it('leaves a player body standing in exported vehicle space with no collision box', () => {
  const inventory = new Inventory(registry);
  const id = inventory.registerVehicle({
    blueprint: 'hatchback',
    placementKey: 'vehicle-clear-space',
    origin: [0, 0, 0],
    facing: 'n',
  });
  const allCells = projectVehicleParts(registry, id, inventory.vehicles.get(id)!, scale.blockSize).flatMap((part) =>
    part.boxes.flatMap(cellsOf),
  );
  const min = allCells.reduce<Vec3>(
    (result, cell) => result.map((value, axis) => Math.min(value, cell[axis]!)) as Vec3,
    [...allCells[0]!],
  );
  const max = allCells.reduce<Vec3>(
    (result, cell) => result.map((value, axis) => Math.max(value, cell[axis]!)) as Vec3,
    [...allCells[0]!],
  );
  const solid = worldSolid(new World(), registry, inventory.entities, {
    vehicles: inventory.vehicles,
    blockSize: scale.blockSize,
  });
  const [minX, minY, minZ] = min;
  const [maxX, maxY, maxZ] = max;
  const clear = [] as Vec3[];
  for (let y = minY; y <= maxY; y += 1) {
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        if (!bodyOverlapsTerrain(createPlayerBody(scale, x + 0.5, y, z + 0.5), solid)) {
          clear.push([x, y, z]);
        }
      }
    }
  }
  expect(clear.length).toBeGreaterThan(0);
});
