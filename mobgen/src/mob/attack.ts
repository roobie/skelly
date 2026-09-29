// A data-driven attack: a list of keyframes over time, smoothly interpolated per bone/axis and layered
// on top of a base (walk or standing) pose. Structured as data (not a hand-coded curve) so deadvox's
// planned roster of attacks can each just be another AttackClip.
//
// Rotation convention: same as gait.ts (forward swing = +rotX for a hanging limb — arms, jaw). For an
// *upright* bone (spine, chest, head), +rotX tips it backward and -rotX pitches it forward instead (the
// same rotation, but the bone points the other way at rest) — verified against boneTransforms, not
// assumed; see mobgen's report on this feature for the check.

import type { Bone } from '../core/body.ts';
import { type Mat3, mulMM, rotAxis, rotX, rotY, rotZ, type Vec3 } from '../core/math.ts';
import type { Pose } from '../core/pose.ts';
import { GROUND_SMOOTHING, groundOffset, legGeometryFor, type WalkActor } from './gait.ts';
import type { HumanoidParams } from './humanoid.ts';

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const smoothstep = (x: number): number => x * x * (3 - 2 * x);
const IDENTITY_M: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export interface AttackKey {
  readonly t: number;
  /** Degrees, [x, y, z]; composed as rotZ(z) ∘ rotY(y) ∘ rotX(x). Bones not listed stay at the base pose.
   * For upperArm.{L,R}, x is the *net* angle from vertical (torso-pitch-compensated — see
   * upperArmLocalFromNet), not a raw local delta, so hand height doesn't depend on how much the torso
   * happens to be leaning. */
  readonly rotations: Partial<Record<string, readonly [number, number, number]>>;
  /** Root drop this key adds, as a fraction of (average) leg length — e.g. a lunge's crouch. */
  readonly pelvisDrop?: number;
}

/**
 * A named attack, authored as keyframes over time (seconds). `hitTime` is when damage should land.
 * Interpolated per bone/axis with a monotone cubic (see attackPose) — zero slope is forced at the first
 * and last key, so author those all-zero (rotations {} or every touched bone at [0,0,0]) for a clean
 * blend in/out. Every key should list every bone the clip ever touches, even as [0,0,0] — the
 * interpolator tolerates sparser clips (treating an absent bone as 0 at that key) but a clip authored
 * this way makes the intended shape obvious and avoids a bone popping in only when a key first mentions it.
 */
export interface AttackClip {
  readonly name: string;
  readonly duration: number;
  readonly hitTime: number;
  readonly keys: readonly AttackKey[];
}

/** A key with every listed bone at [0,0,0] — the clean, zero-slope shape a clip's first/last key needs
 * (see AttackClip's own doc comment). Exported for reactions.ts's HIT_FLINCH, which authors clips the
 * same way. */
export const zeroKey = (t: number, bones: readonly string[]): AttackKey => ({
  t,
  rotations: Object.fromEntries(bones.map((b) => [b, [0, 0, 0]])),
});

const LUNGE_BONES = ['spine', 'chest', 'head', 'jaw', 'upperArm.L', 'upperArm.R', 'forearm.L', 'forearm.R'] as const;

/** Reach-and-grab lunge: windup (rear back, arms rise bent), strike (pitch forward, arms clasp
 * straight, hitTime), recover (ease back to neutral). 0.9 s, under the 1.5 s cooldown. */
export const LUNGE_GRAB: AttackClip = {
  name: 'lunge-grab',
  duration: 0.9,
  hitTime: 0.45,
  keys: [
    zeroKey(0, LUNGE_BONES),
    {
      t: 0.35,
      rotations: {
        spine: [8, 0, 0],
        chest: [10, 0, 0],
        head: [3, 0, 0],
        jaw: [10, 0, 0],
        'upperArm.L': [100, 0, -8],
        'upperArm.R': [100, 0, 8],
        'forearm.L': [25, 0, 0],
        'forearm.R': [25, 0, 0],
      },
    },
    {
      t: 0.45,
      rotations: {
        spine: [-12, 0, 0],
        chest: [-18, 0, 0],
        head: [-7, 0, 0],
        jaw: [27, 0, 0],
        'upperArm.L': [87, 0, -50],
        'upperArm.R': [87, 0, 50],
        'forearm.L': [-5, 0, 0],
        'forearm.R': [-5, 0, 0],
      },
      pelvisDrop: 0.02,
    },
    zeroKey(0.9, LUNGE_BONES),
  ],
};

export const ATTACK_CLIPS: Readonly<Record<string, AttackClip>> = { LUNGE_GRAB };

// ---- keyframe curve: monotone cubic Hermite, zero slope forced at the clip's first/last key ----

