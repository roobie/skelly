import { describe, expect, it } from 'vitest';
import { build, generateValid } from '../src/core/generate.ts';
import { SEVERABLE_PARTS, severedBoneSet } from '../src/mob/dismember.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const shamblerBones = () => {
  const t = TEMPLATES.find((x) => x.name === 'shambler')!;
  const found = generateValid(t, 1)!;
  return build(found.genome).bones;
};

describe('SEVERABLE_PARTS', () => {
  it('lists exactly the first-slice parts: hand/forearm/upperArm each side, and head', () => {
    expect([...SEVERABLE_PARTS].sort()).toEqual(
      ['forearm.L', 'forearm.R', 'hand.L', 'hand.R', 'head', 'upperArm.L', 'upperArm.R'].sort(),
    );
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
