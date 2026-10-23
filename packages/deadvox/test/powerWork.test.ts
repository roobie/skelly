import { describe, expect, it } from 'vitest';
import { dayPhaseAt } from '../src/core/dayPhase.ts';
import { PowerNetwork, type PowerState, type PowerTransition, type PowerWork } from '../src/core/power.ts';
import type { PowerDeviceDef } from '../src/core/powerContent.ts';
import { simTimestamp } from '../src/core/time.ts';
import { deviceState, powerCycle } from './powerFixture.ts';

const definitions: PowerDeviceDef[] = [
  { id: 'generator', kind: 'generator', priority: 0, outputWatts: 6, burnLitresPerGameHour: 1 },
  { id: 'solar', kind: 'solar', priority: 0, outputWatts: { night: 0, dawn: 0, day: 6, dusk: 0 } },
  { id: 'store', kind: 'battery', priority: 0, capacityWh: 0.01, chargeEfficiency: 1, dischargeEfficiency: 1 },
  { id: 'load', kind: 'consumer', priority: 0, demandWatts: 4 },
];
const environment = (defs = definitions, start = 0) => ({
  registry: { powerDevices: new Map(defs.map((def) => [def.id, def])) },
  tuning: { id: 'fixture', tickSimSeconds: 0.037 },
  clock: { start, ratio: 1 },
  cycle: powerCycle,
});
const initial = (fuelUnits = 10_000_000, storedMicrojoules = 0): PowerState => ({
  atGameMilliseconds: 0,
  devices: [
    { ...deviceState('generator'), fuelUnits },
    deviceState('solar'),
    { ...deviceState('store'), storedMicrojoules },
    deviceState('b', 'load'),
    deviceState('a', 'load'),
  ],
  links: ['solar', 'store', 'a', 'b'].map((to, index) => ({ from: 'generator', to, itemUid: index + 1 })),
});

// Only this synthetic owner creates batches; production owns no prototype process state.
class Batches implements PowerWork {
  at: number;
  remaining: Record<string, number>;
  completions: { at: number; id: string }[];

  constructor(
    settledAt = 0,
    remaining: Record<string, number> = { a: 500, b: 500 },
    completions: { at: number; id: string }[] = [],
  ) {
    this.at = settledAt;
    this.remaining = remaining;
    this.completions = completions;
  }

  remainingGameMilliseconds(id: string) {
    return this.remaining[id];
  }

  settle(elapsed: number, served: readonly string[]) {
    this.at += elapsed;
    for (const id of [...served].sort()) {
      const before = this.remaining[id];
      if (before === undefined) {
        continue;
      }
      if (elapsed > before) {
        throw new Error('Power stepped past completion');
      }
      this.remaining[id] = before - elapsed;
      if (this.remaining[id] === 0) {
        this.completions.push({ at: this.at, id });
      }
    }
  }
}
const at = (milliseconds: number) => simTimestamp(milliseconds / 1000);
const store = (power: PowerNetwork) => power.snapshot().devices.find((device) => device.id === 'store')!;

