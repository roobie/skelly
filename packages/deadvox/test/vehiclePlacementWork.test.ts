import { describe, expect, it } from 'vitest';
import type { Registry } from '../src/core/content.ts';
import { CHUNK } from '../src/core/coords.ts';
import { coreMessage } from '../src/core/coreText.ts';
import { savedItemTree } from '../src/core/itemTree.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { simSeconds } from '../src/core/time.ts';
import { copyVehicleWorkPlacement, type VehicleWorkPlacement } from '../src/core/vehicleInstances.ts';
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
    craftContinue: unexpected,
    craftStop: unexpected,
    wait: unexpected,
    setWakeGameHour: unexpected,
    cancelItemThrow: unexpected,
    throwItem: unexpected,
  });
};

const fixture = () => {
  const registry = fixtureRegistry();
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
  const payload = (work: 'install' | 'remove', vehicleId: number, chosen = placement): ReplayActionPayload => ({
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

  it('refuses a free placement with no authored service site and removing a supporting part before work starts', () => {
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
