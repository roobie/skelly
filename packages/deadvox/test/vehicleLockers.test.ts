import { buildRegistry } from '@skelly/engine/content';
import { coreMessage } from '@skelly/engine/internal/core/coreText.ts';
import { Inventory, useOption } from '@skelly/engine/inventory';
import type { Vec3 } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { baseContentSources } from './baseContentFiles.ts';
import { createRuntime, registry } from './snapshotTestSupport.ts';

/** A blueprint with a fitting that comes stowed and is closed away behind another. */
const [blueprint, locker] = [...registry.vehicleBlueprints.values()].flatMap((candidate) =>
  candidate.fittings.filter(({ stowed, behind }) => stowed && behind).map((fitting) => [candidate, fitting] as const),
)[0]!;

const spawned = () => {
  const inventory = new Inventory(registry);
  const vehicleId = inventory.registerVehicle({
    blueprint: blueprint.id,
    placementKey: 'fixture.lockers',
    origin: [0, 0, 0],
    facing: 'n',
  });
  const fitting = (id: string) => inventory.vehicles.get(vehicleId)!.fittings.find((candidate) => candidate.id === id)!;
  const pocketOf = (id: string) =>
    registry.items.get(locker.part)!.container!.pockets.findIndex((pocket) => pocket.slot === id);
  const [slot, type] = Object.entries(locker.stowed!)[0]!;
  const stowedItem = () => fitting(locker.id).item.pockets![pocketOf(slot)]![0]!.item;
  return { inventory, vehicleId, fitting, pocketOf, slot, type, stowedItem };
};

describe('vehicle lockers', () => {
  it('spawn each slot of a load-out holding its item', () => {
    const { fitting, pocketOf } = spawned();
    for (const def of blueprint.fittings.filter(({ stowed }) => stowed)) {
      const { item } = fitting(def.id);
      for (const [slot, type] of Object.entries(def.stowed!)) {
        expect(item.pockets![pocketOf(slot)]!.map((placed) => placed.item.type)).toEqual([type]);
      }
    }
  });

  it('refuse their contents while the closure is shut and give them up once it is open', () => {
    const { inventory, vehicleId, stowedItem } = spawned();
    const item = stowedItem();
    expect(inventory.move(item, { kind: 'hand', side: 'right' })).toMatchObject({
      ok: false,
      reason: coreMessage(registry, 'shutAway'),
    });
    inventory.vehicles.setOpen(registry, vehicleId, locker.behind!, true);
    expect(inventory.move(item, { kind: 'hand', side: 'right' }).ok).toBe(true);
  });

  it('refuse their contents on a vehicle out of reach', () => {
    const { inventory, vehicleId, stowedItem } = spawned();
    inventory.vehicles.setOpen(registry, vehicleId, locker.behind!, true);
    inventory.canReachVehicle = () => false;
    expect(inventory.move(stowedItem(), { kind: 'hand', side: 'right' })).toMatchObject({
      ok: false,
      reason: coreMessage(registry, 'tooFar'),
    });
  });

  it('keep their contents and what closes them away across a save', () => {
    const { inventory, vehicleId, pocketOf, slot, type } = spawned();
    const saved = JSON.parse(
      JSON.stringify({ inventory: inventory.snapshotState(), vehicles: inventory.vehicles.snapshotState() }),
    );
    const restored = Inventory.restoreState(registry, saved.inventory, undefined, { vehicles: saved.vehicles });
    const vehicle = restored.vehicles.get(vehicleId)!;
    const kept = vehicle.fittings.find(({ id }) => id === locker.id)!;
    expect(kept.behind).toBe(locker.behind);
    expect(vehicle.sites.find(({ id }) => id === locker.id)!.behind).toBe(locker.behind);
    expect(kept.item.pockets![pocketOf(slot)]!.map((placed) => placed.item.type)).toEqual([type]);
  });
});

it('refuse a blueprint whose load-out a slot will not seat, or whose closure does not open', () => {
  const index = blueprint.fittings.indexOf(locker);
  const still = blueprint.fittings.find(({ part }) => !registry.items.get(part)?.vehicle?.opening)!;
  const [slot] = Object.keys(locker.stowed!);
  const fittings = blueprint.fittings.map((fitting) =>
    fitting === locker ? { ...fitting, stowed: { ...fitting.stowed, [slot!]: still.part }, behind: still.id } : fitting,
  );
  const { issues } = buildRegistry([
    ...baseContentSources(),
    { source: 'locker-fixture.json', data: { vehicleBlueprints: [{ ...blueprint, id: 'fixture_lockers', fittings }] } },
  ]);
  const paths = issues.filter(({ source }) => source === 'locker-fixture.json').map(({ path }) => path);
  expect(paths).toEqual(
    expect.arrayContaining([
      expect.stringContaining(`fittings[${index}].stowed.${slot}`),
      expect.stringContaining(`fittings[${index}].behind`),
    ]),
  );
});

describe('vehicle containers in reach', () => {
  const near = (blueprintId: string) => {
    const runtime = createRuntime();
    const vehicleId = runtime.inventory.registerVehicle({
      placementKey: `fixture.${blueprintId}`,
      blueprint: blueprintId,
      origin: [...runtime.player.body.pos] as Vec3,
      facing: 'n',
    });
    return { runtime, vehicle: runtime.inventory.vehicles.get(vehicleId)!, vehicleId };
  };

  it('list the troop carrier’s authored containers, but not the parts as loose items', () => {
    const { runtime, vehicle } = near('apc');
    const containers = vehicle.fittings.filter(({ item, behind }) => item.pockets && !behind).map(({ item }) => item);
    expect(containers).not.toEqual([]);
    const view = runtime.session.reach();
    expect(view.vehicleContainers.map(({ item }) => item)).toEqual(expect.arrayContaining(containers));
    expect(view.entries.some(({ item }) => containers.includes(item))).toBe(false);
  });

  it('list a locker only while its closure is open', () => {
    const { runtime, vehicle, vehicleId } = near(blueprint.id);
    const { item } = vehicle.fittings.find(({ id }) => id === locker.id)!;
    const listed = () => runtime.session.reach().vehicleContainers.some((container) => container.item === item);
    const stowed = () => item.pockets!.flat().map((placed) => placed.item);
    const reached = () =>
      stowed().every((held) => runtime.session.reach().entries.some((entry) => entry.item === held));
    expect(listed()).toBe(false);
    expect(reached()).toBe(false);
    runtime.inventory.vehicles.setOpen(registry, vehicleId, locker.behind!, true);
    expect(listed()).toBe(true);
    expect(reached()).toBe(true);
  });

  it('refuse using what is shut away as shut away, not as too far', () => {
    const { runtime, vehicle } = near(blueprint.id);
    const [held] = vehicle.fittings.find(({ id }) => id === locker.id)!.item.pockets!.flat();
    expect(useOption(held!.item, runtime.session.reach()).plan).toMatchObject({
      ok: false,
      reason: coreMessage(registry, 'shutAway'),
    });
  });
});
