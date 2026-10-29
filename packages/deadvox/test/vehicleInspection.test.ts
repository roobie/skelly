import { expect, it } from 'vitest';
import { Inventory } from '../src/core/inventory.ts';
import type { Item } from '../src/core/items.ts';
import { copyVehicleWorkPlacement } from '../src/core/vehicleInstances.ts';
import { vehicleInspectionViewModel } from '../src/ui/vehicleInspection.ts';
import { baseRegistry } from './baseRegistry.ts';

it('anchors service actions to the selected vehicle, site and part instances, offering only parts whose mount fits', () => {
  const registry = baseRegistry();
  const inventory = new Inventory(registry);
  const spec = (placementKey: string, x: number) => ({
    blueprint: 'hatchback',
    placementKey,
    origin: [x, 0, 0] as [number, number, number],
    facing: 'n' as const,
  });
  const first = inventory.registerVehicle(spec('inspection-first', 0));
  const { sites } = inventory.vehicles.get(first)!;
  // A serviceable site nothing rests on: removing it leaves the rest of the build supported.
  const [vacant, fitted] = sites.filter(
    (site) => site.service && !sites.some((other) => other.supportedBy.includes(site.id)),
  );
  const second = inventory.registerVehicle(spec('inspection-second', 20), [vacant!.id]);
  const part = inventory.create(
    [...registry.items.values()].find((def) => def.vehicle?.mount === vacant!.service!.mount)!.id,
  );
  const unrelated = inventory.create([...registry.items.values()].find((def) => !def.vehicle)!.id);
  const asked: unknown[][] = [];
  const view = vehicleInspectionViewModel(
    {
      inventory,
      reach: { entries: [part, unrelated].map((item: Item) => ({ item })) as never },
      refusal: (...args) => {
        asked.push(args);
        return args[0] === 'remove' ? 'refused' : undefined;
      },
    },
    second,
  )!;

  const empty = view.sites.find((site) => site.id === vacant!.id)!;
  expect(empty.item).toBeUndefined();
  expect(empty.actions.map(({ payload }) => payload)).toEqual([
    {
      kind: 'vehicle.work',
      work: 'install',
      vehicleId: second,
      fittingId: vacant!.id,
      itemUid: part.uid,
      ...copyVehicleWorkPlacement(vacant!),
    },
  ]);
  expect(empty.actions[0]!.refusal).toBeUndefined();

  const occupied = view.sites.find((site) => site.id === fitted!.id)!;
  const fittedUid = inventory.vehicles.get(second)!.fittings.find(({ id }) => id === fitted!.id)!.item.uid;
  expect(occupied.item?.uid).toBe(fittedUid);
  expect(occupied.actions.map(({ payload }) => payload)).toEqual([
    {
      kind: 'vehicle.work',
      work: 'remove',
      vehicleId: second,
      fittingId: fitted!.id,
      itemUid: fittedUid,
      ...copyVehicleWorkPlacement(fitted!),
    },
  ]);
  expect(occupied.actions[0]!.refusal).toBe('refused');
  expect(asked).toContainEqual(['remove', second, { id: fitted!.id, ...copyVehicleWorkPlacement(fitted!) }, fittedUid]);
  expect(asked.every(([, vehicleId]) => vehicleId === second)).toBe(true);
});
