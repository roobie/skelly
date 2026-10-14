// Quadruped (dog) poses: a standing pose grounded flat on its four paw supports, a limping,
// uneven lurch of a gait layered over it, and a short hit flinch — every layer re-grounded
// against the paw supports, the same pattern as mob/crawler.ts (which grounds against its own
// support bones). Planted paws keep their standing rotations, so they stay on the ground; only
// a swinging leg and the body's lurch move anything, and groundQuadrupedPose puts the lowest
// remaining support surface back on y = 0.

import type { Realized } from '../core/generate.ts';
import { IDENTITY_M, type Mat3, mulMM, rotX, rotY, rotZ } from '../core/math.ts';
import type { Pose } from '../core/pose.ts';
import { posedVoxelSurfaceBoundsForBones } from '../core/voxelBounds.ts';
import { legBoneIds, QUADRUPED_LEGS, type QuadrupedLeg } from './quadruped.ts';
import { HIT_FLINCH } from './reactions.ts';

const ROOT = [0, 0, 0] as const;
const poseCache = new WeakMap<Realized, Pose>();

/** The standing carriage: a sick animal holds its head low and lets the jaw go slack. The legs
 * keep their authored standing geometry, so the flat paw soles stay exactly on the ground. */
const STANDING_ROTATIONS: Readonly<Record<string, Mat3>> = {
  neck: rotX(-5),
  head: rotX(2),
  tail: rotX(-3),
};

/** Re-grounds a pose so the lowest of `supports` (default: the template's declared support bones,
 * as resolved by core/generate.ts's resolveSupportBones) sits exactly on y = 0. */
export const groundQuadrupedPose = (
  realized: Realized,
  pose: Pose,
  supports: Iterable<string> = realized.supportBones,
): Pose => {
  const probe: Pose = { root: [pose.root[0], 0, pose.root[2]], rotations: pose.rotations };
  const surfaces = posedVoxelSurfaceBoundsForBones(realized, probe, supports);
  const lowest = Math.min(...surfaces.values());
  return { ...pose, root: [pose.root[0], -lowest, pose.root[2]] };
};

/** The static standing pose, re-grounded against the paw supports for each realized figure. */
export const quadrupedPose = (realized: Realized): Pose => {
  const cached = poseCache.get(realized);
  if (cached) {
    return cached;
  }
  const pose = groundQuadrupedPose(realized, { root: ROOT, rotations: { ...STANDING_ROTATIONS } });
  poseCache.set(realized, pose);
  return pose;
};

const smoothstep = (value: number): number => value * value * (3 - 2 * value);

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/** Gait shape driving the whole body, sampled by the template (see mob/quadruped.ts's
 * QUADRUPED_PARAM_ORDER) and handed in by whoever poses the actor. */
export interface QuadrupedStyle {
  /** 0..1: how badly the animal limps — scales the lame back-left step and its hitch. */
  readonly limp: number;
  /** Swing amplitude multiplier (the template's strideFactor). */
  readonly stride: number;
  /** Body roll per step, degrees (the template's lurch). */
  readonly lurch: number;
  /** Head/neck sway amplitude, degrees (the template's headLoll). */
  readonly headLoll: number;
}

/** Normalizes the genome's raw gait params into a style; the viewer passes genome.params here. */
export const quadrupedStyle = (params: Readonly<Record<string, number>>): QuadrupedStyle => ({
  // `limp` is sampled 0..0.5 (see mob/dogTemplate.ts); the style normalizes it to 0..1.
  limp: clamp01(params.limp ?? 0) / 0.5,
  stride: params.strideFactor ?? 1,
  lurch: params.lurch ?? 4,
  headLoll: params.headLoll ?? 6,
});

const DEFAULT_STYLE: QuadrupedStyle = { limp: 0.5, stride: 1, lurch: 4, headLoll: 6 };

/**
 * Per-leg footfall timing as a fraction of the cycle — a lateral-sequence walk on purpose made
 * uneven (a shamble, not a healthy trot): the diagonal pair lands close together, the back-left
 * (lame) step comes late and short. `span` is the airborne fraction; the rest of the cycle the
 * paw keeps its standing rotations and stays planted on the ground.
 */
const SWING: Readonly<Record<QuadrupedLeg, { readonly start: number; readonly span: number }>> = {
  FL: { start: 0.02, span: 0.42 },
  BR: { start: 0.27, span: 0.4 },
  FR: { start: 0.545, span: 0.4 },
  BL: { start: 0.83, span: 0.36 },
};

/** Swing-relative keyframes: `upper` swings the whole leg forward from its pivot, `flex` folds the
 * lower leg (sign per leg kind below so the fold lifts the paw on both kinds), `paw` levels the paw
 * against the net chain rotation so a swinging paw never plows the ground. */
const SWING_KEYS = [
  { at: 0, upper: 0, flex: 0 },
  { at: 0.28, upper: 0.55, flex: 0.85 },
  { at: 0.62, upper: 1, flex: 0.35 },
  { at: 0.85, upper: 0.6, flex: 0.12 },
  { at: 1, upper: 0, flex: 0 },
] as const;

const UPPER_SWING_DEG = 22;
const FLEX_DEG = 26;

