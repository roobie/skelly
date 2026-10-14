// Quadruped (dog) poses: a standing pose grounded flat on its four paw supports, a limping,
// uneven lurch of a gait layered over it, and a short hit flinch — every layer re-grounded
// against the paw supports, the same pattern as mob/crawler.ts (which grounds against its own
// support bones). The walk is driven by the ground distance the body has advanced, not by
// elapsed time, and every stance leg is solved to sweep its paw exactly that ground backwards
// under the body: the legs stay in sync with the travel, so a planted paw stays planted.
// groundQuadrupedPose puts the lowest support surface back on y = 0.

import type { Realized } from '../core/generate.ts';
import { IDENTITY_M, type Mat3, mulMM, rotX, rotY, rotZ, type Vec3 } from '../core/math.ts';
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

const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Gait shape driving the whole body, sampled by the template (see mob/quadruped.ts's
 * QUADRUPED_PARAM_ORDER) and handed in by whoever poses the actor. */
export interface QuadrupedStyle {
  /** 0..1: how badly the animal limps — shortens the lame diagonal's step and its lift. */
  readonly limp: number;
  /** Step-length multiplier (the template's strideFactor). */
  readonly stride: number;
  /** Lurch amplitude, degrees — how hard the head, neck and tail haul against the step. */
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

// ---- leg geometry and the sagittal solve ----

/** One leg's sagittal (y-z) chain, measured from its rest skeleton: `u` runs the upper segment
 * (hip/shoulder to knee), `v` the lower one (knee to the ankle at the paw's head), and `ankle` is
 * the rest ankle position relative to the upper's pivot. Rotations about X leave x untouched, so
 * the whole leg motion lives in this plane (see the layout in mob/quadruped.ts). */
interface SagittalLeg {
  readonly upper: string;
  readonly lower: string;
  readonly paw: string;
  readonly upperLen: number;
  readonly lowerLen: number;
  readonly ankle: Vec3;
  /** Rest direction of each segment and of the whole leg, as `atan2(z, -y)` (0 = straight down). */
  readonly upperAngle: number;
  readonly lowerAngle: number;
  readonly ankleAngle: number;
}

const legAngle = (dy: number, dz: number): number => Math.atan2(dz, -dy);

const boneHead = (realized: Realized, id: string): Vec3 => {
  const bone = realized.body.bones.find((candidate) => candidate.id === id);
  if (!bone) {
    throw new Error(`quadruped leg bone "${id}" is missing`);
  }
  return bone.head;
};

const sagittalCache = new WeakMap<Realized, Readonly<Record<QuadrupedLeg, SagittalLeg>>>();

const sagittalLegs = (realized: Realized): Readonly<Record<QuadrupedLeg, SagittalLeg>> => {
  const cached = sagittalCache.get(realized);
  if (cached) {
    return cached;
  }
  const legs = {} as Record<QuadrupedLeg, SagittalLeg>;
  for (const leg of QUADRUPED_LEGS) {
    const [upper, lower, paw] = legBoneIds(leg);
    const upperHead = boneHead(realized, upper);
    const knee = boneHead(realized, lower);
    const ankle = boneHead(realized, paw);
    const uy = knee[1] - upperHead[1];
    const uz = knee[2] - upperHead[2];
    const vy = ankle[1] - knee[1];
    const vz = ankle[2] - knee[2];
    legs[leg] = {
      upper,
      lower,
      paw,
      upperLen: Math.hypot(uy, uz),
      lowerLen: Math.hypot(vy, vz),
      ankle: [0, uy + vy, uz + vz],
      upperAngle: legAngle(uy, uz),
      lowerAngle: legAngle(vy, vz),
      ankleAngle: legAngle(uy + vy, uz + vz),
    };
  }
  sagittalCache.set(realized, legs);
  return legs;
};

/** Two-link solve of one leg: joint angles (degrees, about X) that place the ankle at `target`
 * [y, z] relative to the upper's pivot, in the leg's rest sagittal plane. The knee keeps its rest
 * bend side, the target is clamped to the leg's reach so the chain never snaps past its
 * geometry, and the rest pose is its own fixed point (both angles 0). The paw then counter-
 * rotates by the returned sum so its sole keeps one orientation: a planted sole sits flat where
 * the solve put its ankle, and a swinging one never plows the ground. */
const solveLeg = (leg: SagittalLeg, targetY: number, targetZ: number): { upper: number; lower: number } => {
  const l1 = leg.upperLen;
  const l2 = leg.lowerLen;
  const d = Math.max(
    Math.abs(l1 - l2) + (l1 + l2) * 1e-4,
    Math.min((l1 + l2) * (1 - 1e-4), Math.hypot(targetY, targetZ)),
  );
  const clamp = (value: number): number => Math.max(-1, Math.min(1, value));
  // Triangle: the angle at the pivot between the whole leg and the upper segment decides where
  // the knee goes (the rest knee's side), and the angle at the knee decides the fold.
  const atPivot = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
  const kneeAngle = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2)));
  const targetAngle = legAngle(targetY, targetZ);
  const kneeSide = Math.sign(leg.upperAngle - leg.ankleAngle) || 1;
  const upperWorld = targetAngle + kneeSide * atPivot;
  const fold = Math.PI - kneeAngle;
  // Directions run `atan2(z, -y)`, where a rotation about X by a positive angle turns a vector
  // forward (-Z) and so subtracts from its angle (core/math.ts's rotX).
  return {
    upper: toDeg(leg.upperAngle - upperWorld),
    lower: toDeg(leg.lowerAngle - leg.upperAngle - (Math.sign(leg.lowerAngle - leg.upperAngle) || 1) * fold),
  };
};

