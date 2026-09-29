// Forward kinematics: each bone has a rotation about its own head, applied
// down the chain from the root. No skinning — a bone's voxels move as one
// rigid block with it (PROJECT.md "Bones are rigid").
//
// Perf note (mobgen/CHALLENGES.md §1): this is on the hottest path in the codebase — once per bone per
// actor per frame, everywhere an actor is posed. boneLocalTransform and boneTransforms below compute the
// same maths as a naive translate(head) ∘ rotate ∘ translate(-head) [∘ translate(root) for the root]
// composition, but as one direct 3x3/3x1 computation instead of three generic compose() calls (each of
// which would allocate a fresh Mat3 + Vec3) — see test/poseEquivalence.test.ts, which pins the numeric
// output of both this and the mob/gait.ts and mob/attack.ts callers above it, so this can be restructured
// freely as long as that keeps passing. boneTransformsInto goes further: no per-bone object or Map
// allocation at all, for callers (stress.ts's per-frame matrix writes) that pose the same actor every
// frame and can reuse one scratch buffer forever.

import type { Bone } from './body.ts';
import { IDENTITY_M, type Mat3, type Transform, type Vec3 } from './math.ts';

/** Euler angles in degrees, [x, y, z] — the angle about each axis, NOT the order they are composed in.
 * The composition order differs per bone and is documented on Pose.angles / Pose.clipAngles. */
export type EulerDeg = readonly [number, number, number];

export interface Pose {
  /** Translation applied to the root bone, on top of its rotation. */
  readonly root: Vec3;
  /** Per-bone rotation, about the bone's head, expressed in rest-pose world axes.
   *  A bone with no entry keeps its rest orientation (identity). */
  readonly rotations: Readonly<Record<string, Mat3>>;
  /**
   * Optional, only present when the poser was asked for it (walkPose's `recordAngles`): the joint angles
   * (degrees, [x, y, z]) the *walk* composed `rotations` from, so a joint-limits check or a test reads
   * the numbers the walk used instead of decomposing matrices with a guessed Euler order. Written as
   * matrix products, leftmost outermost (`rotZ∘rotX` = mulMM(rotZ(z), rotX(x))); an axis a bone does
   * not use is 0 and left out of the product:
   *
   *   pelvis      rotX(x) ∘ rotZ(z) ∘ rotY(y)   x = fore-aft roll/lean, y = yaw, z = swing-hip drop
   *   spine       rotZ(z) ∘ rotY(y)             y = twist less pelvis yaw, z = trunk counter-lean
   *   chest       rotZ(z)
   *   head        rotZ(z) ∘ rotX(x)
   *   jaw         rotX(x)
   *   upperArm.*  rotZ(z) ∘ rotX(x)             z = stagger-wide, mirrored per side
   *   forearm.*   rotX(x)
   *   thigh.*     rotY(y) ∘ rotZ(z) ∘ rotX(x)   y = -pelvis yaw, z = hip abduction less pelvis z-roll
   *   shin.*      rotX(x)
   *
   * `foot.*` has no entry: its matrix is the inverse of pelvis ∘ thigh ∘ shin (keeping the sole level in
   * world space) times a pitch, so it is derived, not composed from angles of its own. Every entry
   * recomposes to `rotations[bone]` within float rounding (test/angles.test.ts). Bones missing from
   * `rotations` (identity) are missing here too.
   */
  readonly angles?: Readonly<Record<string, EulerDeg>>;
  /**
   * Optional, set by attackPose when its `walkBase` carried `angles`: for each bone the clip touched, the
   * clip's own angles as actually composed (after hunch scaling / the upper arm's torso-pitch
   * compensation), as `rotZ(z) ∘ rotY(y) ∘ rotX(x)`. The bone's matrix is then
   * `rotations[bone] = W ∘ clipRotation`, where W is the walk's matrix from `angles` (for the four arm
   * bones, first faded toward identity by `armWalkWeight`, see attack.ts's blendArmBase). `angles` keeps
   * describing the walk layer only.
   */
  readonly clipAngles?: Readonly<Record<string, EulerDeg>>;
  /** With `clipAngles`: 1 = the walk's arm swing fully present, 0 = fully replaced by the clip. */
  readonly armWalkWeight?: number;
}

export const IDENTITY_POSE: Pose = { root: [0, 0, 0], rotations: {} };

