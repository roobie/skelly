import { buildRegistry, loadVehicleBlueprint, rollingRadius } from '@skelly/engine/content';
import { Group, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { contentAxle } from '../src/debug/wheelRoll.ts';
import { baseSources } from '../src/product/content.ts';

// Blueprints need only the vehicle content and what its parts refer to, not the whole base.
const VEHICLE_BASE = ['vehicles.json', 'inventory.json', 'item-wear.json', 'natural-sounds.json', 'sounds-impact.json'];
const { issues, registry } = buildRegistry(
  baseSources.filter(({ source }) => VEHICLE_BASE.some((file) => source.endsWith(`/${file}`))),
);

it('rolls the top of every spinning rim forward at the vehicle’s ground speed', () => {
  expect(issues).toEqual([]);
  const distance = 1e-3;
  let rims = 0;
  for (const [id, { fittings }] of registry.vehicleBlueprints) {
    const placed = loadVehicleBlueprint(registry, id).fittings;
    fittings.forEach((def, i) => {
      if (!def.spin) {
        return;
      }
      const radius = rollingRadius(def.at, placed[i]!.collision);
      const top = new Group();
      top.position.set(def.at[0], def.at[1] + radius, def.at[2]);
      const { axle, roll } = contentAxle(def, placed[i]!, new Group().add(top));
      const before = top.getWorldPosition(new Vector3());
      roll(distance);
      axle.updateMatrixWorld();
      const moved = top.getWorldPosition(new Vector3()).sub(before);
      expect(moved.z, `${id} ${def.id}`).toBeCloseTo(distance, 6);
      rims += 1;
    });
  }
  expect(rims).toBeGreaterThan(0);
});
