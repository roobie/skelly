import standard from '@dimforge/rapier3d-compat';
import deterministic from '@dimforge/rapier3d-deterministic-compat';
import { beforeAll, expect, it } from 'vitest';
import { VehicleQuerySeam } from '../src/bench/vehicleQuerySeam.ts';
import { VehicleRapierQueries, vehicleSnapshot } from '../src/bench/vehicleRapier.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { stepBody } from '../src/core/physics.ts';
import { VehicleOccupancy } from '../src/core/vehicleProjection.ts';
import { baseRegistry } from './baseRegistry.ts';
import {
  panelBody as body,
  panelCells as cells,
  encodeReplay,
  panelSnapshot as fixture,
  panelFlight as flight,
  replayVehicleQueries as replay,
} from './fixtures/vehicleRapierReplay.ts';

beforeAll(async () => {
  await deterministic.init();
  await standard.init();
});

it('keeps the thin-panel side gap open for body movement, aim rays and throw samples that cells block', () => {
  const queries = new VehicleRapierQueries();
  try {
    queries.sync(fixture);
    const seam = new VehicleQuerySeam(queries, () => false, 1);
    const fine = body();
    const coarse = body();
    for (let frame = 0; frame < 180; frame++) {
      stepBody(fine, 1 / 60, seam.terrain, { gravity: 0, stepHeight: 0, shapeOf: seam.shapeOf });
      stepBody(coarse, 1 / 60, cells, { gravity: 0, stepHeight: 0 });
    }
    expect(fine.pos[2]).toBeGreaterThan(coarse.pos[2]);
    expect(seam.ray([0.25, 1, -0.5], [0, 0, 1], 4)).toBeUndefined();
    expect(queries.ray([0.85, 1, -0.5], [0, 0, 1], 4)).toBeDefined();
    expect(flight(seam.point).points.length).toBeGreaterThan(flight().points.length);
    const blocked = body();
    blocked.pos = [0.5, 0, 1];
    blocked.vel = [1, 0, 0];
    stepBody(blocked, 0.4, seam.terrain, { gravity: 0, stepHeight: 0, shapeOf: seam.shapeOf });
    expect(blocked.pos[0] + blocked.halfWidth).toBeLessThanOrEqual(fixture.parts[0]!.boxes[0]!.min[0]);
  } finally {
    queries.free();
  }
});

it('combines terrain and vehicle queries at non-unit block size and refreshes changed and removed parts', () => {
  const queries = new VehicleRapierQueries();
  try {
    queries.sync(fixture);
    const seam = new VehicleQuerySeam(queries, (_x, y) => y < 0, 0.5);
    expect(seam.point([0.85, 1, 1])).toBe(true);
    expect(seam.point([2, -0.1, 1])).toBe(true);
    expect(seam.ray([2, 1, 1], [0, -1, 0], 3)).toBe(1);
    const changed = {
      version: 1,
      parts: [{ key: 'parked/panel', boxes: [{ min: [2, 0, 0] as Vec3, max: [2.1, 2, 3] as Vec3 }] }],
    };
    queries.sync(changed);
    expect(seam.point([0.85, 1, 1])).toBe(false);
    expect(seam.point([2.05, 1, 1])).toBe(true);
    queries.sync({ version: 2, parts: [] });
    expect(seam.point([2.05, 1, 1])).toBe(false);
    expect(seam.ray([2, 1, 1], [0, -1, 0], 3)).toBe(1);
  } finally {
    queries.free();
  }
});

it('rebuilds exported fitting geometry from the vehicle owner revision after detachment', () => {
  const registry = baseRegistry();
  const inventory = new Inventory(registry);
  const id = inventory.registerVehicle({
    blueprint: 'hatchback',
    placementKey: 'rapier-query',
    origin: [0, 0, 0],
    facing: 'n',
  });
  const queries = new VehicleRapierQueries();
  try {
    const snapshot = vehicleSnapshot(registry, inventory.vehicles, 0.5);
    expect(snapshot.parts.length).toBeGreaterThan(0);
    queries.sync(snapshot);
    const box = snapshot.parts.flatMap((part) => part.boxes)[0]!;
    const center = box.min.map((v, a) => (v + box.max[a]!) / 2) as Vec3;
    expect(queries.point(center)).toBe(true);
    const coarse = new VehicleOccupancy(registry, inventory.vehicles, 0.5);
    expect(coarse.isSolid(...(center.map((v) => Math.floor(v / 0.5)) as Vec3))).toBe(true);
    inventory.vehicles.replace(registry, id, { ...inventory.vehicles.get(id)!, fittings: [] });
    queries.sync(vehicleSnapshot(registry, inventory.vehicles, 0.5));
    expect(queries.point(center)).toBe(false);
  } finally {
    queries.free();
  }
});

it('preserves signed zero and undefined output fields in the browser replay encoding', () => {
  expect(encodeReplay({ poses: [[0]], rays: [undefined] })).not.toEqual(
    encodeReplay({ poses: [[-0]], rays: [undefined] }),
  );
  expect(encodeReplay({ rays: [undefined] })).not.toEqual(encodeReplay({ rays: [null] }));
  expect(encodeReplay({ rays: undefined })).not.toEqual(encodeReplay({}));
});

it('replays movement, terrain contact, rays and throws identically in repeated and standard/deterministic runs', () => {
  const first = replay(deterministic);
  expect(first.poses.length).toBeGreaterThan(0);
  expect(first.rays.some((hit) => hit !== undefined)).toBe(true);
  expect(encodeReplay(replay(deterministic))).toEqual(encodeReplay(first));
  expect(replay(standard as unknown as typeof deterministic)).toEqual(first);
});
