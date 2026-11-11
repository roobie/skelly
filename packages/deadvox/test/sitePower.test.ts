import { illuminationAt } from '@skelly/engine/internal/core/illumination.ts';
import { type PlacedPowerDevice, placedPowerDevices } from '@skelly/engine/internal/core/sitePower.ts';
import { compileAssembly, type Facing } from '@skelly/engine/internal/core/templates.ts';
import { claimed, Inventory } from '@skelly/engine/inventory';
import { decodeSave } from '@skelly/engine/save';
import { SitePower, type Vec3 } from '@skelly/engine/world';
import { LightPool } from '@skelly/presentation/render';
import { PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { BASE_CLOCK, BASE_DAY_CYCLE } from './dayPhaseFixture.ts';
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
    const pool = new LightPool(new Scene(), TEST_SENSE_TUNING.light.renderedFixtureLimit);
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
      const pool = new LightPool(new Scene(), TEST_SENSE_TUNING.light.renderedFixtureLimit);
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
