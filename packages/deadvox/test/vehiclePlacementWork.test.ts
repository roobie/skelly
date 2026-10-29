import { describe, expect, it } from 'vitest';
import type { Registry } from '../src/core/content.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import { CHUNK } from '../src/core/coords.ts';
import { coreMessage } from '../src/core/coreText.ts';
import type { Item } from '../src/core/items.ts';
import { savedItemTree } from '../src/core/itemTree.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { simSeconds } from '../src/core/time.ts';
import { legalAddonPlacements } from '../src/core/vehicleBlueprint.ts';
import {
  copyVehicleWorkPlacement,
  type VehicleWorkPlacement,
  type VehicleWorkTarget,
} from '../src/core/vehicleInstances.ts';
import {
  applyReplayActionPayload,
  isReplayActionPayload,
  type ReplayActionPayload,
} from '../src/game/replayCommands.ts';
import { baseRegistry } from './baseRegistry.ts';
import {
  blockId,
  capture,
  contentLookup,
  createRuntime,
  encodeFixture,
  fixtureZombieColumn,
  formatVersion,
  scale,
} from './snapshotTestSupport.ts';

const duration = 2;
const service = {
  name: 'Fixture service',
  mount: 'fixture_mount',
  durationSimSeconds: simSeconds(duration),
  qualities: {},
};
const placement: VehicleWorkPlacement = { at: [0.25, 0.5, 0.75], supportedBy: ['support'], mirror: true };
const fixtureRegistry = (): Registry => {
  const base = baseRegistry();
  const items = new Map(base.items);
  const wheel = items.get('wheel_205_55r16')!;
  items.set(wheel.id, { ...wheel, vehicle: { ...wheel.vehicle!, mount: service.mount } });
  const battery = items.get('car_battery')!;
  items.set(battery.id, { ...battery, vehicle: { ...battery.vehicle!, mount: service.mount } });
  const vehicleBlueprints = new Map(base.vehicleBlueprints);
  for (const id of ['hatchback', 'pickup']) {
    vehicleBlueprints.set(id, {
      id,
      name: 'Fixture vehicle',
      fittings: [
        { id: 'support', part: 'car_battery', at: [0, 1, 0], supportedBy: [], service },
        { id: 'part', part: wheel.id, ...copyVehicleWorkPlacement(placement), service },
      ],
    });
  }
  return { ...base, items, vehicleBlueprints };
};

const command = (runtime: ReturnType<typeof createRuntime>, payload: ReplayActionPayload) => {
  if (!isReplayActionPayload(payload)) {
    throw new Error('Malformed fixture command');
  }
  const unexpected = (): never => {
    throw new Error('Unexpected non-vehicle command');
  };
  return applyReplayActionPayload(payload, {
    inventory: runtime.inventory,
    queue: runtime.handling,
    quickbar: runtime.quickbar,
    vehicleWork: runtime.session.beginVehicleWork,
    search: unexpected,
    work: unexpected,
    loadBattery: unexpected,
    toHands: unexpected,
    pickup: unexpected,
    interact: unexpected,
    lift: unexpected,
    useFurniture: unexpected,
    slide: unexpected,
    place: unexpected,
    turn: unexpected,
    tip: unexpected,
    clearDownedBody: unexpected,
    craftStart: unexpected,
    craftRepairEntity: unexpected,
    craftContinue: unexpected,
    craftStop: unexpected,
    wait: unexpected,
    setWakeGameHour: unexpected,
    cancelItemThrow: unexpected,
    throwItem: unexpected,
  });
};

