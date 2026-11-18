import { craftActionHooks } from '@skelly/engine/internal/core/craftWork.ts';
import { housingContentIssues, partFailure } from '@skelly/engine/internal/core/housing.ts';
import { illuminationAt } from '@skelly/engine/internal/core/illumination.ts';
import { gameMillisecondsAt } from '@skelly/engine/internal/core/power.ts';
import { POWER_UNITS } from '@skelly/engine/internal/core/powerContent.ts';
import { type PlacedPowerDevice, placedPowerDevices } from '@skelly/engine/internal/core/sitePower.ts';
import { compileAssembly, type Facing } from '@skelly/engine/internal/core/templates.ts';
import { simTimestamp } from '@skelly/engine/internal/core/time.ts';
import { CraftCommands, claimed, HandlingQueue, Inventory } from '@skelly/engine/inventory';
import { decodeSave, type SaveContentQuery } from '@skelly/engine/save';
import { bindReach, Character, Simulation } from '@skelly/engine/sim';
import { BlockEntities, type BlockEntity, SitePower, type Vec3 } from '@skelly/engine/world';
import { LightPool } from '@skelly/presentation/render';
import { contentLookup as lookupSaveContent } from '@skelly/presentation/ui';
import { PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { baseRegistryWith } from './baseRegistry.ts';
import { BASE_CLOCK, BASE_DAY_CYCLE } from './dayPhaseFixture.ts';
import { fixtureSources } from './economyFixtures.ts';
import { fixtureIds } from './fixtures/capabilityIds.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import {
  advance,
  capture,
  contentLookup,
  createRuntime,
  encodeFixture,
  formatVersion,
  registry,
} from './snapshotTestSupport.ts';

const generator = 'fixture_generator';
const lamp = 'fixture_lamp';
const machine = 'fixture_machine';
const furniture = registry.furniture.values().next().value!;
const fixtureRegistry = {
  ...registry,
  powerDevices: new Map([
    [
      'fixture_supply',
      {
        id: 'fixture_supply',
        kind: 'generator' as const,
        priority: 0,
        outputWatts: 1000,
        burnLitresPerGameHour: 3600 / BASE_CLOCK.ratio,
      },
    ],
    ['fixture_load', { id: 'fixture_load', kind: 'consumer' as const, priority: 1, demandWatts: 10 }],
  ]),
  furniture: new Map([
    ...registry.furniture,
    [generator, { ...furniture, id: generator, power: { device: 'fixture_supply', fuelLitres: 4, enabled: true } }],
    [
      lamp,
      {
        ...furniture,
        id: lamp,
        power: {
          device: 'fixture_load',
          fuelLitres: 0,
          enabled: true,
          light: { color: '#ffffff', intensity: 20, radius: 8 },
        },
      },
    ],
    [machine, { ...furniture, id: machine, power: { device: 'fixture_load', fuelLitres: 0, enabled: true } }],
  ]),
};
const loads: PlacedPowerDevice[] = [0, 8, 16].flatMap((y) => [
  { type: lamp, pos: [0, y, 0] },
  { type: machine, pos: [4, y, 0] },
]);
const devices: PlacedPowerDevice[] = [{ type: generator, pos: [8, 16, 0] }, ...loads];
const options = { registry: fixtureRegistry, powerDevices: devices };

