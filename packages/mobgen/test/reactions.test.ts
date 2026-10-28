// Tests for src/mob/reactions.ts: the hit flinch (an AttackClip through the same interpolator as an
// attack) and the death fall (whole-body root pitch, the clip format can't express).

import { describe, expect, it } from 'vitest';
import zombieContent from '../../deadvox/src/content/base/zombies.json' with { type: 'json' };
import type { Bone } from '../src/core/body.ts';
import { generateValid } from '../src/core/generate.ts';
import { applyPoint, cross, dot, IDENTITY_M, length, mulMV, sub, type Transform, type Vec3 } from '../src/core/math.ts';
import { boneTransforms, type Pose } from '../src/core/pose.ts';
import { worldPosition } from '../src/core/voxelize.ts';
import { attackPose, LUNGE_GRAB } from '../src/mob/attack.ts';
import { crawlerGaitPose } from '../src/mob/crawler.ts';
import deathContent from '../src/mob/deathPoses.json' with { type: 'json' };
import { severedBoneSet } from '../src/mob/dismember.ts';
import {
  bodyRestExtents,
  corners,
  createGaitCache,
  footRestExtents,
  INITIAL_CLOCK,
  walkPose,
} from '../src/mob/gait.ts';
import type { HumanoidParams } from '../src/mob/humanoid.ts';
import {
  DEATH_FALL_DURATION,
  type DeathActor,
  deathPose,
  flinchClipFor,
  flinchPose,
  HIT_FLINCH,
} from '../src/mob/reactions.ts';
import { TEMPLATES as ALL_TEMPLATES, HUMANOID_TEMPLATES as TEMPLATES } from '../src/mob/templates.ts';

