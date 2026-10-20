import { describe, expect, it } from 'vitest';
import { BODY_REGIONS, Body, type BodyRegion } from '../src/core/body.ts';
import { SECONDS_PER_HOUR } from '../src/core/clock.ts';
import { type Needs, stepNeeds } from '../src/core/needs.ts';
import { Rng } from '../src/core/random.ts';
import type { TreatmentDef } from '../src/core/schema.ts';
import { simSeconds } from '../src/core/time.ts';
import { BODY_TUNING_FIXTURE, fixtureTier } from './simulationFixture.ts';

const recoveryNeeds = (calories = 80): Needs => ({
  calories,
  hydration: 80,
  fatigue: 10,
  stamina: 100,
  staminaRegenDelayRemainingSimSeconds: 0,
});
const steadyNeedRates = { calories: 0, hydration: 0, fatigue: 0 } as const;

// The test's own treatments. STRONG closes every fixture band even at the lowest roll of the spread.
const STRONG: TreatmentDef = { bleeding: 100 };
const WEAK: TreatmentDef = { bleeding: 1 };
const ANTISEPTIC: TreatmentDef = { infection: { stages: ['early'], chance: 1 } };
const ANTIBIOTICS: TreatmentDef = { infection: { stages: ['advanced'], chance: 1 } };
/** A roll that multiplies a treatment's strength by exactly 1 within the fixture's spread of 0.5 to 1.5. */
const evenRoll = () => 0.5;

const { tiers } = BODY_TUNING_FIXTURE.bleeding;
const MINOR = fixtureTier('minor');
const SERIOUS = fixtureTier('serious');
const CRITICAL = fixtureTier('critical');

