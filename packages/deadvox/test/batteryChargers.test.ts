import { describe, expect, it } from 'vitest';
import { batteryEnergy } from '../src/core/battery.ts';
import { BatteryChargers } from '../src/core/batteryChargers.ts';
import { ruinFurniture } from '../src/core/furnitureMove.ts';
import { Inventory } from '../src/core/inventory.ts';
import { restoreItem, snapshotItem } from '../src/core/items.ts';
import { chargeOf, drainLight, fitsLight, swapBattery, toggleLight } from '../src/core/lights.ts';
import type { PowerState } from '../src/core/power.ts';
import { decodeSave, encodeSave } from '../src/core/saveFormat.ts';
import { gameSeconds, simTimestamp } from '../src/core/time.ts';
import { buildFixtureRegistry } from './economyFixtures.ts';
import { playerInventorySource } from './fixtures/playerInventory.ts';
import { deviceState, powerCycle } from './powerFixture.ts';
import { capture, contentLookup, createRuntime, formatVersion, formatWorldOptions } from './snapshotTestSupport.ts';

const content = () => ({
  items: [
    {
      id: 'cell',
      name: 'Cell',
      category: 'battery',
      size: [1, 1],
      weight: 0.1,
      stack: 4,
      battery: { capacity: 7, rechargeable: { microjoulesPerCharge: 1001 } },
    },
    { id: 'primary', name: 'Primary', category: 'battery', size: [2, 2], weight: 0.1, battery: { capacity: 7 } },
    {
      id: 'lamp',
      name: 'Lamp',
      category: 'misc',
      size: [1, 1],
      weight: 0.1,
      light: {
        intensity: 1,
        radius: 1,
        seenFrom: 1,
        color: '#ffffff',
        power: { battery: 'cell', compatibleBatteries: ['primary'], chargePerGameHour: 1, swapSimSeconds: 1 },
      },
    },
  ],
  furniture: [
    {
      id: 'charger',
      name: 'Charger',
      size: [1, 1, 1],
      color: '#333333',
      container: { pockets: [{ grid: [1, 1], handlingSimSeconds: 1 }] },
      power: { device: 'load', enabled: true, fuelLitres: 0 },
      charger: { batteries: ['cell'], pocket: 0, efficiency: 0.75 },
    },
  ],
  powerDevices: [
    { id: 'generator', kind: 'generator', priority: 0, outputWatts: 0.004, burnLitresPerGameHour: 1 },
    { id: 'store', kind: 'battery', priority: 0, capacityWh: 0.000_01, chargeEfficiency: 1, dischargeEfficiency: 1 },
    { id: 'load', kind: 'consumer', priority: 0, demandWatts: 0.004 },
  ],
});
const sources = (data = content()) => [playerInventorySource(), { source: 'charger-fixture', data }];
const built = buildFixtureRegistry(sources());
if (built.issues.length > 0) {
  throw new Error(JSON.stringify(built.issues));
}
const { registry } = built;
const environment = {
  registry,
  clock: { start: 0, ratio: 1 },
  cycle: powerCycle,
  tuning: { id: 'fixture', tickSimSeconds: 0.001 },
};
const at = (ms: number) => simTimestamp(ms / 1000);
const initial = (): PowerState => ({
  atGameMilliseconds: 0,
  devices: [
    { ...deviceState('generator'), fuelUnits: 10_000_000 },
    deviceState('store'),
    deviceState('charger', 'load'),
  ],
  links: [
    { from: 'generator', to: 'charger', itemUid: 1 },
    { from: 'generator', to: 'store', itemUid: 2 },
  ],
});
const setup = (count = 2, condition = 0.6) => {
  const inventory = new Inventory(registry);
  const entity = inventory.furnish({ type: 'charger', pos: [0, 1, 0], size: [1, 1, 1], facing: 'n' }, [])!;
  inventory.entities.markSearched(entity);
  const endpoints = [{ consumerId: 'charger', entityUid: entity.uid }];
  const owner = new BatteryChargers(inventory, environment, initial(), endpoints);
  const cell = inventory.create('cell', count, condition);
  cell.charges = 0;
  if (!inventory.add(cell, { kind: 'hand', side: 'right' })) {
    throw new Error('Fixture cell did not fit');
  }
  return { inventory, entity, endpoints, owner, cell };
};
const owned = (fixture: ReturnType<typeof setup>) => fixture.entity.pockets![0]![0]!.item;
const stored = (owner: BatteryChargers) =>
  owner.network.snapshot().devices.find(({ id }) => id === 'store')!.storedMicrojoules;

