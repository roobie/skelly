import { expect, it } from 'vitest';
import { Inventory } from '../src/core/inventory.ts';
import { vehicleInspectionViewModel } from '../src/ui/vehicleInspection.ts';
import { baseRegistry } from './baseRegistry.ts';

it('shows an empty service site and anchors inspection commands to the selected vehicle instance', () => {
  const inventory = new Inventory(baseRegistry());
  const first = inventory.registerVehicle({
    blueprint: 'hatchback',
    placementKey: 'inspection-first',
    origin: [0, 0, 0],
    facing: 'n',
  });
  const removable = inventory.vehicles
    .get(first)!
    .sites.find((site) => !inventory.vehicles.get(first)!.sites.some((other) => other.supportedBy.includes(site.id)))!;
  const second = inventory.registerVehicle(
    {
      blueprint: 'hatchback',
      placementKey: 'inspection-second',
      origin: [20, 0, 0],
      facing: 'n',
    },
    [removable.id],
  );

  const view = vehicleInspectionViewModel(inventory, second)!;
  const empty = view.sites.find((site) => site.itemUid === undefined)!;

  expect(empty.command).toEqual({ kind: 'vehicle.inspect', vehicleId: second, siteId: empty.id });
  expect(empty.command.vehicleId).not.toBe(first);
});