describe('authored facility power', () => {
  it('extracts a fuelled generator on the lab entry storey and serves authored consumers on every storey', () => {
    const assembly = registry.mapAssemblies.get('gauntlet_lab')!;
    const template = compileAssembly(registry, assembly, { seed: 1, siteId: 'fixture' });
    const placed = placedPowerDevices(registry, [{ template, origin: [0, 0, 0], turn: 0 }]);
    const supply = placed.filter(
      ({ type }) => registry.powerDevices.get(registry.furniture.get(type)!.power!.device)!.kind === 'generator',
    );
    expect(supply.length).toBeGreaterThan(0);
    expect(registry.furniture.get(supply[0]!.type)!.power!.fuelLitres).toBeGreaterThan(0);
    const storeys = assembly.slots.filter(({ choices }) => choices?.every(({ ref }) => ref.kind === 'assembly'));
    expect(storeys.length).toBeGreaterThan(1);
    const entry = Math.max(...storeys.map(({ at }) => at[1]));
    expect(supply[0]!.pos[1]).toBeGreaterThan(entry);
    const grid = new SitePower({
      registry,
      inventory: new Inventory(registry),
      devices: placed,
      clock: BASE_CLOCK,
      cycle: BASE_DAY_CYCLE,
    });
    for (const storey of storeys) {
      const consumers = placed.filter(({ type, pos }) => {
        const spec = registry.furniture.get(type)!.power!;
        return (
          pos[1] >= storey.at[1] &&
          pos[1] < storey.at[1] + storey.size[1] &&
          spec.enabled &&
          !registry.furniture.get(type)!.charger &&
          registry.powerDevices.get(spec.device)!.kind === 'consumer'
        );
      });
      expect(consumers.length).toBeGreaterThan(0);
      expect(consumers.every((device) => grid.isPowered(device))).toBe(true);
    }
  });

  it('powers every floor without streaming, burns fuel on sim time, and blacks out rendered lights', () => {
    const runtime = createRuntime(undefined, false, undefined, options);
    const power = runtime.session.power!;
    expect(loads.every((load) => power.isPowered(load))).toBe(true);
    expect(power.lights()).toHaveLength(3);
    const initialFuel = power.network.snapshot().devices.find(({ type }) => type === 'fixture_supply')!.fuelUnits;
    advance(runtime, 120);
    const fuel = power.network.snapshot().devices.find(({ type }) => type === 'fixture_supply')!.fuelUnits;
    expect(fuel).toBeGreaterThan(0);
    expect(fuel).toBeLessThan(initialFuel);
    const pool = new LightPool(new Scene(), TEST_SENSE_TUNING.light);
    const context = {
      held: { lightPositionOf: () => false },
      camera: new PerspectiveCamera(),
      blockSize: 0.5,
      daylightScale: 1,
    };
    pool.update(runtime.inventory, { ...context, fixtures: power.lights() });
    expect(pool.lights.some(({ intensity }) => intensity > 0)).toBe(true);
    advance(runtime, 180);
    expect(loads.every((load) => !power.isPowered(load))).toBe(true);
    expect(power.network.snapshot().devices.find(({ type }) => type === 'fixture_supply')!.fuelUnits).toBe(0);
    pool.update(runtime.inventory, { ...context, fixtures: power.lights() });
    expect(pool.lights.every(({ intensity }) => intensity === 0)).toBe(true);
  });

  describe('light emitter', () => {
    const lit = (light: { offset?: Vec3 }, size: Vec3, device: Omit<PlacedPowerDevice, 'type'>) => {
      const shining = {
        ...furniture,
        id: lamp,
        size,
        power: {
          device: 'fixture_load',
          fuelLitres: 0,
          enabled: true,
          light: { color: '#ffffff', intensity: 20, radius: 8, ...light },
        },
      };
      const stack = { ...fixtureRegistry, furniture: new Map(fixtureRegistry.furniture).set(lamp, shining) };
      const inventory = new Inventory(stack);
      const power = new SitePower({
        registry: stack,
        inventory,
        devices: [
          { type: generator, pos: [8, 16, 0] },
          { type: lamp, ...device },
        ],
        clock: BASE_CLOCK,
        cycle: BASE_DAY_CYCLE,
      });
      return { inventory, power };
    };
    const spec = (pos: Vec3, size: Vec3, facing: Facing) => ({ pos, entitySpec: { type: lamp, pos, size, facing } });

    /** Where the renderer's slot sits, in blocks, and whether gameplay reads the light's full strength at `point`. */
    const emission = ({ inventory, power }: ReturnType<typeof lit>, point: Vec3) => {
      const [fixture] = power.lights();
      const blockSize = 0.5;
      const pool = new LightPool(new Scene(), TEST_SENSE_TUNING.light);
      pool.update(inventory, {
        held: { lightPositionOf: () => false },
        camera: new PerspectiveCamera(),
        blockSize,
        daylightScale: 1,
        fixtures: power.lights(),
      });
      const [slot] = pool.lights.filter(({ intensity }) => intensity > 0);
      const { pointDecay, nearFieldMetres } = claimed(inventory.registry.senses, 'player')!.light.illumination;
      const scene = {
        inventory,
        sky: { visibilityAt: () => 0 },
        gameHour: 0,
        cycle: BASE_DAY_CYCLE,
        fixtures: power.lights(),
        isBlocking: () => false,
        blockSize,
        holder: point,
      };
      const full = fixture!.intensity / nearFieldMetres ** pointDecay;
      return {
        rendered: slot!.position.toArray().map((value) => value / blockSize),
        fullStrength: Math.abs(illuminationAt(scene, point) - full) < 1e-9,
      };
    };

    it('shines from the centre of its origin cell when no offset is authored', () => {
      const point: Vec3 = [2.5, 4.5, 6.5];
      expect(emission(lit({}, [1, 3, 1], { pos: [2, 4, 6] }), point)).toEqual({ rendered: point, fullStrength: true });
    });

    it('moves both the rendered light and the light gameplay reads by an authored offset', () => {
      const point: Vec3 = [2.75, 6.5, 6.25];
      const moved = lit({ offset: [0.25, 2, -0.25] }, [1, 3, 1], { pos: [2, 4, 6] });
      expect(emission(moved, point)).toEqual({ rendered: point, fullStrength: true });
    });

    it('turns an authored offset with the piece', () => {
      const point: Vec3 = [2.5, 4.5, 6.75];
      const turned = lit({ offset: [0.25, 0, 0] }, [2, 1, 1], spec([2, 4, 6], [1, 1, 2], 'e'));
      expect(emission(turned, point)).toEqual({ rendered: point, fullStrength: true });
    });
  });

  it('round-trips partial fuel and grid state through the save format and continues to the same blackout', async () => {
    const runtime = createRuntime(undefined, false, undefined, options);
    advance(runtime, 137);
    const saved = capture(runtime);
    expect(saved.world.power!.devices.some(({ fuelUnits }) => fuelUnits > 0)).toBe(true);
    const decoded = await decodeSave(await encodeFixture(saved), { version: formatVersion, contentLookup });
    expect(decoded.snapshot.world.power).toEqual(saved.world.power);
    const restored = createRuntime(decoded.snapshot, false, undefined, options);
    expect(restored.session.power!.network.snapshot()).toEqual(runtime.session.power!.network.snapshot());
    advance(runtime, 180);
    advance(restored, 180);
    expect(restored.session.power!.network.snapshot()).toEqual(runtime.session.power!.network.snapshot());
    expect(loads.every((load) => !restored.session.power!.isPowered(load))).toBe(true);
  });
});

