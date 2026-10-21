import { describe, expect, it } from 'vitest';
import { validateContent } from '../src/core/content.ts';
import { dayPhaseAt } from '../src/core/dayPhase.ts';
import { gameMillisecondsAt, PowerNetwork, type PowerState, type PowerTransition } from '../src/core/power.ts';
import { POWER_UNITS, type PowerDeviceDef } from '../src/core/powerContent.ts';
import { simTimestamp } from '../src/core/time.ts';
import {
  deviceState,
  powerClock,
  powerCycle,
  powerDefinitions,
  powerState,
  powerTuning,
  rateChangeAt,
} from './powerFixture.ts';

const environment = (definitions = powerDefinitions) => ({
  registry: { powerDevices: new Map(definitions.map((def) => [def.id, def])) },
  tuning: powerTuning,
  clock: powerClock,
  cycle: powerCycle,
});
const network = (state = powerState(), definitions = powerDefinitions) =>
  new PowerNetwork(environment(definitions), state);
const entry = (state: PowerState, id: string) => state.devices.find((device) => device.id === id)!;
const advance = (power: PowerNetwork, to: number) => power.advance(simTimestamp(to));
const tickGameMilliseconds = gameMillisecondsAt(powerClock, powerTuning.tickSimSeconds);

function runAgreement(end: number, ticking: boolean) {
  const power = network();
  const transitions: PowerTransition[] = [];
  const runTo = (target: number) => {
    if (ticking) {
      const targetGameMilliseconds = gameMillisecondsAt(powerClock, target);
      while (power.snapshot().atGameMilliseconds + tickGameMilliseconds < targetGameMilliseconds) {
        transitions.push(...power.tick());
      }
    }
    transitions.push(...advance(power, target));
  };
  runTo(Math.min(end, rateChangeAt));
  if (end >= rateChangeAt) {
    transitions.push(...power.setEnabled(rateChangeAt, 'high', true));
    runTo(end);
  }
  return { state: power.snapshot(), transitions };
}

