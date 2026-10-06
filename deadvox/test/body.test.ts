import { describe, expect, it } from 'vitest';
import { BODY_REGIONS, Body, type BodyTreatment } from '../src/core/body.ts';

describe('player body', () => {
  it('applies each approved region consequence to the struck body region', () => {
    const head = new Body();
    head.impact(1, 'head');
    expect(head.regionDamage.head).toBeGreaterThan(0);
    expect(head.consequences.sightImpaired).toBe(true);

    const torso = new Body();
    torso.impact(1, 'torso');
    expect(torso.consequences.aimSway).toBeGreaterThan(1);

    const arm = new Body();
    arm.impact(1, 'rightArm');
    expect(arm.consequences.swingSlowdown).toBeGreaterThan(1);

    const leg = new Body();
    leg.impact(1, 'rightLeg');
    expect(leg.consequences.movementSpeed).toBeLessThan(1);
    expect(BODY_REGIONS).toContain('rightLeg');
  });

  it('can cause unconsciousness while health remains above zero', () => {
    const body = new Body();
    body.impact(30, 'torso', { blunt: true });
    body.impact(30, 'torso', { blunt: true });

    expect(body.health).toBeGreaterThan(0);
    expect(body.unconscious).toBe(true);
    body.advance(1, true);
    expect(body.unconscious).toBe(false);
  });

  it('stops blood loss when a bleeding region is dressed', () => {
    const body = new Body();
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
    const body = new Body();
    body.impact(1, 'rightArm', { bleeding: true });
    body.advance(1, true);
    expect(body.wounds.rightArm?.infection).toBe('early');
    expect(body.canTreat('rightArm', 'antiseptic')).toBe(true);
    expect(body.canTreat('rightArm', 'antibiotics')).toBe(false);

    body.advance(1, true);
    expect(body.wounds.rightArm?.infection).toBe('advanced');
    expect(body.canTreat('rightArm', 'antiseptic')).toBe(false);
    expect(body.canTreat('rightArm', 'antibiotics')).toBe(true);
    expect(body.treat('rightArm', 'antibiotics')).toBe(true);
    expect(body.wounds.rightArm?.infection).toBe('resolved');
    expect(body.canTreat('rightArm', 'antibiotics')).toBe(false);
  });

  it('keeps an antiseptic-treated infection resolved through later body advances', () => {
    const body = new Body();
    body.impact(1, 'head', { bleeding: true });
    body.advance(1, true);
    expect(body.canTreat('head', 'antiseptic')).toBe(true);
    expect(body.treat('head', 'antiseptic')).toBe(true);
    body.advance(1, true);
    expect(body.wounds.head?.infection).toBe('resolved');
    expect(body.canTreat('head', 'antiseptic')).toBe(false);
  });

  it('uses each supported treatment only for its matching wound state', () => {
    const body = new Body();
    body.impact(1, 'head', { bleeding: true });
    const treatments: BodyTreatment[] = ['bandage', 'rag', 'antiseptic', 'antibiotics'];
    expect(treatments.filter((treatment) => body.canTreat('head', treatment))).toEqual(['bandage', 'rag']);
  });
});
