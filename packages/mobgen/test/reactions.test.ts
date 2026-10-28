import { describe, expect, it } from 'vitest';
import { generateValid } from '../src/core/generate.ts';
import { IDENTITY_M } from '../src/core/math.ts';
import type { Pose } from '../src/core/pose.ts';
import { attackPose, LUNGE_GRAB } from '../src/mob/attack.ts';
import { createGaitCache, footRestExtents, INITIAL_CLOCK, walkPose } from '../src/mob/gait.ts';
import type { HumanoidParams } from '../src/mob/humanoid.ts';
import { flinchClipFor, flinchPose, HIT_FLINCH } from '../src/mob/reactions.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const actorOf = () => {
  const found = generateValid(TEMPLATES.find((t) => t.name === 'shambler')!, 1)!;
  return {
    bones: found.realized.body.bones,
    extents: footRestExtents(found.realized.body.bones, found.realized.voxels),
    params: found.genome.params as HumanoidParams,
    seed: found.genome.seed,
    cache: createGaitCache(),
  };
};
const maxPoseDiff = (a: Pose, b: Pose): number => {
  let worst = Math.max(...a.root.map((v, i) => Math.abs(v - b.root[i]!)));
  for (const id of new Set([...Object.keys(a.rotations), ...Object.keys(b.rotations)])) {
    const ra = a.rotations[id] ?? IDENTITY_M;
    const rb = b.rotations[id] ?? IDENTITY_M;
    worst = Math.max(worst, ...ra.map((v, i) => Math.abs(v - rb[i]!)));
  }
  return worst;
};

describe('flinchPose', () => {
  it.each([undefined, 'unknown-fixture-clip', 'toString'])(
    'refuses an unsupported flinch selection: %s',
    (flinchClip) => {
      expect(() => flinchClipFor({ name: 'fixture', ...(flinchClip === undefined ? {} : { flinchClip }) })).toThrow();
    },
  );
  it('matches the base pose at both clip endpoints with or without a side', () => {
    const actor = actorOf();
    const base = walkPose(actor, INITIAL_CLOCK, 0.8);
    for (const side of [undefined, 1]) {
      const params = side === undefined ? {} : { side };
      expect(maxPoseDiff(flinchPose(actor, 0, base, params), base)).toBe(0);
      expect(maxPoseDiff(flinchPose(actor, HIT_FLINCH.duration, base, params), base)).toBe(0);
    }
  });
  it('is repeatable and actually changes the base during the clip', () => {
    const actor = actorOf();
    const base = walkPose(actor, INITIAL_CLOCK, 0.8);
    const a = flinchPose(actor, 0.1, base, { side: 0.5 });
    expect(maxPoseDiff(a, base)).toBeGreaterThan(0);
    expect(maxPoseDiff(a, flinchPose(actor, 0.1, base, { side: 0.5 }))).toBe(0);
  });
  it('layers over an attack without replacing it at the endpoints', () => {
    const actor = actorOf();
    const base = attackPose(actor, LUNGE_GRAB, 0.3, walkPose(actor, INITIAL_CLOCK, 0.8));
    expect(maxPoseDiff(flinchPose(actor, 0.05, base, { side: -1 }), base)).toBeGreaterThan(0);
    expect(maxPoseDiff(flinchPose(actor, 0, base, { side: -1 }), base)).toBe(0);
    expect(maxPoseDiff(flinchPose(actor, HIT_FLINCH.duration, base, { side: -1 }), base)).toBe(0);
  });
  it('mirrors the sideways snap and drops it for side zero', () => {
    const actor = actorOf();
    const base = walkPose(actor, INITIAL_CLOCK, 0);
    const head = (side: number) => flinchPose(actor, 0.08, base, { side }).rotations.head![1]!;
    expect(head(1)).not.toBeCloseTo(0, 6);
    expect(head(1)).toBeCloseTo(-head(-1), 9);
    expect(head(0)).toBeCloseTo(0, 9);
  });
});