const fixture = (registry = fixtureRegistry()) => {
  const spawn: [number, number, number] = [
    fixtureZombieColumn[0] * CHUNK + 8.5,
    (scale.maxCy - 1) * CHUNK + 1.0001,
    fixtureZombieColumn[1] * CHUNK + 8.5,
  ];
  const runtime = createRuntime(undefined, false, undefined, { registry, spawn });
  const { inventory } = runtime;
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      runtime.world.setBlock(
        Math.floor(spawn[0]) + dx,
        Math.floor(spawn[1]) - 1,
        Math.floor(spawn[2]) + dz,
        blockId('planks'),
      );
    }
  }
  const spec = { origin: [spawn[0] + 1, spawn[1], spawn[2]] as [number, number, number], facing: 'n' as const };
  const hatchback = inventory.registerVehicle({ ...spec, blueprint: 'hatchback', placementKey: 'fixture.hatchback' });
  const pickup = inventory.registerVehicle(
    { ...spec, origin: [spawn[0] - 2, spawn[1], spawn[2]], blueprint: 'pickup', placementKey: 'fixture.pickup' },
    ['part'],
  );
  const part = inventory.vehicles.get(hatchback)!.fittings.find(({ id }) => id === 'part')!.item;
  const payload = (
    work: 'install' | 'remove',
    vehicleId: number,
    chosen = placement,
  ): Extract<ReplayActionPayload, { kind: 'vehicle.work' }> => ({
    kind: 'vehicle.work',
    work,
    vehicleId,
    fittingId: 'part',
    itemUid: part.uid,
    ...copyVehicleWorkPlacement(chosen),
  });
  return { runtime, registry, inventory, hatchback, pickup, part, payload };
};