describe('portable battery charging owner', () => {
  it('splits exactly one cell through inventory, reserves it and retains partial energy across blackout, stop and collection', () => {
    const f = setup();
    expect(f.owner.start(at(0), 'charger', f.cell).ok).toBe(true);
    const battery = owned(f);
    expect(battery.uid).not.toBe(f.cell.uid);
    expect(f.cell.count).toBe(1);
    expect(battery.count).toBe(1);
    expect(battery.condition).toBe(f.cell.condition);
    expect(f.inventory.move(battery, { kind: 'hand', side: 'left' }).ok).toBe(false);
    expect(f.inventory.consume(battery)).toBe(false);
    expect(f.inventory.move(f.cell, { kind: 'furniture', entity: f.entity, pocket: 0 }).ok).toBe(false);
    f.owner.network.setEnabled(at(100), 'generator', false);
    expect(batteryEnergy(registry, battery)).toBe(300);
    f.owner.network.advance(at(500));
    expect(batteryEnergy(registry, battery)).toBe(300);
    f.owner.network.setEnabled(at(500), 'generator', true);
    expect(f.owner.stop(at(600), 'charger')).toBe(true);
    expect(batteryEnergy(registry, battery)).toBe(600);
    f.owner.network.advance(at(700));
    expect(batteryEnergy(registry, battery)).toBe(600);
    expect(f.owner.start(at(700), 'charger', battery).ok).toBe(true);
    expect(f.owner.stop(at(701), 'charger')).toBe(true);
    expect(f.owner.collect(at(701), 'charger', { kind: 'hand', side: 'left' }).ok).toBe(true);
    expect(f.inventory.hands.left).toBe(battery);
    expect(batteryEnergy(registry, battery)).toBe(603);
    expect(f.owner.collect(at(701), 'charger', { kind: 'pile', pos: [1, 1, 0] }).ok).toBe(false);
  });

  it('preserves sub-charge energy across partitioned advances and releases demand exactly at capacity without duplicating network energy', () => {
    const run = (partitioned: boolean) => {
      const f = setup();
      expect(f.owner.start(at(0), 'charger', f.cell).ok).toBe(true);
      if (partitioned) {
        for (const ms of [1, 2, 7, 137, 999, 2001, 2335, 2336]) {
          f.owner.network.advance(at(ms));
        }
      }
      const transitions = f.owner.network.advance(at(3000));
      const battery = owned(f);
      const completeAt = Math.ceil(7007 / 3);
      expect(batteryEnergy(registry, battery)).toBe(7007);
      expect(stored(f.owner)).toBe((3000 - completeAt) * 4);
      expect(batteryEnergy(registry, battery) + stored(f.owner)).toBeLessThanOrEqual(3000 * 4);
      expect(f.entity.charging).toBeUndefined();
      if (!partitioned) {
        expect(transitions).toContainEqual({ at: at(completeAt), consumerId: 'charger', powered: false });
      }
      return { battery: snapshotItem(battery), power: f.owner.network.snapshot() };
    };
    expect(run(true)).toEqual(run(false));
  });

  it('restores one settled owner and battery identity and continues exactly, rejecting detached or mismatched state', () => {
    const f = setup();
    expect(f.owner.start(at(0), 'charger', f.cell).ok).toBe(true);
    f.owner.network.advance(at(137));
    const saved = JSON.parse(
      JSON.stringify({ inventory: f.inventory.snapshotState(), power: f.owner.network.snapshot() }),
    );
    const inventory = Inventory.restoreState(registry, saved.inventory);
    const owner = new BatteryChargers(inventory, environment, saved.power, f.endpoints);
    owner.network.advance(at(400));
    f.owner.network.advance(at(400));
    expect(inventory.snapshotState()).toEqual(f.inventory.snapshotState());
    expect(owner.network.snapshot()).toEqual(f.owner.network.snapshot());
    expect(() => new BatteryChargers(inventory, environment, saved.power, f.endpoints)).toThrow('settlement boundary');
    expect(
      () => new BatteryChargers(Inventory.restoreState(registry, saved.inventory), environment, saved.power, []),
    ).toThrow('settlement boundary');
    const bad = structuredClone(saved.inventory);
    bad.entities.entities[0].charging.batteryUid += 1;
    expect(() => Inventory.restoreState(registry, bad)).toThrow('ownership');
    const state = snapshotItem(owned(f));
    for (const batteryMicrojoules of [-1, 7008, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => restoreItem(registry, { ...state, batteryMicrojoules })).toThrow('battery energy');
    }
    expect(() => restoreItem(registry, { ...state, charges: 1 })).toThrow('battery energy');
  });

  it('settles before destruction and lets the existing ruin owner drop the same partially charged cell exactly once', () => {
    const f = setup();
    expect(f.owner.start(at(0), 'charger', f.cell).ok).toBe(true);
    const battery = owned(f);
    f.owner.beforeRemove(at(101), 'charger');
    f.owner.beforeRemove(at(101), 'charger');
    expect(f.owner.network.snapshot().devices.some(({ id }) => id === 'charger')).toBe(false);
    expect(f.owner.network.snapshot().links.some(({ from, to }) => from === 'charger' || to === 'charger')).toBe(false);
    expect(
      ruinFurniture(
        {
          inventory: f.inventory,
          terrainSolid: (_x, y) => y < 1,
          blockSize: 0.5,
          player: { pos: [10, 1, 10], vel: [0, 0, 0], halfWidth: 0.4, height: 1.8, onGround: true },
          others: [],
          stamina: 100,
        },
        f.entity,
      ),
    ).toEqual([f.entity]);
    const drops = [...f.inventory.piles.values()]
      .flatMap(({ items }) => items)
      .filter(({ item }) => item.uid === battery.uid);
    expect(drops).toHaveLength(1);
    expect(drops[0]!.item).toBe(battery);
    expect(batteryEnergy(registry, battery)).toBe(303);
    f.owner.network.advance(at(1000));
    expect(batteryEnergy(registry, battery)).toBe(303);
  });

  it('rejects incompatible and unreachable inputs without taking ownership, and failed collection leaves the result', () => {
    const f = setup();
    const wrong = f.inventory.create('primary');
    expect(f.inventory.add(wrong, { kind: 'hand', side: 'left' })).toBe(true);
    expect(f.owner.start(at(0), 'charger', wrong).ok).toBe(false);
    f.inventory.canReachEntity = () => false;
    expect(f.owner.start(at(0), 'charger', f.cell).ok).toBe(false);
    expect(f.cell.count).toBe(2);
    f.inventory.canReachEntity = () => true;
    expect(f.owner.start(at(0), 'charger', f.cell).ok).toBe(true);
    f.owner.network.advance(at(3000));
    const battery = owned(f);
    expect(f.owner.collect(at(3000), 'charger', { kind: 'hand', side: 'left' }).ok).toBe(false);
    expect(owned(f)).toBe(battery);
    expect(f.owner.remainingGameMilliseconds('charger')).toBe(0);
  });

  it('returns a charged cell to an existing light and retains a spent rechargeable cell', () => {
    const condition = 0.4;
    const f = setup(1, condition);
    const { inventory, owner, cell } = f;
    expect(owner.start(at(0), 'charger', cell).ok).toBe(true);
    owner.network.advance(at(3000));
    const charged = owned(f);
    expect(owner.collect(at(3000), 'charger', { kind: 'hand', side: 'right' }).ok).toBe(true);
    const lamp = inventory.create('lamp');
    expect(inventory.add(lamp, { kind: 'hand', side: 'left' })).toBe(true);
    expect(fitsLight(registry, lamp, charged)).toBe(true);
    expect(swapBattery(inventory, lamp, charged, () => ({ kind: 'pile', pos: [1, 1, 0] }))).toBeUndefined();
    expect(lamp.slots!.battery).toBe(charged);
    expect(toggleLight(registry, lamp)).toBeUndefined();
    expect(chargeOf(registry, lamp)).toBeGreaterThan(0);
    expect(drainLight(registry, lamp, gameSeconds(0.01))).toBeUndefined();
    expect(charged.condition).toBe(condition);
    expect(restoreItem(registry, snapshotItem(lamp))).toEqual(lamp);
    drainLight(registry, lamp, gameSeconds(1e9));
    expect(chargeOf(registry, charged)).toBe(0);
    const replacement = inventory.create('primary');
    expect(inventory.add(replacement, { kind: 'hand', side: 'right' })).toBe(true);
    expect(swapBattery(inventory, lamp, replacement, () => ({ kind: 'pile', pos: [1, 1, 0] }))).toBeUndefined();
    expect(inventory.locate(charged)?.kind).toBe('pile');
  });
});

