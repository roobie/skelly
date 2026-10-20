// Idle stances: the "A pose" (walkPose's own speed<=0 rotations: {} bind pose) never appears — a standing
// actor always shows one of these instead, plus a slow procedural motion on top (breathing, weight shift,
// a little restless reach). Authored the same way attack.ts authors clips: per-bone degrees, upright bones
// +x tips back, upperArm's x is the *net* angle from vertical (attack.ts's own upperArmLocalFromNet).
//
// Two layers, both pure functions of (actor, stance[, time]):
//   idleBasePose(actor, stance)        — static: genome-scaled stance + legs bent via 2-bone IK, re-grounded.
//                                         Cacheable per (variant, stance) — doesn't depend on time.
//   applyIdleMotion(base, stance, ...) — the time-varying top layer (breathing/sway/head/claw), composed
//                                         onto a (possibly cached) base. Cheap: no IK, no re-grounding —
//                                         see its own comment on why it never touches the legs.
//   idlePose(actor, stance, time)      — the two composed, for a caller that doesn't need to cache the base.

import type { Bone } from '../core/body.ts';
import { IDENTITY_M, type Mat3, mulMM, rotX, rotY, rotZ, type Vec3 } from '../core/math.ts';
import type { Pose } from '../core/pose.ts';
import { eulerToMat3, scaleForGenome, upperArmLocalFromNet } from './attack.ts';
import {
  GROUND_SMOOTHING,
  groundOffset,
  type LegGeometry,
  legGeometryFor,
  restAngleDeg,
  type Side,
  solveTwoBone,
  type WalkActor,
} from './gait.ts';
import type { HumanoidParams } from './humanoid.ts';

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

export type IdleStance = 'slack' | 'aggravated';

interface StanceData {
  /** Plain (scaleForGenome-scaled) per-bone degrees — everything except the arms, which need the
   * net-angle-from-vertical treatment (see upperArmNetXDegFor). */
  readonly rotations: Partial<Record<string, readonly [number, number, number]>>;
  /** rotZ magnitude for the upper arms — mirrored by side (positive = inward, toward the centreline). */
  readonly upperArmZDeg: number;
  /** Additional hip-to-ankle shortening (metres, before the genome's own kneeBend scaling) — see
   * solveIdleLeg. */
  readonly crouchM: number;
}

// How much extra the aggravated stance's arms reach beyond the chase walk's own steady arm height, so a
// chasing zombie that stops (or gets blended down toward idle at low speed — see gait.ts's walkPose) reads
// as "still reaching," not a sudden extra lift.
const AGGRAVATED_REACH_EXTRA_DEG = 6;

const STANCES: Readonly<Record<IdleStance, StanceData>> = {
  // Wander/idle: head drooped, shoulders slumped (chest/spine pitched forward), arms hanging slightly
  // forward and in, forearms a little bent, jaw slack.
  slack: {
    rotations: {
      spine: [-4, 0, 0],
      chest: [-6, 0, 0],
      neck: [-8, 0, 0],
      head: [-18, 0, 0],
      jaw: [16, 0, 0],
      'forearm.L': [18, 0, 0],
      'forearm.R': [18, 0, 0],
    },
    upperArmZDeg: 8,
    crouchM: 0.02,
  },
  // Chase/attack rest: torso hunched forward but the head tips back up toward the target (a net "still
  // watching you" gaze despite the hunch), jaw open, arms raised forward — matching the chase walk's own
  // steady arm height (see upperArmNetXDegFor) so a walk-to-stand blend (gait.ts's walkPose) doesn't pop —
  // elbows bent, knees bent more than slack (a coiled, ready-to-lunge stance).
  aggravated: {
    rotations: {
      spine: [-8, 0, 0],
      chest: [-14, 0, 0],
      neck: [-3, 0, 0],
      head: [10, 0, 0],
      jaw: [32, 0, 0],
      'forearm.L': [28, 0, 0],
      'forearm.R': [28, 0, 0],
    },
    upperArmZDeg: -10, // outward, reaching toward the target rather than hugging the body
    crouchM: 0.05,
  },
};

/** The upper arm's net angle from vertical (attack.ts's own convention) for `stance` — a fixed, modest
 * forward hang for slack; for aggravated, gait.ts's own walk arm-swing steady-state (see armRotations:
 * averaged over a full cycle, the oscillating swing term is 0 and only params.armRaise remains) plus a
 * little extra reach, so a chase-speed walk blending down to this stance doesn't visibly pop. */
const upperArmNetXDegFor = (stance: IdleStance, params: HumanoidParams): number =>
  stance === 'aggravated' ? params.armRaise + AGGRAVATED_REACH_EXTRA_DEG : 10;

