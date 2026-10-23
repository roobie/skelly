import { describe, expect, it } from 'vitest';
import type { Inventory } from '../src/core/inventory.ts';
import { savedItemTree } from '../src/core/itemTree.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { registerTestHouseVehicles, testHouseVehiclePlacement } from '../src/game/testHouseVehicles.ts';
import {
  capture,
  contentLookup,
  createRuntime,
  encodeFixture,
  formatVersion,
  registry,
} from './snapshotTestSupport.ts';

const spec = (placementKey: string) => ({
  placementKey,
  blueprint: 'pickup',
  origin: [-1100.25, 7, 2100.5] as [number, number, number],
  facing: 'w' as const,
});
const occupied = (inventory: Inventory, id: number, fittingId: string) => {
  const fitting = inventory.vehicles.get(id)!.fittings.find((entry) => entry.id === fittingId);
  if (!fitting) {
    throw new Error(`Missing fixture fitting ${fittingId}`);
  }
  return fitting.item;
};

const fixture = () => {
  const runtime = createRuntime();
  const { inventory } = runtime;
  const factoryFittings = registry.vehicleBlueprints.get('pickup')!.fittings;
  const absent = factoryFittings.find(
    (fitting) => !(fitting.cargo || factoryFittings.some((other) => other.supportedBy.includes(fitting.id))),
  )!.id;
  const cargoId = factoryFittings.find((fitting) => fitting.cargo)!.id;
  const id = inventory.registerVehicle(spec('fixture.pickup'), [absent]);
  const cargo = occupied(inventory, id, cargoId);
  const light = inventory.create('headlamp', 1, 0.4);
  if (!inventory.add(light, { kind: 'pocket', owner: cargo, pocket: 0 })) {
    throw new Error('Could not load fixture cargo');
  }
  if (!light.slots?.battery) {
    throw new Error('Fixture light needs a nested battery');
  }
  return { runtime, inventory, id, cargo, cargoId, light, absent };
};

