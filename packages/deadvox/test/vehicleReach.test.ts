import type { ModelBox } from '@skelly/thing-core/schema';
import { expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { coreMessage } from '../src/core/coreText.ts';
import { pickInteractionTarget } from '../src/core/interactionPick.ts';
import { reachTuning, vehicleInReach } from '../src/core/reach.ts';
import { blockId, createRuntime, registry, scale } from './snapshotTestSupport.ts';

const s = scale.blockSize;

/** Feet (blocks) a short step out from each side face of each part box, at ground height, with its aim point. */
const sideStands = (boxes: readonly ModelBox[], groundY: number): { feet: Vec3; aim: Vec3 }[] =>
  boxes.flatMap((box) => {
    const aim = box.min.map((value, axis) => (value + box.max[axis]!) / 2 / s) as Vec3;
    return [0, 2].flatMap((axis) =>
      [-1, 1].map((sign) => {
        const feet: Vec3 = [aim[0], groundY, aim[2]];
        feet[axis] = ((sign < 0 ? box.min[axis]! : box.max[axis]!) + sign * 0.45) / s;
        return { feet, aim };
      }),
    );
  });

/**
 * Opening the vehicle, keeping its section open and admitting service share `Inventory.canReachVehicle`, so a
 * part F can pick from outside the car must be in that reach, however far it lies from the vehicle origin.
 */
it('keeps every exterior vehicle pick within the reach its surface and service share, and refuses far away', () => {
  const runtime = createRuntime();
  const origin = [...runtime.player.body.pos] as Vec3;
  const vehicleId = runtime.inventory.registerVehicle({
    placementKey: 'reach-fixture',
    blueprint: 'hatchback',
    origin,
    facing: 'n',
  });
  const vehicle = runtime.inventory.vehicles.get(vehicleId)!;
  const parts = runtime.session.vehicleParts.all();
  const boxes = runtime.session.vehicleParts.boxesOf(vehicleId);
  const inside = (point: Vec3) =>
    boxes.some(({ min, max }) => point.every((value, axis) => value * s >= min[axis]! && value * s <= max[axis]!));
  const wheel = vehicle.fittings.find(
    ({ id, service }) => service && !vehicle.fittings.some(({ supportedBy }) => supportedBy.includes(id)),
  )!;
  const tooFar = coreMessage(registry, 'tooFar');

  const exterior = sideStands(boxes, origin[1]).flatMap(({ feet, aim }) => {
    const eye: Vec3 = [feet[0], feet[1] + runtime.session.playerEyeHeightMetres / s, feet[2]];
    const target =
      inside(feet) || inside(eye)
        ? undefined
        : pickInteractionTarget({
            inventory: runtime.inventory,
            entities: runtime.inventory.entities,
            origin: eye,
            direction: aim.map((value, axis) => value - eye[axis]!) as Vec3,
            maxDistance: reachTuning(registry).useReachMetres / s,
            blockSize: s,
            worldSeed: 1,
            isSolid: () => false,
            isOpaque: () => false,
            hasModel: () => false,
            vehicleParts: parts,
          });
    return target?.kind === 'vehicle' ? [feet] : [];
  });
  expect(exterior.length, 'the scan finds exterior picks').toBeGreaterThan(0);
  for (const feet of exterior) {
    runtime.player.body.pos = feet;
    expect(runtime.inventory.canReachVehicle(vehicleId), `from ${feet.join(',')}`).toBe(true);
    expect(runtime.session.vehicleWorkRefusal('remove', vehicleId, wheel.id, wheel.item.uid)).not.toBe(tooFar);
  }

  const far = Math.max(...boxes.map(({ max }) => max[0])) + 3;
  runtime.player.body.pos = [far / s, origin[1], origin[2]];
  expect(runtime.inventory.canReachVehicle(vehicleId)).toBe(false);
  expect(runtime.session.vehicleWorkRefusal('remove', vehicleId, wheel.id, wheel.item.uid)).toBe(tooFar);
});

it('refuses vehicle service through a wall and allows it again once the wall is gone', () => {
  const runtime = createRuntime();
  const origin = [...runtime.player.body.pos] as Vec3;
  const vehicleId = runtime.inventory.registerVehicle({
    placementKey: 'wall-fixture',
    blueprint: 'hatchback',
    origin,
    facing: 'n',
  });
  const boxes = runtime.session.vehicleParts.boxesOf(vehicleId);
  const faceMetres = Math.max(...boxes.map(({ max }) => max[0]));
  const centreZ = boxes.reduce((sum, { min, max }) => sum + (min[2] + max[2]) / 2, 0) / boxes.length;
  const standMetres = faceMetres + reachTuning(registry).reachMetres / 4;
  runtime.player.body.pos = [standMetres / s, origin[1], centreZ / s];
  expect(runtime.inventory.canReachVehicle(vehicleId), 'in reach with open ground between').toBe(true);

  const wallX = Math.floor((faceMetres + (standMetres - faceMetres) / 2) / s);
  const cells: Vec3[] = [];
  for (let y = Math.floor(origin[1]); y < Math.floor(origin[1]) + 4; y++) {
    for (let z = Math.floor(centreZ / s) - 6; z <= Math.floor(centreZ / s) + 6; z++) {
      cells.push([wallX, y, z]);
    }
  }
  for (const [x, y, z] of cells) {
    runtime.world.setBlock(x, y, z, blockId('planks'));
  }
  expect(runtime.inventory.canReachVehicle(vehicleId), 'a wall between player and car').toBe(false);

  for (const [x, y, z] of cells) {
    runtime.world.setBlock(x, y, z, 0);
  }
  expect(runtime.inventory.canReachVehicle(vehicleId), 'the same position without the wall').toBe(true);
});

it('refuses vehicle service through another parked vehicle but not through its own body', () => {
  const runtime = createRuntime();
  const origin = [...runtime.player.body.pos] as Vec3;
  const vehicleId = runtime.inventory.registerVehicle({
    placementKey: 'target-fixture',
    blueprint: 'hatchback',
    origin,
    facing: 'n',
  });
  const faceMetres = Math.max(...runtime.session.vehicleParts.boxesOf(vehicleId).map(({ max }) => max[0]));
  // Stood off the nearest face, inside reach, with the car's own cells between the chest and its far parts.
  runtime.player.body.pos = [(faceMetres + reachTuning(registry).reachMetres * 0.85) / s, origin[1], origin[2]];
  expect(runtime.inventory.canReachVehicle(vehicleId), 'in reach with nothing between').toBe(true);

  // A second car turned across the line, overlapping the target's end so no gap is left to see through.
  runtime.inventory.registerVehicle({
    placementKey: 'blocker-fixture',
    blueprint: 'hatchback',
    origin: [(faceMetres + 0.575) / s, origin[1], origin[2]],
    facing: 'e',
  });
  expect(runtime.inventory.canReachVehicle(vehicleId), 'another vehicle between player and target').toBe(false);
});

it('needs the near part, not just any part, to be both in range and in view', () => {
  const runtime = createRuntime();
  const { reachMetres: limit, chestHeightMetres: chest } = reachTuning(registry);
  const player = {
    inventory: runtime.inventory,
    position: [0, 0, 0] as Vec3,
    blockSize: limit / 10,
    obstacles: { version: 0, isSolid: (x: number) => x === 3 },
  };
  const near = { min: [limit * 0.6, chest - 0.1, 0], max: [limit * 0.7, chest + 0.1, 0.1] } as ModelBox;
  const far = { min: [0, chest - 0.1, limit * 2], max: [0.1, chest + 0.1, limit * 2.1] } as ModelBox;
  expect(vehicleInReach(player, 1, [near]), 'near part behind the wall').toBe(false);
  expect(vehicleInReach(player, 1, [far]), 'far part in view').toBe(false);
  expect(vehicleInReach(player, 1, [near, far]), 'neither part satisfies both').toBe(false);
});