/**
 * One bone's own (parent-relative) transform: translate(head_b) ∘ R_b ∘ translate(-head_b), plus —
 * for the root only — the root translation composed on the outside. Closed form: expanding that
 * composition algebraically gives r = R_b, t = head_b - R_b·head_b (+ pose.root for the root) directly,
 * with no intermediate Transform to allocate. `r` is the same array `pose.rotations[bone.id]` (or
 * IDENTITY_M) holds — aliased, not copied, exactly as the old rotation()/compose() chain also did, and
 * safe for the same reason: every consumer (compose, the loop below, three.js's Matrix4.set) only reads
 * a Transform's r/t, never mutates it in place.
 *
 * Exported for stress.ts: a SkinnedMesh's THREE.Bone hierarchy composes matrixWorld the same
 * parent-relative way three.js itself does (parent.matrixWorld * this.matrix), so setting each
 * THREE.Bone's local matrix to exactly this reproduces boneTransforms' own recursive composition below
 * without walking a Map of world transforms.
 */
export const boneLocalTransform = (bone: Bone, pose: Pose): Transform => {
  const r = pose.rotations[bone.id] ?? IDENTITY_M;
  const head = bone.head;
  const hx = head[0];
  const hy = head[1];
  const hz = head[2];
  const tx = hx - (r[0] * hx + r[1] * hy + r[2] * hz);
  const ty = hy - (r[3] * hx + r[4] * hy + r[5] * hz);
  const tz = hz - (r[6] * hx + r[7] * hy + r[8] * hz);
  if (bone.parent === null) {
    const root = pose.root;
    return { r, t: [tx + root[0], ty + root[1], tz + root[2]] };
  }
  return { r, t: [tx, ty, tz] };
};

/** world = compose(parent, local): parent.r · local.r, parent.r · local.t + parent.t — inlined (see this
 * module's header) rather than calling math.ts's generic compose/mulMM/mulMV/add, each of which would
 * allocate its own array. Indexes into r/t directly rather than array-destructuring them: V8 doesn't
 * always optimize destructuring a plain array to simple indexed loads (see the profile in mobgen's
 * report — it showed up as real ArrayIteratorPrototypeNext time on this exact function). */
const composeWorld = (parent: Transform, local: Transform): Transform => {
  const pr = parent.r;
  const pr0 = pr[0];
  const pr1 = pr[1];
  const pr2 = pr[2];
  const pr3 = pr[3];
  const pr4 = pr[4];
  const pr5 = pr[5];
  const pr6 = pr[6];
  const pr7 = pr[7];
  const pr8 = pr[8];
  const lr = local.r;
  const lr0 = lr[0];
  const lr1 = lr[1];
  const lr2 = lr[2];
  const lr3 = lr[3];
  const lr4 = lr[4];
  const lr5 = lr[5];
  const lr6 = lr[6];
  const lr7 = lr[7];
  const lr8 = lr[8];
  const lt = local.t;
  const ltx = lt[0];
  const lty = lt[1];
  const ltz = lt[2];
  const r: Mat3 = [
    pr0 * lr0 + pr1 * lr3 + pr2 * lr6,
    pr0 * lr1 + pr1 * lr4 + pr2 * lr7,
    pr0 * lr2 + pr1 * lr5 + pr2 * lr8,
    pr3 * lr0 + pr4 * lr3 + pr5 * lr6,
    pr3 * lr1 + pr4 * lr4 + pr5 * lr7,
    pr3 * lr2 + pr4 * lr5 + pr5 * lr8,
    pr6 * lr0 + pr7 * lr3 + pr8 * lr6,
    pr6 * lr1 + pr7 * lr4 + pr8 * lr7,
    pr6 * lr2 + pr7 * lr5 + pr8 * lr8,
  ];
  const t: Vec3 = [
    pr0 * ltx + pr1 * lty + pr2 * ltz + parent.t[0],
    pr3 * ltx + pr4 * lty + pr5 * ltz + parent.t[1],
    pr6 * ltx + pr7 * lty + pr8 * ltz + parent.t[2],
  ];
  return { r, t };
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
    out.set(bone.id, composeWorld(parentT, local));
  }
  return out;
};

// ---- allocation-free path: same maths, written into caller-owned scratch instead of a fresh Map ----

/** A Transform whose r/t arrays are mutated in place by boneTransformsInto, instead of a fresh object
 * per bone per call. Plain arrays (not the `readonly` Mat3/Vec3 tuples), so they're mutable. */
export interface MutableTransform {
  r: [number, number, number, number, number, number, number, number, number];
  t: [number, number, number];
}

const IDENTITY_MUTABLE_R: MutableTransform['r'] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** One scratch transform, initialized to the identity (overwritten before first use either way). */
export const makeTransformScratch = (): MutableTransform => ({ r: [...IDENTITY_MUTABLE_R], t: [0, 0, 0] });