describe('production vehicle ownership', () => {
  it('allocates disjoint ordinary item subtrees for factory instances and refuses generic root handling', () => {
    const { runtime, inventory, id, cargo, cargoId, light } = fixture();
    const second = inventory.registerVehicle(spec('fixture.second'));
    const snapshot = capture(runtime);
    const idsFor = (vehicleId: number) =>
      [
        ...savedItemTree(snapshot.character.inventory, {
          nextId: snapshot.world.vehicles.nextId,
          instances: snapshot.world.vehicles.instances.filter((entry) => entry.id === vehicleId),
        }),
      ]
        .filter(({ path }) => path.startsWith('world.vehicles'))
        .map(({ item }) => item.uid);
    const firstIds = idsFor(id);
    const secondIds = idsFor(second);
    expect(firstIds.length).toBeGreaterThan(0);
    expect(secondIds.length).toBeGreaterThan(0);
    expect(secondIds.every((uid) => !firstIds.includes(uid))).toBe(true);
    expect(inventory.itemByUid(light.slots!.battery!.uid)).toBe(light.slots!.battery);
    expect(inventory.locate(cargo)).toMatchObject({ kind: 'vehicle', vehicleId: id, fittingId: cargoId });
    expect(inventory.placeOf(inventory.locate(light)!)).toMatchObject({ kind: 'vehicle', origin: spec('').origin });
    expect(inventory.move(cargo, { kind: 'hand', side: 'right' }).ok).toBe(false);
    expect(inventory.consume(cargo)).toBe(false);
    expect(inventory.itemByUid(cargo.uid)).toBe(cargo);
  });

  it('round-trips region-owned pose, absent fitting, vacant site and nested contents through session restore', async () => {
    const { runtime, inventory, id, cargo, light, absent } = fixture();
    const before = capture(runtime);
    const decoded = await decodeSave(await encodeFixture(before), { version: formatVersion, contentLookup });
    expect(decoded.snapshot.world.vehicles).toEqual(before.world.vehicles);
    const restored = createRuntime(decoded.snapshot);
    expect(restored.session.vehicles).toBe(restored.inventory.vehicles);
    expect(restored.inventory.vehicles.get(id)).not.toBe(inventory.vehicles.get(id));
    expect(restored.inventory.itemByUid(cargo.uid)?.pockets?.[0]?.[0]?.item.uid).toBe(light.uid);
    expect(restored.inventory.itemByUid(light.slots!.battery!.uid)).toBeDefined();
    const build = restored.inventory.vehicles.get(id)!;
    expect(build.fittings.some((entry) => entry.id === absent)).toBe(false);
    expect(build.sites.some((entry) => entry.id === absent)).toBe(true);
    expect(capture(restored).world.vehicles).toEqual(before.world.vehicles);
    expect(inventory.vehicles.snapshotState()).toEqual(before.world.vehicles);
  });

  it('rejects an invalid replacement without making the session unsavable', async () => {
    const { runtime, inventory, id } = fixture();
    const before = inventory.vehicles.snapshotState();
    const replacement = structuredClone(inventory.vehicles.get(id)!);
    replacement.origin[0] = Number.NaN;

    expect(() => inventory.vehicles.replace(registry, id, replacement)).toThrow('Invalid vehicle identity or pose');
    expect(inventory.vehicles.snapshotState()).toEqual(before);
    await expect(encodeFixture(capture(runtime))).resolves.toBeInstanceOf(Uint8Array);
  });

  it('rejects cross-owner duplicate UIDs before restoring any live owners', async () => {
    const { runtime } = fixture();
    const invalid = structuredClone(capture(runtime));
    const root = invalid.world.vehicles.instances[0]!.vehicle.fittings[0]!.item;
    invalid.character.inventory.hands.right = structuredClone(root);
    await expect(encodeFixture(invalid)).rejects.toThrow('Duplicate item id');
    expect(() => createRuntime(invalid)).toThrow('Duplicate item id');
  });

  it('rejects allocator, identity, pose and support corruption in saved builds', async () => {
    const { runtime } = fixture();
    const saved = capture(runtime);
    const changes: ((state: SaveSnapshot) => void)[] = [
      (state) => {
        state.character.inventory.nextItemUid = state.world.vehicles.instances[0]!.vehicle.fittings[0]!.item.uid;
      },
      (state) => {
        state.world.vehicles.nextId = state.world.vehicles.instances[0]!.id;
      },
      (state) => {
        state.world.vehicles.instances.push(structuredClone(state.world.vehicles.instances[0]!));
      },
      (state) => {
        const { sites } = state.world.vehicles.instances[0]!.vehicle;
        sites.push(structuredClone(sites[0]!));
      },
      (state) => {
        const { fittings } = state.world.vehicles.instances[0]!.vehicle;
        fittings[1]!.id = fittings[0]!.id;
      },
      (state) => {
        state.world.vehicles.instances[0]!.vehicle.origin[0] = Number.NaN;
      },
      (state) => {
        state.world.vehicles.instances[0]!.vehicle.fittings[0]!.supportedBy = ['absent'];
      },
      (state) => {
        const root = state.world.vehicles.instances[0]!.vehicle.fittings[0]!;
        root.supportedBy = [root.id];
      },
    ];
    await Promise.all(
      changes.map(async (corrupt) => {
        const invalid = structuredClone(saved);
        corrupt(invalid);
        await expect(encodeFixture(invalid)).rejects.toThrow();
        expect(() => createRuntime(invalid)).toThrow();
      }),
    );
  });

  it('rejects unknown parts, non-parts and invalid fitted cargo on restore', () => {
    const { runtime } = fixture();
    for (const type of ['fixture_missing_item', 'rag']) {
      const invalid = structuredClone(capture(runtime));
      invalid.world.vehicles.instances[0]!.vehicle.fittings[0]!.item.type = type;
      expect(() => createRuntime(invalid)).toThrow();
    }
    const invalid = structuredClone(capture(runtime));
    const cargo = invalid.world.vehicles.instances[0]!.vehicle.fittings.find(({ item }) => item.cargo)!;
    cargo.item.pockets![0]![0]!.x = cargo.item.cargo![0];
    expect(() => createRuntime(invalid)).toThrow('Invalid item placement');
    const floating = structuredClone(capture(runtime));
    floating.world.vehicles.instances[0]!.vehicle.fittings.find(({ item }) => item.cargo)!.at[1] += 1;
    expect(() => createRuntime(floating)).toThrow('Invalid vehicle cargo containment');
  });

  it('repeated testHouse registration after restore preserves saved missing parts and placement identity', async () => {
    const runtime = createRuntime();
    const { fittings } = registry.vehicleBlueprints.get('hatchback')!;
    const absent = fittings.find((fitting) => !fittings.some((other) => other.supportedBy.includes(fitting.id)))!.id;
    const id = runtime.inventory.registerVehicle(testHouseVehiclePlacement(3, 0.5), [absent]);
    const initial = capture(runtime);
    const decoded = await decodeSave(await encodeFixture(initial), { version: formatVersion, contentLookup });
    const restored = createRuntime(decoded.snapshot);
    const before = capture(restored);
    expect(registerTestHouseVehicles(restored.inventory, 'testHouse', 900, 0.5)).toBe(id);
    expect(registerTestHouseVehicles(restored.inventory, 'testHouse', 3, 0.5)).toBe(id);
    expect(capture(restored)).toEqual(before);
    const equivalent = createRuntime();
    equivalent.inventory.registerVehicle(testHouseVehiclePlacement(3, 0.5), [absent]);
    expect(equivalent.inventory.vehicles.snapshotState()).toEqual(initial.world.vehicles);
  });
});
