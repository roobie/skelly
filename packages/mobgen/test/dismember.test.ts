import { describe, expect, it } from 'vitest';
import { build, generateValid, planOf } from '../src/core/generate.ts';
import { acidTemplate } from '../src/mob/acidTemplate.ts';
import { burstBones, regionSeverableParts, severedBoneSet } from '../src/mob/dismember.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const shamblerBones = () => {
  const t = TEMPLATES.find((x) => x.name === 'shambler')!;
  const found = generateValid(t, 1)!;
  return build(found.genome).bones;
};

describe('regionSeverableParts', () => {
  it('keeps the shambler cuttable at its arms and head only', () => {
    const parts = regionSeverableParts(shamblerBones(), planOf('humanoid').regionBones!);
    expect(parts.leftArm).toEqual(['upperArm.L', 'forearm.L', 'hand.L']);
    expect(parts.head).toEqual(['head']);
    expect([...parts.torso, ...parts.leftLeg, ...parts.rightLeg]).toEqual([]);
  });

  it('follows the acid dispositions: limbs and skull cut, the sac bursts under the torso', () => {
    const { bones } = generateValid(acidTemplate, 1)!.realized.body;
    const regions = planOf('acid').regionBones!;
    const parts = regionSeverableParts(bones, regions);
    for (const region of ['head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'] as const) {
      expect(parts[region].length, region).toBeGreaterThan(0);
    }
    expect(parts.torso).toEqual([]);
    const burst = burstBones(bones);
    expect(burst.length).toBeGreaterThan(0);
    expect(burst.every((id) => regions.torso.includes(id))).toBe(true);
  });
});

describe('severedBoneSet', () => {
  it('cutting a hand hides only that hand', () => {
    const bones = shamblerBones();
    expect(severedBoneSet(bones, ['hand.L'])).toEqual(new Set(['hand.L']));
  });

  it('cutting a forearm takes its hand with it', () => {
    const bones = shamblerBones();
    expect(severedBoneSet(bones, ['forearm.R'])).toEqual(new Set(['forearm.R', 'hand.R']));
  });

  it('cutting an upperArm takes the whole arm (forearm + hand) with it', () => {
    const bones = shamblerBones();
    expect(severedBoneSet(bones, ['upperArm.L'])).toEqual(new Set(['upperArm.L', 'forearm.L', 'hand.L']));
  });

  it('cutting the head takes the jaw with it, but nothing below the neck', () => {
    const bones = shamblerBones();
    const hidden = severedBoneSet(bones, ['head']);
    expect(hidden).toEqual(new Set(['head', 'jaw']));
    expect(hidden.has('neck')).toBe(false);
    expect(hidden.has('chest')).toBe(false);
  });

  it('combines multiple independent cuts', () => {
    const bones = shamblerBones();
    const hidden = severedBoneSet(bones, ['upperArm.L', 'head']);
    expect(hidden).toEqual(new Set(['upperArm.L', 'forearm.L', 'hand.L', 'head', 'jaw']));
  });

  it('a redundant cut (both the arm and something already inside it) is harmless', () => {
    const bones = shamblerBones();
    expect(severedBoneSet(bones, ['upperArm.R', 'hand.R'])).toEqual(new Set(['upperArm.R', 'forearm.R', 'hand.R']));
  });

  it('no cuts hides nothing', () => {
    const bones = shamblerBones();
    expect(severedBoneSet(bones, [])).toEqual(new Set());
  });
});
