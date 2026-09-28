// Targeted checks for src/viewer/stressActors.ts's allocation-light posing (mobgen/CHALLENGES.md §1).
// The per-bone maths itself (boneTransformsInto, and the closed-form local transform buildSkinnedActor
// inlines) is already pinned against core/pose.ts's boneTransforms in test/pose.test.ts and
// test/poseEquivalence.test.ts; what's specific to this file is (1) that buildBonesActor's Mesh matrices
// actually receive boneTransformsInto's output, and (2) buildSkinnedActor's one bit of real logic: the
// crowd placement composed onto the root bone (see that function's own comment on why it isn't just a
// wrapping Group).

import { describe, expect, it } from 'vitest';
import { compose, rotation, rotY, type Transform, translation } from '../src/core/math.ts';
import { boneLocalTransform, type Pose } from '../src/core/pose.ts';
import { buildPoolRender, createActor, generatePoolEntry, type PoolEntry } from '../src/viewer/stressActors.ts';

/** A real (not hand-built) pool entry, generated once and reused by every test below. */
const entry: PoolEntry = generatePoolEntry(0, 1).entry;

const somePose = (): Pose => {
  const { bones } = entry.realized.body;
  return {
    root: [0.05, -0.12, 0.3],
    rotations: Object.fromEntries(
      bones.map((bone, i) => {
        const a = i * 0.31;
        return [bone.id, [Math.cos(a), -Math.sin(a), 0, Math.sin(a), Math.cos(a), 0, 0, 0, 1]] as const;
      }),
    ),
  };
};

describe('buildBonesActor', () => {
  it('writes each Mesh matrix from boneTransformsInto (world head lands where boneLocalTransform chaining says it should)', () => {
    const render = buildPoolRender(entry, 'bones');
    const actor = createActor(entry, render);
    const pose = somePose();
    actor.place(2, 3, 0.7, pose);
    const group = actor.sceneObjects[0]!;
    group.updateMatrixWorld(true);

    // Independently compose each bone's world transform (same recursive rule as core/pose.ts's
    // boneTransforms, just via boneLocalTransform directly) and compare the WORLD HEAD POSITION it
    // implies to what the actual Mesh matrixWorld places bone.head at.
    const { bones } = entry.realized.body;
    const worldByOwnMath = new Map<string, Transform>();
    for (const bone of bones) {
      const local = boneLocalTransform(bone, pose);
      worldByOwnMath.set(bone.id, bone.parent === null ? local : compose(worldByOwnMath.get(bone.parent)!, local));
    }
    // The group itself carries the crowd placement (position/yaw); fold that in too.
    const crowd = compose(translation([2, 0, 3]), rotation(rotY((0.7 * 180) / Math.PI)));

    for (const [i, bone] of bones.entries()) {
      const mesh = group.children[i];
      if (!mesh) {
        continue; // a bone with no owned voxels has no mesh (see meshBones) — nothing to check
      }
      const local = worldByOwnMath.get(bone.id)!;
      const world = compose(crowd, local);
      const [hx, hy, hz] = bone.head;
      const expected = [
        world.r[0] * hx + world.r[1] * hy + world.r[2] * hz + world.t[0],
        world.r[3] * hx + world.r[4] * hy + world.r[5] * hz + world.t[1],
        world.r[6] * hx + world.r[7] * hy + world.r[8] * hz + world.t[2],
      ];
      const m = mesh.matrixWorld.elements; // column-major
      const actual = [
        m[0]! * hx + m[4]! * hy + m[8]! * hz + m[12]!,
        m[1]! * hx + m[5]! * hy + m[9]! * hz + m[13]!,
        m[2]! * hx + m[6]! * hy + m[10]! * hz + m[14]!,
      ];
      expect(actual[0]).toBeCloseTo(expected[0]!, 9);
      expect(actual[1]).toBeCloseTo(expected[1]!, 9);
      expect(actual[2]).toBeCloseTo(expected[2]!, 9);
    }
  });
});

describe('buildSkinnedActor', () => {
  it("composes the crowd placement onto the root bone's own local transform exactly", () => {
    const render = buildPoolRender(entry, 'skinned');
    const actor = createActor(entry, render);
    const pose = somePose();
    const [mesh, rootBone] = actor.sceneObjects;
    actor.place(2, 3, 0.7, pose);

    // The mesh's own transform must stay fixed at the identity forever (see buildSkinnedActor's own
    // comment) — otherwise the crowd placement would apply twice.
    expect(mesh!.matrix.elements).toEqual(new Array(16).fill(0).map((_, i) => (i % 5 === 0 ? 1 : 0)));

    const rootBoneData = entry.realized.body.bones.find((b) => b.parent === null)!;
    const local = boneLocalTransform(rootBoneData, pose);
    const crowd = compose(translation([2, 0, 3]), rotation(rotY((0.7 * 180) / Math.PI)));
    const expected = compose(crowd, local);
    const expectedElements = [
      expected.r[0],
      expected.r[3],
      expected.r[6],
      0,
      expected.r[1],
      expected.r[4],
      expected.r[7],
      0,
      expected.r[2],
      expected.r[5],
      expected.r[8],
      0,
      expected.t[0],
      expected.t[1],
      expected.t[2],
      1,
    ];
    for (const [i, v] of rootBone!.matrix.elements.entries()) {
      expect(v).toBeCloseTo(expectedElements[i]!, 9);
    }
  });
});