describe('placement-carrying vehicle commands', () => {
  it('keeps one owner through a player-installed plate chain and refuses removing its occupied support', () => {
    const registry = fixtureRegistry();
    const cell = registry.inventory.get(CORE_CONTENT_IDS.player)!.cellMetres;
    const items = new Map(registry.items);
    const plate = items.get('mounting_plate')!;
    items.set(plate.id, {
      ...plate,
      vehicle: {
        ...plate.vehicle!,
        service: {
          mount: plate.vehicle!.mount!,
          durationSimSeconds: simSeconds(duration),
          qualities: {},
        },
      },
    });
    const models = new Map(registry.models);
    const model = models.get(plate.model!)!;
    const collision = Object.values(model.parts!).flatMap((body) => body.collision!);
    const span = (axis: 0 | 2) =>
      Math.max(...collision.map(({ max }) => max[axis])) - Math.min(...collision.map(({ min }) => min[axis]));
    const width = Math.ceil(span(0) / cell + 2) * cell;
    const depth = Math.ceil(span(2) / cell + 2) * cell;
    models.set('fixture_floor', {
      ...model,
      id: 'fixture_floor',
      parts: {
        body: {
          massKg: 1,
          centreOfMass: [width / 2, cell / 2, depth / 2],
          voxelGrain: cell,
          collision: [{ min: [0, 0, 0], max: [width, cell, depth] }],
        },
      },
    });
    items.set('fixture_floor', {
      ...plate,
      id: 'fixture_floor',
      model: 'fixture_floor',
      vehicle: { ...plate.vehicle!, addon: undefined, service: undefined },
    });
    const vehicleBlueprints = new Map(registry.vehicleBlueprints);
    for (const id of ['hatchback', 'pickup']) {
      vehicleBlueprints.set(id, {
        id,
        name: 'Fixture plate host',
        fittings: [{ id: 'part', part: 'fixture_floor', at: [0, 0, 0], supportedBy: [] }],
      });
    }
    const { runtime, inventory, hatchback } = fixture({ ...registry, items, models, vehicleBlueprints });
    const plates = [inventory.create(plate.id), inventory.create(plate.id)];
    const pos = runtime.player.body.pos.map(Math.floor) as [number, number, number];
    for (const item of plates) {
      expect(inventory.add(item, { kind: 'pile', pos })).toBe(true);
    }
    const singleOwners = () => {
      const state = capture(runtime);
      const owned = [...savedItemTree(state.character.inventory, state.world.vehicles)];
      for (const item of plates) {
        expect(owned.filter(({ item: saved }) => saved.uid === item.uid)).toHaveLength(1);
      }
    };
    const targetFor = (item: Item, support: string, id: string): VehicleWorkTarget => {
      const listed = legalAddonPlacements(inventory.registry, item, inventory.vehicles.get(hatchback)!);
      const target = listed.find((entry) => entry.support === support)?.cells[0];
      expect(target).toBeDefined();
      return { id, ...target! };
    };
    const payload = (kind: 'install' | 'remove', item: Item, target: VehicleWorkTarget): ReplayActionPayload => ({
      kind: 'vehicle.work',
      work: kind,
      vehicleId: hatchback,
      fittingId: target.id,
      itemUid: item.uid,
      ...copyVehicleWorkPlacement(target),
    });
    const work = (kind: 'install' | 'remove', item: Item, target: VehicleWorkTarget) => {
      expect(command(runtime, payload(kind, item, target))).toBeUndefined();
      singleOwners();
      runtime.sim.scheduler.advance(duration + 1);
      singleOwners();
      expect(inventory.locate(item)?.kind).toBe(kind === 'install' ? 'vehicle' : 'pile');
    };
    singleOwners();
    const [lower, upper] = plates as [Item, Item];
    const lowerTarget = targetFor(lower, 'part', 'lower');
    work('install', lower, lowerTarget);
    const upperTarget = targetFor(upper, 'lower', 'upper');
    work('install', upper, upperTarget);
    expect(command(runtime, payload('remove', lower, lowerTarget))).toBe(
      coreMessage(inventory.registry, 'partSupportsOthers'),
    );
    expect(runtime.sim.actions.snapshotState().job).toBeNull();
    singleOwners();
    work('remove', upper, upperTarget);
    work('remove', lower, lowerTarget);
    expect(inventory.vehicles.get(hatchback)!.fittings.map(({ id }) => id)).toEqual(['part']);
  });
  it('moves a factory cargo item to another legal cell through work with exactly one owner and removes it again', () => {
    const registry = fixtureRegistry();
    const cell = registry.inventory.get(CORE_CONTENT_IDS.player)!.cellMetres;
    const items = new Map(registry.items);
    const models = new Map(registry.models);
    const floor = items.get('car_battery')!;
    const floorModel = models.get(floor.model!)!;
    models.set('fixture_floor', {
      ...floorModel,
      id: 'fixture_floor',
      parts: {
        body: {
          massKg: 1,
          centreOfMass: [0, 0, 0],
          voxelGrain: cell,
          collision: [{ min: [0, 0, 0], max: [4 * cell, cell, 3 * cell] }],
        },
      },
    });
    items.set('fixture_floor', {
      ...floor,
      id: 'fixture_floor',
      model: 'fixture_floor',
      vehicle: { ...floor.vehicle!, capabilities: ['structure', 'load_floor'] },
    });
    items.set('fixture_structure', {
      ...items.get('fixture_floor')!,
      id: 'fixture_structure',
      vehicle: { ...floor.vehicle!, capabilities: ['structure'] },
    });
    const cargo = items.get('cargo_space')!;
    items.set(cargo.id, {
      ...cargo,
      vehicle: {
        ...cargo.vehicle!,
        mount: service.mount,
        service: { ...service, qualities: {} },
        addon: { requires: 'load_floor', openClearanceCells: 3 },
      },
    });
    const original: VehicleWorkPlacement = { at: [cell / 2, cell, cell / 2], supportedBy: ['support'] };
    const vehicleBlueprints = new Map(registry.vehicleBlueprints);
    for (const id of ['hatchback', 'pickup']) {
      vehicleBlueprints.set(id, {
        id,
        name: 'Fixture cargo vehicle',
        fittings: [
          { id: 'support', part: 'fixture_floor', at: [0, 0, 0], supportedBy: [] },
          { id: 'structure', part: 'fixture_structure', at: [-4 * cell, 0, 0], supportedBy: [] },
          { id: 'part', part: cargo.id, cargo: [1, 1, 1], ...original },
        ],
      });
    }
    const { runtime, inventory, hatchback, part, payload } = fixture({ ...registry, items, models, vehicleBlueprints });
    const outputOwner = () => {
      const state = capture(runtime);
      expect(
        [...savedItemTree(state.character.inventory, state.world.vehicles)].filter(({ item }) => item.uid === part.uid),
      ).toHaveLength(1);
    };
    const work = (kind: 'install' | 'remove', target: VehicleWorkPlacement) => {
      expect(command(runtime, payload(kind, hatchback, target))).toBeUndefined();
      runtime.sim.scheduler.advance(duration + 1);
      outputOwner();
    };
    work('remove', original);
    expect(inventory.locate(part)?.kind).toBe('pile');
    const listed = legalAddonPlacements(inventory.registry, part, inventory.vehicles.get(hatchback)!);
    const chosen = listed.flatMap(({ cells }) => cells).find(({ at }) => at[0] !== original.at[0])!;
    expect(chosen).toBeDefined();
    const refusals: [VehicleWorkTarget, 'partDoesNotFit' | 'partNeedsSupport'][] = [
      [{ ...chosen, id: 'support' }, 'partDoesNotFit'],
      [{ ...chosen, id: 'part', supportedBy: ['structure'] }, 'partNeedsSupport'],
      [{ ...chosen, id: 'part', supportedBy: ['part'] }, 'partNeedsSupport'],
    ];
    for (const [target, reason] of refusals) {
      const refusal = coreMessage(inventory.registry, reason);
      expect(runtime.session.vehicleWorkRefusal('install', hatchback, target, part.uid)).toBe(refusal);
      expect(command(runtime, { ...payload('install', hatchback, target), fittingId: target.id })).toBe(refusal);
      expect(
        inventory.vehicleTransfer({
          kind: 'install',
          vehicleId: hatchback,
          fittingId: target.id,
          itemUid: part.uid,
          placement: target,
        }),
      ).toBe(refusal);
      expect(runtime.sim.actions.snapshotState().job).toBeNull();
      expect(inventory.locate(part)?.kind).toBe('pile');
    }
    work('install', chosen);
    expect(inventory.locate(part)).toMatchObject({ kind: 'vehicle', vehicleId: hatchback });
    const pile = inventory.pileAt(runtime.player.body.pos.map(Math.floor) as [number, number, number]);
    expect(pile?.items.some(({ item }) => item.uid === part.uid) ?? false).toBe(false);
    const fitted = inventory.vehicles.get(hatchback)!.fittings.find(({ item }) => item.uid === part.uid)!;
    expect(copyVehicleWorkPlacement(fitted)).toEqual(chosen);
    work('remove', chosen);
    expect(inventory.locate(part)?.kind).toBe('pile');
    expect(inventory.vehicles.get(hatchback)!.fittings.some(({ item }) => item.uid === part.uid)).toBe(false);
    expect(part.cargo).toEqual([1, 1, 1]);
  });
  it('moves one service UID hatchback to inventory to pickup with exactly one owner, retaining placement through save', async () => {
    const { runtime, registry, inventory, hatchback, pickup, part, payload } = fixture();
    const owner = (expected: 'vehicle' | 'pile', vehicleId?: number) => {
      const state = capture(runtime);
      const matches = [...savedItemTree(state.character.inventory, state.world.vehicles)].filter(
        ({ item }) => item.uid === part.uid,
      );
      expect(matches).toHaveLength(1);
      expect(inventory.locate(part)).toMatchObject({
        kind: expected,
        ...(vehicleId === undefined ? {} : { vehicleId }),
      });
    };
    owner('vehicle', hatchback);
    expect(command(runtime, payload('remove', hatchback))).toBeUndefined();
    owner('vehicle', hatchback);
    runtime.sim.scheduler.advance(duration + 1);
    owner('pile');
    expect(command(runtime, payload('install', pickup))).toBeUndefined();
    owner('pile');
    runtime.sim.scheduler.advance(0.5);
    const saved = await decodeSave(await encodeFixture(capture(runtime)), { version: formatVersion, contentLookup });
    const resumed = createRuntime(saved.snapshot, false, undefined, { registry });
    expect(resumed.sim.actions.job).toMatchObject({ jobType: 'vehicleWork', placement });
    runtime.sim.scheduler.advance(duration + 1);
    resumed.sim.scheduler.advance(duration + 1);
    owner('vehicle', pickup);
    const fitted = inventory.vehicles.get(pickup)!.fittings.find(({ item }) => item.uid === part.uid)!;
    expect(copyVehicleWorkPlacement(fitted)).toEqual(placement);
    expect(resumed.inventory.vehicles.snapshotState()).toEqual(inventory.vehicles.snapshotState());
    const completed = await decodeSave(await encodeFixture(capture(runtime)), {
      version: formatVersion,
      contentLookup,
    });
    expect(completed.snapshot.world.vehicles).toEqual(capture(runtime).world.vehicles);
  });

  it('uses authored site requirements instead of the part requirements', () => {
    const registry = fixtureRegistry();
    const items = new Map(registry.items);
    const wheel = items.get('wheel_205_55r16')!;
    items.set(wheel.id, {
      ...wheel,
      vehicle: {
        ...wheel.vehicle!,
        service: {
          mount: service.mount,
          durationSimSeconds: simSeconds(duration * 3),
          qualities: { wrenching: 5 },
        },
      },
    });
    const { runtime, inventory, hatchback, part, payload } = fixture({ ...registry, items });
    expect(inventory.vehicleService(hatchback, 'part', part.uid)).toEqual({
      mount: service.mount,
      durationSimSeconds: service.durationSimSeconds,
      qualities: service.qualities,
    });
    expect(command(runtime, payload('remove', hatchback))).toBeUndefined();
    runtime.sim.scheduler.advance(duration + 1);
    expect(inventory.locate(part)?.kind).toBe('pile');
  });

  it('refuses changed cells, wrong mounts and unapproved supports identically in commands and inspection admission', () => {
    const { runtime, inventory, hatchback, pickup, part, payload } = fixture();
    expect(command(runtime, payload('remove', hatchback))).toBeUndefined();
    runtime.sim.scheduler.advance(duration + 1);
    const before = inventory.vehicles.snapshotState();
    const invalid: VehicleWorkPlacement[] = [
      { ...placement, at: [placement.at[0] + 1, placement.at[1], placement.at[2]] },
      { ...placement, supportedBy: [] },
      { ...placement, mirror: undefined },
    ];
    for (const chosen of invalid) {
      const refusal = runtime.session.vehicleWorkRefusal('install', pickup, { id: 'part', ...chosen }, part.uid);
      expect(refusal).toBe(coreMessage(inventory.registry, 'partDoesNotFit'));
      expect(command(runtime, payload('install', pickup, chosen))).toBe(refusal);
      expect(
        inventory.vehicleTransfer({
          kind: 'install',
          vehicleId: pickup,
          fittingId: 'part',
          itemUid: part.uid,
          placement: chosen,
        }),
      ).toBe(refusal);
    }
    const wrong = inventory.create('rag');
    expect(
      inventory.add(wrong, { kind: 'pile', pos: runtime.player.body.pos.map(Math.floor) as [number, number, number] }),
    ).toBe(true);
    const wrongCommand: ReplayActionPayload = {
      ...payload('install', pickup),
      itemUid: wrong.uid,
    } as ReplayActionPayload;
    expect(command(runtime, wrongCommand)).toBe(
      runtime.session.vehicleWorkRefusal('install', pickup, { id: 'part', ...placement }, wrong.uid),
    );
    expect(command(runtime, wrongCommand)).toBe(coreMessage(inventory.registry, 'partDoesNotFit'));
    expect(runtime.sim.actions.snapshotState().job).toBeNull();
    expect(inventory.vehicles.snapshotState()).toEqual(before);
    expect(inventory.locate(part)?.kind).toBe('pile');
  });

  it('refuses a free placement without part requirements and removing a supporting part before work starts', () => {
    const { runtime, inventory, hatchback, part } = fixture();
    const fitted = inventory.vehicles.get(hatchback)!.fittings.find(({ id }) => id === 'support')!;
    expect(
      command(runtime, {
        kind: 'vehicle.work',
        work: 'remove',
        vehicleId: hatchback,
        fittingId: fitted.id,
        itemUid: fitted.item.uid,
        ...copyVehicleWorkPlacement(fitted),
      }),
    ).toBe(coreMessage(inventory.registry, 'partSupportsOthers'));
    expect(runtime.sim.actions.snapshotState().job).toBeNull();
    expect(inventory.vehiclePlacementService(hatchback, { id: 'free', ...placement }, part.uid)).toBeUndefined();
    expect(
      command(runtime, {
        kind: 'vehicle.work',
        work: 'install',
        vehicleId: hatchback,
        fittingId: 'free',
        itemUid: part.uid,
        ...placement,
      }),
    ).toBe(coreMessage(inventory.registry, 'gone'));
  });

  it('rejects malformed placement payloads before dispatch', () => {
    const payload = {
      kind: 'vehicle.work',
      work: 'install',
      vehicleId: 1,
      fittingId: 'fixture',
      itemUid: 2,
      ...placement,
    };
    expect(isReplayActionPayload(payload)).toBe(true);
    for (const invalid of [
      { at: [1, 2] },
      { at: [0, Number.NaN, 0] },
      { supportedBy: ['a', 'a'] },
      { supportedBy: [1] },
      { mirror: false },
      { at: undefined },
    ]) {
      expect(isReplayActionPayload({ ...payload, ...invalid })).toBe(false);
    }
  });
});