// ---- the walk itself ----

/** Opposite-corner diagonal pairs: fore-left with hind-right, fore-right with hind-left — the
 * pairs the dog's gait rule names (`mobgen/PROJECT.md`, "Body-plan constraints"). The second
 * diagonal carries the lame back-left leg, so the shamble's unevenness is its short step, not a
 * leg that moves out of step with its partner. */
const DIAGONAL_PAIRS = [
  ['FL', 'BR'],
  ['FR', 'BL'],
] as const satisfies readonly (readonly [QuadrupedLeg, QuadrupedLeg])[];

/** How much shorter the lame diagonal steps across the full limp, and how much less its paw
 * lifts; the healthy fore leg on the opposite diagonal over-reaches to compensate. */
const LIMP_STEP_SHORTEN = 0.45;
const LIMP_LIFT_SHORTEN = 0.4;
const FORE_COMPENSATE = 0.12;
/** Swing paw lift at mid-swing in metres, before the per-leg limp scaling. */
const LIFT_HEIGHT_M = 0.045;
/** Fraction of each leg's total chain length held back from full extension, so the solve stays
 * well conditioned at the extremes of a step. */
const REACH_MARGIN = 0.02;

/** How far one leg's ankle can travel fore and aft at its rest height, in metres. The rest
 * chain sits close to full extension, so the budget is the chord the ankle may draw around its
 * rest spot before the chain runs out of reach; a pair's step is what its tighter leg sweeps. */
const legStepReach = (leg: SagittalLeg): { forward: number; back: number } => {
  const reach = (leg.upperLen + leg.lowerLen) * (1 - REACH_MARGIN);
  const slack = Math.sqrt(Math.max(0, reach * reach - leg.ankle[1] * leg.ankle[1]));
  return { forward: Math.max(0, slack + leg.ankle[2]), back: Math.max(0, slack - leg.ankle[2]) };
};

interface DiagonalStep {
  readonly legs: readonly [QuadrupedLeg, QuadrupedLeg];
  /** Metres the paw lands ahead of its rest spot, and how far it trails at lift-off. */
  readonly forward: number;
  readonly back: number;
  readonly step: number;
}

/** Per-diagonal step geometry in metres of ground: both legs of one diagonal plant and sweep
 * together over the same span, so their shared step is exactly the ground their stance covers. */
const diagonalStepsFor = (realized: Realized, style: QuadrupedStyle): readonly [DiagonalStep, DiagonalStep] => {
  const legs = sagittalLegs(realized);
  const limpScale = clamp01(style.limp);
  const build = (pairIndex: 0 | 1): DiagonalStep => {
    const pair = DIAGONAL_PAIRS[pairIndex];
    const reaches = pair.map((leg) => legStepReach(legs[leg]));
    const forward = Math.min(...reaches.map((reach) => reach.forward));
    const back = Math.min(...reaches.map((reach) => reach.back));
    const lame = pairIndex === 1;
    const scale = style.stride * (lame ? 1 - LIMP_STEP_SHORTEN * limpScale : 1 + FORE_COMPENSATE * limpScale);
    return { legs: pair, forward: forward * scale, back: back * scale, step: (forward + back) * scale };
  };
  return [build(0), build(1)];
};

/** Ground distance (metres) the quadruped covers in one full walk cycle (both diagonals).
 * Derived from what its stance legs actually sweep, so a caller advances the walk by distance
 * and the paws plant at any speed. */
export const quadrupedStrideLength = (realized: Realized, style: QuadrupedStyle = DEFAULT_STYLE): number =>
  diagonalStepsFor(realized, style).reduce((sum, diagonal) => sum + diagonal.step, 0);