interface Keyframe {
  readonly value: number;
  readonly slope: number;
}

const hermite = (u: number, k0: Keyframe, k1: Keyframe): number => {
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    (2 * u3 - 3 * u2 + 1) * k0.value +
    (u3 - 2 * u2 + u) * k0.slope +
    (-2 * u3 + 3 * u2) * k1.value +
    (u3 - u2) * k1.slope
  );
};

/** Fritsch-Carlson tangent at an interior key: 0 at a local extremum, else the clamped average of the
 * two adjacent secant slopes (prevents the curve overshooting past either neighbour). */
const monotoneTangent = (dPrev: number, dNext: number): number => {
  if (dPrev === 0 || dNext === 0 || dPrev > 0 !== dNext > 0) {
    return 0;
  }
  const limit = 3 * Math.min(Math.abs(dPrev), Math.abs(dNext));
  return clamp((dPrev + dNext) / 2, -limit, limit);
};

/** Evaluates a monotone-cubic curve through (times[i], values[i]) at t, tangent forced to 0 at both
 * ends. `times` must be sorted and `t` within [times[0], times[last]]. */
const evalCurve = (times: readonly number[], values: readonly number[], t: number): number => {
  const n = times.length;
  if (n === 1) {
    return values[0]!;
  }
  let i = 0;
  while (i < n - 2 && t > times[i + 1]!) {
    i += 1;
  }
  const t0 = times[i]!;
  const t1 = times[i + 1]!;
  const v0 = values[i]!;
  const v1 = values[i + 1]!;
  const dt = t1 - t0;
  const dSeg = (v1 - v0) / dt;
  const dPrev = i > 0 ? (v0 - values[i - 1]!) / (t0 - times[i - 1]!) : undefined;
  const dNext = i + 2 < n ? (values[i + 2]! - v1) / (times[i + 2]! - t1) : undefined;
  const m0 = i === 0 ? 0 : monotoneTangent(dPrev!, dSeg);
  const m1 = i === n - 2 ? 0 : monotoneTangent(dSeg, dNext!);
  const u = clamp((t - t0) / dt, 0, 1);
  return hermite(u, { value: v0, slope: m0 * dt }, { value: v1, slope: m1 * dt });
};

const sampleVec3 = (clip: AttackClip, boneId: string, t: number): readonly [number, number, number] => {
  const times = clip.keys.map((k) => k.t);
  const axis = (i: 0 | 1 | 2): number =>
    evalCurve(
      times,
      clip.keys.map((k) => k.rotations[boneId]?.[i] ?? 0),
      t,
    );
  return [axis(0), axis(1), axis(2)];
};

const samplePelvisDrop = (clip: AttackClip, t: number): number =>
  evalCurve(
    clip.keys.map((k) => k.t),
    clip.keys.map((k) => k.pelvisDrop ?? 0),
    t,
  );

// ---- applying a clip on top of a base pose ----

/** Exported for mob/idle.ts, which authors its stances the same way attack clips do. */
export const eulerToMat3 = ([x, y, z]: readonly [number, number, number]): Mat3 =>
  mulMM(mulMM(rotZ(z), rotY(y)), rotX(x));

/** A little genome flavour on top of the authored clip — no new sampled params. Only scales the
 * dominant (x) axis, so a clip key of [0,0,0] is untouched (keeps the clip's own zero endpoints exact).
 * Exported for mob/idle.ts, which scales its own stances by the same genome params. */
export const scaleForGenome = (boneId: string, xDeg: number, params: HumanoidParams): number =>
  boneId === 'spine' || boneId === 'chest' ? xDeg * (1 + params.hunch / 100) : xDeg; // hunch: leans further in

const UPPER_ARM_BONES = new Set(['upperArm.L', 'upperArm.R']);

/** upperArm's clip value is the *net* angle from vertical, not a local delta: arm rotations compose onto
 * whatever the torso (spine+chest, already hunch-scaled) is doing, so a raw local delta would put the
 * hand at a genome-dependent height (a hunchier character's own lean would "steal" from the reach). This
 * subtracts the torso's current cumulative pitch so the arm's world angle — and so hand height — stays
 * put regardless of how much the torso leans. armRaise still gets a small (habitual-reach) bump. Exported
 * for mob/idle.ts's aggravated stance, whose raised arms are authored the same "net angle" way. */
export const upperArmLocalFromNet = (netXDeg: number, torsoPitchXDeg: number, params: HumanoidParams): number =>
  netXDeg * (1 + params.armRaise / 1000) - torsoPitchXDeg;

const ARM_BONES = new Set(['upperArm.L', 'upperArm.R', 'forearm.L', 'forearm.R']);
const FADE_FRACTION = 0.2; // walk arm-swing blends down/back up over this fraction of the clip, each end

