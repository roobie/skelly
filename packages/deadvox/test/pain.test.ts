import { describe, expect, it } from 'vitest';
import { Body } from '../src/core/body.ts';
import type { Modifier } from '../src/core/modifiers.ts';
import type { AnalgesicDef } from '../src/core/pain.ts';
import { gameMinutes, simSeconds } from '../src/core/time.ts';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';
import { BODY_TUNING_FIXTURE, fixtureTier } from './simulationFixture.ts';

// The test's own painkillers: two items sharing one group, and one of another group.
const PILL: AnalgesicDef = {
  group: 'otc',
  takeSimSeconds: simSeconds(1),
  reliefPerDose: 3,
  maxRelief: 5,
  onsetGameMinutes: gameMinutes(30),
  peakGameMinutes: gameMinutes(120),
  fadeGameMinutes: gameMinutes(60),
};
const ASPIRIN: AnalgesicDef = { ...PILL, reliefPerDose: 2 };
const OPIOID: AnalgesicDef = { ...PILL, group: 'opioid', reliefPerDose: 4, maxRelief: 4, vignette: 0.5 };
// The same relief without the vignette, so felt pain matches the opioid's.
const { vignette: _, ...CLEAR_OPIOID } = OPIOID;
const ANALGESICS: Record<string, AnalgesicDef> = {
  pill: PILL,
  aspirin: ASPIRIN,
  opioid: OPIOID,
  clearOpioid: CLEAR_OPIOID,
};
const lookup = (item: string): AnalgesicDef | undefined => ANALGESICS[item];
const bodyWith = (modifiers: readonly Modifier[] = []): Body =>
  new Body(BODY_TUNING_FIXTURE, undefined, modifiers, lookup);
const AT_PEAK = PILL.onsetGameMinutes + PILL.peakGameMinutes / 2;
const NOT_A_PAINKILLER = /painkiller/;

/** Advances only Game time, so acute pain and wounds stand still while doses age. */
const ageBy = (body: Body, gameSeconds: number): void => {
  body.advance(0, true, gameSeconds);
};

/** A body whose background pain alone outweighs any relief in these tests, with no acute pain. */
const steadilyHurt = (): Body => {
  const body = bodyWith();
  body.impact(60, 'torso');
  return body;
};