describe('PowerNetwork', () => {
  it('agrees exactly with ticking across fuel, storage, solar and a mid-run rate change', () => {
    const day = dayPhaseAt(powerCycle, 0);
    const phaseTimes = [day.dawn, day.sunrise, day.sunset, day.nightfall].map((at) => at / powerClock.ratio);
    const checkpoints = [
      3.1,
      15.7,
      rateChangeAt,
      22.4,
      34.1,
      35.6,
      46.7,
      71.2,
      98.3,
      140.1,
      ...phaseTimes.flatMap((at) => [at - 0.1, at, at + 0.1]),
      1600.3,
      2880.9,
    ];
    for (const end of checkpoints) {
      const live = runAgreement(end, true);
      const caught = runAgreement(end, false);
      expect(live.state).toEqual(caught.state);
      expect(live.transitions).toEqual(caught.transitions);
    }
    const completed = runAgreement(checkpoints.at(-1)!, false);
    expect(entry(completed.state, 'generator').fuelUnits).toBe(0);
    expect(completed.transitions.some((change) => change.at > rateChangeAt && !change.powered)).toBe(true);
    expect(completed.transitions.some((change) => change.at > rateChangeAt && change.powered)).toBe(true);
  });

  it('admits whole consumers by content priority and identity, independent of insertion order', () => {
    const defs: PowerDeviceDef[] = [
      { id: 'supply', kind: 'generator', priority: 0, outputWatts: 10, burnLitresPerGameHour: 1 },
      { id: 'load', kind: 'consumer', priority: 0, demandWatts: 6 },
      { id: 'urgent', kind: 'consumer', priority: -1, demandWatts: 6 },
    ];
    const state: PowerState = {
      atGameMilliseconds: 0,
      devices: [
        { ...deviceState('source', 'supply'), fuelUnits: 2 * POWER_UNITS.amount },
        deviceState('b', 'load'),
        deviceState('a', 'load'),
        { ...deviceState('urgent'), enabled: false },
      ],
      links: ['a', 'b', 'urgent'].map((to, index) => ({ from: 'source', to, itemUid: index + 1 })),
    };
    const a = network(state, defs);
    const b = network({ ...state, devices: [...state.devices].reverse(), links: [...state.links].reverse() }, defs);
    expect(advance(a, 0)).toEqual(advance(b, 0));
    expect(entry(a.snapshot(), 'a').powered).toBe(true);
    expect(entry(a.snapshot(), 'b').powered).toBe(false);
    const time = simTimestamp(1);
    expect(a.setEnabled(time, 'urgent', true)).toEqual(b.setEnabled(time, 'urgent', true));
    expect(entry(a.snapshot(), 'urgent').powered).toBe(true);
    expect(entry(a.snapshot(), 'a').powered).toBe(false);
    expect(a.setEnabled(time, 'urgent', false)).toEqual(b.setEnabled(time, 'urgent', false));
    expect(entry(a.snapshot(), 'a').powered).toBe(true);
    expect(advance(a, 2)).toEqual([]);
    advance(b, 2);
    expect(a.snapshot()).toEqual(b.snapshot());
  });

  it.each(['priority', 'identity'] as const)('orders lossy storage transfer by %s', (order) => {
    const supply = { id: 'supply', kind: 'generator', priority: 0, outputWatts: 10, burnLitresPerGameHour: 1 } as const;
    const store = {
      id: 'store',
      kind: 'battery',
      priority: 0,
      capacityWh: 5,
      chargeEfficiency: 0.8,
      dischargeEfficiency: 0.5,
    } as const;
    const load = { id: 'load', kind: 'consumer', priority: 0, demandWatts: 10 } as const;
    const defs: PowerDeviceDef[] = [supply, store, { ...store, id: 'later', priority: 1 }, load];
    const first = order === 'priority' ? 'b' : 'a';
    const second = order === 'priority' ? 'a' : 'b';
    const state: PowerState = {
      atGameMilliseconds: 0,
      devices: [
        { ...deviceState('source', 'supply'), fuelUnits: 5 * POWER_UNITS.amount },
        deviceState('b', 'store'),
        deviceState('a', order === 'priority' ? 'later' : 'store'),
        { ...deviceState('load'), enabled: false },
      ],
      links: ['a', 'b', 'load'].map((to, index) => ({ from: 'source', to, itemUid: index + 1 })),
    };
    const power = network(state, defs);
    advance(power, 15);
    expect(entry(power.snapshot(), first).storedMicrojoules).toBeGreaterThan(0);
    expect(entry(power.snapshot(), second).storedMicrojoules).toBe(0);
    advance(power, 45);
    const full = entry(power.snapshot(), first).storedMicrojoules;
    const later = entry(power.snapshot(), second).storedMicrojoules;
    expect(full).toBe(store.capacityWh * POWER_UNITS.amount);
    expect(later).toBeGreaterThan(0);
    const before = power.snapshot();
    power.setEnabled(simTimestamp(45), 'source', false);
    power.setEnabled(simTimestamp(45), 'load', true);
    advance(power, 48);
    expect(entry(power.snapshot(), first).storedMicrojoules).toBeLessThan(full);
    expect(entry(power.snapshot(), second).storedMicrojoules).toBe(later);
    const burned = state.devices[0]!.fuelUnits - entry(before, 'source').fuelUnits;
    const runMilliseconds = burned / (supply.burnLitresPerGameHour * POWER_UNITS.rate);
    expect(full + later).toBe(runMilliseconds * supply.outputWatts * POWER_UNITS.rate * store.chargeEfficiency);
    const drained = full - entry(power.snapshot(), first).storedMicrojoules;
    const delivered = load.demandWatts * POWER_UNITS.rate * gameMillisecondsAt(powerClock, 48 - 45);
    expect(drained * store.dischargeEfficiency).toBe(delivered);
  });

  it('waits for full batteries before restart without instantaneous on/off oscillation', () => {
    const defs: PowerDeviceDef[] = [
      { id: 'supply', kind: 'generator', priority: 0, outputWatts: 3, burnLitresPerGameHour: 1 },
      { id: 'store', kind: 'battery', priority: 0, capacityWh: 2, chargeEfficiency: 0.8, dischargeEfficiency: 0.9 },
      { id: 'load', kind: 'consumer', priority: 0, demandWatts: 4 },
    ];
    const state: PowerState = {
      atGameMilliseconds: 0,
      devices: [
        { ...deviceState('source', 'supply'), fuelUnits: 100 * POWER_UNITS.amount },
        deviceState('store'),
        deviceState('load'),
      ],
      links: ['store', 'load'].map((to, index) => ({ from: 'source', to, itemUid: index + 1 })),
    };
    const power = network(state, defs);
    const [supply, store] = defs;
    if (supply?.kind !== 'generator' || store?.kind !== 'battery') {
      throw new Error('Invalid test fixture');
    }
    const capacity = store.capacityWh * POWER_UNITS.amount;
    const fullAt =
      capacity / (supply.outputWatts * POWER_UNITS.rate * store.chargeEfficiency) / gameMillisecondsAt(powerClock, 1);
    expect(advance(power, fullAt / 2)).toEqual([]);
    expect(entry(power.snapshot(), 'store').storedMicrojoules).toBeLessThan(capacity);
    expect(entry(power.snapshot(), 'load').powered).toBe(false);
    const history = advance(power, 600);
    expect(history[0]!.at).toBe(fullAt);
    expect(history.some((change) => change.powered)).toBe(true);
    expect(history.some((change) => !change.powered)).toBe(true);
    for (let i = 1; i < history.length; i++) {
      expect(history[i]!.at).toBeGreaterThan(history[i - 1]!.at);
      expect(history[i]!.powered).not.toBe(history[i - 1]!.powered);
    }
    expect(advance(network(state, defs), 600)).toEqual(history);
  });

  it('integrates authored solar output at world day-phase boundaries', () => {
    const panel = powerDefinitions.find((def) => def.kind === 'solar')!;
    if (panel.kind !== 'solar') {
      throw new Error('Invalid test fixture');
    }
    const store = {
      id: 'store',
      kind: 'battery',
      priority: 0,
      capacityWh: 1000,
      chargeEfficiency: 0.8,
      dischargeEfficiency: 0.9,
    } as const;
    const day = dayPhaseAt(powerCycle, 0);
    const boundaries = [0, day.dawn, day.sunrise, day.sunset, day.nightfall, 86_400];
    let expected = 0;
    for (let i = 1; i < boundaries.length; i++) {
      const from = boundaries[i - 1]!;
      const to = boundaries[i]!;
      const { phase } = dayPhaseAt(powerCycle, (from + to) / 2);
      const milliseconds =
        Math.round(to * POWER_UNITS.gameMillisecondsPerGameSecond) -
        Math.round(from * POWER_UNITS.gameMillisecondsPerGameSecond);
      expected += milliseconds * panel.outputWatts[phase] * POWER_UNITS.rate * store.chargeEfficiency;
    }
    const power = network(
      {
        atGameMilliseconds: 0,
        devices: [deviceState('panel'), deviceState('store')],
        links: [{ from: 'panel', to: 'store', itemUid: 1 }],
      },
      [panel, store],
    );
    advance(power, 86_400 / powerClock.ratio);
    expect(entry(power.snapshot(), 'store').storedMicrojoules).toBe(expected);
  });

  it('burns fuel while idling and settles old networks before rewiring', () => {
    const power = network();
    power.setEnabled(simTimestamp(0), 'low', false);
    const initialFuel = entry(power.snapshot(), 'generator').fuelUnits;
    expect(power.rewire(simTimestamp(10), [])).toEqual([]);
    expect(entry(power.snapshot(), 'generator').fuelUnits).toBeLessThan(initialFuel);
    expect(entry(power.snapshot(), 'first').storedMicrojoules).toBeGreaterThan(
      entry(powerState(), 'first').storedMicrojoules,
    );
    const charge = entry(power.snapshot(), 'first').storedMicrojoules;
    advance(power, 20);
    expect(entry(power.snapshot(), 'first').storedMicrojoules).toBe(charge);
    const connected = network();
    const isolated = connected.rewire(
      simTimestamp(10),
      powerState().links.filter((link) => link.to !== 'low'),
    );
    expect(isolated.some((change) => change.consumerId === 'low' && change.at === 10 && !change.powered)).toBe(true);
  });

  it('round-trips all state and continues with the same resources and power history', () => {
    const original = network();
    original.setEnabled(rateChangeAt, 'high', true);
    advance(original, 71.2);
    const state = JSON.parse(JSON.stringify(original.snapshot())) as PowerState;
    const restored = network(state);
    expect(restored.snapshot()).toEqual(original.snapshot());
    expect(restored.refuel(simTimestamp(100), 'generator', 0.3)).toEqual(
      original.refuel(simTimestamp(100), 'generator', 0.3),
    );
    expect(advance(restored, 1900.7)).toEqual(advance(original, 1900.7));
    expect(restored.snapshot()).toEqual(original.snapshot());
    state.links.length = 0;
    state.devices[0]!.enabled = false;
    expect(restored.snapshot()).toEqual(original.snapshot());
  });

  it('rejects invalid saved resources, inexact content, unknown mechanisms and duplicated cable ownership', () => {
    const state = powerState();
    expect(() =>
      network({
        ...state,
        devices: state.devices.map((device) => (device.id === 'generator' ? { ...device, fuelUnits: -1 } : device)),
      }),
    ).toThrow();
    expect(() => network({ ...state, links: [...state.links, state.links[0]!] })).toThrow();
    expect(() =>
      network({
        ...state,
        devices: state.devices.map((device) => (device.id === 'generator' ? { ...device, type: 'missing' } : device)),
      }),
    ).toThrow();
    const invalid = powerDefinitions.map((def) =>
      def.kind === 'battery' && def.id === 'first' ? { ...def, chargeEfficiency: 0 } : def,
    );
    expect(validateContent({ source: 'power-fixture', data: { powerDevices: invalid } }).length).toBeGreaterThan(0);
    const inexact = powerDefinitions.map((def) => (def.kind === 'consumer' ? { ...def, demandWatts: 0.0001 } : def));
    expect(validateContent({ source: 'power-fixture', data: { powerDevices: inexact } }).length).toBeGreaterThan(0);
    expect(
      validateContent({
        source: 'power-fixture',
        data: { powerDevices: powerDefinitions, powerTuning: [powerTuning] },
      }),
    ).toEqual([]);
  });
});
