import { describe, expect, it } from 'vitest';
import { BODY_REGIONS, Body, type BodyTreatment, bodyRegionForHitArea } from '../src/core/body.ts';
import { SECONDS_PER_HOUR } from '../src/core/clock.ts';
import { type Needs, stepNeeds } from '../src/core/needs.ts';
import { simSeconds } from '../src/core/time.ts';
import { BODY_TUNING_FIXTURE } from './simulationFixture.ts';

const recoveryNeeds = (calories = 80): Needs => ({
  calories,
  hydration: 80,
  fatigue: 10,
  stamina: 100,
  staminaRegenDelayRemainingSimSeconds: 0,
});
const steadyNeedRates = { calories: 0, hydration: 0, fatigue: 0 } as const;

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
    body.impact(1, 'rightArm', { bleeding: true, infectionAtRisk: false });
    const damageWhileBleeding = body.regionDamage.rightArm;

    stepNeeds(recoveryNeeds(), body, 100, { rates: steadyNeedRates });
    expect(body.health).toBe(100);
    expect(body.regionDamage.rightArm).toBe(damageWhileBleeding);
    expect(body.treat('rightArm', 'bandage')).toBe(true);

    stepNeeds(recoveryNeeds(), body, 1, { rates: steadyNeedRates });

    expect(body.regionDamage.rightArm).toBeLessThan(damageWhileBleeding);
    expect(body.health).toBe(100);
  });

  it('pauses only a bleeding region while other damage recovers', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(1, 'head');
    body.impact(1, 'rightArm', { bleeding: true, infectionAtRisk: false });
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
      body.impact(1, 'rightArm', { bleeding: true });
      body.advance(0, true, infectionTime);
      expect(body.treat('rightArm', 'bandage')).toBe(true);
      const headDamage = body.regionDamage.head;
      const infectedDamage = body.regionDamage.rightArm;

      stepNeeds(recoveryNeeds(), body, 1, { rates: steadyNeedRates });

      expect(body.regionDamage.head).toBeLessThan(headDamage);
      expect(body.regionDamage.rightArm).toBe(infectedDamage);
    }

    const resolved = new Body(BODY_TUNING_FIXTURE);
    resolved.impact(1, 'rightArm', { bleeding: true });
    resolved.advance(0, true, BODY_TUNING_FIXTURE.infectionOnsetGameHours);
    expect(resolved.treat('rightArm', 'bandage')).toBe(true);
    expect(resolved.treat('rightArm', 'antiseptic')).toBe(true);
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
    body.impact(1, 'rightArm', { bleeding: true });
    expect(body.treat('rightArm', 'bandage')).toBe(true);
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
    body.impact(10, 'rightArm', { bleeding: true });
    body.restoreHealth(10);
    expect(body.treat('rightArm', 'bandage')).toBe(true);
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

  it('can cause unconsciousness while health remains above zero', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(30, 'torso', { blunt: true });
    body.impact(30, 'torso', { blunt: true });

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

  it('stops blood loss when a bleeding region is dressed', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    const bloodBefore = body.blood;
    body.impact(1, 'torso', { bleeding: true });
    body.advance(100);
    const bloodAfterBleeding = body.blood;
    expect(bloodAfterBleeding).toBeLessThan(bloodBefore);

    expect(body.treat('torso', 'bandage')).toBe(true);
    body.advance(100);
    expect(body.blood).toBeGreaterThan(bloodAfterBleeding);
    expect(body.wounds.torso?.bleeding).toBe(false);
  });

  it('requires antibiotics only after infection progresses', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(1, 'rightArm', { bleeding: true, infectionAtRisk: true });
    body.advance(BODY_TUNING_FIXTURE.infectionOnsetGameHours, true);
    expect(body.wounds.rightArm?.infection).toBe('early');
    expect(body.canTreat('rightArm', 'antiseptic')).toBe(true);
    expect(body.canTreat('rightArm', 'antibiotics')).toBe(false);

    body.advance(BODY_TUNING_FIXTURE.antisepticWindowGameHours, true);
    expect(body.wounds.rightArm?.infection).toBe('advanced');
    expect(body.canTreat('rightArm', 'antiseptic')).toBe(false);
    expect(body.canTreat('rightArm', 'antibiotics')).toBe(true);
    expect(body.treat('rightArm', 'antibiotics')).toBe(true);
    expect(body.wounds.rightArm?.infection).toBe('resolved');
    expect(body.canTreat('rightArm', 'antibiotics')).toBe(false);
  });

  it('keeps an antiseptic-treated infection resolved through later body advances', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(1, 'head', { bleeding: true, infectionAtRisk: true });
    body.advance(BODY_TUNING_FIXTURE.infectionOnsetGameHours, true);
    expect(body.canTreat('head', 'antiseptic')).toBe(true);
    expect(body.treat('head', 'antiseptic')).toBe(true);
    body.advance(1, true);
    expect(body.wounds.head?.infection).toBe('resolved');
    expect(body.canTreat('head', 'antiseptic')).toBe(false);
  });

  it('uses each supported treatment only for its matching wound state', () => {
    const body = new Body(BODY_TUNING_FIXTURE);
    body.impact(1, 'head', { bleeding: true });
    const treatments: BodyTreatment[] = ['bandage', 'rag', 'antiseptic', 'antibiotics'];
    expect(treatments.filter((treatment) => body.canTreat('head', treatment))).toEqual(['bandage', 'rag']);
  });

  it('routes a leg-area hit to either selected leg instead of biasing left', () => {
    for (const side of ['leftLeg', 'rightLeg'] as const) {
      const body = new Body(BODY_TUNING_FIXTURE);
      const region = bodyRegionForHitArea('legs', side);
      body.impact(1, region);
      expect(body.regionDamage[side]).toBeGreaterThan(0);
    }
  });
});
