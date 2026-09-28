import { describe, expect, it } from 'vitest';
import type { Bone } from '../src/core/body.ts';
import { applyPoint, rotZ } from '../src/core/math.ts';
import { boneTransforms, type Pose } from '../src/core/pose.ts';

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