describe('coupled power work', () => {
  it('releases completed demand at its deadline, serving the competitor and then charging storage', () => {
    const work = new Batches();
    const power = new PowerNetwork(environment(), initial(), work);
    const transitions = power.advance(at(2000));
    expect(work.completions).toEqual([
      { at: 500, id: 'a' },
      { at: 1000, id: 'b' },
    ]);
    expect(transitions).toContainEqual({ at: at(500), consumerId: 'b', powered: true });
    expect(store(power).storedMicrojoules).toBe(8_000_000);
    expect(
      power
        .snapshot()
        .devices.filter((device) => device.type === 'load')
        .every((device) => device.enabled),
    ).toBe(true);
  });

  it('settles tied completions together in stable identity order without transient re-admission', () => {
    const defs = definitions.map((def) => (def.kind === 'generator' ? { ...def, outputWatts: 10 } : def));
    const run = (partitioned: boolean) => {
      const work = new Batches();
      const power = new PowerNetwork(environment(defs), initial(), work);
      const transitions: PowerTransition[] = [];
      const ticksBefore = (target: number) => {
        if (partitioned) {
          while (work.at + 37 < target) {
            transitions.push(...power.tick());
          }
        }
      };
      ticksBefore(500);
      transitions.push(...power.setEnabled(at(500), 'a', false));
      ticksBefore(2000);
      transitions.push(...power.advance(at(2000)));
      expect(work.completions).toEqual([
        { at: 500, id: 'a' },
        { at: 500, id: 'b' },
      ]);
      expect(transitions.filter((change) => change.at === at(500))).toEqual([
        { at: at(500), consumerId: 'a', powered: false },
        { at: at(500), consumerId: 'b', powered: false },
      ]);
      expect(store(power).storedMicrojoules).toBe(16_000_000);
      return { state: power.snapshot(), work, transitions };
    };
    expect(run(true)).toEqual(run(false));
  });

  it('agrees exactly across depletion, solar, rewire, start/stop and a restored boundary', () => {
    const { sunrise } = dayPhaseAt(powerCycle, 0);
    const env = environment(definitions, Math.round(sunrise * 1000) / 1000 - 2);
    const run = (partitioned: boolean, restore: boolean) => {
      let work = new Batches(0, { a: 1500, b: 0 });
      let power = new PowerNetwork(env, initial(1_000_000, 100_000), work);
      const transitions: PowerTransition[] = [];
      const checkpoints: unknown[] = [];
      const advance = (target: number) => {
        if (partitioned) {
          while (work.at + 37 < target) {
            transitions.push(...power.tick());
          }
        }
        transitions.push(...power.advance(at(target)));
        expect(work.at).toBe(target);
        checkpoints.push({ power: power.snapshot(), remaining: { ...work.remaining } });
      };
      advance(100);
      work.remaining.b = 800;
      transitions.push(...power.advance(at(100)));
      advance(350);
      transitions.push(...power.setEnabled(at(350), 'a', false));
      advance(600);
      transitions.push(...power.setEnabled(at(600), 'a', true));
      advance(900);
      transitions.push(
        ...power.rewire(
          at(900),
          initial().links.filter((link) => link.to !== 'b'),
        ),
      );
      advance(1100);
      transitions.push(...power.rewire(at(1100), initial().links));
      const paused = { ...work.remaining };
      expect(paused.a).toBeGreaterThan(0);
      expect(paused.b).toBeGreaterThan(0);
      advance(2000);
      expect(work.remaining).toEqual(paused);
      if (restore) {
        const saved = JSON.parse(JSON.stringify({ power: power.snapshot(), work }));
        work = new Batches(saved.work.at, saved.work.remaining, saved.work.completions);
        power = new PowerNetwork(env, saved.power, work);
      }
      advance(6000);
      expect(work.completions.map((completion) => completion.id).sort()).toEqual(['a', 'b']);
      expect(power.snapshot().devices.find((device) => device.id === 'generator')!.fuelUnits).toBe(0);
      expect(transitions.some((change) => change.at > at(100) && change.at < at(2000) && !change.powered)).toBe(true);
      expect(transitions.some((change) => change.at >= at(2000) && change.powered)).toBe(true);
      expect(store(power).storedMicrojoules).toBeGreaterThan(0);
      return { state: power.snapshot(), work, transitions, checkpoints };
    };
    const caughtUp = run(false, false);
    expect(run(true, false)).toEqual(caughtUp);
    expect(run(false, true)).toEqual(caughtUp);
    expect(run(true, true)).toEqual(caughtUp);
  });

  it('rejects inexact and unsafe work deadlines rather than rounding or stalling', () => {
    for (const duration of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
      const power = new PowerNetwork(environment(), initial(), new Batches(0, { a: duration, b: 0 }));
      expect(() => power.advance(at(1))).toThrow('remaining duration');
    }
  });
});
