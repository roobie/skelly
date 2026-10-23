import { expect, it } from 'vitest';
import { Inventory } from '../src/core/inventory.ts';
import { reach } from '../src/core/reach.ts';
import { baseRegistry } from './baseRegistry.ts';

it('keeps a fitted vehicle part outside the generic crafting reach snapshot', () => {
  const inventory = new Inventory(baseRegistry());
  const vehicleId = inventory.registerVehicle({
    blueprint: 'hatchback',
    placementKey: 'craft-reach-vehicle',
    origin: [0, 0, 0],
    facing: 'n',
  });
  const fitted = inventory.vehicles.get(vehicleId)!.fittings[0]!.item;
  const snapshot = reach({
    inventory,
    position: [0, 0, 0],
    blockSize: 0.5,
    clock: { ratio: 1, start: 0 },
  });

  expect(snapshot.entries.some((entry) => entry.item.uid === fitted.uid)).toBe(false);
  expect(inventory.locate(fitted)?.kind).toBe('vehicle');
});