describe('pain', () => {
  it('raises acute pain on an impact of a damage kind, none on a kindless one, and fades it alike in one step or many', () => {
    const kindless = bodyWith();
    kindless.impact(10, 'leftArm');
    const cut = bodyWith();
    cut.impact(10, 'leftArm', { kind: 'cut' });
    expect(cut.pain.felt).toBeGreaterThan(kindless.pain.felt);

    const background = kindless.pain.felt;
    kindless.advance(30);
    expect(kindless.pain.felt).toBe(background);

    const stepped = bodyWith();
    stepped.impact(10, 'leftArm', { kind: 'cut' });
    cut.advance(30);
    for (let step = 0; step < 300; step++) {
      stepped.advance(0.1);
    }
    expect(cut.pain.felt).toBeCloseTo(stepped.pain.felt, 9);
    expect(cut.pain.felt).toBeGreaterThan(background);
    cut.advance(3600);
    expect(cut.pain.felt).toBeCloseTo(background, 9);
  });

  it('reads background pain from the injuries, so it falls as a region heals and a wound stops bleeding', () => {
    const body = bodyWith();
    body.impact(30, 'leftLeg', { bleeding: fixtureTier('serious') });
    const injured = body.pain.felt;
    expect(injured).toBeGreaterThan(0);

    // Dressed and cleaned, so the region is free to heal.
    const dressed = body.snapshotState();
    const stopped = new Body(BODY_TUNING_FIXTURE, {
      ...dressed,
      wounds: { ...dressed.wounds, leftLeg: { ...dressed.wounds.leftLeg!, bleeding: 0, infectionAtRisk: false } },
    });
    expect(stopped.pain.felt).toBeLessThan(injured);

    stopped.recoverRegionDamage(10, 1, 0);
    expect(stopped.pain.felt).toBeLessThan(injured);
    stopped.recoverRegionDamage(10, 10, 0);
    expect(stopped.pain.felt).toBe(0);
  });

  it("follows a dose's relief up through its onset, holds it at the peak, and drops the dose once it has faded", () => {
    const body = steadilyHurt();
    const before = body.pain.felt;
    body.takeAnalgesic('pill');
    const relief = (): number => before - body.pain.felt;

    ageBy(body, PILL.onsetGameMinutes / 2);
    const rising = relief();
    expect(rising).toBeGreaterThan(0);
    ageBy(body, PILL.onsetGameMinutes / 2 + PILL.peakGameMinutes / 4);
    const peak = relief();
    expect(peak).toBeGreaterThan(rising);
    ageBy(body, PILL.peakGameMinutes / 2);
    expect(relief()).toBe(peak);

    ageBy(body, PILL.peakGameMinutes / 4 + PILL.fadeGameMinutes);
    expect(relief()).toBe(0);
    expect(body.snapshotState().pain.doses).toEqual([]);
  });

  it("caps one group's repeat doses, whichever item they come from, while another group's dose adds on top", () => {
    const reliefAtPeak = (items: readonly string[]): number => {
      const body = steadilyHurt();
      const before = body.pain.felt;
      for (const item of items) {
        body.takeAnalgesic(item);
      }
      ageBy(body, AT_PEAK);
      return before - body.pain.felt;
    };

    const one = reliefAtPeak(['pill']);
    const two = reliefAtPeak(['pill', 'pill']);
    expect(two).toBeGreaterThan(one);
    expect(reliefAtPeak(['pill', 'pill', 'aspirin'])).toBe(two);
    expect(two).toBeLessThanOrEqual(PILL.maxRelief);
    expect(reliefAtPeak(['pill', 'pill', 'opioid'])).toBeGreaterThan(two);
  });

  it("eases pain's own effects with a painkiller and leaves health, regions, wounds and consequences as they were", () => {
    // Hurt past the first tier but short of the effect caps, so relief shows in the effects.
    const hurt = (): Body => {
      const body = bodyWith();
      body.impact(5, 'torso', { kind: 'cut', bleeding: fixtureTier('serious') });
      body.impact(3, 'rightArm', { kind: 'blunt' });
      return body;
    };
    const untreated = hurt();
    const treated = hurt();
    treated.takeAnalgesic('opioid');
    ageBy(untreated, AT_PEAK);
    ageBy(treated, AT_PEAK);

    expect(treated.pain.effects.aimSway).toBeLessThan(untreated.pain.effects.aimSway);
    expect(treated.pain.effects.handlingSlowdown).toBeLessThan(untreated.pain.effects.handlingSlowdown);
    expect(treated.consequences).toEqual(untreated.consequences);
    expect(treated.health).toBe(untreated.health);
    expect(treated.regionDamage).toEqual(untreated.regionDamage);
    expect(treated.wounds).toEqual(untreated.wounds);
  });

  it("follows an opioid's relief with its vignette through the fade, leaves pain as it was, and gives none for the common one", () => {
    const common = steadilyHurt();
    common.takeAnalgesic('pill');
    ageBy(common, AT_PEAK);
    expect(common.drugVignette).toBe(0);

    const drugged = steadilyHurt();
    const clear = steadilyHurt();
    drugged.takeAnalgesic('opioid');
    clear.takeAnalgesic('clearOpioid');
    ageBy(drugged, AT_PEAK);
    ageBy(clear, AT_PEAK);
    const peak = drugged.drugVignette;
    expect(peak).toBeGreaterThan(0);
    expect(drugged.pain).toEqual(clear.pain);

    ageBy(drugged, PILL.peakGameMinutes / 2 + OPIOID.fadeGameMinutes / 2);
    expect(drugged.drugVignette).toBeGreaterThan(0);
    expect(drugged.drugVignette).toBeLessThan(peak);
    ageBy(drugged, OPIOID.fadeGameMinutes);
    expect(drugged.drugVignette).toBe(0);
  });

  it('changes nothing below the first tier and something from it on', () => {
    const { tiers, knockoutAt } = BODY_TUNING_FIXTURE.pain;
    const below = bodyWith();
    below.impact((tiers[0]!.from * knockoutAt) / 4, 'torso', { kind: 'cut' });
    expect(below.pain.ratio).toBeGreaterThan(0);
    expect(below.pain.tier).toBeUndefined();
    expect(below.pain.effects).toEqual({ aimSway: 1, handlingSlowdown: 1 });

    const above = bodyWith();
    above.impact(tiers[0]!.from * knockoutAt, 'torso', { kind: 'cut' });
    expect(above.pain.tier).toBeDefined();
    expect(above.pain.effects.aimSway).toBeGreaterThan(1);
  });

  it('empties shock at the pain knockout threshold without doing so below it', () => {
    const { knockoutAt, perDamage, perRegionDamage, regionWeight } = BODY_TUNING_FIXTURE.pain;
    const painPerDamage = perDamage.cut * regionWeight.torso + perRegionDamage;
    const atThreshold = bodyWith();
    atThreshold.impact(knockoutAt / painPerDamage, 'torso', { kind: 'cut' });
    expect(atThreshold.pain.felt).toBeCloseTo(knockoutAt, 9);
    expect(atThreshold.shock).toBe(0);
    expect(atThreshold.unconscious).toBe(true);
    atThreshold.advance(BODY_TUNING_FIXTURE.knockoutSimSeconds);
    expect(atThreshold.unconscious).toBe(false);

    const belowThreshold = bodyWith();
    belowThreshold.impact((knockoutAt - 1) / painPerDamage, 'torso', { kind: 'cut' });
    expect(belowThreshold.pain.felt).toBeLessThan(knockoutAt);
    expect(belowThreshold.shock).toBeGreaterThan(0);
    expect(belowThreshold.unconscious).toBe(false);
  });

  it('lowers the tier and effects of the same pain when a modifier raises the knockout threshold', () => {
    const hurt = (modifiers: readonly Modifier[]): Body => {
      const body = bodyWith(modifiers);
      body.impact(20, 'torso', { kind: 'cut' });
      return body;
    };
    const plain = hurt([]);
    const tough = hurt([{ effect: 'body.painKnockoutAt', multiply: 4 }]);
    expect(tough.pain.felt).toBe(plain.pain.felt);
    expect(plain.pain.tier).toBeDefined();
    expect(tough.pain.tier ?? -1).toBeLessThan(plain.pain.tier!);
    expect(tough.pain.effects.aimSway).toBeLessThan(plain.pain.effects.aimSway);
  });

  it('accepts zero-length phases: no onset is at the peak on taking, no fade ends at once, and a dose lasting no time is not kept', () => {
    const zeroPhased = (id: string, peakGameMinutes: number) => ({
      id,
      name: id,
      category: 'medical',
      weight: 1,
      size: [1, 1],
      analgesic: {
        takeSimSeconds: 1,
        reliefPerDose: 3,
        maxRelief: 3,
        onsetGameMinutes: 0,
        peakGameMinutes,
        fadeGameMinutes: 0,
      },
    });
    const { registry, issues } = buildRegistry([
      { source: 'zero-phase-fixture', data: { items: [zeroPhased('instant', 30), zeroPhased('nothing', 0)] } },
    ]);
    expect(issues).toEqual([]);
    const instant = registry.items.get('instant')!.analgesic!;
    const body = new Body(BODY_TUNING_FIXTURE, undefined, [], (item) => registry.items.get(item)?.analgesic);
    body.impact(60, 'torso');
    const before = body.pain.felt;
    expect(before).toBeGreaterThan(instant.reliefPerDose);

    body.takeAnalgesic('instant');
    expect(before - body.pain.felt).toBeCloseTo(instant.reliefPerDose, 9);
    ageBy(body, instant.peakGameMinutes / 2);
    expect(before - body.pain.felt).toBeCloseTo(instant.reliefPerDose, 9);
    ageBy(body, instant.peakGameMinutes / 2);
    expect(body.pain.felt).toBe(before);
    expect(body.snapshotState().pain.doses).toEqual([]);

    body.takeAnalgesic('nothing');
    expect(body.pain.felt).toBe(before);
    expect(body.snapshotState().pain.doses).toEqual([]);
  });

  it('restores acute pain and doses from a snapshot, and refuses a dose of an item that is no painkiller', () => {
    const body = steadilyHurt();
    body.impact(10, 'head', { kind: 'pierce' });
    body.takeAnalgesic('pill');
    ageBy(body, PILL.onsetGameMinutes / 2);
    const snapshot = body.snapshotState();
    const restored = bodyWith();
    restored.restoreState(snapshot);
    expect(restored.pain).toEqual(body.pain);

    const forged = { ...snapshot, pain: { acute: 0, doses: [{ item: 'bandage', elapsedGameSeconds: 0 }] } };
    expect(() => bodyWith().restoreState(forged)).toThrow(NOT_A_PAINKILLER);
    expect(() => bodyWith().takeAnalgesic('bandage')).toThrow(NOT_A_PAINKILLER);
  });
});
