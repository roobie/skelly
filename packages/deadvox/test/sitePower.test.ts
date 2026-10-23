import { PerspectiveCamera, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { decodeSave } from '../src/core/saveFormat.ts';
import { type PlacedPowerDevice, placedPowerDevices, SitePower } from '../src/core/sitePower.ts';
import { compileAssembly } from '../src/core/templates.ts';
import { LightPool } from '../src/render/lightPool.ts';
import { BASE_CLOCK, BASE_DAY_CYCLE } from './dayPhaseFixture.ts';
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
    const grid = new SitePower({ registry, devices: placed, clock: BASE_CLOCK, cycle: BASE_DAY_CYCLE });
    for (const storey of storeys) {
      const consumers = placed.filter(({ type, pos }) => {
        const spec = registry.furniture.get(type)!.power!;
        return (
          pos[1] >= storey.at[1] &&
          pos[1] < storey.at[1] + storey.size[1] &&
          spec.enabled &&
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
    const pool = new LightPool(new Scene());
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