const MODULE = 'fixture_plant_module';
const WORN_MODULE = 'fixture_plant_worn_module';
const CRITICAL_MODULE = 'fixture_plant_critical_module';
const READY_MODULE = 'fixture_plant_ready_module';
const CORE = 'fixture_plant_core';
const DUD = 'fixture_plant_dud';
const STOCK = 'fixture_plant_stock';
const STORE = 'fixture_plant_store';
const BIG = 'fixture_plant_big_load';
const SMALL = 'fixture_plant_small_load';
const SERVICE = 'fixture_plant_service';
const WATTS = 10;
const SEED = 29;
const item = (id: string) => ({ id, name: 'Fixture plant part', category: 'material', size: [1, 1], weight: 1 });
const piece = (id: string, device: string, extra: object = {}) => ({
  id,
  name: 'Fixture plant piece',
  size: [1, 1, 1],
  massKg: 1,
  color: '#777777',
  power: { device, fuelLitres: 0, enabled: true },
  ...extra,
});
// The core starts absent, the authored failure; the casing's seeded range stays above its ruin-only gate.
const moduleFurniture = (id: string, casing: object) =>
  piece(id, MODULE, {
    breach: { minimumStrength: 1, durability: 100 },
    takeApart: { parts: MODULE },
    power: {
      device: MODULE,
      fuelLitres: 0,
      enabled: true,
      requires: [
        { slot: 'core', parts: [CORE], minimum: 0.5, critical: true },
        { slot: 'casing', ...casing },
      ],
    },
  });