/** A reusable scratch buffer for boneTransformsInto, one entry per bone — allocate once per actor
 * (alongside its bones array) and reuse forever, instead of once per frame. */
export const allocateBoneTransforms = (boneCount: number): MutableTransform[] =>
  Array.from({ length: boneCount }, makeTransformScratch);

/** bones[i]'s array index of its own parent, or -1 for the root — precompute once per actor
 * (indexBonesByParent) so boneTransformsInto's hot loop never does a string-keyed lookup. */
export type ParentIndex = readonly number[];

export const indexBonesByParent = (bones: readonly Bone[]): ParentIndex => {
  const indexById = new Map(bones.map((bone, i) => [bone.id, i]));
  return bones.map((bone) => (bone.parent === null ? -1 : (indexById.get(bone.parent) ?? -1)));
};

/**
 * Allocation-free equivalent of boneTransforms: writes bones[i]'s posed world transform into out[i]
 * (same order as `bones`, not keyed by id) instead of building a Map<string, Transform> and a fresh
 * Transform per bone. Numerically identical to boneTransforms (test/poseEquivalence.test.ts checks both
 * against the same golden record) — this only changes how the result is delivered.
 *
 * `parentIndex` must come from indexBonesByParent(bones) (bones must be parents-first, as always); `out`
 * from allocateBoneTransforms(bones.length), sized once and reused every call.
 */
export const boneTransformsInto = (
  bones: readonly Bone[],
  pose: Pose,
  parentIndex: ParentIndex,
  out: readonly MutableTransform[],
): void => {
  for (let i = 0; i < bones.length; i++) {
    const bone = bones[i]!;
    const r = pose.rotations[bone.id] ?? IDENTITY_M;
    const head = bone.head;
    const hx = head[0];
    const hy = head[1];
    const hz = head[2];
    const ltx = hx - (r[0] * hx + r[1] * hy + r[2] * hz);
    const lty = hy - (r[3] * hx + r[4] * hy + r[5] * hz);
    const ltz = hz - (r[6] * hx + r[7] * hy + r[8] * hz);
    const o = out[i]!;
    const pi = parentIndex[i]!;
    if (pi < 0) {
      const root = pose.root;
      o.r[0] = r[0];
      o.r[1] = r[1];
      o.r[2] = r[2];
      o.r[3] = r[3];
      o.r[4] = r[4];
      o.r[5] = r[5];
      o.r[6] = r[6];
      o.r[7] = r[7];
      o.r[8] = r[8];
      o.t[0] = ltx + root[0];
      o.t[1] = lty + root[1];
      o.t[2] = ltz + root[2];
      continue;
    }
    const p = out[pi]!;
    const pr = p.r;
    const pt = p.t;
    // world.r = p.r * r ; world.t = p.r * local.t + p.t — same composeWorld formula above, inlined so
    // this loop touches no function but itself (this is the innermost loop of the hottest path).
    const wr0 = pr[0] * r[0] + pr[1] * r[3] + pr[2] * r[6];
    const wr1 = pr[0] * r[1] + pr[1] * r[4] + pr[2] * r[7];
    const wr2 = pr[0] * r[2] + pr[1] * r[5] + pr[2] * r[8];
    const wr3 = pr[3] * r[0] + pr[4] * r[3] + pr[5] * r[6];
    const wr4 = pr[3] * r[1] + pr[4] * r[4] + pr[5] * r[7];
    const wr5 = pr[3] * r[2] + pr[4] * r[5] + pr[5] * r[8];
    const wr6 = pr[6] * r[0] + pr[7] * r[3] + pr[8] * r[6];
    const wr7 = pr[6] * r[1] + pr[7] * r[4] + pr[8] * r[7];
    const wr8 = pr[6] * r[2] + pr[7] * r[5] + pr[8] * r[8];
    const wtx = pr[0] * ltx + pr[1] * lty + pr[2] * ltz + pt[0];
    const wty = pr[3] * ltx + pr[4] * lty + pr[5] * ltz + pt[1];
    const wtz = pr[6] * ltx + pr[7] * lty + pr[8] * ltz + pt[2];
    o.r[0] = wr0;
    o.r[1] = wr1;
    o.r[2] = wr2;
    o.r[3] = wr3;
    o.r[4] = wr4;
    o.r[5] = wr5;
    o.r[6] = wr6;
    o.r[7] = wr7;
    o.r[8] = wr8;
    o.t[0] = wtx;
    o.t[1] = wty;
    o.t[2] = wtz;
  }
};
