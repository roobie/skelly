import { settleCell } from '@skelly/engine/internal/core/itemThrow.ts';
import { type BrickOut, brickHas } from '@skelly/engine/internal/core/solidBricks.ts';
import { spawnOverlappingSolidBlock } from '@skelly/engine/internal/core/spawnClearance.ts';
import { VehicleOccupancy } from '@skelly/engine/internal/core/vehicleProjection.ts';
import { Inventory } from '@skelly/engine/inventory';
import { projectVehicleParts } from '@skelly/engine/vehicles';
import {
  BlockEntities,
  bodyOverlapsTerrain,
  makeScale,
  type Vec3,
  World,
  worldBricks,
  worldSolid,
} from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { createSession, IDLE } from '../src/game/session.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { fixtureIds } from './fixtures/capabilityIds.ts';
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

it('wires vehicle occupancy into session furniture placement and landing', () => {
  const world = new World();
  const floor = registry.blockIds.get('planks')!;
  for (let x = -8; x <= 8; x += 1) {
    for (let z = -8; z <= 8; z += 1) {
      world.setBlock(x, 0, z, floor);
    }
  }
  const session = createSession({
    registry,
    actorFigureFiles: stackActorFigureFiles(registry),
    world,
    isSolid: (_x, y, _z) => y === 0,
    isOpaque: () => false,
    scale,
    seed: 73,
    start: 43_200,
    spawn: [-20, 1, -20],
    ready: () => true,
    controls: {
      active: () => true,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
  });
  const { inventory } = session;
  const id = inventory.registerVehicle({
    blueprint: 'hatchback',
    placementKey: 'session-vehicle-placement',
    origin: [0, 0, 0],
    facing: 'n',
  });
  const vehicle = inventory.vehicles.get(id)!;
  const parts = projectVehicleParts(registry, id, vehicle, scale.blockSize);
  const occupancy = new Map<string, number>();
  for (const part of parts) {
    for (const box of part.boxes) {
      for (const candidate of cellsOf(box)) {
        const key = candidate.join(',');
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
  const crate = inventory.furnish({
    type: 'crate',
    pos: [-10, 1, -10],
    size: [...registry.furniture.get('crate')!.size],
    facing: 'n',
  })!;
  inventory.entities.lift(crate);
  inventory.canReach = () => true;
  const aimed: Vec3 = [cell[0] + Math.floor(crate.size[0] / 2), cell[1], cell[2] + Math.floor(crate.size[2] / 2)];

  expect(session.furniturePlacement(aimed)).toEqual({
    refusal: registry.ui.get(fixtureIds.ui)!.furnitureMoveMessages.noRoom,
  });
  expect(inventory.landing(cell)).toBeUndefined();

  inventory.vehicles.replace(registry, id, { ...vehicle, fittings: [] });

  expect(session.furniturePlacement(aimed)).toEqual({ pos: expect.any(Array) });
  expect(inventory.landing(cell)).toBeDefined();
});

it('keeps glazing out of sight and light channels while applying its authored sound policy', () => {
  const inventory = new Inventory(registry);
  const id = inventory.registerVehicle({
    blueprint: 'hatchback',
    placementKey: 'vehicle-channel-policy',
    origin: [0, 0, 0],
    facing: 'n',
  });
  const vehicle = inventory.vehicles.get(id)!;
  const parts = projectVehicleParts(registry, id, vehicle, scale.blockSize);
  const glazing = parts.find((part) => registry.items.get(part.item.type)?.vehicle?.capabilities.includes('glazing'));
  if (!glazing) {
    throw new Error('Fixture vehicle has no glazing');
  }
  const channelCell = glazing.boxes.flatMap(cellsOf).find((cell) => {
    const others = parts.filter((part) => part !== glazing).flatMap((part) => part.boxes.flatMap(cellsOf));
    return !others.some((other) => other.every((value, axis) => value === cell[axis]));
  });
  if (!channelCell) {
    throw new Error('Fixture glazing has no independent query cell');
  }
  const [x, y, z] = channelCell;
  const bodies = new VehicleOccupancy(registry, inventory.vehicles, scale.blockSize);
  const sight = new VehicleOccupancy(registry, inventory.vehicles, scale.blockSize, 'sight');
  const light = new VehicleOccupancy(registry, inventory.vehicles, scale.blockSize, 'light');
  const sound = new VehicleOccupancy(registry, inventory.vehicles, scale.blockSize, 'sound');

  expect(bodies.isSolid(x, y, z)).toBe(true);
  expect(sight.isSolid(x, y, z)).toBe(false);
  expect(light.isSolid(x, y, z)).toBe(false);
  expect(sound.isSolid(x, y, z)).toBe(registry.items.get(glazing.item.type)!.vehicle!.obstruction.sound);
});

it('invalidates a warmed opaque channel after a fitting disappears', () => {
  const inventory = new Inventory(registry);
  const id = inventory.registerVehicle({
    blueprint: 'hatchback',
    placementKey: 'vehicle-opaque-invalidation',
    origin: [0, 0, 0],
    facing: 'n',
  });
  const vehicle = inventory.vehicles.get(id)!;
  const parts = projectVehicleParts(registry, id, vehicle, scale.blockSize);
  const opaque = parts.find(
    (part) =>
      !(
        registry.items.get(part.item.type)?.vehicle?.capabilities.includes('glazing') ||
        vehicle.fittings.some((fitting) => fitting.supportedBy.includes(part.fittingId))
      ),
  );
  if (!opaque) {
    throw new Error('Fixture vehicle has no opaque part');
  }
  const cell = opaque.boxes.flatMap(cellsOf)[0]!;
  const sight = new VehicleOccupancy(registry, inventory.vehicles, scale.blockSize, 'sight');
  expect(sight.isSolid(...cell)).toBe(true);
  inventory.vehicles.replace(registry, id, {
    ...vehicle,
    fittings: [],
  });
  expect(sight.isSolid(...cell)).toBe(false);
});

it('leaves a player body clear in an empty cell of vehicle space beside a solid part cell', () => {
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
  const occupied = new Set(allCells.map((cell) => cell.join(',')));
  const bodyAt = ([x, y, z]: Readonly<Vec3>) => createPlayerBody(scale, x + 0.5, y, z + 0.5);
  const [minX, minY, minZ] = min;
  const [maxX, maxY, maxZ] = max;
  // The cells just outside a body's footprint, one per horizontal direction, at its feet, with the one-cell step toward each.
  const besideFootprint = (cell: Readonly<Vec3>): { part: Vec3; step: Vec3 }[] => {
    const { pos, halfWidth } = bodyAt(cell);
    const [x, y, z] = cell;
    const lo = (axis: 0 | 2) => Math.floor(pos[axis] - halfWidth) - 1;
    const hi = (axis: 0 | 2) => Math.ceil(pos[axis] + halfWidth);
    return [
      { part: [lo(0), y, z], step: [x - 1, y, z] },
      { part: [hi(0), y, z], step: [x + 1, y, z] },
      { part: [x, y, lo(2)], step: [x, y, z - 1] },
      { part: [x, y, hi(2)], step: [x, y, z + 1] },
    ];
  };
  let found: { clear: Vec3; part: Vec3; step: Vec3 } | undefined;
  for (let y = minY; y <= maxY && !found; y += 1) {
    for (let z = minZ; z <= maxZ && !found; z += 1) {
      for (let x = minX; x <= maxX && !found; x += 1) {
        const clear: Vec3 = [x, y, z];
        const beside = besideFootprint(clear).find(({ part }) => occupied.has(part.join(',')));
        if (beside && !occupied.has(clear.join(',')) && !bodyOverlapsTerrain(bodyAt(clear), solid)) {
          found = { clear, ...beside };
        }
      }
    }
  }
  expect(found, 'an empty cell in vehicle space with room for a player beside a part').toBeDefined();
  expect(solid(...found!.part)).toBe(true);
  expect(bodyOverlapsTerrain(bodyAt(found!.step), solid)).toBe(true);
});