const swingJointAngles = (progress: number, reach: number): { upper: number; fold: number } => {
  const right = SWING_KEYS.findIndex((key) => key.at >= progress);
  const from = SWING_KEYS[Math.max(0, right - 1)]!;
  const to = SWING_KEYS[Math.max(0, right)] ?? from;
  const span = to.at - from.at;
  const t = span === 0 ? 1 : smoothstep((progress - from.at) / span);
  const upper = (from.upper + (to.upper - from.upper) * t) * UPPER_SWING_DEG * reach;
  const fold = (from.flex + (to.flex - from.flex) * t) * FLEX_DEG * reach;
  return { upper, fold };
};

interface LegSwing {
  readonly upper: number;
  /** Fold angle in degrees, positive = fold the lower leg up off the ground. */
  readonly fold: number;
}

const legSwing = (leg: QuadrupedLeg, t: number, style: QuadrupedStyle): LegSwing | undefined => {
  const { start, span } = SWING[leg];
  const into = (((t - start) % 1) + 1) % 1;
  if (into >= span) {
    return undefined; // stance: the paw keeps its standing rotations and stays planted
  }
  // The lame back-left step is short and quick; the front-left over-reaches to compensate.
  const reach: Partial<Record<QuadrupedLeg, number>> = { BL: 1 - 0.4 * style.limp, FL: 1 + 0.12 * style.limp };
  const { upper, fold } = swingJointAngles(into / span, (reach[leg] ?? 1) * style.stride);
  return { upper, fold };
};

/** The limping lurch itself, as a pure per-cycle layer over the standing pose: swings each leg in
 * its own window, rolls the trunk against the step, dips at the lame footfall and lets the head,
 * jaw and tail ride along. */
export const quadrupedGaitPose = (
  realized: Realized,
  phase: number,
  speed: number,
  style: QuadrupedStyle = DEFAULT_STYLE,
): Pose => {
  const base = quadrupedPose(realized);
  if (speed <= 0 || !Number.isFinite(phase)) {
    return base;
  }
  const cycle = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const t = cycle / (Math.PI * 2);
  const rotations: Record<string, Mat3> = { ...base.rotations };
  const addRotation = (bone: string, delta: Mat3): void => {
    rotations[bone] = mulMM(rotations[bone] ?? IDENTITY_M, delta);
  };

  for (const leg of QUADRUPED_LEGS) {
    const swing = legSwing(leg, t, style);
    if (!swing) {
      continue;
    }
    const [upper, lower, paw] = legBoneIds(leg);
    // The lower fold lifts the paw on a front leg when positive about X, on a hind leg when
    // negative (its zig-zag leg folds up behind): one sign per kind (see the layout in
    // mob/quadruped.ts). The paw counter-rotation keeps a swinging paw level with the ground.
    const fold = leg[0] === 'F' ? swing.fold : -swing.fold;
    addRotation(upper, rotX(swing.upper));
    addRotation(lower, rotX(fold));
    addRotation(paw, rotX(-(swing.upper + fold)));
  }

  // Trunk lurch: a roll against the step (small — the chest is the swing legs' parent, so a big
  // roll would take planted paws with it), a twist at the waist, and a dip at the lame footfall.
  const roll = style.lurch * Math.sin(Math.PI * 2 * (t - 0.27));
  addRotation('chest', rotZ(roll));
  addRotation('spine', mulMM(rotZ(-0.35 * roll), rotY(0.3 * roll)));
  const hitchDistance = Math.abs(((t - 0.83 + 0.5) % 1) - 0.5);
  const hitch = hitchDistance < 0.125 ? smoothstep(1 - hitchDistance / 0.125) : 0;
  if (hitch > 0) {
    addRotation('chest', rotX(-3 * hitch * style.limp));
    addRotation('jaw', rotX(6 * hitch * style.limp));
    addRotation('shin.BL', rotX(-8 * hitch * style.limp));
    addRotation('paw.BL', rotX(6 * hitch * style.limp));
  }

  addRotation('neck', mulMM(rotY(style.headLoll * Math.sin(Math.PI * 2 * (t - 0.1))), rotX(-0.15 * style.headLoll)));
  addRotation('head', rotY(0.6 * style.headLoll * Math.sin(Math.PI * 2 * (t - 0.3))));
  addRotation('tail', rotY(8 * Math.sin(Math.PI * 2 * (t - 0.35))));
  return groundQuadrupedPose(realized, { ...base, rotations });
};

/** A short stumble/recoil layered over the current gait pose and re-grounded against its paw
 * supports: the chest braces, the head jerks and the whole body lurches into its weak side. */
export const quadrupedHitPose = (realized: Realized, base: Pose, time: number, side = 0): Pose => {
  if (!(time > 0) || time >= HIT_FLINCH.duration) {
    return base;
  }
  const progress = time / HIT_FLINCH.duration;
  const intensity = progress < 0.2 ? smoothstep(progress / 0.2) : 1 - smoothstep((progress - 0.2) / 0.8);
  const rotations: Record<string, Mat3> = { ...base.rotations };
  const addRotation = (bone: string, delta: Mat3): void => {
    rotations[bone] = mulMM(rotations[bone] ?? IDENTITY_M, delta);
  };
  addRotation('spine', rotX(2 * intensity));
  addRotation('chest', mulMM(rotX(3 * intensity), rotZ(3 * intensity * side)));
  addRotation('neck', rotX(-4 * intensity));
  addRotation('head', rotX(-6 * intensity));
  addRotation('jaw', rotX(10 * intensity));
  addRotation('upperArm.FL', rotX(-2 * intensity));
  addRotation('upperArm.FR', rotX(-2 * intensity));
  addRotation('tail', rotY(15 * intensity * side));
  return groundQuadrupedPose(realized, { ...base, rotations });
};
