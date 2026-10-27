import { describe, expect, it, vi } from 'vitest';
import { toChunk } from '../src/core/coords.ts';
import { coreMessage } from '../src/core/coreText.ts';
import type { Inventory } from '../src/core/inventory.ts';
import { savedItemTree } from '../src/core/itemTree.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { terrainShapeOf } from '../src/core/sitePalette.ts';
import { terrainHeight } from '../src/core/worldgen.ts';
import { layoutVehiclePlacements, registerLayoutVehicles } from '../src/game/layoutVehicles.ts';
import { IDLE } from '../src/game/session.ts';
import {
  advance,
  capture,
  contentLookup,
  createRuntime,
  encodeFixture,
  fixtureSite,
  formatVersion,
  registry,
  scale,
  seed,
} from './snapshotTestSupport.ts';

const spec = (placementKey: string) => ({
  placementKey,
  blueprint: 'pickup',
  origin: [-1100.25, 7, 2100.5] as [number, number, number],
  facing: 'w' as const,
});
const wheelWork = (runtime: ReturnType<typeof createRuntime>, placementKey: string, kind: 'install' | 'remove') => {
  const pos: [number, number, number] = [
    runtime.player.body.pos[0] + 1,
    runtime.player.body.pos[1],
    runtime.player.body.pos[2],
  ];
  const output: [number, number, number] = [
    Math.floor(runtime.player.body.pos[0]),
    Math.floor(runtime.player.body.pos[1]),
    Math.floor(runtime.player.body.pos[2]),
  ];
  runtime.inventory.canReach = () => true;
  runtime.inventory.canReachVehicle = () => true;
  const id = runtime.inventory.registerVehicle({ placementKey, blueprint: 'hatchback', origin: pos, facing: 'n' });
  const fitting = runtime.inventory.vehicles
    .get(id)!
    .fittings.find(({ id: fittingId }) => fittingId === 'front_wheel_near')!;
  const backpack = runtime.inventory.hands.right;
  const wrench = runtime.inventory.create('wrench');
  if (!(backpack && runtime.inventory.add(wrench, { kind: 'pocket', owner: backpack, pocket: 0 }))) {
    throw new Error('Could not pack fixture wrench');
  }
  if (kind === 'install') {
    const removal = runtime.inventory.vehicleTransfer({
      kind: 'remove',
      vehicleId: id,
      fittingId: fitting.id,
      itemUid: fitting.item.uid,
      output: { kind: 'pile', pos: output },
    });
    if (removal) {
      throw new Error(removal);
    }
  }
  const item = kind === 'install' ? runtime.inventory.itemByUid(fitting.item.uid)! : fitting.item;
  const service = runtime.inventory.vehicleService(id, fitting.id, item.uid);
  if (!service) {
    throw new Error('Missing fixture wheel service');
  }
  const refusal = runtime.sim.actions.beginVehicleWork({
    kind,
    vehicleId: id,
    fittingId: fitting.id,
    itemUid: item.uid,
    durationSimSeconds: service.durationSimSeconds,
  });
  if (refusal) {
    throw new Error(refusal);
  }
  return { id, fitting, item, output };
};

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

  it('admits the authored hatchback wheel service row without changing its UID', () => {
    const { inventory } = fixture();
    const id = inventory.registerVehicle({
      placementKey: 'fixture.hatchback',
      blueprint: 'hatchback',
      origin: [0, 0, 0],
      facing: 'n',
    });
    const fitting = inventory.vehicles.get(id)!.fittings.find(({ id: fittingId }) => fittingId === 'front_wheel_near')!;
    const output = { kind: 'pile' as const, pos: [0, 0, 0] as [number, number, number] };

    expect(
      inventory.vehicleTransfer({
        kind: 'remove',
        vehicleId: id,
        fittingId: fitting.id,
        itemUid: fitting.item.uid,
        output,
      }),
    ).toBeUndefined();
    expect(inventory.locate(fitting.item)).toMatchObject({ kind: 'pile' });
    expect(
      inventory.vehicleTransfer({ kind: 'install', vehicleId: id, fittingId: fitting.id, itemUid: fitting.item.uid }),
    ).toBeUndefined();
    expect(inventory.locate(fitting.item)).toMatchObject({ kind: 'vehicle', vehicleId: id, fittingId: fitting.id });
  });

  it('refuses a build the engine rejects with a content line, never the engine text', () => {
    const { inventory } = fixture();
    const id = inventory.registerVehicle({
      placementKey: 'fixture.engine-refused-hatchback',
      blueprint: 'hatchback',
      origin: [0, 0, 0],
      facing: 'n',
    });
    const fitting = inventory.vehicles.get(id)!.fittings.find(({ id: fittingId }) => fittingId === 'front_wheel_near')!;
    const engineText = 'fixture engine rejection';
    const replace = vi.spyOn(inventory.vehicles, 'replace').mockImplementation(() => {
      throw new Error(engineText);
    });
    const request = { vehicleId: id, fittingId: fitting.id, itemUid: fitting.item.uid };
    const removal = inventory.vehicleTransfer({
      ...request,
      kind: 'remove',
      output: { kind: 'pile', pos: [0, 0, 0] },
    });
    expect(removal).toBe(coreMessage(inventory.registry, 'partSupportsOthers'));
    expect(inventory.locate(fitting.item)).toMatchObject({ kind: 'vehicle', vehicleId: id });

    replace.mockRestore();
    expect(inventory.vehicleTransfer({ ...request, kind: 'remove', output: { kind: 'pile', pos: [0, 0, 0] } })).toBe(
      undefined,
    );
    vi.spyOn(inventory.vehicles, 'replace').mockImplementation(() => {
      throw new Error(engineText);
    });
    expect(inventory.vehicleTransfer({ ...request, kind: 'install' })).toBe(
      coreMessage(inventory.registry, 'partDoesNotFit'),
    );
    expect(inventory.locate(fitting.item)).toMatchObject({ kind: 'pile' });
  });

  it('refuses an unavailable removal destination without detaching the fitted UID', () => {
    const { inventory } = fixture();
    const id = inventory.registerVehicle({
      placementKey: 'fixture.refused-hatchback',
      blueprint: 'hatchback',
      origin: [0, 0, 0],
      facing: 'n',
    });
    const fitting = inventory.vehicles.get(id)!.fittings.find(({ id: fittingId }) => fittingId === 'front_wheel_near')!;
    const output = { kind: 'hand' as const, side: 'right' as const };
    expect(
      inventory.vehicleTransfer({
        kind: 'remove',
        vehicleId: id,
        fittingId: fitting.id,
        itemUid: fitting.item.uid,
        output,
      }),
    ).toBeDefined();
    expect(inventory.locate(fitting.item)).toMatchObject({ kind: 'vehicle', vehicleId: id, fittingId: fitting.id });
    expect(inventory.itemByUid(fitting.item.uid)).toBe(fitting.item);
  });

  it('removes a moved player’s wheel at the same destination after save continuation', async () => {
    const hedge = fixtureSite.hedges.find(({ min }) => toChunk(min[2]) === toChunk(min[2] + 3.5));
    if (!hedge) {
      throw new Error('Snapshot fixture has no walkable hedge');
    }
    const [x, , z] = hedge.min;
    const startZ = z + 3.5;
    const ground = fixtureSite.surface.height(
      x,
      startZ,
      terrainHeight(seed, terrainShapeOf(registry), scale, x, startZ),
    );
    const spawn: [number, number, number] = [x + 0.5, ground + 1.0001, startZ];
    const columns: [number, number][] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        columns.push([toChunk(x) + dx, toChunk(z) + dz]);
      }
    }
    const intent = { ...IDLE, forward: 1, walk: true };
    const runtimeFor = (snapshot?: ReturnType<typeof capture>) =>
      createRuntime(snapshot, false, columns, { spawn, yaw: 0, active: true, intent: () => intent });

    const uninterrupted = runtimeFor();
    const startedAt = uninterrupted.player.body.pos.map(Math.floor);
    advance(uninterrupted, 60);
    intent.forward = 0;
    expect(uninterrupted.player.body.pos.map(Math.floor)).not.toEqual(startedAt);
    const original = wheelWork(uninterrupted, 'fixture.saved-wheel.uninterrupted', 'remove');
    uninterrupted.sim.scheduler.advance(10);
    const midwayAction = uninterrupted.sim.actions.snapshotState();

    const saved = await decodeSave(await encodeFixture(capture(uninterrupted)), {
      version: formatVersion,
      contentLookup,
    });
    const resumed = runtimeFor(saved.snapshot);
    expect(resumed.sim.actions.snapshotState()).toEqual(midwayAction);

    uninterrupted.sim.scheduler.advance(30);
    resumed.sim.scheduler.advance(30);
    expect(capture(resumed)).toEqual(capture(uninterrupted));
    expect(resumed.inventory.locate(resumed.inventory.itemByUid(original.item.uid)!)).toMatchObject({
      kind: 'pile',
      pile: { pos: resumed.player.body.pos.map(Math.floor) },
    });
  });

  it('stops installation when removing its supporting fitting keeps the selected UID at one owner', () => {
    const runtime = createRuntime();
    const work = wheelWork(runtime, 'fixture.changed-wheel-support', 'install');
    runtime.sim.scheduler.advance(10);
    const strut = runtime.inventory.vehicles.get(work.id)!.fittings.find(({ id }) => id === 'front_strut_near')!;
    expect(
      runtime.inventory.vehicleTransfer({
        kind: 'remove',
        vehicleId: work.id,
        fittingId: strut.id,
        itemUid: strut.item.uid,
        output: { kind: 'pile', pos: work.output },
      }),
    ).toBeUndefined();

    runtime.sim.scheduler.advance(1);
    expect(runtime.sim.actions.snapshotState().job).toMatchObject({ jobType: 'vehicleWork', stopped: true });
    expect(runtime.inventory.locate(work.item)).toMatchObject({ kind: 'pile' });
    expect(
      [...savedItemTree(capture(runtime).character.inventory, capture(runtime).world.vehicles)].filter(
        ({ item }) => item.uid === work.item.uid,
      ),
    ).toHaveLength(1);
  });

  it('refuses to start removing a fitting another part rests on, spending no work time', () => {
    const runtime = createRuntime();
    const work = wheelWork(runtime, 'fixture.loaded-strut', 'remove');
    runtime.sim.actions.cancel();
    const strut = runtime.inventory.vehicles.get(work.id)!.fittings.find(({ id }) => id === 'front_strut_near')!;

    expect(runtime.session.beginVehicleWork('remove', work.id, strut.id, strut.item.uid)).toBeDefined();
    expect(runtime.sim.actions.snapshotState().job).toBeNull();
    expect(runtime.inventory.locate(strut.item)).toMatchObject({ kind: 'vehicle', fittingId: strut.id });
  });

  it('repeated testHouse registration after restore preserves saved missing parts and placement identity', async () => {
    const runtime = createRuntime();
    const placement = layoutVehiclePlacements(registry, 'testHouse', 0.5)[0]!;
    expect(placement).toBeDefined();
    const { fittings } = registry.vehicleBlueprints.get(placement.blueprint)!;
    const absent = fittings.find((fitting) => !fittings.some((other) => other.supportedBy.includes(fitting.id)))!.id;
    const id = runtime.inventory.registerVehicle(placement, [absent]);
    const initial = capture(runtime);
    const decoded = await decodeSave(await encodeFixture(initial), { version: formatVersion, contentLookup });
    const restored = createRuntime(decoded.snapshot);
    const before = capture(restored);
    registerLayoutVehicles(restored.inventory, registry, 'testHouse', 0.5);
    registerLayoutVehicles(restored.inventory, registry, 'testHouse', 0.5);
    expect(restored.inventory.vehicles.idForPlacementKey(placement.placementKey)).toBe(id);
    expect(capture(restored)).toEqual(before);
    const equivalent = createRuntime();
    equivalent.inventory.registerVehicle(placement, [absent]);
    expect(equivalent.inventory.vehicles.snapshotState()).toEqual(initial.world.vehicles);
  });
});
