import { describe, expect, it } from 'vitest';
import { Inventory } from '../src/core/inventory.ts';
import { restoreItem, snapshotItem } from '../src/core/items.ts';
import { chargeOf, chargeShare, drainLight, toggleLight } from '../src/core/lights.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { gameSeconds } from '../src/core/time.ts';
import { fitsFuelledTool } from '../src/core/torch.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { baseRegistry } from './baseRegistry.ts';
import { buildFixtureRegistry } from './economyFixtures.ts';
import { capture, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const vessel = (id: string, volumeMicrolitres: number) => ({
  id,
  name: id,
  category: 'tool',
  size: [1, 1],
  weight: 10,
  vessel: {
    capacityMicrolitres: 9,
    accepts: ['fixture_fuel', 'fixture_storage_only'],
    initialContents:
      volumeMicrolitres === 0 ? { kind: 'empty' } : { kind: 'filled', liquid: 'fixture_fuel', volumeMicrolitres },
  },
});
const lampDef = {
  ...vessel('fixture_reservoir_light', 0),
  light: {
    radius: 2,
    seenFrom: 10,
    color: '#ffffff',
    intensity: 1,
    liquidFuel: { accepts: ['fixture_fuel'], microlitresPerGameSecond: 3 },
    burning: { ignition: 'manual', douse: true, sprint: 'douse', stow: 'douse', drop: 'stay', relight: true },
  },
};
const build = (lamp: unknown = lampDef) =>
  buildFixtureRegistry([
    {
      source: 'fixture-lamp.json',
      data: {
        liquids: [
          { id: 'fixture_fuel', name: 'Fixture fuel', densityGramsPerMillilitre: 1 },
          { id: 'fixture_storage_only', name: 'Storage only', densityGramsPerMillilitre: 1 },
        ],
        items: [
          lamp,
          vessel('fixture_bottle', 9),
          {
            ...lampDef,
            id: 'fixture_long_lamp',
            name: 'Fixture long lamp',
            vessel: { ...vessel('unused', 90).vessel, capacityMicrolitres: 90 },
          },
        ],
      },
    },
  ]);
const result = build();
if (result.issues.length > 0) {
  throw new Error(JSON.stringify(result.issues));
}
const base = baseRegistry();
const registry = {
  ...base,
  items: new Map([...base.items, ...result.registry.items]),
  liquids: new Map([...base.liquids, ...result.registry.liquids]),
};
const pair = (inventory = new Inventory(registry)) => {
  const lamp = inventory.create(lampDef.id);
  const bottle = inventory.create('fixture_bottle');
  for (const item of [lamp, bottle]) {
    if (!inventory.add(item, { kind: 'pile', pos: [0, 0, 0] })) {
      throw new Error('Fixture admission failed');
    }
  }
  return { inventory, lamp, bottle };
};
const filledLamp = () => {
  const fixture = pair();
  if (!fixture.inventory.transferLiquid(fixture.bottle.uid, fixture.lamp.uid).ok) {
    throw new Error('Fixture fill failed');
  }
  return fixture;
};

describe('fixed reservoir lights', () => {
  it('fills and drains through explicit endpoints without fitting or moving either shell', () => {
    const { inventory, lamp, bottle } = pair();
    const uids = [lamp.uid, bottle.uid];
    const locations = [inventory.locate(lamp), inventory.locate(bottle)];
    expect(inventory.transferLiquid(bottle.uid, lamp.uid)).toMatchObject({ ok: true, volumeMicrolitres: 9 });
    expect(bottle.liquidContents).toEqual({ kind: 'empty' });
    expect(lamp.slots?.canister).toBeUndefined();
    expect(fitsFuelledTool(inventory, lamp, bottle)).toBe(false);
    expect(inventory.transferLiquid(lamp.uid, bottle.uid).ok).toBe(true);
    expect(lamp.liquidContents).toEqual({ kind: 'empty' });
    expect([lamp.uid, bottle.uid]).toEqual(uids);
    expect([inventory.locate(lamp), inventory.locate(bottle)]).toEqual(locations);
    expect(inventory.itemByUid(lamp.uid)).toBe(lamp);
    expect(inventory.itemByUid(bottle.uid)).toBe(bottle);
  });

  it('refuses lit service in both directions and admits a just-extinguished lamp without a wait', () => {
    const { inventory, lamp, bottle } = pair();
    expect(inventory.transferLiquid(bottle.uid, lamp.uid, 4).ok).toBe(true);
    expect(toggleLight(registry, lamp, 0)).toBeUndefined();
    const before = inventory.snapshotState();
    for (const [source, receiver] of [
      [bottle, lamp],
      [lamp, bottle],
    ]) {
      expect(inventory.transferLiquid(source!.uid, receiver!.uid)).toEqual({ ok: false, reason: 'unserviceable' });
    }
    expect(inventory.snapshotState()).toEqual(before);
    expect(toggleLight(registry, lamp, 0)).toBeUndefined();
    expect(inventory.transferLiquid(lamp.uid, bottle.uid).ok).toBe(true);
    expect(inventory.transferLiquid(bottle.uid, lamp.uid).ok).toBe(true);
  });

  it('settles fuel before extinguishing between simulation ticks', () => {
    const { lamp } = filledLamp();
    expect(toggleLight(registry, lamp, 0)).toBeUndefined();
    expect(toggleLight(registry, lamp, 0.2)).toBeUndefined();
    expect(lamp.liquidBurnRemainder).toBe(600_000);
    expect(toggleLight(registry, lamp, 10)).toBeUndefined();
    expect(drainLight(registry, lamp, gameSeconds(0.2), 10.2)).toBeUndefined();
    expect(chargeOf(registry, lamp)).toBe(8);
    expect(lamp.liquidBurnRemainder).toBe(200_000);
  });

  it('extinguishes at depletion within a long step and never refills on save/load', () => {
    const { lamp } = filledLamp();
    expect(chargeShare(registry, lamp)).toBe(1);
    expect(toggleLight(registry, lamp, 0)).toBeUndefined();
    expect(drainLight(registry, lamp, gameSeconds(0.1), 0.1)).toBeUndefined();
    expect(drainLight(registry, lamp, gameSeconds(10), 10.1)).toBeCloseTo(2.9, 12);
    expect(lamp.on).toBe(false);
    expect(lamp.liquidContents).toEqual({ kind: 'empty' });
    expect(lamp.liquidBurnRemainder).toBe(0);
    const restored = restoreItem(registry, snapshotItem(lamp));
    expect(chargeOf(registry, restored)).toBe(0);
    expect(toggleLight(registry, restored, 10.1)).toBeDefined();
    expect(restored.on).toBe(false);
  });

  it('partitioned and save-interrupted burn preserve fractional work and the extinction boundary', () => {
    const burn = (times: number[], saveAt?: number) => {
      let { lamp } = filledLamp();
      expect(toggleLight(registry, lamp, 0)).toBeUndefined();
      let previous = 0;
      for (const at of times) {
        expect(drainLight(registry, lamp, gameSeconds(at - previous), at)).toBeUndefined();
        if (at === saveAt) {
          lamp = restoreItem(registry, snapshotItem(lamp));
        }
        previous = at;
      }
      return lamp;
    };
    const whole = burn([1.1]);
    const split = burn([0.1, 0.3, 0.7, 1.1]);
    const saved = burn([0.1, 0.3, 0.7, 1.1], 0.3);
    expect(whole.liquidBurnRemainder).toBeGreaterThan(0);
    expect(snapshotItem(split)).toEqual(snapshotItem(whole));
    expect(snapshotItem(saved)).toEqual(snapshotItem(whole));
    for (const lamp of [whole, split, saved]) {
      expect(drainLight(registry, lamp, gameSeconds(3), 4.1)).toBeCloseTo(1.9, 12);
      expect(lamp.liquidContents).toEqual({ kind: 'empty' });
      expect(lamp.on).toBe(false);
    }
  });

  it('the simulation burns a dropped light and saves its fractional work through the wire', async () => {
    const runtime = createRuntime(undefined, false, undefined, { registry });
    const { inventory } = runtime;
    const lamp = inventory.create('fixture_long_lamp');
    expect(inventory.add(lamp, { kind: 'pile', pos: runtime.session.feet() })).toBe(true);
    runtime.sim.paused = false;
    runtime.session.frame(1 / 60);
    const full = chargeOf(registry, lamp)!;
    expect(toggleLight(registry, lamp, runtime.sim.calendar)).toBeUndefined();
    for (let frame = 0; frame < 90; frame++) {
      runtime.session.frame(1 / 60);
    }
    expect(lamp.on).toBe(true);
    expect(chargeOf(registry, lamp)).toBeLessThan(full);
    expect(chargeOf(registry, lamp)).toBeGreaterThan(0);
    expect(inventory.locate(lamp)?.kind).toBe('pile');
    const snapshot = capture(runtime);
    const decoded = await decodeSave(await encodeFixture(snapshot), {
      version: formatVersion,
      contentLookup: (kind, id, item) => contentLookup(registry, kind, id, item),
    });
    const restored = createRuntime(decoded.snapshot, false, runtime.columns, {
      registry,
      start: runtime.sim.clock.start,
    });
    expect(snapshotItem(restored.inventory.itemByUid(lamp.uid)!)).toEqual(snapshotItem(lamp));
    expect(lamp.liquidBurnRemainder).toBeGreaterThan(0);
  });

  it.each([undefined, -1, 0.5, 1_000_000, Number.NaN])('rejects invalid or missing saved burn carry %s', (carry) => {
    const { lamp } = filledLamp();
    const { liquidBurnRemainder: _carry, ...rest } = snapshotItem(lamp);
    const state = carry === undefined ? rest : { ...rest, liquidBurnRemainder: carry };
    expect(() => restoreItem(registry, state)).toThrow();
  });

  it.each([
    ['no reservoir', { vessel: undefined }],
    [
      'unknown fuel',
      { light: { ...lampDef.light, liquidFuel: { accepts: ['missing'], microlitresPerGameSecond: 3 } } },
    ],
    ['fuel not accepted by storage', { vessel: { ...lampDef.vessel, accepts: ['fixture_storage_only'] } }],
    ['missing rate', { light: { ...lampDef.light, liquidFuel: { accepts: ['fixture_fuel'] } } }],
    ['competing fuel', { light: { ...lampDef.light, fuelPerGameHour: 1 } }],
  ])('rejects %s', (_label, patch) => {
    expect(build({ ...lampDef, ...patch }).issues.length).toBeGreaterThan(0);
  });
});
