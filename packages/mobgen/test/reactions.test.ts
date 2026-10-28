// Tests for src/mob/reactions.ts: the hit flinch (an AttackClip through the same interpolator as an
// attack) and the death fall (whole-body root pitch, the clip format can't express).

import { describe, expect, it } from 'vitest';
import type { Bone } from '../src/core/body.ts';
import { build, generateValid } from '../src/core/generate.ts';
import { applyPoint, cross, dot, IDENTITY_M, length, mulMV, sub, type Transform } from '../src/core/math.ts';
import { boneTransforms, type Pose } from '../src/core/pose.ts';
import { voxelize } from '../src/core/voxelize.ts';
import { attackPose, LUNGE_GRAB } from '../src/mob/attack.ts';
import deathContent from '../src/mob/deathPoses.json' with { type: 'json' };
import {
  bodyRestExtents,
  corners,
  createGaitCache,
  footRestExtents,
  INITIAL_CLOCK,
  walkPose,
} from '../src/mob/gait.ts';
import type { HumanoidParams } from '../src/mob/humanoid.ts';
import { DEATH_FALL_DURATION, deathPose, flinchClipFor, flinchPose, HIT_FLINCH } from '../src/mob/reactions.ts';
import { HUMANOID_TEMPLATES as TEMPLATES } from '../src/mob/templates.ts';

const setup = (name: string, seed = 1) => {
  const t = TEMPLATES.find((x) => x.name === name)!;
  const found = generateValid(t, seed)!;
  const body = build(found.genome);
  const voxels = voxelize(body, found.genome.voxelSize, found.genome.seed);
  const extents = footRestExtents(body.bones, voxels);
  const bodyExtents = bodyRestExtents(body.bones, voxels);
  return {
    body,
    voxels,
    extents,
    bodyExtents,
    params: found.genome.params as HumanoidParams,
    seed: found.genome.seed,
  };
};

const walkActorOf = (found: ReturnType<typeof setup>) => ({
  bones: found.body.bones,
  extents: found.extents,
  params: found.params,
  seed: found.seed,
  cache: createGaitCache(),
});

const deathActorOf = (found: ReturnType<typeof setup>) => ({ ...walkActorOf(found), bodyExtents: found.bodyExtents });

/** Worst absolute difference between two poses — root and every bone's rotation matrix, treating a
 * missing entry on either side as identity. Same helper shape as attack.test.ts's maxPoseDiff. */
const maxPoseDiff = (a: Pose, b: Pose): number => {
  let worst = Math.abs(a.root[1] - b.root[1]) + Math.abs(a.root[0] - b.root[0]) + Math.abs(a.root[2] - b.root[2]);
  for (const boneId of new Set([...Object.keys(a.rotations), ...Object.keys(b.rotations)])) {
    const ra = a.rotations[boneId] ?? IDENTITY_M;
    const rb = b.rotations[boneId] ?? IDENTITY_M;
    for (let i = 0; i < 9; i++) {
      worst = Math.max(worst, Math.abs(ra[i]! - rb[i]!));
    }
  }
  return worst;
};