const setup = (name: string, seed = 1) => {
  const t = ALL_TEMPLATES.find((x) => x.name === name)!;
  const found = generateValid(t, seed, { maxAttempts: 1 });
  if (!found) {
    throw new Error(`Invalid authored figure: ${name}/${seed}`);
  }
  const { body, voxels } = found.realized;
  const extents = footRestExtents(body.bones, voxels);
  const bodyExtents = bodyRestExtents(body.bones, voxels);
  return {
    body,
    voxels,
    extents,
    bodyExtents,
    realized: found.realized,
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

const deathActorOf = (found: ReturnType<typeof setup>) => ({
  ...walkActorOf(found),
  bodyExtents: found.bodyExtents,
  voxels: found.voxels,
  posture: 'upright' as const,
});

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

const surfaceClearance = (actor: DeathActor, transforms: ReadonlyMap<string, Transform>, id: string): number =>
  Math.min(...corners(actor.bodyExtents.get(id)!).map((point) => applyPoint(transforms.get(id)!, point)[1]));

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

const floorSettlingBones = new Set(deathContent.settleBones.filter((id) => id !== 'head'));

describe('deathPose', () => {
  it.for(
    ALL_TEMPLATES.flatMap((template) =>
      [
        ...new Set(
          zombieContent.zombies
            .filter((entry) => entry.model === template.name)
            .flatMap((entry) => entry.figureSeeds ?? []),
        ),
      ].flatMap((seed) =>
        deathContent.poses.flatMap(({ id: poseId }) =>
          (template.bodyPlan === 'crawler' ? (['prone'] as const) : (['upright', 'prone'] as const)).map((posture) => ({
            name: template.name,
            poseId,
            posture,
            seed,
          })),
        ),
      ),
    ),
  )(
    '$name seed $seed $posture $poseId keeps the settled skull clear of the chest',
    async ({ name, seed, posture, poseId }, { annotate }) => {
      const found = setup(name, seed);
      const actor = { ...deathActorOf(found), posture };
      const base = posture === 'prone' ? crawlerGaitPose(found.realized, 0.5, 1) : walkPose(actor, INITIAL_CLOCK, 0);
      const transforms = boneTransforms(
        actor.bones,
        deathPose(actor, base, DEATH_FALL_DURATION, { direction: -1, poseId }),
      );
      const neckBone = actor.bones.find((bone) => bone.id === 'neck')!;
      const neckVector = sub(neckBone.tail, neckBone.head);
      const flatNeck = mulMV(transforms.get('chest')!.r, neckVector);
      const posedNeck = mulMV(transforms.get('neck')!.r, neckVector);
      const liftAxis = cross(flatNeck, [0, 1, 0]);
      const lift =
        (Math.atan2(dot(liftAxis, cross(flatNeck, posedNeck)) / length(liftAxis), dot(flatNeck, posedNeck)) * 180) /
        Math.PI;
      await annotate(`Neck elevation relative to chest rest frame (degrees): ${lift}`);
      const { voxels } = found;
      const cells = (id: string): Vec3[] => {
        const owner = actor.bones.findIndex((bone) => bone.id === id) + 1;
        const result: Vec3[] = [];
        voxels.owner.forEach((cellOwner, index) => {
          if (cellOwner !== owner) {
            return;
          }
          const i = index % voxels.dims[0];
          const j = Math.floor(index / voxels.dims[0]) % voxels.dims[1];
          const k = Math.floor(index / (voxels.dims[0] * voxels.dims[1]));
          result.push(applyPoint(transforms.get(id)!, worldPosition(voxels, i, j, k)));
        });
        expect(result.length).toBeGreaterThan(0);
        return result;
      };
      const chest = cells('chest');
      let skullSupported = false;
      for (const id of ['head', 'jaw']) {
        const skull = cells(id);
        const axesOf = (boneId: string) =>
          (
            [
              [1, 0, 0],
              [0, 1, 0],
              [0, 0, 1],
            ] as const
          ).map((axis) => mulMV(transforms.get(boneId)!.r, axis));
        const a = axesOf(id);
        const b = axesOf('chest');
        const axes = [...a, ...b, ...a.flatMap((axis) => b.map((other) => cross(axis, other)))].filter(
          (axis) => length(axis) > 1e-10,
        );
        const projections = axes.map((axis) => ({
          axis,
          radius: (voxels.size / 2) * [...a, ...b].reduce((sum, basis) => sum + Math.abs(dot(axis, basis)), 0),
        }));
        const overlaps = skull.some((left) =>
          chest.some((right) => {
            const delta = sub(left, right);
            return (
              dot(delta, delta) < 3 * voxels.size ** 2 &&
              projections.every(
                ({ axis, radius }) =>
                  Math.abs(dot(delta, axis)) <
                  radius - Math.max(...deathContent.contact.penetrationVoxels) * voxels.size * length(axis) - 1e-9,
              )
            );
          }),
        );
        expect(overlaps, `${id} cells must not overlap chest cells`).toBe(false);
        const nearChest = skull.some((left) =>
          chest.some((right) => {
            const delta = sub(left, right);
            return (
              dot(delta, delta) <= 3 * (voxels.size * (1 + deathContent.contact.supportDistanceVoxels)) ** 2 &&
              projections.every(
                ({ axis, radius }) =>
                  Math.abs(dot(delta, axis)) <=
                  radius + voxels.size * deathContent.contact.supportDistanceVoxels * length(axis),
              )
            );
          }),
        );
        skullSupported ||= surfaceClearance(actor, transforms, id) <= voxels.size || nearChest;
      }
      expect(skullSupported, 'the skull settles onto the floor or chest instead of freezing above both').toBe(true);
    },
  );
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
          if (floorSettlingBones.has(bone.id)) {
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
  it.for(
    [
      { model: 'crawler', cuts: [] },
      { model: 'shambler', cuts: ['thigh.L'] },
    ].flatMap((fixture) => deathContent.poses.map(({ id: poseId }) => ({ ...fixture, poseId }))),
  )('$model keeps its crawling trunk down during $poseId death', ({ model, cuts, poseId }) => {
    const found = setup(model);
    const actor = { ...deathActorOf(found), posture: 'prone' as const };
    // A figure can die standing or after leg loss without changing its cached skeleton.
    if (model === 'shambler') {
      const upright = { ...actor, posture: 'upright' as const };
      deathPose(upright, walkPose(upright, INITIAL_CLOCK, 0), DEATH_FALL_DURATION, { direction: -1, poseId });
    }
    const hidden = severedBoneSet(actor.bones, cuts);
    const base = crawlerGaitPose(found.realized, 0.5, 1);
    const baseTransforms = boneTransforms(actor.bones, base);
    const endTransforms = boneTransforms(
      actor.bones,
      deathPose(actor, base, DEATH_FALL_DURATION, { direction: -1, poseId }),
    );
    const transitionLimits = new Map(
      ['pelvis', 'chest'].map((id) => [
        id,
        // Skull rotation can need clearance between endpoints, but must not stand the trunk up.
        Math.max(surfaceClearance(actor, baseTransforms, id), surfaceClearance(actor, endTransforms, id)) +
          actor.params.height * 0.04,
      ]),
    );
    const restingLimits = new Map(
      ['pelvis', 'chest', 'head', 'upperArm.L', 'upperArm.R', 'forearm.L', 'forearm.R', 'hand.L', 'hand.R'].map(
        (id) => [id, actor.params.height * 0.04],
      ),
    );
    for (const time of [DEATH_FALL_DURATION / 2, DEATH_FALL_DURATION]) {
      const pose = deathPose(actor, base, time, { direction: -1, poseId });
      const transforms = boneTransforms(actor.bones, pose);
      const limits = time === DEATH_FALL_DURATION ? restingLimits : transitionLimits;
      for (const bone of actor.bones.filter((candidate) => !hidden.has(candidate.id))) {
        const transform = transforms.get(bone.id)!;
        const lowest = surfaceClearance(actor, transforms, bone.id);
        expect.soft(lowest, `${poseId}/${time}/${bone.id}: no sinking`).toBeGreaterThanOrEqual(0);
        expect(length(sub(applyPoint(transform, bone.tail), applyPoint(transform, bone.head)))).toBeCloseTo(
          length(sub(bone.tail, bone.head)),
          9,
        );
        const limit = limits.get(bone.id);
        if (limit !== undefined) {
          expect.soft(lowest, `${poseId}/${time}/${bone.id}: rests near floor`).toBeLessThanOrEqual(limit);
        }
      }
    }
  });
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
    const { body, voxels } = found!.realized;
    const extents = footRestExtents(body.bones, voxels);
    const bodyExtents = bodyRestExtents(body.bones, voxels);
    const params = found!.genome.params as HumanoidParams;
    const walkActor = { bones: body.bones, extents, params, seed: found!.genome.seed, cache: createGaitCache() };
    const actor = { ...walkActor, bodyExtents, voxels, posture: 'upright' as const };
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
