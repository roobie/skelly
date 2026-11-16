import { actorFigure } from '@skelly/engine/content';
import { burstBones, regionSeverableParts, remnantCuts } from '@skelly/engine/internal/core/boneTree.ts';
import { severedItem } from '@skelly/engine/internal/core/severedItem.ts';
import { typeWeightGrams } from '@skelly/engine/inventory';
import { type Bone, bodySkeleton, severedBoneSet } from '@skelly/engine/pose';
import type { BodyRegion } from '@skelly/engine/sim';
import { describe, expect, it } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';

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

  it('keeps the built acid dispositions consistent with its region map', () => {
    const registry = baseRegistry();
    const acid = [...registry.actors.values()].find(({ model }) => model === 'acid')!;
    const { body } = actorFigure(stackActorFigureFiles(registry), acid, acid.figureSeeds![0]!);
    const bones = bodySkeleton(body);
    const names: readonly BodyRegion[] = ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
    const regions = Object.fromEntries(names.map((name) => [name, body.regions?.[name] ?? []])) as Readonly<
      Partial<Record<BodyRegion, readonly string[]>>
    > as Readonly<Record<BodyRegion, readonly string[]>>;
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
  it('cutting a bone takes every descendant with it, and nothing above it', () => {
    expect(severedBoneSet(BONES, ['armA.L'])).toEqual(new Set(['armA.L', 'armB.L', 'paw.L']));
    const hidden = severedBoneSet(BONES, ['skull']);
    expect(hidden).toEqual(new Set(['skull', 'jaw']));
    expect(hidden.has('neck')).toBe(false);
  });

  it('a redundant cut inside an already-cut subtree is harmless', () => {
    expect(severedBoneSet(BONES, ['armA.R', 'paw.R'])).toEqual(new Set(['armA.R', 'armB.R', 'paw.R']));
    expect(severedBoneSet(BONES, ['paw.R', 'armA.R'])).toEqual(new Set(['armA.R', 'armB.R', 'paw.R']));
  });

  it('no cuts hides nothing', () => {
    expect(severedBoneSet(BONES, [])).toEqual(new Set());
  });
});

describe('severedItem', () => {
  it("a part cut after a part below it carries none of that part's mass, so the two weigh the whole part", () => {
    const registry = baseRegistry();
    const cut = [...registry.actors.values()].filter((type) => Object.keys(type.severedItems ?? {}).length > 0);
    const nested = cut.flatMap((type) => {
      const bones = bodySkeleton(actorFigure(stackActorFigureFiles(registry), type, type.figureSeeds![0]!).body);
      return Object.keys(type.severedItems!).flatMap((part) =>
        remnantCuts(bones, part)
          .filter((gone) => gone.length === 1)
          .map(([below]) => ({ type, bones, part, below: below! })),
      );
    });
    expect(nested.length).toBeGreaterThan(0);
    const grams = (item: string | undefined) => typeWeightGrams(registry, item!);
    for (const { type, bones, part, below } of nested) {
      const whole = severedItem(type.severedItems, bones, [part], part);
      const first = severedItem(type.severedItems, bones, [below], below);
      const after = severedItem(type.severedItems, bones, [below, part], part);
      expect(grams(after) + grams(first), `${type.id} ${part} cut after ${below}`).toBeCloseTo(grams(whole), 6);
    }
  });
});
