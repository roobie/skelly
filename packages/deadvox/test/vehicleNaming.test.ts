import { buildRegistry, type Registry } from '@skelly/engine/content';
import { claimed } from '@skelly/engine/internal/core/capabilities.ts';
import { simSeconds } from '@skelly/engine/internal/core/time.ts';
import { vehicleContentIssues } from '@skelly/engine/internal/core/vehicleBlueprint.ts';
import { registerLayoutVehicles } from '@skelly/engine/internal/game/layoutVehicles.ts';
import { Inventory } from '@skelly/engine/inventory';
import { VehicleInstances, vehicleName, vehicleSiteName } from '@skelly/engine/vehicles';
import { vehicleInspectionViewModel } from '@skelly/presentation/internal/ui/vehicleInspection.ts';
import { describe, expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';

type Fitting = NonNullable<ReturnType<Registry['vehicleBlueprints']['get']>>['fittings'][number];

const base = baseRegistry();
const wheel = base.items.get('wheel_205_55r16')!;
const service = { mount: wheel.vehicle!.mount!, durationSimSeconds: simSeconds(1), qualities: {} };
// Test-owned parts: a frame that provides two positioned slots and one lone slot, and a second root.
const frameNames = { slot: { left: 'Fixture left slot', right: 'Fixture right slot' }, lone: 'Fixture lone slot' };
const frame = (sites = frameNames) => ({
  ...base.items.get('car_battery')!,
  id: 'fixture_frame',
  name: 'Fixture frame',
  vehicle: { ...base.items.get('car_battery')!.vehicle!, sites },
});
const rail = { ...base.items.get('car_battery')!, id: 'fixture_rail', name: 'Fixture rail' };
const root: Fitting = { id: 'frame', part: 'fixture_frame', at: [0, 0, 0], supportedBy: [] };
// The two slots share one authored origin, so only their positions tell them apart.
const slot = (position: string): Fitting => ({
  id: position,
  part: wheel.id,
  at: [0, 0.5, 0],
  supportedBy: ['frame'],
  service,
  site: { provider: 'fixture_frame', key: 'slot', position },
});
const blueprint = (id: string, fittings: Fitting[]) => ({ id, name: `Fixture ${id}`, fittings });

const fixtureRegistry = (sites = frameNames, extra: ReturnType<typeof blueprint>[] = []): Registry => ({
  ...base,
  items: new Map(base.items).set('fixture_frame', frame(sites)).set('fixture_rail', rail),
  vehicleBlueprints: new Map(
    [
      ...base.vehicleBlueprints.values(),
      blueprint('fixture_named', [root, slot('left'), slot('right')]),
      blueprint('fixture_roots', [root, { id: 'rail', part: 'fixture_rail', at: [1, 0, 0], supportedBy: [] }]),
      blueprint('fixture_solo', [{ ...root, part: wheel.id, service }]),
      ...extra,
    ].map((entry) => [entry.id, entry]),
  ),
  layouts: new Map(base.layouts).set('fixture_lot', {
    ...[...base.layouts.values()][0]!,
    id: 'fixture_lot',
    vehicles: [{ blueprint: 'fixture_solo', placementKey: 'fixture.solo', position: [0, 0, 0], facing: 'n' }],
  }),
});

const registered = (registry: Registry, id: string, key = `fixture.${id}`) => {
  const inventory = new Inventory(registry);
  const vehicleId = inventory.registerVehicle({ blueprint: id, placementKey: key, origin: [0, 0, 0], facing: 'n' });
  return { inventory, vehicleId };
};

const siteNames = (registry: Registry, inventory: Inventory, vehicleId: number) =>
  inventory.vehicles.get(vehicleId)!.sites.flatMap(({ site }) => (site ? [vehicleSiteName(registry, site)] : []));

const stripped = (inventory: Inventory, registry: Registry, vehicleId: number) => {
  const { blueprint: _blueprint, ...scratch } = inventory.vehicles.get(vehicleId)!;
  inventory.vehicles.replace(registry, vehicleId, scratch);
};

const inspection = (inventory: Inventory, vehicleId: number) =>
  vehicleInspectionViewModel({ inventory, reach: { entries: [] }, refusal: () => undefined }, vehicleId);

describe('vehicle site and build names', () => {
  it('names sites from their providing part alike for factory and blueprint-less builds, coincident slots apart', () => {
    const registry = fixtureRegistry();
    const { inventory, vehicleId } = registered(registry, 'fixture_named');
    const factory = siteNames(registry, inventory, vehicleId);
    expect(factory).toEqual([frameNames.slot.left, frameNames.slot.right]);
    stripped(inventory, registry, vehicleId);
    expect(siteNames(registry, inventory, vehicleId)).toEqual(factory);
    expect(vehicleName(registry, inventory.vehicles.get(vehicleId)!)).toBe('Fixture frame');
    expect(inspection(inventory, vehicleId)?.name).toBe('Fixture frame');
  });

  it('keeps a site’s name when its occupant leaves and another fills it', () => {
    const registry = fixtureRegistry();
    const { inventory, vehicleId } = registered(registry, 'fixture_named');
    const fitted = inventory.vehicles.get(vehicleId)!.fittings.find(({ id }) => id === 'left')!;
    const output = { kind: 'pile' as const, pos: [0, 0, 0] as [number, number, number] };
    const request = { vehicleId, fittingId: 'left', placement: fitted };
    expect(inventory.vehicleTransfer({ ...request, kind: 'remove', itemUid: fitted.item.uid, output })).toBeUndefined();
    const vacant = inspection(inventory, vehicleId)!.sites.find(({ id }) => id === 'left')!;
    expect(vacant.item).toBeUndefined();
    expect(vacant.label).toContain(frameNames.slot.left);
    const replacement = inventory.create(wheel.id);
    expect(inventory.add(replacement, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    expect(inventory.vehicleTransfer({ ...request, kind: 'install', itemUid: replacement.uid })).toBeUndefined();
    const refitted = inspection(inventory, vehicleId)!.sites.find(({ id }) => id === 'left')!;
    expect(refitted.item?.uid).toBe(replacement.uid);
    expect(refitted.site).toBe(frameNames.slot.left);
    expect(siteNames(registry, inventory, vehicleId)).toEqual([frameNames.slot.left, frameNames.slot.right]);
  });

  it('saves site references, not text, so the provider’s rewording relabels a restored build', () => {
    const registry = fixtureRegistry();
    const { inventory, vehicleId } = registered(registry, 'fixture_named');
    const saved = structuredClone(inventory.vehicles.snapshotState());
    expect(JSON.stringify(saved)).not.toContain(frameNames.slot.left);
    const reworded = { ...frameNames, slot: { left: 'Reworded left slot', right: 'Reworded right slot' } };
    const rewordedRegistry = fixtureRegistry(reworded);
    const restored = new VehicleInstances();
    restored.restoreState(rewordedRegistry, saved);
    expect(restored.snapshotState()).toEqual(saved);
    const names = restored
      .get(vehicleId)!
      .sites.flatMap(({ site }) => (site ? [vehicleSiteName(rewordedRegistry, site)] : []));
    expect(names).toEqual([reworded.slot.left, reworded.slot.right]);
  });

  it('names a blueprint-less build after its one root, and generically when it has several', () => {
    const registry = fixtureRegistry();
    const one = registered(registry, 'fixture_named');
    stripped(one.inventory, registry, one.vehicleId);
    expect(vehicleName(registry, one.inventory.vehicles.get(one.vehicleId)!)).toBe('Fixture frame');
    const several = registered(registry, 'fixture_roots');
    stripped(several.inventory, registry, several.vehicleId);
    const generic = claimed(registry.ui, 'interface')!.screenText.vehicle.assembly;
    expect(vehicleName(registry, several.inventory.vehicles.get(several.vehicleId)!)).toBe(generic);
    expect(inspection(several.inventory, several.vehicleId)?.name).toBe(generic);
  });

  it('reads build and site names and the inspection without changing the build or allocating', () => {
    const registry = fixtureRegistry();
    const { inventory, vehicleId } = registered(registry, 'fixture_named');
    stripped(inventory, registry, vehicleId);
    const now = () => ({
      state: inventory.snapshotState(),
      vehicles: inventory.vehicles.snapshotState(),
      versions: [inventory.version, inventory.vehicles.version],
    });
    const before = now();
    // Each read on its own, so two writes that undo each other cannot hide.
    for (const read of [
      () => vehicleName(registry, inventory.vehicles.get(vehicleId)!),
      () => siteNames(registry, inventory, vehicleId),
      () => inspection(inventory, vehicleId),
    ]) {
      read();
      expect(now()).toEqual(before);
    }
  });
});

describe('a build with no parts', () => {
  it('ends when its last part leaves, never reusing its id, and stays ended through a save and re-registration', () => {
    const registry = fixtureRegistry();
    const inventory = new Inventory(registry);
    registerLayoutVehicles(inventory, registry, 'fixture_lot', 1);
    const vehicleId = inventory.vehicles.idForPlacementKey('fixture.solo')!;
    const only = inventory.vehicles.get(vehicleId)!.fittings[0]!;
    const output = { kind: 'pile' as const, pos: [0, 0, 0] as [number, number, number] };
    expect(
      inventory.vehicleTransfer({
        kind: 'remove',
        vehicleId,
        fittingId: only.id,
        itemUid: only.item.uid,
        placement: only,
        output,
      }),
    ).toBeUndefined();
    expect(inventory.vehicles.get(vehicleId)).toBeUndefined();
    expect(inventory.locate(only.item)).toMatchObject({ kind: 'pile' });
    expect(inventory.vehicles.hasEnded('fixture.solo')).toBe(true);
    const later = inventory.registerVehicle({
      blueprint: 'fixture_named',
      placementKey: 'fixture.later',
      origin: [0, 0, 0],
      facing: 'n',
    });
    expect(later).toBeGreaterThan(vehicleId);

    const restored = Inventory.restoreState(registry, inventory.snapshotState(), undefined, {
      vehicles: structuredClone(inventory.vehicles.snapshotState()),
    });
    registerLayoutVehicles(restored, registry, 'fixture_lot', 1);
    expect(restored.vehicles.idForPlacementKey('fixture.solo')).toBeUndefined();
    expect(restored.vehicles.hasEnded('fixture.solo')).toBe(true);
  });
});

describe('vehicle site validation', () => {
  const issuesFor = (fittings: Fitting[]) =>
    vehicleContentIssues(fixtureRegistry(frameNames, [blueprint('fixture_bad', fittings)])).filter(
      ({ id }) => id === 'fixture_bad',
    );

  it.each([
    ['an unknown site key', { ...slot('left'), site: { provider: 'fixture_frame', key: 'fixture_none' } }],
    ['a missing position', { ...slot('left'), site: { provider: 'fixture_frame', key: 'slot' } }],
    [
      'a position on a lone site',
      { ...slot('left'), site: { provider: 'fixture_frame', key: 'lone', position: 'left' } },
    ],
    [
      'a provider it does not rest on',
      { ...slot('left'), site: { provider: 'fixture_rail', key: 'slot', position: 'left' } },
    ],
    ['no site on a serviceable part resting on another', { ...slot('left'), site: undefined }],
  ] as [string, Fitting][])('refuses %s', (_case, bad) => {
    const { site, ...rest } = bad;
    expect(issuesFor([root, site ? bad : rest]).some(({ path }) => path.includes('.site'))).toBe(true);
  });

  it('refuses two sites that read alike, and accepts the same slots apart', () => {
    expect(issuesFor([root, slot('left'), { ...slot('left'), id: 'twin' }]).length).toBeGreaterThan(0);
    expect(issuesFor([root, slot('left'), slot('right')])).toEqual([]);
  });

  it('refuses a blueprint that authors its own site text', () => {
    const { issues } = buildRegistry([
      {
        source: 'fixture-labelled.json',
        data: {
          vehicleBlueprints: [
            {
              id: 'fixture_labelled',
              name: 'Fixture labelled',
              fittings: [{ ...root, part: wheel.id, service: { ...service, name: 'Fixture label' } }],
            },
          ],
        },
      },
    ]);
    expect(issues.some(({ source, path }) => source === 'fixture-labelled.json' && path.includes('service'))).toBe(
      true,
    );
  });

  it('refuses restoring a saved site reference its provider no longer offers', () => {
    const registry = fixtureRegistry();
    const { inventory } = registered(registry, 'fixture_named');
    const saved = structuredClone(inventory.vehicles.snapshotState());
    const withoutSlot = fixtureRegistry({ ...frameNames, slot: undefined as never });
    expect(() => new VehicleInstances().restoreState(withoutSlot, saved)).toThrow('Invalid vehicle site');
  });
});