const plantRegistry = baseRegistryWith(
  fixtureSources([
    {
      source: 'plant-module-fixture',
      data: {
        items: [item(CORE), item(DUD), item(STOCK)],
        powerDevices: [
          { id: MODULE, kind: 'inexhaustible', priority: 0, outputWatts: WATTS },
          { id: STORE, kind: 'battery', priority: 0, capacityWh: 1000, chargeEfficiency: 1, dischargeEfficiency: 1 },
          { id: BIG, kind: 'consumer', priority: 0, demandWatts: WATTS * 1.5 },
          { id: SMALL, kind: 'consumer', priority: 1, demandWatts: WATTS / 2 },
        ],
        partBlueprints: [
          {
            id: MODULE,
            slots: [
              { id: 'core', accepts: [CORE, DUD] },
              { id: 'casing', accepts: [CORE], initial: { item: CORE, condition: [0.5, 0.9] } },
            ],
          },
          // Every baseline part works, so it produces before any event touches it.
          { id: READY_MODULE, slots: [{ id: 'core', accepts: [CORE], initial: { item: CORE, condition: [0.6, 1] } }] },
        ],
        furniture: [
          moduleFurniture(MODULE, { parts: [CORE] }),
          // Seeded at 0.5 to 0.9 against a 0.7 minimum, so a world could start with an unauthored failure.
          moduleFurniture(WORN_MODULE, { parts: [CORE], minimum: 0.7 }),
          moduleFurniture(CRITICAL_MODULE, { parts: [CORE], minimum: 0.7, critical: true }),
          piece(READY_MODULE, MODULE, {
            breach: { minimumStrength: 1, durability: 100 },
            takeApart: { parts: READY_MODULE },
            power: {
              device: MODULE,
              fuelLitres: 0,
              enabled: true,
              requires: [{ slot: 'core', parts: [CORE], minimum: 0.5 }],
            },
          }),
          piece(STORE, STORE),
          piece(BIG, BIG),
          piece(SMALL, SMALL),
        ],
        recipes: [
          {
            id: SERVICE,
            kind: 'repair',
            result: { item: STOCK, count: 1 },
            repair: { entity: MODULE, skill: 'crafting', amount: 20, perSkill: 0 },
            timeGameMinutes: 1,
            skills: {},
            qualities: {},
            components: [[{ item: STOCK, count: 1 }]],
          },
        ],
      },
    },
  ]),
);
const plantLookup = (...query: SaveContentQuery): boolean => lookupSaveContent(plantRegistry, ...query);
const placed = (type: string, x: number): PlacedPowerDevice => {
  const pos: Vec3 = [x, 1, 0];
  return { type, pos, entitySpec: { type, pos, size: [1, 1, 1], facing: 'n' } };
};
const [first, second, store, big, small] = [
  placed(MODULE, 1),
  placed(MODULE, 3),
  placed(STORE, 5),
  placed(BIG, 7),
  placed(SMALL, 9),
] as const;
/** Delivers the module housings the way their column's arrival does, through the furnishing owner. */
const arriveModules = (inventory: Inventory, placedDevices: readonly PlacedPowerDevice[], wear?: number) =>
  placedDevices
    .filter(({ type }) => plantRegistry.furniture.get(type)!.power!.requires)
    .map((device) =>
      inventory.furnishSpawn({ spec: device.entitySpec!, loot: [], ...(wear === undefined ? {} : { wear }) }),
    );
/** A plant whose module columns have arrived, unless `arrival` is false; then `arrive` delivers them later. */
const plant = (placedDevices: readonly PlacedPowerDevice[], arrival = true) => {
  const inventory = new Inventory(plantRegistry, undefined, new BlockEntities(plantRegistry, SEED));
  let arrived = false;
  const power = new SitePower({
    registry: plantRegistry,
    inventory,
    devices: placedDevices,
    clock: BASE_CLOCK,
    cycle: BASE_DAY_CYCLE,
    arrived: () => arrived,
  });
  const arrive = (wear?: number) => {
    const pieces = arriveModules(inventory, placedDevices, wear);
    arrived = true;
    return pieces;
  };
  if (arrival) {
    arrive();
  }
  return { inventory, power, arrive };
};
const housing = (inventory: Inventory, device: PlacedPowerDevice) => inventory.entities.atOrigin(device.pos)!;
const fitCore = (inventory: Inventory, device: PlacedPowerDevice, slot: string) => {
  const part = inventory.create(CORE);
  if (!inventory.add(part, { kind: 'pile', pos: [0, 1, 0] })) {
    throw new Error('Fixture part did not land');
  }
  const refusal = inventory.housingTransfer({
    kind: 'fit',
    entityUid: housing(inventory, device).uid,
    slot,
    itemUid: part.uid,
  });
  if (refusal) {
    throw new Error(refusal);
  }
};
const stored = (power: SitePower) =>
  power.network.snapshot().devices.find(({ type }) => type === STORE)!.storedMicrojoules;
const gameMs = (at: number) => gameMillisecondsAt(BASE_CLOCK, at);
const energy = (watts: number, from: number, to: number) => watts * POWER_UNITS.rate * (gameMs(to) - gameMs(from));