describe('player body', () => {
  it('recovers each damaged region with health when needs are met', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(1, 'head');
    body.impact(1, 'torso');
    body.impact(1, 'leftArm');
    body.impact(1, 'leftLeg');

    stepNeeds(recoveryNeeds(), body, 100, { rates: steadyNeedRates });

    expect(body.regionDamage).toMatchObject({ head: 0, torso: 0, leftArm: 0, leftLeg: 0 });
    expect(body.consequences).toEqual({
      sightImpaired: false,
      aimSway: 1,
      swingSlowdown: 1,
      movementSpeed: 1,
    });
  });

  it('continues regional recovery after health is full and bleeding stops', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(1, 'rightArm', { bleeding: SERIOUS, infectionAtRisk: false });
    const damageWhileBleeding = body.regionDamage.rightArm;

    stepNeeds(recoveryNeeds(), body, 100, { rates: steadyNeedRates });
    expect(body.health).toBe(100);
    expect(body.regionDamage.rightArm).toBe(damageWhileBleeding);
    expect(body.treat('rightArm', STRONG, evenRoll)).toBe(true);

    stepNeeds(recoveryNeeds(), body, 1, { rates: steadyNeedRates });

    expect(body.regionDamage.rightArm).toBeLessThan(damageWhileBleeding);
    expect(body.health).toBe(100);
  });

  it('pauses only a bleeding region while other damage recovers', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(1, 'head');
    body.impact(1, 'rightArm', { bleeding: SERIOUS, infectionAtRisk: false });
    const headDamage = body.regionDamage.head;
    const bleedingDamage = body.regionDamage.rightArm;

    stepNeeds(recoveryNeeds(), body, 1, { rates: steadyNeedRates });

    expect(body.regionDamage.head).toBeLessThan(headDamage);
    expect(body.regionDamage.rightArm).toBe(bleedingDamage);
  });

  it('pauses only an infected region through early and advanced infection', () => {
    for (const infectionTime of [
      BODY_TUNING_FIXTURE.infectionOnsetGameHours,
      BODY_TUNING_FIXTURE.infectionOnsetGameHours + BODY_TUNING_FIXTURE.antisepticWindowGameHours,
    ]) {
      const body = new Body(BODY_TUNING_FIXTURE);
      body.impact(1, 'head');
      body.impact(1, 'rightArm', { bleeding: SERIOUS });
      body.advance(0, true, infectionTime);
      expect(body.treat('rightArm', STRONG, evenRoll)).toBe(true);
      const headDamage = body.regionDamage.head;
      const infectedDamage = body.regionDamage.rightArm;

      stepNeeds(recoveryNeeds(), body, 1, { rates: steadyNeedRates });

      expect(body.regionDamage.head).toBeLessThan(headDamage);
      expect(body.regionDamage.rightArm).toBe(infectedDamage);
    }

    const resolved = new Body(BODY_TUNING_FIXTURE);
    resolved.impact(1, 'rightArm', { bleeding: SERIOUS });
    resolved.advance(0, true, BODY_TUNING_FIXTURE.infectionOnsetGameHours);
    expect(resolved.treat('rightArm', STRONG, evenRoll)).toBe(true);
    expect(resolved.treat('rightArm', ANTISEPTIC, evenRoll)).toBe(true);
    const resolvedDamage = resolved.regionDamage.rightArm;

    stepNeeds(recoveryNeeds(), resolved, 1, { rates: steadyNeedRates });

    expect(resolved.regionDamage.rightArm).toBeLessThan(resolvedDamage);
  });

  it('uses the damage-immune health rate for regional recovery', () => {
    const healing = new Body(BODY_TUNING_FIXTURE);
    const protectedFromLoss = new Body(BODY_TUNING_FIXTURE);
    healing.impact(1, 'head');
    protectedFromLoss.impact(1, 'head');
    const initialHealth = healing.health;
    const initialDamage = healing.regionDamage.head;
    const protectedHealth = protectedFromLoss.health;
    const protectedDamage = protectedFromLoss.regionDamage.head;

    stepNeeds(recoveryNeeds(), healing, 1, { damageImmune: true, rates: steadyNeedRates });
    stepNeeds(recoveryNeeds(0), protectedFromLoss, 1, { damageImmune: true, rates: steadyNeedRates });

    expect(healing.health).toBeGreaterThan(initialHealth);
    expect(healing.regionDamage.head).toBeLessThan(initialDamage);
    expect(protectedFromLoss.health).toBe(protectedHealth);
    expect(protectedFromLoss.regionDamage.head).toBe(protectedDamage);
  });

  it('stops recovering at infection onset inside a needs step', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(1, 'rightArm', { bleeding: SERIOUS });
    expect(body.treat('rightArm', STRONG, evenRoll)).toBe(true);
    body.advance(0, true, BODY_TUNING_FIXTURE.infectionOnsetGameHours * 0.9);
    const initialDamage = body.regionDamage.rightArm;

    stepNeeds(recoveryNeeds(), body, 1, { rates: steadyNeedRates });
    body.advance(0, true, SECONDS_PER_HOUR);

    expect(body.wounds.rightArm?.infection).toBe('advanced');
    expect(body.regionDamage.rightArm).toBeLessThan(initialDamage);
    expect(body.regionDamage.rightArm).toBeGreaterThan(0);
  });

  it('uses elapsed time when infection starts in a later health segment', () => {
    const onsetHours = BODY_TUNING_FIXTURE.infectionOnsetGameHours / SECONDS_PER_HOUR;
    const probeHours = onsetHours / 100;
    const probe = new Body(BODY_TUNING_FIXTURE);
    probe.damageHealth(1);
    const probeHealth = probe.health;
    stepNeeds(recoveryNeeds(), probe, probeHours, { rates: steadyNeedRates });
    const recoveryRate = (probe.health - probeHealth) / probeHours;

    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(10, 'rightArm', { bleeding: SERIOUS });
    body.restoreHealth(10);
    expect(body.treat('rightArm', STRONG, evenRoll)).toBe(true);
    const initialDamage = body.regionDamage.rightArm;
    body.damageHealth((recoveryRate * onsetHours) / 2);

    stepNeeds(recoveryNeeds(), body, onsetHours * 2, { rates: steadyNeedRates });

    expect(body.health).toBe(100);
    expect(initialDamage - body.regionDamage.rightArm).toBeCloseTo(recoveryRate * onsetHours, 8);
  });

  it('does not recover any region while needs prevent health recovery', () => {
    const control = new Body(BODY_TUNING_FIXTURE);
    const unmet = new Body(BODY_TUNING_FIXTURE);
    control.impact(1, 'head');
    unmet.impact(1, 'head');
    const controlDamage = control.regionDamage.head;
    const unmetDamage = unmet.regionDamage.head;

    stepNeeds(recoveryNeeds(), control, 1, { rates: steadyNeedRates });
    stepNeeds(recoveryNeeds(0), unmet, 1, { rates: steadyNeedRates });

    expect(control.regionDamage.head).toBeLessThan(controlDamage);
    expect(unmet.regionDamage.head).toBe(unmetDamage);
  });

  it('applies each approved region consequence to the struck body region', () => {
    const head = new Body(BODY_TUNING_FIXTURE);
    head.impact(1, 'head');
    expect(head.regionDamage.head).toBeGreaterThan(0);
    expect(head.consequences.sightImpaired).toBe(true);

    const torso = new Body(BODY_TUNING_FIXTURE);
    torso.impact(1, 'torso');
    expect(torso.consequences.aimSway).toBeGreaterThan(1);

    const arm = new Body(BODY_TUNING_FIXTURE);
    arm.impact(1, 'rightArm');
    expect(arm.consequences.swingSlowdown).toBeGreaterThan(1);

    const leg = new Body(BODY_TUNING_FIXTURE);
    leg.impact(1, 'rightLeg');
    expect(leg.consequences.movementSpeed).toBeLessThan(1);
    expect(BODY_REGIONS).toContain('rightLeg');
  });

  it("can cause unconsciousness from a kind's shock while health remains above zero", () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(30, 'torso', { kind: 'blunt' });
    body.impact(30, 'torso', { kind: 'blunt' });

    expect(body.health).toBeGreaterThan(0);
    expect(body.unconscious).toBe(true);
    expect(body.actionRefusal).toBeDefined();
    body.advance(BODY_TUNING_FIXTURE.knockoutSimSeconds);
    expect(
      () =>
        new Body(
          { ...BODY_TUNING_FIXTURE, knockoutSimSeconds: simSeconds(BODY_TUNING_FIXTURE.knockoutSimSeconds / 2) },
          body.snapshotState(),
        ),
    ).not.toThrow();
    expect(body.unconscious).toBe(false);
    expect(body.actionRefusal).toBeUndefined();
    expect(body.shock).toBeGreaterThan(0);
    expect(body.shock).toBeLessThan(100);
  });

  it("loses blood at each bleeding tier's rate, summed across the bleeding regions", () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    const bloodBefore = body.blood;
    body.impact(0, 'torso', { bleeding: SERIOUS });
    body.impact(0, 'leftLeg', { bleeding: CRITICAL });
    const seconds = 10;

    body.advance(seconds);

    expect(bloodBefore - body.blood).toBeCloseTo(
      (tiers[SERIOUS]!.bloodLossPerSimSecond + tiers[CRITICAL]!.bloodLossPerSimSecond) * seconds,
      9,
    );
  });

  it('recovers blood only while no wound bleeds', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(0, 'torso', { bleeding: SERIOUS });
    body.impact(0, 'leftArm', { bleeding: SERIOUS });
    body.advance(100);
    const bloodWhileBleeding = body.blood;

    expect(body.treat('torso', STRONG, evenRoll)).toBe(true);
    body.advance(100);
    const bloodWithOneBleeding = body.blood;
    expect(bloodWithOneBleeding).toBeLessThan(bloodWhileBleeding);

    expect(body.treat('leftArm', STRONG, evenRoll)).toBe(true);
    body.advance(100);
    expect(body.worstBleedingTier).toBeUndefined();
    expect(body.blood).toBeGreaterThan(bloodWithOneBleeding);
  });

  it("closes every wound by itself, band by band at each tier's rate, only while the body recovers", () => {
    const wounded = (): Body => {
      const body = new Body(BODY_TUNING_FIXTURE);
      body.impact(0, 'torso', { bleeding: MINOR, infectionAtRisk: false });
      body.impact(0, 'leftArm', { bleeding: SERIOUS, infectionAtRisk: false });
      return body;
    };
    const minorClose = tiers[MINOR]!.closeSimSeconds;
    const seriousClose = tiers[SERIOUS]!.closeSimSeconds;

    const recovering = wounded();
    recovering.advance(minorClose, false, minorClose, { recovering: true });
    expect(recovering.bleedingTier('torso')).toBeUndefined();
    expect(recovering.bleedingTier('leftArm')).toBe(tiers[SERIOUS]);
    expect(recovering.wounds.leftArm!.bleeding).toBeLessThan(SERIOUS + 1);
    recovering.advance(seriousClose + minorClose, false, seriousClose + minorClose, { recovering: true });
    expect(recovering.worstBleedingTier).toBeUndefined();

    const notRecovering = wounded();
    notRecovering.advance(seriousClose + minorClose, false, seriousClose + minorClose, { recovering: false });
    expect(notRecovering.wounds.torso!.bleeding).toBe(MINOR + 1);
    expect(notRecovering.wounds.leftArm!.bleeding).toBe(SERIOUS + 1);
  });

  it('keeps an infected wound from closing by itself', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(0, 'torso', { bleeding: MINOR, infectionAtRisk: true });
    body.advance(0, true, BODY_TUNING_FIXTURE.infectionOnsetGameHours);
    expect(body.wounds.torso?.infection).toBe('early');

    body.advance(tiers[MINOR]!.closeSimSeconds, true, 0, { recovering: true });

    expect(body.wounds.torso!.bleeding).toBe(MINOR + 1);
  });

  it("spends a treatment's strength band by band, carrying what's left into the next band down", () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(0, 'leftLeg', { bleeding: CRITICAL });
    const halfOfSerious = tiers[SERIOUS]!.treatmentEffort / 2;

    expect(body.treat('leftLeg', { bleeding: tiers[CRITICAL]!.treatmentEffort + halfOfSerious }, evenRoll)).toBe(true);

    expect(body.wounds.leftLeg!.bleeding).toBeCloseTo(SERIOUS + 0.5, 9);
    expect(body.bleedingTier('leftLeg')).toBe(tiers[SERIOUS]);
  });

  it("rolls each application's effect within the body's treatment spread", () => {
    const { min, max } = BODY_TUNING_FIXTURE.treatmentSpread;
    const effect = (roll: number): number => {
      const body = new Body(BODY_TUNING_FIXTURE);
      body.impact(0, 'leftLeg', { bleeding: CRITICAL });
      body.treat('leftLeg', WEAK, () => roll);
      return CRITICAL + 1 - body.wounds.leftLeg!.bleeding;
    };
    const cost = tiers[CRITICAL]!.treatmentEffort;

    expect(effect(0)).toBeCloseTo((WEAK.bleeding! * min) / cost, 9);
    expect(effect(1 - Number.EPSILON)).toBeCloseTo((WEAK.bleeding! * max) / cost, 9);
  });

  it('stacks applications: a weak treatment applied again and again stops even the worst wound', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(0, 'leftLeg', { bleeding: CRITICAL });
    const rolls = Rng.stream(1, 'body-test-treatment');
    const totalEffort = tiers.reduce((sum, tier) => sum + tier.treatmentEffort, 0);
    const mostApplications = Math.ceil(totalEffort / (WEAK.bleeding! * BODY_TUNING_FIXTURE.treatmentSpread.min));

    const severities = [body.wounds.leftLeg!.bleeding];
    while (body.wounds.leftLeg!.bleeding > 0 && severities.length <= mostApplications) {
      body.treat('leftLeg', WEAK, () => rolls.next());
      severities.push(body.wounds.leftLeg!.bleeding);
    }

    expect(body.wounds.leftLeg!.bleeding).toBe(0);
    expect(severities.every((severity, i) => i === 0 || severity < severities[i - 1]!)).toBe(true);
  });

  it('passes treatment quality through the modifier point', () => {
    const plain = new Body(BODY_TUNING_FIXTURE);
    const modified = new Body(BODY_TUNING_FIXTURE, undefined, [{ effect: 'treatment.quality', multiply: 100 }]);
    for (const body of [plain, modified]) {
      body.impact(0, 'leftLeg', { bleeding: CRITICAL });
      body.treat('leftLeg', WEAK, evenRoll);
    }

    expect(plain.bleedingTier('leftLeg')).toBe(tiers[CRITICAL]);
    expect(modified.worstBleedingTier).toBeUndefined();
  });

  it("opens the tier a roll lands in among those the hit's damage and region allow, or none", () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    const critical = tiers[CRITICAL]!;
    const limb = 'leftLeg';
    const torso = 'torso';
    const allPierce = tiers.reduce((sum, tier) => sum + tier.chancePerDamage.pierce * critical.minDamage, 0);

    expect(body.bleedingTierForHit(critical.minDamage, limb, 'pierce', 0)).toBe(CRITICAL);
    expect(body.bleedingTierForHit(critical.minDamage, torso, 'pierce', 0)).toBe(CRITICAL);
    expect(body.bleedingTierForHit(critical.minDamage / 2, torso, 'pierce', 0)).not.toBe(CRITICAL);
    expect(body.bleedingTierForHit(tiers[SERIOUS]!.minDamage / 2, limb, 'pierce', 0)).toBe(MINOR);
    expect(body.bleedingTierForHit(critical.minDamage, limb, 'pierce', allPierce)).toBeUndefined();
  });

  it('uses zero and fractional region factors to scale a fixture tier chance', () => {
    const tuningWithFactor = (region: BodyRegion, factor: number) => ({
      ...BODY_TUNING_FIXTURE,
      bleeding: {
        ...BODY_TUNING_FIXTURE.bleeding,
        tiers: tiers.map((tier) =>
          tier.id === 'critical' ? { ...tier, regionFactor: { ...tier.regionFactor, [region]: factor } } : tier,
        ),
      },
    });
    const withFactor = (region: BodyRegion, factor: number) => new Body(tuningWithFactor(region, factor));
    const critical = tiers[CRITICAL]!;
    const boundaryRoll = critical.chancePerDamage.pierce * critical.minDamage * 0.75;
    const zeroTorso = withFactor('torso', 0);
    const halfTorso = withFactor('torso', 0.5);
    const fullTorso = withFactor('torso', 1);

    for (const roll of [0, boundaryRoll, 0.999]) {
      expect(zeroTorso.bleedingTierForHit(critical.minDamage, 'torso', 'pierce', roll)).not.toBe(CRITICAL);
    }
    expect(fullTorso.bleedingTierForHit(critical.minDamage, 'torso', 'pierce', boundaryRoll)).toBe(CRITICAL);
    expect(halfTorso.bleedingTierForHit(critical.minDamage, 'torso', 'pierce', boundaryRoll)).not.toBe(CRITICAL);
  });

  it('keeps a zero-factor region excluded when bleeding chance has an additive modifier', () => {
    const critical = tiers[CRITICAL]!;
    const tuning = {
      ...BODY_TUNING_FIXTURE,
      bleeding: {
        ...BODY_TUNING_FIXTURE.bleeding,
        tiers: tiers.map((tier) =>
          tier.id === 'critical' ? { ...tier, regionFactor: { ...tier.regionFactor, head: 0 } } : tier,
        ),
      },
    };
    const body = new Body(tuning, undefined, [{ effect: 'bleeding.chance', add: 1 }]);

    expect(body.bleedingTierForHit(critical.minDamage, 'head', 'pierce', 0)).not.toBe(CRITICAL);
  });

  it('lets a blunt hit bleed, just far less often than a piercing one', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    const damage = tiers[CRITICAL]!.minDamage;
    const rolls = Rng.stream(1, 'body-test-kind');
    const bleeds = { blunt: 0, pierce: 0 };
    for (let i = 0; i < 2000; i++) {
      const roll = rolls.next();
      for (const kind of ['blunt', 'pierce'] as const) {
        bleeds[kind] += body.bleedingTierForHit(damage, 'leftLeg', kind, roll) === undefined ? 0 : 1;
      }
    }

    expect(bleeds.blunt).toBeGreaterThan(0);
    expect(bleeds.blunt).toBeLessThan(bleeds.pierce / 2);
  });

  it('requires the later-stage treatment only after infection progresses', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(1, 'rightArm', { bleeding: SERIOUS, infectionAtRisk: true });
    body.advance(BODY_TUNING_FIXTURE.infectionOnsetGameHours, true);
    expect(body.wounds.rightArm?.infection).toBe('early');
    expect(body.canTreat('rightArm', ANTISEPTIC)).toBe(true);
    expect(body.canTreat('rightArm', ANTIBIOTICS)).toBe(false);

    body.advance(BODY_TUNING_FIXTURE.antisepticWindowGameHours, true);
    expect(body.wounds.rightArm?.infection).toBe('advanced');
    expect(body.canTreat('rightArm', ANTISEPTIC)).toBe(false);
    expect(body.canTreat('rightArm', ANTIBIOTICS)).toBe(true);
    expect(body.treat('rightArm', ANTIBIOTICS, evenRoll)).toBe(true);
    expect(body.wounds.rightArm?.infection).toBe('resolved');
    expect(body.canTreat('rightArm', ANTIBIOTICS)).toBe(false);
  });

  it("resolves an infection only when the treatment's chance comes up", () => {
    const halfChance: TreatmentDef = { infection: { stages: ['early'], chance: 0.5 } };
    const outcome = (roll: number): string | undefined => {
      const body = new Body(BODY_TUNING_FIXTURE);
      body.impact(1, 'head', { bleeding: SERIOUS, infectionAtRisk: true });
      body.advance(BODY_TUNING_FIXTURE.infectionOnsetGameHours, true);
      body.treat('head', halfChance, () => roll);
      return body.wounds.head?.infection;
    };

    expect(outcome(0.4)).toBe('resolved');
    expect(outcome(0.6)).toBe('early');
  });

  it('keeps an antiseptic-treated infection resolved through later body advances', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(1, 'head', { bleeding: SERIOUS, infectionAtRisk: true });
    body.advance(BODY_TUNING_FIXTURE.infectionOnsetGameHours, true);
    expect(body.canTreat('head', ANTISEPTIC)).toBe(true);
    expect(body.treat('head', ANTISEPTIC, evenRoll)).toBe(true);
    body.advance(1, true);
    expect(body.wounds.head?.infection).toBe('resolved');
    expect(body.canTreat('head', ANTISEPTIC)).toBe(false);
  });

  it('applies a treatment only to the wound state its content fields treat', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(1, 'head', { bleeding: SERIOUS });
    const treatments = [STRONG, WEAK, ANTISEPTIC, ANTIBIOTICS];
    expect(treatments.filter((treatment) => body.canTreat('head', treatment))).toEqual([STRONG, WEAK]);
  });
});