/** How much a swinging paw lifts this step: the lame leg drags its lift, the healthy fore leg
 * reaches a little higher. */
const swingLiftScale = (leg: QuadrupedLeg, limpScale: number): number => {
  if (leg === 'BL') {
    return 1 - LIMP_LIFT_SHORTEN * limpScale;
  }
  if (leg === 'FL') {
    return 1 + FORE_COMPENSATE * limpScale;
  }
  return 1;
};

/**
 * A staggering diagonal walk driven by ground distance, not wall time: `distance` is how far the
 * body has advanced, so a planted paw rides the moving ground and any `speed` only says how fast
 * distance grows (0 speed or a non-finite distance means the animal stands). Opposite-corner
 * pairs (fore-left with hind-right, fore-right with hind-left) share a phase and the opposite
 * pair is half a cycle off; over its stance a pair's paws sweep exactly the ground their step
 * promises, so each step covers the ground the stride suggests and the shamble's unevenness
 * lives in the lame diagonal's short step and lift rather than in legs that move out of step.
 */
export const quadrupedGaitPose = (
  realized: Realized,
  distance: number,
  speed: number,
  style: QuadrupedStyle = DEFAULT_STYLE,
): Pose => {
  const base = quadrupedPose(realized);
  if (speed <= 0 || !Number.isFinite(distance)) {
    return base;
  }
  const legs = sagittalLegs(realized);
  const limpScale = clamp01(style.limp);
  const [first, second] = diagonalStepsFor(realized, style);
  const cycleLength = first.step + second.step;
  const cycle = ((distance % cycleLength) + cycleLength) % cycleLength;
  // Whose stance half the distance clock sits in: that diagonal plants and sweeps over exactly
  // its own step of ground while the opposite one swings its paw back to the forward spot. Both
  // walk the same progress through the half, so the swap is seamless at the boundary.
  const firstStance = cycle < first.step;
  const stance = firstStance ? first : second;
  const swing = firstStance ? second : first;
  const progress = (cycle - (firstStance ? 0 : first.step)) / stance.step;

  const rotations: Record<string, Mat3> = { ...base.rotations };
  const addRotation = (bone: string, delta: Mat3): void => {
    rotations[bone] = mulMM(rotations[bone] ?? IDENTITY_M, delta);
  };

  for (const leg of QUADRUPED_LEGS) {
    const sag = legs[leg];
    const planted = stance.legs.includes(leg);
    // The planted paw travels from `forward` ahead of its rest spot to `back` behind it across
    // its stance: exactly the ground the body covers in that time, so it holds its ground
    // position. The swinging paw walks its own step back to the forward spot with a lift that
    // clears the ground, easing into and out of the flight.
    const away = planted ? -stance.forward + stance.step * progress : swing.back - swing.step * smoothstep(progress);
    const lift = planted ? 0 : LIFT_HEIGHT_M * Math.sin(Math.PI * progress) * swingLiftScale(leg, limpScale);
    const { upper, lower } = solveLeg(sag, sag.ankle[1] + lift, sag.ankle[2] + away);
    // The paw counter-rotates against the solved chain so its sole keeps one orientation.
    addRotation(sag.upper, rotX(upper));
    addRotation(sag.lower, rotX(lower));
    addRotation(sag.paw, rotX(-(upper + lower)));
  }

  // The shamble's haul: head, neck and tail swing against the step, and the jaw winces around the
  // lame footfall. The trunk stays out of this on purpose — chest and pelvis carry the planted
  // legs, so rolling or dipping them would drag those paws off the ground they are holding.
  const t = cycle / cycleLength;
  const hitchDistance = Math.abs(cycle - first.step - Math.round((cycle - first.step) / cycleLength) * cycleLength);
  const hitchWindow = cycleLength * 0.125;
  const hitch = hitchDistance < hitchWindow ? smoothstep(1 - hitchDistance / hitchWindow) : 0;
  addRotation(
    'neck',
    mulMM(rotY((style.headLoll + style.lurch) * Math.sin(Math.PI * 2 * (t - 0.1))), rotX(-0.15 * style.headLoll)),
  );
  addRotation('head', rotY(0.6 * (style.headLoll + style.lurch) * Math.sin(Math.PI * 2 * (t - 0.3))));
  addRotation('tail', rotY((8 + 2 * style.lurch) * Math.sin(Math.PI * 2 * (t - 0.35))));
  if (hitch > 0) {
    addRotation('jaw', rotX(6 * hitch * style.limp));
    addRotation('neck', rotX(-2 * hitch * style.limp));
    addRotation('head', rotX(3 * hitch * style.limp));
  }
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