describe('flinchPose', () => {
  it.each([undefined, 'unknown-fixture-clip', 'toString'])(
    'refuses an unsupported template flinch selection: %s',
    (flinchClip) => {
      expect(() => flinchClipFor({ name: 'fixture', ...(flinchClip === undefined ? {} : { flinchClip }) })).toThrow();
    },
  );

  it('matches the base pose exactly at t=0 and at the end of the clip (zero-slope endpoints)', () => {
    const found = setup('shambler');
    const actor = walkActorOf(found);
    const walkBase = walkPose(actor, INITIAL_CLOCK, 0.8);
    expect(maxPoseDiff(flinchPose(actor, 0, walkBase, { side: 1 }), walkBase)).toBe(0);
    expect(maxPoseDiff(flinchPose(actor, HIT_FLINCH.duration, walkBase, { side: 1 }), walkBase)).toBe(0);
    // Also true with no side given (the default, straight-back-only snap).
    expect(maxPoseDiff(flinchPose(actor, 0, walkBase), walkBase)).toBe(0);
    expect(maxPoseDiff(flinchPose(actor, HIT_FLINCH.duration, walkBase), walkBase)).toBe(0);
  });

  it('is deterministic: the same inputs give the exact same pose', () => {
    const found = setup('shambler');
    const actor = walkActorOf(found);
    const walkBase = walkPose(actor, INITIAL_CLOCK, 0.8);
    const a = flinchPose(actor, 0.1, walkBase, { side: 0.5 });
    const b = flinchPose(actor, 0.1, walkBase, { side: 0.5 });
    expect(Object.keys(a.rotations).length).toBeGreaterThan(0);
    expect(maxPoseDiff(a, walkBase)).toBeGreaterThan(0);
    expect(maxPoseDiff(a, b)).toBe(0);
  });

  it('layers on top of an attack pose too, not just a walk pose (mid-attack flinch)', () => {
    const found = setup('shambler');
    const actor = walkActorOf(found);
    const walkBase = walkPose(actor, INITIAL_CLOCK, 0.8);
    const attacking = attackPose(actor, LUNGE_GRAB, 0.3, walkBase);
    const flinched = flinchPose(actor, 0.05, attacking, { side: -1 });
    // Differs from the pure attack pose (the flinch actually did something)...
    expect(maxPoseDiff(flinched, attacking)).toBeGreaterThan(0);
    // ...but matches it exactly at the flinch's own endpoints, same as layering over a walk.
    expect(maxPoseDiff(flinchPose(actor, 0, attacking, { side: -1 }), attacking)).toBe(0);
  });

  it('side mirrors the sideways (Z) snap: side and -side are exact mirror images, side=0 drops it', () => {
    const found = setup('shambler');
    const actor = walkActorOf(found);
    const walkBase = walkPose(actor, INITIAL_CLOCK, 0);
    const right = flinchPose(actor, 0.08, walkBase, { side: 1 });
    const left = flinchPose(actor, 0.08, walkBase, { side: -1 });
    const straight = flinchPose(actor, 0.08, walkBase, { side: 0 });
    // head's Z-axis contribution: mirrored between side=1 and side=-1, and zero at side=0. Read it back
    // via boneTransforms rather than assuming rotation-matrix layout.
    const headZAt = (pose: Pose): number => {
      const r = pose.rotations.head!;
      // rotZ(z) has this matrix's [0] and [1] as (cos z, -sin z) — small-angle-free-of-doubt check: the
      // matrices for side=+1 and side=-1 should be transposes of one another for the Z-only difference,
      // and side=0 should collapse to whatever the pure spine/chest/head X-only snap gives.
      return r[1]!; // sin-bearing entry: 0 only when the Z component is 0.
    };
    expect(headZAt(right)).not.toBeCloseTo(0, 6);
    expect(headZAt(right)).toBeCloseTo(-headZAt(left), 9);
    expect(headZAt(straight)).toBeCloseTo(0, 9);
  });
});

const restingSurfaceClearances = (actor: ReturnType<typeof deathActorOf>, pose: Pose): Record<string, number> => {
  const transforms = boneTransforms(actor.bones, pose);
  return Object.fromEntries(
    ['pelvis', 'chest', 'hand.L', 'hand.R', 'foot.L', 'foot.R'].map((id) => [
      id,
      Math.min(...corners(actor.bodyExtents.get(id)!).map((point) => applyPoint(transforms.get(id)!, point)[1])) /
        actor.params.height,
    ]),
  );
};

