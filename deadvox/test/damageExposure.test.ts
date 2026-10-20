import { describe, expect, it } from 'vitest';
import { Body } from '../src/core/body.ts';
import { type DamageExposure, DamageExposures } from '../src/core/damageExposure.ts';
import type { BodyTuningDef } from '../src/core/schema.ts';
import { simSeconds } from '../src/core/time.ts';
import { BODY_TUNING_FIXTURE, Simulation } from './simulationFixture.ts';

const tuning: BodyTuningDef = {
  ...BODY_TUNING_FIXTURE,
  linger: { acid: { simSeconds: simSeconds(2) } },
  bleeding: {
    ...BODY_TUNING_FIXTURE.bleeding,
    tiers: BODY_TUNING_FIXTURE.bleeding.tiers.map((tier, index) => ({
      ...tier,
      minDamage: index * 2,
      chancePerDamage: { blunt: 0.03, cut: 0.03, pierce: 0.03, acid: 0.03 },
    })),
  },
};

const runContact = (step: number) => {
  let draws = 0;
  const exposures = new DamageExposures(tuning, () => {
    draws += 1;
    return (draws % 7) / 7;
  });
  const body = new Body(tuning);
  const apply = (amount: number, _cause: string, exposure: DamageExposure) => {
    const bleeding = body.bleedingTierForHit(exposure.damage, exposure.region, exposure.kind, exposure.roll);
    body.impact(amount, exposure.region, {
      kind: exposure.kind,
      ...(bleeding === undefined ? {} : { bleeding }),
    });
  };
  exposures.contact({ id: 'pool', rate: 3, cause: 'fixture burn', region: 'leftLeg', kind: 'acid' });
  for (let index = 0; index < Math.round(2 / step); index++) {
    exposures.advance(step, apply);
  }
  const contact = exposures.snapshotState().exposures[0]!;
  const beforeTail = body.health;
  exposures.leave('pool');
  for (let index = 0; index < Math.round(2 / step); index++) {
    exposures.advance(step, apply);
  }
  return {
    draws,
    beforeTail,
    refusal: exposures.refusal(),
    accumulated: contact.damage,
    health: body.health,
    bleeding: body.wounds.leftLeg?.bleeding,
    roll: contact.roll,
  };
};