it('round-trips charger references and bounded battery energy through the save wire format', async () => {
  const runtime = createRuntime();
  const { inventory } = runtime;
  const base = inventory.registry;
  const entity = inventory.furnish({ type: 'battery_charger', pos: [0, 1, 0], size: [1, 1, 1], facing: 'n' }, [])!;
  inventory.entities.markSearched(entity);
  const cell = inventory.create('rechargeable_aa_battery');
  cell.batteryMicrojoules = 137;
  expect(inventory.add(cell, { kind: 'pile', pos: [0, 1, 1] })).toBe(true);
  const state: PowerState = {
    atGameMilliseconds: 0,
    devices: [deviceState('charger', 'portable_battery_charger')],
    links: [],
  };
  const endpoints = [{ consumerId: 'charger', entityUid: entity.uid }];
  const owner = new BatteryChargers(inventory, { ...environment, registry: base }, state, endpoints);
  inventory.canReachEntity = () => true;
  inventory.canReach = () => true;
  expect(owner.start(at(0), 'charger', cell).ok).toBe(true);
  const captured = capture(runtime);
  const snapshot = { ...captured, world: { ...captured.world, power: owner.network.snapshot() } };
  const bytes = await encodeSave(snapshot, { generation: 1, version: formatVersion, worldOptions: formatWorldOptions });
  const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
  const restored = Inventory.restoreState(base, decoded.snapshot.character.inventory);
  const restoredOwner = new BatteryChargers(
    restored,
    { ...environment, registry: base },
    decoded.snapshot.world.power!,
    endpoints,
  );
  expect(restored.entities.byUid(entity.uid)!.charging).toEqual(entity.charging);
  expect(restored.itemByUid(cell.uid)!.batteryMicrojoules).toBe(137);
  expect(restoredOwner.network.snapshot()).toEqual(owner.network.snapshot());
});

it('validates rechargeability, exact energy bounds, compatibility and a fitting positive charger load', () => {
  const mutations = [
    (data: ReturnType<typeof content>) => {
      data.furniture[0]!.charger.batteries = ['primary'];
    },
    (data: ReturnType<typeof content>) => {
      data.furniture[0]!.charger.pocket = 1;
    },
    (data: ReturnType<typeof content>) => {
      data.furniture[0]!.charger.efficiency = 0.000_01;
    },
    (data: ReturnType<typeof content>) => {
      data.items[0]!.battery!.capacity = Number.MAX_SAFE_INTEGER;
    },
  ];
  for (const mutate of mutations) {
    const data = content();
    mutate(data);
    expect(buildFixtureRegistry(sources(data)).issues.length).toBeGreaterThan(0);
  }
});
