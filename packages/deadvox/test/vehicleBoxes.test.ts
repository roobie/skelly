import { expect, it } from 'vitest';
import type { Registry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { steppedItemFlight } from '../src/core/itemThrow.ts';
import { type Body, stepBody } from '../src/core/physics.ts';
import { raycast } from '../src/core/raycast.ts';
import { VehicleBoxes, vehicleBoxSpikeEnabled, vehicleBoxSpikeQueries } from '../src/core/vehicleBoxes.ts';
import { VehicleOccupancy } from '../src/core/vehicleProjection.ts';
import { probeHeading } from '../src/core/zombies.ts';
import { baseRegistry } from './baseRegistry.ts';

const fixture = () => {
  const base = baseRegistry();
  const source = [...base.items.values()].find((item) => item.vehicle && !item.vehicle.cargoSpace && item.model)!;
  const model = base.models.get(source.model!)!;
  const part = Object.values(model.parts!)[0]!;
  const registry: Registry = {
    ...base,
    items: new Map(base.items).set('fixture-panel', { ...source, id: 'fixture-panel', model: 'fixture-model' }),
    models: new Map(base.models).set('fixture-model', {
      ...model,
      id: 'fixture-model',
      parts: { panel: { ...part, collision: [{ min: [0.1, 0, 0], max: [0.2, 2, 3] }] } },
    }),
    vehicleBlueprints: new Map(base.vehicleBlueprints).set('fixture-vehicle', {
      ...base.vehicleBlueprints.get('hatchback')!,
      id: 'fixture-vehicle',
      fittings: [{ id: 'panel', part: 'fixture-panel', at: [0, 0, 0], supportedBy: [] }],
    }),
  };
  const inventory = new Inventory(registry);
  const id = inventory.registerVehicle({
    blueprint: 'fixture-vehicle',
    placementKey: 'fixture',
    origin: [0, 0, 0],
    facing: 'n',
  });
  const boxes = new VehicleBoxes(registry, inventory.vehicles, 1);
  const cells = new VehicleOccupancy(registry, inventory.vehicles, 1);
  const solid = (x: number, y: number, z: number) => cells.isSolid(x, y, z);
  return { inventory, registry, id, boxes, solid };
};
const body = (): Body => ({ pos: [0.7, 0, -0.4], vel: [0, 0, 1], halfWidth: 0.1, height: 1, onGround: false });
const empty = () => false;

it('leaves the gap beside an exported thin panel open for movement, zombie probes, rays and throw samples', () => {
  const { boxes, solid, registry, inventory } = fixture();
  const coarse = body();
  const fine = body();
  const physics = { gravity: 0, stepHeight: 0 };
  const finePhysics = { ...physics, shapeOf: (actor: Body) => boxes.shape(actor, empty) };
  stepBody(coarse, 1, solid, physics);
  stepBody(fine, 1, empty, finePhysics);
  expect(fine.pos[2]).toBeGreaterThan(coarse.pos[2]);
  const probe = { body: body(), intent: [0, 0, 1] as Vec3, blockSize: 1 };
  expect(probeHeading({ ...probe, isSolid: empty, physics: finePhysics }, [0, 0, 1], 1)[2]).toBeGreaterThan(
    probeHeading({ ...probe, isSolid: solid, physics }, [0, 0, 1], 1)[2],
  );
  const origin: Vec3 = [0.7, 0.5, -0.4];
  expect(raycast(origin, [0, 0, 1], 2, solid)).toBeDefined();
  expect(boxes.ray(origin, [0, 0, 1], 2, empty)).toBeUndefined();
  const disabled = vehicleBoxSpikeQueries({
    enabled: false,
    registry,
    vehicles: inventory.vehicles,
    blockSize: 1,
    terrain: empty,
    coarse: solid,
  });
  expect(disabled.movementSolid).toBe(solid);
  expect(disabled.physicalRay(origin, [0, 0, 1], 2)).toBeDefined();
  expect(disabled.throwSampleSolid).toBeUndefined();
  expect(vehicleBoxSpikeEnabled(false, '?vehicle-boxes=1')).toBe(false);
  expect(vehicleBoxSpikeEnabled(true, '')).toBe(false);
  expect(vehicleBoxSpikeEnabled(true, '?vehicle-boxes=1')).toBe(true);
  const flight = {
    from: origin,
    direction: [0, 0, 1] as Vec3,
    distanceMetres: 2,
    gravityMetresPerSimSecondSquared: 4,
    flightSimSeconds: 1,
    drag: 0,
    blockSize: 1,
    minY: -1,
    isSolid: solid,
  };
  const rounded = steppedItemFlight(flight);
  const exact = steppedItemFlight({ ...flight, sampleSolid: (point) => boxes.contains(point) });
  expect(exact.points.length).toBeGreaterThan(rounded.points.length);
});

it('stops against the actual panel and invalidates warmed boxes after its fitting comes off', () => {
  const { inventory, registry, id, boxes } = fixture();
  const actor: Body = { ...body(), pos: [-0.3, 0, 1], vel: [1, 0, 0] };
  stepBody(actor, 0.3, empty, { gravity: 0, stepHeight: 0, shapeOf: (b) => boxes.shape(b, empty) });
  expect(actor.pos[0] + actor.halfWidth).toBeLessThanOrEqual(0.1);
  expect(boxes.contains([0.15, 1, 1])).toBe(true);
  expect(boxes.ray([-1, 1, 1], [1, 0, 0], 3, empty)?.distance).toBeCloseTo(1.1);
  const vehicle = inventory.vehicles.get(id)!;
  inventory.vehicles.replace(registry, id, { ...vehicle, fittings: [] });
  expect(boxes.contains([0.15, 1, 1])).toBe(false);
  expect(boxes.ray([-1, 1, 1], [1, 0, 0], 3, empty)).toBeUndefined();
});