describe('damage exposure', () => {
  it('retains one threshold draw and the same wound outcome at 1/60 and 1/30 steps', () => {
    const fine = runContact(1 / 60);
    const coarse = runContact(1 / 30);
    for (const result of [fine, coarse]) {
      expect(result.accumulated).toBeGreaterThan(0);
      expect(result.bleeding).toBeGreaterThan(0);
      expect(result.health).toBeLessThan(result.beforeTail);
      expect(result.refusal).toBeUndefined();
    }
    expect(fine.draws).toBe(2);
    expect(coarse.draws).toBe(fine.draws);
    expect(coarse.roll).toBe(fine.roll);
    expect(coarse.health).toBeCloseTo(fine.health, 10);
    expect(coarse.bleeding).toBe(fine.bleeding);
  });

  it('integrates a linear tail exactly even when a step straddles its content end', () => {
    const exposure = new DamageExposures(tuning, () => 0.5);
    const duration = tuning.linger.acid!.simSeconds;
    const rate = 3;
    let damage = 0;
    const apply = (amount: number) => {
      damage += amount;
    };
    exposure.contact({ id: 'pool', rate, cause: 'fixture burn', region: 'torso', kind: 'acid' });
    exposure.leave('pool');
    exposure.advance(duration / 4, apply);
    const first = damage;
    exposure.advance(duration / 4, apply);
    expect(damage - first).toBeLessThan(first);
    exposure.advance(duration, apply);
    expect(damage).toBeCloseTo((rate * duration) / 2, 12);
    expect(exposure.refusal()).toBeUndefined();
    exposure.advance(duration, apply);
    expect(damage).toBeCloseTo((rate * duration) / 2, 12);
  });

  it('a hit tail adds half its immediate damage without an independent rate value', () => {
    const exposures = new DamageExposures(tuning, () => 0.5);
    const damage = 4;
    const exposure = exposures.hit(damage, 'fixture glob', 'torso', { kind: 'acid' })!;
    const immediate = exposure.damage;
    let tail = 0;
    exposures.advance(tuning.linger.acid!.simSeconds, (amount) => {
      tail += amount;
    });
    expect(immediate).toBe(damage);
    expect(tail).toBeCloseTo(damage / 2, 12);
    expect(exposure.damage).toBeCloseTo(immediate + tail, 12);
    expect(exposures.refusal()).toBeUndefined();
  });

  it('re-entry before the tail ends keeps accumulated damage and its threshold', () => {
    const exposure = new DamageExposures(tuning, () => 0.4);
    exposure.contact({ id: 'pool', rate: 2, cause: 'fixture burn', region: 'leftLeg', kind: 'acid' });
    exposure.advance(0.5, () => undefined);
    exposure.leave('pool');
    const before = exposure.snapshotState();
    exposure.contact({ id: 'pool', rate: 2, cause: 'fixture burn', region: 'leftLeg', kind: 'acid' });
    const after = exposure.snapshotState();
    expect(after.nextId).toBe(before.nextId);
    expect(after.exposures[0]!.damage).toBeGreaterThan(0);
    expect(after.exposures[0]!.damage).toBe(before.exposures[0]!.damage);
    expect(after.exposures[0]!.roll).toBe(before.exposures[0]!.roll);
    // The refreshed record carries no key the new contact lacks, not even an undefined one.
    expect(after.exposures[0]!.sources).toStrictEqual([{ id: 'pool', rate: 2, cause: 'fixture burn' }]);
  });

  it('a glob hit starts a continuous tail and ending that kind stops further damage', () => {
    const sim = new Simulation({ seed: 1, bodyTuning: tuning });
    sim.hit(2, 'fixture glob', 'leftArm', { kind: 'acid' });
    sim.beginFrame();
    const events = sim.events.reader();
    const afterHit = sim.body.health;
    sim.frame(simSeconds(0.5));
    expect(sim.body.health).toBeLessThan(afterHit);
    expect(events.read().filter((event) => event.kind === 'interrupt')).toHaveLength(0);
    expect(sim.actions.startWait()).toBeDefined();
    sim.endExposure('acid');
    const afterWash = sim.body.health;
    sim.frame(simSeconds(0.25));
    expect(sim.body.health).toBe(afterWash);
    expect(sim.actions.startWait()).toBeUndefined();
  });

  it('continuous contact interrupts an existing action once and refuses restarting until it ends', () => {
    const sim = new Simulation({ seed: 1, bodyTuning: tuning });
    expect(sim.actions.startWait()).toBeUndefined();
    const events = sim.events.reader();
    sim.expose({ id: 'pool', rate: 1, cause: 'fixture burn', region: 'rightLeg', kind: 'acid' });
    expect(sim.actions.job?.stopped).toBe(true);
    expect(sim.actions.startWait()).toBeDefined();
    sim.frame(simSeconds(0.5));
    expect(events.read().filter((event) => event.kind === 'interrupt')).toHaveLength(0);
    sim.leaveExposure('pool');
    expect(sim.actions.startWait()).toBeDefined();
    sim.frame(simSeconds(tuning.linger.acid!.simSeconds));
    expect(sim.actionRefusal).toBeUndefined();
    expect(sim.actions.startWait()).toBeUndefined();
  });

  it('continuous exposure also stops a real-time action and refuses its resume', () => {
    const sim = new Simulation({ seed: 1, bodyTuning: tuning });
    let strikes = 0;
    sim.actions.forcing = {
      validate: () => undefined,
      strike: () => {
        strikes += 1;
      },
      finish: () => undefined,
    };
    expect(
      sim.actions.beginForcing(1, 2, { method: 'fixture', durationSimSeconds: 10, strikeIntervalSimSeconds: 1 }),
    ).toBeUndefined();
    sim.expose({ id: 'pool', rate: 1, cause: 'fixture burn', region: 'leftLeg', kind: 'acid' });
    expect(sim.actions.job?.stopped).toBe(true);
    expect(sim.actions.resume()).toBeDefined();
    sim.frame(simSeconds(2));
    expect(strikes).toBe(0);
    sim.endExposure('acid');
    expect(sim.actions.resume()).toBeUndefined();
    sim.frame(simSeconds(1));
    expect(strikes).toBeGreaterThan(0);
  });

  it('all localized damage reaches the shared wear boundary, including falls and a burn tail', () => {
    let wearDamage = 0;
    const sim = new Simulation({
      seed: 1,
      bodyTuning: tuning,
      onImpact: (amount) => {
        wearDamage += amount;
      },
    });
    for (const kind of ['blunt', 'cut', 'pierce', 'acid'] as const) {
      const before = wearDamage;
      sim.hit(1, 'fixture attack', 'leftArm', { kind });
      expect(wearDamage).toBeGreaterThan(before);
    }
    const beforeFall = wearDamage;
    sim.land(tuning.landing.safeSpeedMetresPerSimSecond + 1);
    expect(wearDamage).toBeGreaterThan(beforeFall);
    const beforeTail = wearDamage;
    sim.frame(simSeconds(0.25));
    expect(wearDamage).toBeGreaterThan(beforeTail);
    expect(wearDamage).toBeCloseTo(100 - sim.body.health, 10);
  });

  it('a blow opens the highest tier whose damage and threshold it reaches', () => {
    const body = new Body(tuning);
    for (const [index, tier] of tuning.bleeding.tiers.entries()) {
      const damage = Math.max(1, tier.minDamage);
      const higher = tuning.bleeding.tiers[index + 1];
      expect(higher === undefined || damage < higher.minDamage).toBe(true);
      expect(body.bleedingTierForHit(damage, 'leftLeg', 'cut', 0)).toBe(index);
    }
  });

  it('a snapshot inside the activation tick preserves the first exposure tick and continuation', () => {
    const live = new Simulation({ seed: 2, bodyTuning: tuning });
    let saved: ReturnType<Simulation['snapshotState']> | undefined;
    const registerContact = (sim: Simulation, capture: () => void) => {
      sim.scheduler.register({
        id: 'fixture-contact',
        rate: 8,
        tick: () => {
          sim.expose({ id: 'pool', rate: 1, cause: 'fixture burn', region: 'leftLeg', kind: 'acid' });
          capture();
        },
      });
    };
    registerContact(live, () => {
      saved ??= live.snapshotState();
    });
    live.frame(simSeconds(0.125));
    if (saved === undefined) {
      throw new Error('Contact did not capture its activation');
    }
    expect(saved.exposures.exposures).toHaveLength(1);
    const restored = new Simulation({ seed: 2, bodyTuning: tuning });
    registerContact(restored, () => undefined);
    restored.restoreState(saved);
    restored.paused = false;
    for (const sim of [live, restored]) {
      sim.frame(simSeconds(0.01));
    }
    expect(live.scheduler.tickCounts().get('damage-exposure')).toBe(0);
    expect(restored.body.health).toBe(live.body.health);
    expect(restored.snapshotState()).toEqual(live.snapshotState());
    for (const sim of [live, restored]) {
      sim.frame(simSeconds(0.1));
    }
    expect(live.body.health).toBeLessThan(saved.body.health);
    expect(restored.snapshotState()).toEqual(live.snapshotState());
  });

  it('restores active contact, its threshold and taper to the same continuation', () => {
    const sim = new Simulation({ seed: 2, bodyTuning: tuning });
    sim.hit(2, 'fixture glob', 'leftArm', { kind: 'acid' });
    sim.frame(simSeconds(0.25));
    const saved = JSON.parse(JSON.stringify(sim.snapshotState()));
    const restored = new Simulation({ seed: 2, bodyTuning: tuning });
    restored.restoreState(saved);
    restored.paused = false;
    for (const runtime of [sim, restored]) {
      runtime.frame(simSeconds(0.5));
    }
    expect(restored.snapshotState()).toEqual(sim.snapshotState());
    expect(restored.exposures.snapshotState().exposures).toHaveLength(1);
  });
});
