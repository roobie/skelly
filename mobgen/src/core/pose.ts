// Forward kinematics: each bone has a rotation about its own head, applied
// down the chain from the root. No skinning — a bone's voxels move as one
// rigid block with it (PROJECT.md "Bones are rigid").

import type { Bone } from './body.ts';
import { compose, IDENTITY_M, type Mat3, rotation, scale, type Transform, translation, type Vec3 } from './math.ts';

export interface Pose {
  /** Translation applied to the root bone, on top of its rotation. */
  readonly root: Vec3;
  /** Per-bone rotation, about the bone's head, expressed in rest-pose world axes.
   *  A bone with no entry keeps its rest orientation (identity). */
  readonly rotations: Readonly<Record<string, Mat3>>;
}

export const IDENTITY_POSE: Pose = { root: [0, 0, 0], rotations: {} };

/**
 * One bone's own (parent-relative) transform: translate(head_b) ∘ R_b ∘ translate(-head_b), plus —
 * for the root only — the root translation composed on the outside. Exported for stress.ts: a
 * SkinnedMesh's THREE.Bone hierarchy composes matrixWorld the same parent-relative way three.js itself
 * does (parent.matrixWorld * this.matrix), so setting each THREE.Bone's local matrix to exactly this
 * reproduces boneTransforms' own recursive composition below without walking a Map of world transforms.
 */
export const boneLocalTransform = (bone: Bone, pose: Pose): Transform => {
  const r = rotation(pose.rotations[bone.id] ?? IDENTITY_M);
  const toHead = translation(bone.head);
  const fromHead = translation(scale(bone.head, -1));
  const local = compose(compose(toHead, r), fromHead);
  return bone.parent === null ? compose(translation(pose.root), local) : local;
};

/**
 * World transform (rest pose -> posed) for every bone. `bones` must be
 * parents-first (every bone's parent appears earlier), which is how Body
 * always stores them.
 *
 * T_b = T_parent ∘ translate(head_b) ∘ R_b ∘ translate(-head_b), and the
 * root additionally gets the root translation.
 */
export const boneTransforms = (bones: readonly Bone[], pose: Pose): Map<string, Transform> => {
  const out = new Map<string, Transform>();
  for (const bone of bones) {
    const local = boneLocalTransform(bone, pose);
    if (bone.parent === null) {
      out.set(bone.id, local);
      continue;
    }
    const parentT = out.get(bone.parent);
    if (!parentT) {
      throw new Error(
        `bone "${bone.id}" has parent "${bone.parent}", which hasn't been placed yet (bones must be parents-first)`,
      );
    }
    out.set(bone.id, compose(parentT, local));
  }
  return out;
};