describe('part-gated module sources', () => {
  it('fails a requirement for an absent, incompatible or worn part by one gate, at ruin when no minimum is authored', () => {
    const [core, casing] = plantRegistry.furniture.get(MODULE)!.power!.requires!;
    expect(partFailure(core!, undefined)).toBe('absent');
    expect(partFailure(core!, { type: DUD, condition: 1 })).toBe('incompatible');
    expect(partFailure(core!, { type: CORE, condition: 0.49 })).toBe('insufficient');
    expect(partFailure(core!, { type: CORE, condition: 0.5 })).toBeUndefined();
    expect(partFailure(casing!, { type: CORE, condition: 0 })).toBe('insufficient');
    expect(partFailure(casing!, { type: CORE, condition: Number.MIN_VALUE })).toBeUndefined();
  });

  it('refuses a non-critical seeded part whose range crosses its minimum, leaving critical ones authored', () => {
    const flagged = housingContentIssues(plantRegistry).map(({ id }) => id);
    expect(flagged).toContain(WORN_MODULE);
    expect(flagged).not.toContain(MODULE);
    expect(flagged).not.toContain(CRITICAL_MODULE);
  });

  it("stops only a failing module's share of the bus while its switch stays on", () => {
    const { inventory, power } = plant([first, second, big, small]);
    const served = () => [big, small].map((load) => power.isPowered(load));
    expect(served()).toEqual([false, false]);
    fitCore(inventory, first, 'core');
    power.advance(simTimestamp(1));
    expect(served()).toEqual([false, true]);
    fitCore(inventory, second, 'core');
    power.advance(simTimestamp(2));
    expect(served()).toEqual([true, true]);
    const removed = inventory.housingTransfer({
      kind: 'remove',
      entityUid: housing(inventory, second).uid,
      slot: 'casing',
      output: { kind: 'pile', pos: [0, 1, 0] },
    });
    expect(removed).toBeUndefined();
    power.advance(simTimestamp(3));
    expect(served()).toEqual([false, true]);
    expect(power.control(housing(inventory, second))?.enabled).toBe(true);
  });

  it('furnishes a module housing whole on arrival, after producing by the baseline parts it arrives with', () => {
    const ready = placed(READY_MODULE, 1);
    const { inventory, power, arrive } = plant([ready, store], false);
    expect(inventory.entities.atOrigin(ready.pos)).toBeUndefined();
    power.advance(simTimestamp(10));
    expect(stored(power)).toBe(energy(WATTS, 0, 10));
    const [arrived] = arrive(0.5);
    expect(arrived).toBeDefined();
    expect(inventory.entities.conditionOf(arrived!)).toBeLessThan(1);
    expect(arriveModules(inventory, [ready])).toEqual([undefined]);
    power.advance(simTimestamp(20));
    expect(stored(power)).toBe(energy(WATTS, 0, 20));
  });

  it('settles at a fit and a removal, so neither moves supply across its timestamp, and reads or runs without writing parts', () => {
    const { inventory, power } = plant([first, store]);
    let now = 0;
    inventory.entities.aroundPartsChange = (entity, change) => power.aroundChange(simTimestamp(now), entity, change);
    const built = JSON.stringify(inventory.snapshotState());
    power.advance(simTimestamp(5));
    expect(JSON.stringify(inventory.snapshotState())).toBe(built);
    now = 10;
    expect(power.network.snapshot().atGameMilliseconds).toBeLessThan(gameMs(now));
    fitCore(inventory, first, 'core');
    const fitted = JSON.stringify(inventory.snapshotState());
    power.advance(simTimestamp(30));
    expect(stored(power)).toBe(energy(WATTS, 10, 30));
    expect(JSON.stringify(inventory.snapshotState())).toBe(fitted);
    now = 40;
    expect(power.network.snapshot().atGameMilliseconds).toBeLessThan(gameMs(now));
    const removed = inventory.housingTransfer({
      kind: 'remove',
      entityUid: housing(inventory, first).uid,
      slot: 'core',
      output: { kind: 'pile', pos: [0, 1, 0] },
    });
    expect(removed).toBeUndefined();
    power.advance(simTimestamp(60));
    expect(stored(power)).toBe(energy(WATTS, 10, 40));
  });

  it.each([
    ['falls and survives', (entities: BlockEntities, housed: BlockEntity) => entities.drop(housed, housed.pos[1] - 1)],
    [
      'is lifted and set down elsewhere',
      (entities: BlockEntities, housed: BlockEntity) => {
        entities.lift(housed);
        entities.place(housed, [housed.pos[0], housed.pos[1], housed.pos[2] + 2]);
      },
    ],
  ])('stops producing once its housing %s, from the next balance, with its switch still on', (_, move) => {
    const { inventory, power } = plant([first, store]);
    fitCore(inventory, first, 'core');
    power.advance(simTimestamp(10));
    expect(stored(power), 'the fitted module must produce where it was placed').toBe(energy(WATTS, 0, 10));
    const housed = housing(inventory, first);
    power.beforeRemove(simTimestamp(20), housed);
    move(inventory.entities, housed);
    expect(housed.pos).not.toEqual(first.pos);
    power.advance(simTimestamp(40));
    expect(stored(power)).toBe(energy(WATTS, 0, 20));
    expect(power.control(housed)?.enabled).toBe(true);
  });

  it('runs no serviced module through its job and settles at both ends, while the other module runs on', () => {
    const { inventory, power } = plant([first, second, store]);
    fitCore(inventory, first, 'core');
    fitCore(inventory, second, 'core');
    const serviced = housing(inventory, first);
    if (inventory.entities.bash(serviced, 50) !== 'damaged') {
      throw new Error('Fixture module was not damaged');
    }
    if (!inventory.add(inventory.create(STOCK), { kind: 'pile', pos: [0, 1, 0] })) {
      throw new Error('Fixture stock did not land');
    }
    const character = new Character(plantRegistry);
    character.initializeProgression({}, [SERVICE]);
    const sim = new Simulation({
      seed: 1,
      registry: plantRegistry,
      clock: BASE_CLOCK,
      bodyTuning: plantRegistry.body.get(fixtureIds.player)!,
      compressionCaps: plantRegistry.compression.get(fixtureIds.player)!.caps,
    });
    const position: Vec3 = [0, 1, 0];
    const reach = bindReach({ inventory, position, blockSize: 0.5, clock: BASE_CLOCK });
    sim.actions.craft = craftActionHooks(inventory, character, reach, {
      feet: () => position,
      calendar: () => sim.calendar,
    });
    const commands = new CraftCommands({ inventory, character, sim, queue: new HandlingQueue(inventory), reach });
    const boundaries: number[] = [];
    inventory.entities.aroundPartsChange = (entity: BlockEntity, change) => {
      if (entity === serviced) {
        boundaries.push(sim.time);
      }
      power.aroundChange(simTimestamp(sim.time), entity, change);
    };
    sim.scheduler.advance(5);
    expect(commands.repairEntity(SERVICE, serviced.uid)).toBeUndefined();
    const work = serviced.work!.work!;
    sim.scheduler.advance((work.duration - work.elapsed) / sim.clock.ratio + 5);
    expect(serviced.work).toBeUndefined();
    power.advance(simTimestamp(sim.time));
    const [start, end] = boundaries;
    expect(boundaries).toHaveLength(2);
    expect(gameMs(start!)).toBeGreaterThan(0);
    expect(gameMs(end!)).toBeGreaterThan(gameMs(start!));
    expect(gameMs(sim.time)).toBeGreaterThan(gameMs(end!));
    expect(stored(power)).toBe(
      energy(2 * WATTS, 0, start!) + energy(WATTS, start!, end!) + energy(2 * WATTS, end!, sim.time),
    );
  });

  it('continues a repaired plant the same across a reload taken at the repair', async () => {
    const plantOptions = { registry: plantRegistry, powerDevices: [first, store] };
    const runtime = createRuntime(undefined, false, undefined, plantOptions);
    arriveModules(runtime.inventory, plantOptions.powerDevices);
    advance(runtime, 30);
    const power = runtime.session.power!;
    expect(power.network.snapshot().atGameMilliseconds).toBeLessThan(gameMs(runtime.sim.time));
    const repairedAt = runtime.sim.time;
    fitCore(runtime.inventory, first, 'core');
    const decoded = await decodeSave(await encodeFixture(capture(runtime)), {
      version: formatVersion,
      contentLookup: plantLookup,
    });
    const restored = createRuntime(decoded.snapshot, false, undefined, plantOptions);
    advance(runtime, 120);
    advance(restored, 120);
    expect(restored.session.power!.network.snapshot()).toEqual(power.network.snapshot());
    const at = power.network.snapshot().atGameMilliseconds;
    expect(stored(power)).toBe(WATTS * POWER_UNITS.rate * (at - gameMs(repairedAt)));
    const parts = (inventory: Inventory) => inventory.entities.housingView(housing(inventory, first));
    expect(parts(restored.inventory)).toEqual(parts(runtime.inventory));
  });
});