/** 1 outside the attack's active window (full walk arm swing), 0 in the middle (clip fully replaces it),
 * smoothstep between — 1 exactly at t=0 and t=duration so attackPose matches walkBase there. */
const armSwingWeight = (t: number, clip: AttackClip): number => {
  const fade = FADE_FRACTION * clip.duration;
  if (t <= fade) {
    return smoothstep(1 - clamp(t / fade, 0, 1));
  }
  if (t >= clip.duration - fade) {
    return smoothstep(clamp((t - (clip.duration - fade)) / fade, 0, 1));
  }
  return 0;
};

/** The walk's own arm rotation, scaled toward identity by `weight` (1 = full walk swing, 0 = none) —
 * exact at weight 1 (bit-identical to baseR) so attackPose matches walkBase exactly at the clip's ends.
 * Scales baseR's own axis-angle by `weight` (same axis, smaller angle) rather than assuming baseR is a
 * pure rotX and rescaling atan2(m[7],m[4]) — the walk's upperArm rotation is rotZ(stagger-wide) ∘
 * rotX(swing), not pure rotX, and that mismatched assumption produced a real, if small, snap right where
 * this switches to the `weight >= 1` shortcut (see mobgen's report). */
const blendArmBase = (baseR: Mat3, weight: number): Mat3 => {
  if (weight >= 1) {
    return baseR;
  }
  const cosAngle = clamp((baseR[0]! + baseR[4]! + baseR[8]! - 1) / 2, -1, 1);
  const angle = Math.acos(cosAngle);
  if (weight <= 0 || angle < 1e-9) {
    return IDENTITY_M;
  }
  const sinAngle = Math.sin(angle);
  const axis: Vec3 = [
    (baseR[7]! - baseR[5]!) / (2 * sinAngle),
    (baseR[2]! - baseR[6]!) / (2 * sinAngle),
    (baseR[3]! - baseR[1]!) / (2 * sinAngle),
  ];
  return rotAxis(axis, (angle * 180 * weight) / Math.PI);
};

const avgLegLen = (bones: readonly Bone[], extents: WalkActor['extents']): number =>
  (legGeometryFor(bones, extents, 'L').legLen + legGeometryFor(bones, extents, 'R').legLen) / 2;

/**
 * Layers `clip` at `time` on top of `walkBase` (the current walk or standing pose): composes each
 * clip-touched bone's rotation onto the base, blending the walk's own arm swing down to 0 over the
 * clip's active window (see armSwingWeight) so the clip's arms read clean. Legs are untouched (base
 * keeps them planted); the root is re-grounded (groundOffset) and then dropped by pelvisDrop.
 */
export const attackPose = (actor: WalkActor, clip: AttackClip, time: number, walkBase: Pose): Pose => {
  const t = clamp(time, 0, clip.duration);
  const boneIds = new Set<string>();
  for (const key of clip.keys) {
    for (const id of Object.keys(key.rotations)) {
      boneIds.add(id);
    }
  }

  const torsoPitchX =
    scaleForGenome('spine', sampleVec3(clip, 'spine', t)[0], actor.params) +
    scaleForGenome('chest', sampleVec3(clip, 'chest', t)[0], actor.params);

  const weight = armSwingWeight(t, clip);
  const rotations: Record<string, Mat3> = { ...walkBase.rotations };
  for (const boneId of boneIds) {
    const [x, y, z] = sampleVec3(clip, boneId, t);
    const scaledX = UPPER_ARM_BONES.has(boneId)
      ? upperArmLocalFromNet(x, torsoPitchX, actor.params)
      : scaleForGenome(boneId, x, actor.params);
    const clipR = eulerToMat3([scaledX, y, z]);
    const baseR = walkBase.rotations[boneId] ?? IDENTITY_M;
    const blendedBase = ARM_BONES.has(boneId) ? blendArmBase(baseR, weight) : baseR;
    rotations[boneId] = mulMM(blendedBase, clipR);
  }

  const drop = samplePelvisDrop(clip, t) * avgLegLen(actor.bones, actor.extents);
  // X and Z come from the base pose unchanged (the walk's own weave/forward progress) — legs (and so
  // groundOffset's own Y) don't move, but X isn't 0 in general now that steps can stagger sideways.
  // Same smoothing as walkPose's own groundOffset call — otherwise this can disagree with walkBase.root[1]
  // right at a near-tie between two feet's corners, breaking the exact match at the clip's own endpoints.
  const root: Vec3 = [
    walkBase.root[0],
    groundOffset(actor.bones, actor.extents, rotations, GROUND_SMOOTHING) - drop,
    walkBase.root[2],
  ];
  return { root, rotations };
};