/** Rest-pose (straight-line, not summed-segment) hip-to-ankle distance in the sagittal (Y-Z) plane — the
 * rig's own kneeBend genome param already bends the rest leg a little (humanoid.ts's jointLayout), so this
 * is shorter than l1+l2 by however much that baked-in bend already is. */
const restHipToAnkleSagittal = (thigh: Bone, shin: Bone): { distance: number; z: number } => {
  const [, , z] = shin.tail;
  return { distance: Math.hypot(thigh.head[1] - shin.tail[1], thigh.head[2] - z), z };
};

/**
 * Bends one leg's knee by `crouchM` (shortening the hip-to-ankle reach by that much) while keeping the
 * ankle at its exact rest Z (and, since solveTwoBone only solves the sagittal Y-Z plane, its rest X too —
 * the leg never abducts here) — "feet stay flat at their rest xz." Reuses gait.ts's own two-bone solve
 * (solveTwoBone) and rest-angle-to-local-delta conversion (restAngleDeg), the same pieces
 * legAndFootRotations uses for the walk cycle's own knee bend, just without that function's pelvis-roll/
 * yaw/abduction machinery — an idle stance's pelvis never rotates, so the foot-levelling correction
 * collapses to a single rotX (these are all pure X-axis rotations here, which compose additively).
 *
 * This rig's own thigh/shin rest vectors already lean inward (hip wider than ankle — same "nativeX" gait.ts's
 * own legAndFootRotations accounts for): rotX never touches X, so l1/l2 (each segment's full 3D length,
 * from legGeometryFor) overstate how much *sagittal* (Y-Z) reach is actually available — solveTwoBone
 * itself only models the Y-Z plane. Each segment's own fixed X offset is subtracted out (Pythagoras) before
 * calling it, or the solved angles place the knee off by exactly that segment's own native X (verified
 * numerically against a hand-built target: without this, the ankle lands right but the *knee* — and so
 * the whole shin — ends up rotated a few cm off).
 */
const solveIdleLeg = (
  byId: ReadonlyMap<string, Bone>,
  geom: LegGeometry,
  side: Side,
  crouchM: number,
): { readonly thighDelta: number; readonly shinDelta: number; readonly footR: Mat3 } => {
  const thigh = byId.get(`thigh.${side}`)!;
  const shin = byId.get(`shin.${side}`)!;
  const { distance: restD, z } = restHipToAnkleSagittal(thigh, shin);
  const dz = thigh.head[2] - z;
  const nativeXThigh = thigh.tail[0] - thigh.head[0];
  const nativeXShin = shin.tail[0] - shin.head[0];
  const l1 = Math.sqrt(Math.max(geom.l1 * geom.l1 - nativeXThigh * nativeXThigh, 0));
  const l2 = Math.sqrt(Math.max(geom.l2 * geom.l2 - nativeXShin * nativeXShin, 0));
  const targetD = clamp(restD - crouchM, Math.abs(dz) + 0.01, l1 + l2 - 0.001);
  const dy = Math.sqrt(Math.max(targetD * targetD - dz * dz, 0));
  const target: Vec3 = [thigh.head[0], thigh.head[1] - dy, z];
  const { a1: thighAbs, a2: shinAbs } = solveTwoBone(thigh.head, target, l1, l2);
  const thighDelta = thighAbs - restAngleDeg(thigh);
  const shinDelta = shinAbs - restAngleDeg(shin) - thighDelta;
  return { thighDelta, shinDelta, footR: rotX(-(thighDelta + shinDelta)) };
};

const SIDES: readonly Side[] = ['L', 'R'];

/** The static half of an idle stance: genome-scaled torso/head/jaw/arms, knees bent via solveIdleLeg (feet
 * planted, re-grounded exactly as walkPose re-grounds its own pose). No time argument — cacheable per
 * (variant, stance) by a caller that poses many actors sharing one body (e.g. deadvox's crowd renderer). */