const extentsOverlap = (
  actor: ReturnType<typeof deathActorOf>,
  transforms: ReadonlyMap<string, Transform>,
  leftId: string,
  rightId: string,
): boolean => {
  const box = (id: string) => {
    const transform = transforms.get(id)!;
    return {
      points: corners(actor.bodyExtents.get(id)!).map((point) => applyPoint(transform, point)),
      axes: (
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ] as const
      ).map((axis) => mulMV(transform.r, axis)),
    };
  };
  const left = box(leftId);
  const right = box(rightId);
  const axes = [...left.axes, ...right.axes, ...left.axes.flatMap((a) => right.axes.map((b) => cross(a, b)))];
  return axes
    .filter((axis) => length(axis) > 1e-10)
    .every((axis) => {
      const a = left.points.map((point) => dot(point, axis));
      const b = right.points.map((point) => dot(point, axis));
      return Math.max(...a) > Math.min(...b) && Math.max(...b) > Math.min(...a);
    });
};

describe('deathPose', () => {
  it.for(TEMPLATES.flatMap((template) => deathContent.poses.map((entry) => [template.name, entry.id] as const)))(
    '%s %s rests with supported limbs and separated feet after walking or attacking',
    async ([name, poseId], { annotate }) => {
      const found = setup(name);
      const actor = deathActorOf(found);
      const walking = walkPose(actor, { ...INITIAL_CLOCK, progress: 0.3 }, 1);
      const attacking = attackPose(actor, LUNGE_GRAB, 0.35, walking);
      const clearances = restingSurfaceClearances(
        actor,
        deathPose(actor, walking, DEATH_FALL_DURATION, { direction: -1, poseId }),
      );
      await annotate(`Surface clearance / body height: ${JSON.stringify(clearances)}`);
      for (const [id, clearance] of Object.entries(clearances)) {
        expect.soft(clearance, `${poseId}: ${id} rests near the floor`).toBeLessThan(0.04);
        expect.soft(clearance, `${poseId}: ${id} does not sink`).toBeGreaterThanOrEqual(0);
      }
      for (const base of [walking, attacking]) {
        const pose = deathPose(actor, base, DEATH_FALL_DURATION, { direction: -1, poseId });
        const transforms = boneTransforms(actor.bones, pose);
        expect.soft(extentsOverlap(actor, transforms, 'foot.L', 'foot.R'), `${poseId}: feet overlap`).toBe(false);
        for (const bone of actor.bones) {
          const transform = transforms.get(bone.id)!;
          expect(
            length(sub(applyPoint(transform, bone.tail), applyPoint(transform, bone.head))),
            `${poseId}: ${bone.id} length`,
          ).toBeCloseTo(length(sub(bone.tail, bone.head)), 9);
          const lowest = Math.min(
            ...corners(actor.bodyExtents.get(bone.id)!).map((point) => applyPoint(transform, point)[1]),
          );
          expect.soft(lowest, `${poseId}: ${bone.id} does not sink`).toBeGreaterThanOrEqual(0);
          if (deathContent.settleBones.includes(bone.id)) {
            expect.soft(lowest, `${poseId}: ${bone.id} support`).toBeLessThan(actor.params.height * 0.1);
          }
          for (const end of [bone.head, bone.tail]) {
            expect
              .soft(applyPoint(transform, end)[1], `${poseId}: ${bone.id}`)
              .toBeLessThan(actor.params.height * 0.25);
          }
        }
      }
    },
  );
  it('refuses unknown resting pose selections', () => {
    const actor = deathActorOf(setup('shambler'));
    const base = walkPose(actor, INITIAL_CLOCK, 0);
    expect(() =>
      deathPose(actor, base, DEATH_FALL_DURATION, { direction: 1, poseId: 'unknown-fixture-pose' }),
    ).toThrow();
  });

  it('matches the base pose exactly at t=0', () => {
    const found = setup('shambler');
    const actor = deathActorOf(found);
    const walkBase = walkPose(walkActorOf(found), INITIAL_CLOCK, 0);
    for (const direction of [1, -1] as const) {
      const diff = maxPoseDiff(deathPose(actor, walkBase, 0, { direction }), walkBase);
      expect(diff).toBeLessThan(1e-9);
    }
  });

  it('is deterministic: the same inputs give the exact same pose', () => {
    const found = setup('shambler');
    const actor = deathActorOf(found);
    const walkBase = walkPose(walkActorOf(found), INITIAL_CLOCK, 0);
    const a = deathPose(actor, walkBase, 0.6, { direction: 1 });
    const b = deathPose(actor, walkBase, 0.6, { direction: 1 });
    expect(Object.keys(a.rotations).length).toBeGreaterThan(0);
    expect(maxPoseDiff(a, walkBase)).toBeGreaterThan(0);
    expect(maxPoseDiff(a, b)).toBe(0);
  });

  it('holds its final pose for any t beyond DEATH_FALL_DURATION', () => {
    const found = setup('shambler');
    const actor = deathActorOf(found);
    const walkBase = walkPose(walkActorOf(found), INITIAL_CLOCK, 0);
    const atEnd = deathPose(actor, walkBase, DEATH_FALL_DURATION, { direction: 1 });
    const later = deathPose(actor, walkBase, DEATH_FALL_DURATION + 5, { direction: 1 });
    expect(maxPoseDiff(atEnd, later)).toBe(0);
  });

  // Every template x seed x fall direction: the final pose must be lying down (chest/head well below
  // standing height — a fraction of the actor's own standing height, not a fixed metre figure, since
  // templates range from a shambler to a much taller brute) and not penetrate the ground by more than
  // GROUND_SMOOTHING's usual few-mm tolerance (see gait.ts's own smoothMinAll comment).
  const cases = TEMPLATES.flatMap((t) => [1, 2, 3].map((seed) => [t.name, seed] as const));
  it.each(cases)('%s seed %i ends lying down, not penetrating the ground, in both fall directions', (name, seed) => {
    const found = generateValid(TEMPLATES.find((t) => t.name === name)!, seed);
    expect(found, `${name} seed ${seed} must produce a valid fixture`).toBeDefined();
    const body = build(found!.genome);
    const voxels = voxelize(body, found!.genome.voxelSize, found!.genome.seed);
    const extents = footRestExtents(body.bones, voxels);
    const bodyExtents = bodyRestExtents(body.bones, voxels);
    const params = found!.genome.params as HumanoidParams;
    const walkActor = { bones: body.bones, extents, params, seed: found!.genome.seed, cache: createGaitCache() };
    const actor = { ...walkActor, bodyExtents };
    const standing = walkPose(walkActor, INITIAL_CLOCK, 0);
    const byId = new Map(body.bones.map((b: Bone) => [b.id, b]));
    const worldOf = (pose: Pose, boneId: string): number =>
      applyPoint(boneTransforms(body.bones, pose).get(boneId)!, byId.get(boneId)!.head)[1];
    const standingHeadY = worldOf(standing, 'head');
    const standingChestY = worldOf(standing, 'chest');

    for (const direction of [1, -1] as const) {
      const pose = deathPose(actor, standing, DEATH_FALL_DURATION, { direction });
      const transforms = boneTransforms(body.bones, pose);
      let minY = Number.POSITIVE_INFINITY;
      for (const [boneId, extent] of bodyExtents) {
        const t = transforms.get(boneId)!;
        for (const c of corners(extent)) {
          minY = Math.min(minY, applyPoint(t, c)[1]);
        }
      }
      // Never penetrates; the smooth-min ground fit hovers by at most a couple of cm (see gait.ts).
      expect(minY).toBeGreaterThanOrEqual(-0.001);
      expect(minY).toBeLessThan(0.03);
      const [, headY] = applyPoint(transforms.get('head')!, byId.get('head')!.head);
      const [, chestY] = applyPoint(transforms.get('chest')!, byId.get('chest')!.head);
      expect(headY).toBeLessThan(standingHeadY * 0.4);
      expect(chestY).toBeLessThan(standingChestY * 0.55);
    }
  });
});
