import { Group } from 'three';
import { describe, expect, it } from 'vitest';
import { projectVehicleParts } from '../src/core/vehicleProjection.ts';
import { VehicleMeshes } from '../src/render/vehicles.ts';
import { createRuntime, registry, scale } from './snapshotTestSupport.ts';

const spec = (placementKey: string, facing: 'n' | 'e' | 's' | 'w' = 'n') => ({
  placementKey,
  blueprint: 'hatchback',
  origin: [12, 7, -8] as [number, number, number],
  facing,
});

const absentLeaf = () => {
  const { fittings } = registry.vehicleBlueprints.get('hatchback')!;
  return fittings.find((fitting) => !fittings.some((other) => other.supportedBy.includes(fitting.id)))!.id;
};

const models = {
  version: 1,
  part: () => new Group(),
};

describe('production vehicle projection', () => {
  it('uses the loaded mirrored fitting frame after the vehicle faces east', () => {
    const { inventory } = createRuntime();
    const id = inventory.registerVehicle(spec('projection.east', 'e'));
    const vehicle = inventory.vehicles.get(id)!;
    const mirrored = vehicle.fittings.find((fitting) => fitting.mirror)!;
    const projected = projectVehicleParts(registry, id, vehicle, scale.blockSize).find(
      (part) => part.fittingId === mirrored.id,
    )!;

    expect(projected.transform.mirror).toBe(true);
    expect(projected.transform.yaw).toBeCloseTo(Math.PI / 2);
    expect(projected.transform.position).toEqual([
      vehicle.origin[0] * scale.blockSize - mirrored.at[2],
      vehicle.origin[1] * scale.blockSize + mirrored.at[1],
      vehicle.origin[2] * scale.blockSize - mirrored.at[0],
    ]);
    expect(projected.boxes.length).toBeGreaterThan(0);
    expect(projected.boxes.every(({ min, max }) => min.every((value, axis) => value <= max[axis]!))).toBe(true);
  });

  it('omits an absent fitting from both the render projection and pick boxes', () => {
    const { inventory } = createRuntime();
    const missing = absentLeaf();
    const id = inventory.registerVehicle(spec('projection.absent'), [missing]);
    const parts = projectVehicleParts(registry, id, inventory.vehicles.get(id)!, scale.blockSize);

    expect(parts.some((part) => part.fittingId === missing)).toBe(false);
    expect(parts.every((part) => part.boxes.length > 0)).toBe(true);
  });

  it('rebuilds only the changed vehicle render group', () => {
    const { inventory } = createRuntime();
    const first = inventory.registerVehicle(spec('projection.first'));
    const second = inventory.registerVehicle(spec('projection.second'));
    const rendered = new VehicleMeshes(registry, models as never, scale.blockSize);
    rendered.sync(inventory.vehicles);
    const unchanged = rendered.groupFor(second);
    const build = inventory.vehicles.get(first)!;
    inventory.vehicles.replace(registry, first, {
      ...build,
      fittings: build.fittings.filter((fitting) => fitting.id !== absentLeaf()),
    });
    rendered.sync(inventory.vehicles);

    expect(rendered.groupFor(first)).not.toBeUndefined();
    expect(rendered.groupFor(second)).toBe(unchanged);
  });
});