export const idleBasePose = (actor: WalkActor, stance: IdleStance): Pose => {
  const { bones, extents, params } = actor;
  const data = STANCES[stance];
  const torsoPitchX =
    scaleForGenome('spine', data.rotations.spine?.[0] ?? 0, params) +
    scaleForGenome('chest', data.rotations.chest?.[0] ?? 0, params);

  const rotations: Record<string, Mat3> = {};
  for (const [boneId, xyz] of Object.entries(data.rotations)) {
    const [x, y, z] = xyz!;
    rotations[boneId] = eulerToMat3([scaleForGenome(boneId, x, params), y, z]);
  }
  const netX = upperArmNetXDegFor(stance, params);
  for (const side of SIDES) {
    const signZ = side === 'L' ? 1 : -1;
    rotations[`upperArm.${side}`] = eulerToMat3([
      upperArmLocalFromNet(netX, torsoPitchX, params),
      0,
      signZ * data.upperArmZDeg,
    ]);
  }

  const byId = new Map(bones.map((b) => [b.id, b] as const));
  const kneeBendScale = 0.5 + clamp(params.kneeBend / 15, 0, 1); // a little genome flavour, never to 0
  for (const side of SIDES) {
    const geom = legGeometryFor(bones, extents, side);
    const { thighDelta, shinDelta, footR } = solveIdleLeg(byId, geom, side, data.crouchM * kneeBendScale);
    rotations[`thigh.${side}`] = rotX(thighDelta);
    rotations[`shin.${side}`] = rotX(shinDelta);
    rotations[`foot.${side}`] = footR;
  }

  const root: Vec3 = [0, groundOffset(bones, extents, rotations, GROUND_SMOOTHING), 0];
  return { root, rotations };
};

// Slow, small-amplitude procedural motion — periods in seconds, amplitudes in degrees. Never touches the
// legs (thigh/shin/foot): those are fixed by idleBasePose's own IK, so a standing actor's feet never slide
// no matter how long it's been idling (the "weight shift" reads through the chest/spine lean instead of
// the pelvis, exactly so it doesn't drag the legs — rotating the pelvis would move every leg bone with it).
const BREATH_RATE = (2 * Math.PI) / 3.5;
const BREATH_AMPLITUDE_DEG = 2;
const SWAY_RATE = (2 * Math.PI) / 5;
const SWAY_AMPLITUDE_DEG = 2.5;
const HEAD_RATE = (2 * Math.PI) / 6;
const HEAD_AMPLITUDE_DEG = 4;
const CLAW_RATE = (2 * Math.PI) / 1.2;
const CLAW_AMPLITUDE_DEG = 10;

/** A cheap, deterministic 0..2π phase from `seed` and a `salt` (so different motions don't all line up) —
 * a shader-style hash-to-fraction, not a full RNG stream: this is cosmetic phase offsetting, not a
 * behaviourally-significant draw. */
const phaseFor = (seed: number, salt: number): number => {
  const h = Math.sin(seed * 12.9898 + salt * 78.233) * 43_758.5453;
  return (h - Math.floor(h)) * 2 * Math.PI;
};

/**
 * Layers slow procedural motion onto `base` (idleBasePose's output, or any pose — a caller blending walk
 * into idle at low speed could apply this to the already-blended result too): breathing (chest/spine),
 * a weight-shift sway (chest/spine rotZ), slow head motion, and — for `aggravated` — a restless
 * reach/claw on the forearms. `seed` phase-offsets everything so a crowd sharing one body doesn't breathe
 * in lockstep; deadvox passes each zombie's own id, not the shared variant's genome seed, for that reason.
 */
export const applyIdleMotion = (base: Pose, stance: IdleStance, time: number, seed: number): Pose => {
  const breathe = Math.sin(time * BREATH_RATE + phaseFor(seed, 1)) * BREATH_AMPLITUDE_DEG;
  const sway = Math.sin(time * SWAY_RATE + phaseFor(seed, 2)) * SWAY_AMPLITUDE_DEG;
  const headBob = Math.sin(time * HEAD_RATE + phaseFor(seed, 3)) * HEAD_AMPLITUDE_DEG;
  const baseR = (id: string): Mat3 => base.rotations[id] ?? IDENTITY_M;

  const rotations: Record<string, Mat3> = {
    ...base.rotations,
    spine: mulMM(baseR('spine'), mulMM(rotZ(sway * 0.6), rotX(breathe * 0.6))),
    chest: mulMM(baseR('chest'), mulMM(rotZ(sway), rotX(breathe))),
    head: mulMM(baseR('head'), rotY(headBob)),
  };

  if (stance === 'aggravated') {
    const claw = Math.sin(time * CLAW_RATE + phaseFor(seed, 4)) * CLAW_AMPLITUDE_DEG;
    for (const side of SIDES) {
      const sign = side === 'L' ? 1 : -1;
      rotations[`forearm.${side}`] = mulMM(baseR(`forearm.${side}`), rotX(claw * sign));
    }
  }

  return { root: base.root, rotations };
};

/** idleBasePose + applyIdleMotion, for a caller that doesn't need to cache the (time-independent) base
 * itself — the mobgen viewer/stress page/CLI bench all just want "the idle pose right now." */
export const idlePose = (actor: WalkActor, stance: IdleStance, time: number): Pose =>
  applyIdleMotion(idleBasePose(actor, stance), stance, time, actor.seed);
