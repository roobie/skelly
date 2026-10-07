import { describe, expect, it } from 'vitest';
import type { Bone } from '../src/core/body.ts';
import { generate, realize } from '../src/core/generate.ts';
import { applyPoint, rotX, rotY, rotZ } from '../src/core/math.ts';
import {
  allocateBoneTransforms,
  blendPose,
  boneTransforms,
  boneTransformsInto,
  indexBonesByParent,
  type Pose,
} from '../src/core/pose.ts';
import { advanceClock, footRestExtents, INITIAL_CLOCK, legGeometryFor, walkPose } from '../src/mob/gait.ts';
import type { HumanoidParams } from '../src/mob/humanoid.ts';
import { HUMANOID_TEMPLATES as TEMPLATES } from '../src/mob/templates.ts';

const bones: readonly Bone[] = [
  { id: 'a', parent: null, head: [0, 0, 0], tail: [0, 1, 0] },
  { id: 'b', parent: 'a', head: [0, 1, 0], tail: [0, 2, 0] },
];

describe('boneTransforms', () => {
  it('identity pose leaves points unchanged', () => {
    const pose: Pose = { root: [0, 0, 0], rotations: {} };
    const t = boneTransforms(bones, pose);
    for (const bone of bones) {
      expect(applyPoint(t.get(bone.id)!, bone.head)).toEqual(bone.head);
      expect(applyPoint(t.get(bone.id)!, bone.tail)).toEqual(bone.tail);
    }
  });

  it('a root translation moves every bone by the same amount', () => {
    const pose: Pose = { root: [1, 2, 3], rotations: {} };
    const t = boneTransforms(bones, pose);
    expect(applyPoint(t.get('a')!, bones[0]!.head)).toEqual([1, 2, 3]);
    expect(applyPoint(t.get('b')!, bones[1]!.tail)).toEqual([1, 4, 3]);
  });

  it('a child follows a parent rotation (about the parent bone-s own head)', () => {
    const rot = rotZ(90);
    const pose: Pose = { root: [0, 0, 0], rotations: { a: rot } };
    const t = boneTransforms(bones, pose);
    const bTail = bones[1]!.tail;
    // a.head is the origin here, so rotating about it is just applying `rot` directly.
    const expected = applyPoint({ r: rot, t: [0, 0, 0] }, bTail);
    expect(applyPoint(t.get('b')!, bTail)).toEqual(expected);
    // and b itself has no rotation of its own relative to its parent's frame.
    expect(applyPoint(t.get('b')!, bones[1]!.head)).toEqual(applyPoint(t.get('a')!, bones[1]!.head));
  });

  it('throws if bones are not parents-first', () => {
    const badOrder: readonly Bone[] = [bones[1]!, bones[0]!];
    expect(() => boneTransforms(badOrder, { root: [0, 0, 0], rotations: {} })).toThrow();
  });
});

/** boneTransforms' Map(id -> Transform) as an array in `bones` order, for comparing against
 * boneTransformsInto's array output (see the describe block below). */
const asArray = (rig: readonly Bone[], transforms: ReadonlyMap<string, { r: unknown; t: unknown }>): unknown[] =>
  rig.map((bone) => transforms.get(bone.id));

describe('boneTransformsInto (mobgen/CHALLENGES.md §1: the allocation-free posing path)', () => {
  it('matches boneTransforms exactly on a small hand-built rig', () => {
    const rig: readonly Bone[] = [
      { id: 'a', parent: null, head: [0, 0, 0], tail: [0, 1, 0] },
      { id: 'b', parent: 'a', head: [0, 1, 0], tail: [0.3, 2, 0] },
      { id: 'c', parent: 'b', head: [0.3, 2, 0], tail: [0.3, 3, 0.4] },
    ];
    const parentIndex = indexBonesByParent(rig);
    const scratch = allocateBoneTransforms(rig.length);
    const poses: readonly Pose[] = [
      { root: [0, 0, 0], rotations: {} },
      { root: [1, -2, 0.5], rotations: {} },
      { root: [0.1, 0.2, -0.3], rotations: { a: rotZ(37), b: rotX(-12), c: rotY(200) } },
    ];
    for (const pose of poses) {
      boneTransformsInto(rig, pose, parentIndex, scratch);
      const expected = asArray(rig, boneTransforms(rig, pose));
      for (const [i, bone] of rig.entries()) {
        const t = scratch[i]!;
        const e = expected[i] as { r: readonly number[]; t: readonly number[] };
        expect({ r: [...t.r], t: [...t.t] }, `bone ${bone.id}`).toEqual({ r: [...e.r], t: [...e.t] });
      }
    }
  });

  it('matches boneTransforms on a real 18-bone rig across a walk cycle', () => {
    for (const template of TEMPLATES) {
      const genome = generate(template, 5);
      const { body, voxels } = realize(genome);
      const extents = footRestExtents(body.bones, voxels);
      const params = genome.params as HumanoidParams;
      const legGeometryL = legGeometryFor(body.bones, extents, 'L');
      const walkActor = { bones: body.bones, extents, params, seed: genome.seed };
      const parentIndex = indexBonesByParent(body.bones);
      const scratch = allocateBoneTransforms(body.bones.length);

      let clock = INITIAL_CLOCK;
      for (const distance of [0, 0.3, 0.7, 1.4, 2.1]) {
        clock = advanceClock(clock, distance, { params, geomL: legGeometryL, speed: 1.6, seed: genome.seed });
        const pose = walkPose(walkActor, clock, 1.6);
        boneTransformsInto(body.bones, pose, parentIndex, scratch);
        const expected = asArray(body.bones, boneTransforms(body.bones, pose));
        for (const [i, bone] of body.bones.entries()) {
          const t = scratch[i]!;
          const e = expected[i] as { r: readonly number[]; t: readonly number[] };
          expect({ r: [...t.r], t: [...t.t] }, `${template.name} bone ${bone.id} at distance ${distance}`).toEqual({
            r: [...e.r],
            t: [...e.t],
          });
        }
      }
    }
  });
});

describe('blendPose', () => {
  const a: Pose = { root: [0, 0, 0], rotations: { spine: rotX(0), chest: rotY(10) } };
  const b: Pose = { root: [1, 2, 3], rotations: { spine: rotX(30), forearm: rotZ(15) } };

  it('is exactly a at t=0 and exactly b at t=1 (no numeric drift from the quaternion round trip)', () => {
    expect(blendPose(a, b, 0)).toBe(a); // short-circuited, not just numerically close
    expect(blendPose(a, b, 1)).toBe(b);
  });

  it('lerps the root and slerps each shared bone', () => {
    const mid = blendPose(a, b, 0.5);
    expect(mid.root).toEqual([0.5, 1, 1.5]);
    for (const [i, x] of rotX(15).entries()) {
      expect(mid.rotations.spine![i]).toBeCloseTo(x, 6);
    }
  });

  it('treats a bone missing from one side as identity there, not a jump partway through the blend', () => {
    const mid = blendPose(a, b, 0.5);
    // chest is only in `a` (blends toward identity, not b's — b never mentions it); forearm is only in
    // `b` (blends from identity, not a's).
    for (const [i, x] of rotY(5).entries()) {
      expect(mid.rotations.chest![i]).toBeCloseTo(x, 6);
    }
    for (const [i, x] of rotZ(7.5).entries()) {
      expect(mid.rotations.forearm![i]).toBeCloseTo(x, 6);
    }
  });
});
