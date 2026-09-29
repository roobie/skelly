// Targeted checks for src/viewer/stressActors.ts's allocation-light posing (mobgen/CHALLENGES.md §1).
// The per-bone maths itself (boneTransformsInto, and the closed-form local transform buildSkinnedActor
// inlines) is already pinned against core/pose.ts's boneTransforms in test/pose.test.ts and
// test/poseEquivalence.test.ts; what's specific to this file is (1) that buildBonesActor's Mesh matrices
// actually receive boneTransformsInto's output, and (2) buildSkinnedActor's one bit of real logic: the
// crowd placement composed onto the root bone (see that function's own comment on why it isn't just a
// wrapping Group).

import type { InstancedMesh } from 'three';
import { describe, expect, it } from 'vitest';
import { applyPoint, compose, rotation, rotY, type Transform, translation, type Vec3 } from '../src/core/math.ts';
import {
  allocateBoneTransforms,
  boneLocalTransform,
  boneTransformsInto,
  indexBonesByParent,
  type Pose,
} from '../src/core/pose.ts';
import {
  buildCrowdRender,
  buildPoolRender,
  type CrowdPoolRender,
  type CrowdVariantAssignment,
  createActor,
  crowdTexelIndex,
  crowdTextureLayout,
  generatePoolEntry,
  type PoolEntry,
  packCrowdBoneMatrix,
} from '../src/viewer/stressActors.ts';

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

describe('packCrowdBoneMatrix (mobgen/CHALLENGES.md §1: the pure part of crowd mode)', () => {
  it('unpacked matrix per bone, applied to a point, equals placement ∘ boneTransformsInto applied to the same point', () => {
    const { bones } = entry.realized.body;
    const parentIndex = indexBonesByParent(bones);
    const scratch = allocateBoneTransforms(bones.length);
    const pose = somePose();
    boneTransformsInto(bones, pose, parentIndex, scratch);

    const placement = { x: 2, z: 3, yawRad: 0.7 };
    const crowdTransform = compose(
      translation([placement.x, 0, placement.z]),
      rotation(rotY((placement.yawRad * 180) / Math.PI)),
    );

    const layout = crowdTextureLayout(bones.length, 1);
    const data = new Float32Array(layout.width * layout.height * 4);

    for (const [bone, boneData] of bones.entries()) {
      packCrowdBoneMatrix(data, { layout, slot: 0, bone }, scratch[bone]!, placement);
      const expected: Transform = compose(crowdTransform, { r: scratch[bone]!.r, t: scratch[bone]!.t });

      const i = crowdTexelIndex(layout, 0, bone);
      const packed: Transform = {
        r: [
          data[i]!,
          data[i + 1]!,
          data[i + 2]!,
          data[i + 4]!,
          data[i + 5]!,
          data[i + 6]!,
          data[i + 8]!,
          data[i + 9]!,
          data[i + 10]!,
        ],
        t: [data[i + 3]!, data[i + 7]!, data[i + 11]!],
      };

      // Several points, not just bone.head (often near an axis, which can hide a transposed-matrix bug):
      // head, tail, and an arbitrary offset point.
      const [hx, hy, hz] = boneData.head;
      const testPoints: readonly Vec3[] = [boneData.head, boneData.tail, [hx + 0.1, hy + 0.2, hz - 0.15]];
      for (const p of testPoints) {
        const expectedWorld = applyPoint(expected, p);
        const actualWorld = applyPoint(packed, p);
        // `data` is a Float32Array (the texture's own storage) — 5 decimal places (~1e-5), not 9: the
        // reference side (`expected`) is full float64, so this bounds Float32 rounding, not a logic bug.
        expect(actualWorld[0]).toBeCloseTo(expectedWorld[0], 5);
        expect(actualWorld[1]).toBeCloseTo(expectedWorld[1], 5);
        expect(actualWorld[2]).toBeCloseTo(expectedWorld[2], 5);
      }
    }
  });

  it("crowdTextureLayout keeps one actor's whole bone set on one texture row", () => {
    const layout = crowdTextureLayout(18, 5);
    expect(layout.width).toBe(54);
    expect(layout.height).toBe(5);
    // Every texel for slot s, any bone, falls within row s: index (in texels, not floats) is s*width + x
    // for some 0 <= x < width — i.e. flooring texelIndex/width recovers the slot exactly.
    for (let slot = 0; slot < 5; slot++) {
      for (let bone = 0; bone < 18; bone++) {
        const texelIndex = crowdTexelIndex(layout, slot, bone) / 4; // crowdTexelIndex is in floats (RGBA)
        expect(Math.floor(texelIndex / layout.width)).toBe(slot);
      }
    }
  });
});

describe('buildCrowdRender', () => {
  const poolB = generatePoolEntry(1, 500).entry; // a second, distinct variant (runner, not shambler)
  const pool = [entry, poolB];
  const renders = pool.map((e) => buildPoolRender(e, 'crowd')) as CrowdPoolRender[];

  it('one InstancedMesh per variant actually used, each sized and crowdSlot-tagged to match the assignment', () => {
    const assignments: readonly CrowdVariantAssignment[] = [
      { poolIndex: 0 },
      { poolIndex: 1 },
      { poolIndex: 0 },
      { poolIndex: 0 },
      { poolIndex: 1 },
    ];
    const render = buildCrowdRender(pool, renders, assignments);
    try {
      expect(render.sceneObjects).toHaveLength(2); // 2 distinct poolIndex values used
      expect(render.actors).toHaveLength(5);

      const meshes = render.sceneObjects as readonly InstancedMesh[];
      const byCount = new Map(meshes.map((m) => [m.count, m]));
      expect([...byCount.keys()].sort()).toEqual([2, 3]); // variant 0: 3 actors, variant 1: 2 actors

      const variant0Mesh = byCount.get(3)!;
      const crowdSlotAttr = variant0Mesh.geometry.getAttribute('crowdSlot')!;
      const variant0Slots = Array.from({ length: 3 }, (_, k) => crowdSlotAttr.getX(k)).sort((a, b) => a - b);
      expect(variant0Slots).toEqual([0, 2, 3]); // the assignment's poolIndex: 0 entries, in slot order

      const variant1Mesh = byCount.get(2)!;
      const variant1Slots = Array.from({ length: 2 }, (_, k) =>
        variant1Mesh.geometry.getAttribute('crowdSlot')!.getX(k),
      ).sort((a, b) => a - b);
      expect(variant1Slots).toEqual([1, 4]);

      // instanceMatrix must be identity for every instance (see buildCrowdRender's own note on why the
      // zero-filled default would break <project_vertex>'s `mvPosition = instanceMatrix * mvPosition`).
      for (const mesh of meshes) {
        for (let k = 0; k < mesh.count; k++) {
          const m = mesh.instanceMatrix.array as Float32Array;
          const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
          expect(Array.from(m.slice(k * 16, k * 16 + 16))).toEqual(identity);
        }
      }
    } finally {
      render.dispose();
    }
  });

  it('place() and commit() run for every actor across two variants without throwing, including a no-op second commit', () => {
    const assignments: readonly CrowdVariantAssignment[] = [{ poolIndex: 0 }, { poolIndex: 1 }, { poolIndex: 0 }];
    const render = buildCrowdRender(pool, renders, assignments);
    try {
      const pose = somePose();
      for (const [i, actor] of render.actors.entries()) {
        actor.place(i * 1.5, -i, i * 0.2, pose);
      }
      expect(() => render.commit()).not.toThrow();
      expect(() => render.commit()).not.toThrow(); // nothing pending — must still be a harmless no-op
    } finally {
      render.dispose();
    }
  });
});
