import { generateValid, planOf } from '@mobgen/core/generate.ts';
import { acidTemplate } from '@mobgen/mob/acidTemplate.ts';
import { describe, expect, it } from 'vitest';
import type { BodyRegion } from '../src/core/body.ts';
import type { Bone } from '../src/core/bones.ts';
import { burstBones, regionSeverableParts, severedBoneSet } from '../src/core/boneTree.ts';

const bone = (id: string, parent: string | null, disposition?: Bone['disposition']): Bone => ({
  id,
  parent,
  head: [0, 0, 0],
  tail: [0, 1, 0],
  ...(disposition ? { disposition } : {}),
});

// A hand-authored, parents-first skeleton: a fixed trunk, a two-segment cuttable arm per side,
// a cuttable leg on one side, a skull with a dependent jaw, and a sac that bursts.
const BONES: readonly Bone[] = [
  bone('trunk', null, 'fixed'),
  bone('sac', 'trunk', 'burst'),
  bone('neck', 'trunk', 'fixed'),
  bone('skull', 'neck', 'sever'),
  bone('jaw', 'skull'),
  bone('armA.L', 'trunk', 'sever'),
  bone('armB.L', 'armA.L', 'sever'),
  bone('paw.L', 'armB.L'),
  bone('armA.R', 'trunk', 'sever'),
  bone('armB.R', 'armA.R', 'sever'),
  bone('paw.R', 'armB.R'),
  bone('leg.L', 'trunk', 'sever'),
  bone('leg.R', 'trunk', 'fixed'),
];

const REGIONS: Readonly<Record<BodyRegion, readonly string[]>> = {
  head: ['neck', 'skull', 'jaw'],
  torso: ['trunk', 'sac'],
  leftArm: ['armA.L', 'armB.L', 'paw.L'],
  rightArm: ['armA.R', 'armB.R', 'paw.R'],
  leftLeg: ['leg.L'],
  rightLeg: ['leg.R'],
};

describe('regionSeverableParts', () => {
  it('lists only sever-disposition bones per region, parents first', () => {
    expect(regionSeverableParts(BONES, REGIONS)).toEqual({
      head: ['skull'],
      torso: [],
      leftArm: ['armA.L', 'armB.L'],
      rightArm: ['armA.R', 'armB.R'],
      leftLeg: ['leg.L'],
      rightLeg: [],
    });
  });

  it('lists burst-disposition bones apart from cuttable ones', () => {
    expect(burstBones(BONES)).toEqual(['sac']);
  });

  it('keeps the authored acid dispositions consistent with its region map', () => {
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
  it('cutting a leaf hides only that leaf', () => {
    expect(severedBoneSet(BONES, ['paw.L'])).toEqual(new Set(['paw.L']));
  });

  it('cutting a bone takes every descendant with it, and nothing above it', () => {
    expect(severedBoneSet(BONES, ['armA.L'])).toEqual(new Set(['armA.L', 'armB.L', 'paw.L']));
    const hidden = severedBoneSet(BONES, ['skull']);
    expect(hidden).toEqual(new Set(['skull', 'jaw']));
    expect(hidden.has('neck')).toBe(false);
  });

  it('combines multiple independent cuts', () => {
    expect(severedBoneSet(BONES, ['armA.L', 'skull'])).toEqual(new Set(['armA.L', 'armB.L', 'paw.L', 'skull', 'jaw']));
  });

  it('a redundant cut inside an already-cut subtree is harmless', () => {
    expect(severedBoneSet(BONES, ['armA.R', 'paw.R'])).toEqual(new Set(['armA.R', 'armB.R', 'paw.R']));
    expect(severedBoneSet(BONES, ['paw.R', 'armA.R'])).toEqual(new Set(['armA.R', 'armB.R', 'paw.R']));
  });

  it('no cuts hides nothing', () => {
    expect(severedBoneSet(BONES, [])).toEqual(new Set());
  });
});
