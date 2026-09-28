// The humanoid walk cycle: a pure function of phase and speed. Phase advances
// with distance travelled, not time (CHALLENGES.md §4): callers do
// `phase += distanceMoved / strideLength(params, legLen, speed)`, so a speed
// change never makes the feet jump or slide.
//
// Sign convention (documented once, used throughout): a hanging limb
// (pointing -Y) swinging forward rotates positively about +X (it moves
// toward -Z). math.ts's rotX(deg) matches this: rotX(delta) maps the
// direction dir(theta) = (0, -cos(theta), -sin(theta)) to dir(theta + delta).
//
// Foot planting: legs are posed by 2-bone IK against an explicit ankle
// target (see legTarget below), not by independently-tuned swing curves, so
// the stance foot lands exactly on its target every phase — no slop to tune
// out. Pelvis roll is compensated (legs are solved in the pelvis's own
// unrotated frame) so it never drags the planted foot.

import type { Bone } from '../core/body.ts';
import { add, applyPoint, type Mat3, mulMM, mulMV, rotX, rotY, sub, transpose, type Vec3 } from '../core/math.ts';
import { boneTransforms, type Pose } from '../core/pose.ts';
import { cellIndex, type Voxels, worldPosition } from '../core/voxelize.ts';
import { FEET_BONES, type HumanoidParams } from './humanoid.ts';

const TAU = Math.PI * 2;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;
const toRad = (deg: number): number => (deg * Math.PI) / 180;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
/** Smooth 0->1 ease with zero slope at both ends (3x²-2x³). */
const smoothstep = (x: number): number => x * x * (3 - 2 * x);
/** 0 at or below wander speed (0.8 m/s), 1 at or above chase speed (2.8 m/s); blends in the
 * speed-dependent crouch/lean below. */
const chaseBlend = (speed: number): number => clamp((speed - 0.8) / 2, 0, 1);

type Side = 'L' | 'R';
const SIDES: readonly Side[] = ['L', 'R'];

const boneMap = (bones: readonly Bone[]): ReadonlyMap<string, Bone> => new Map(bones.map((b) => [b.id, b]));

/** Angle from straight down, in degrees, of a bone's rest direction; forward (-Z) is positive. */
const restAngleDeg = (bone: Bone): number =>
  toDeg(Math.atan2(-(bone.tail[2] - bone.head[2]), -(bone.tail[1] - bone.head[1])));
const boneLen = (bone: Bone): number =>
  Math.hypot(bone.tail[0] - bone.head[0], bone.tail[1] - bone.head[1], bone.tail[2] - bone.head[2]);

/** Distance (metres) travelled per full stride cycle (both feet), from speed, leg length and the genome's
 * strideFactor. 0.6 + 0.95·speed targets human walking data at legLen 0.75 m, strideFactor 1: ~1.0 m at
 * 0.8 m/s, rising toward (but not reaching) ~1.45 m at 1.4 and ~1.8 m at 2.8. The cap, 1.5·legLen, isn't
 * a reach limit — legAndFootRotations' hip-drop solve and heel-toe roll keep the leg IK well short of
 * full extension for any stride here, no sliding (checked across every template/strideFactor extreme).
 * It's a *crouch* limit: reaching the targets above needs a hip drop of roughly 25% of leg length;
 * 1.5·legLen keeps it under 8% (see mobgen's report on this change for the numbers). Above the cap,
 * cadence alone carries speed — see gait.test.ts. */
export const strideLength = (params: HumanoidParams, legLen: number, speed: number): number => {
  if (speed <= 0) {
    return legLen; // unused when standing (speed 0), kept positive so callers never divide by zero
  }
  const raw = legLen * (0.6 + 0.95 * speed) * params.strideFactor;
  const cap = 1.5 * legLen;
  return Math.min(raw, cap);
};

export interface Extent {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Extends `existing` (if any) to also cover the cell at `p` (a cube of side `2*half` centred on it). */
const mergeExtent = (existing: Extent | undefined, p: Vec3, half: number): Extent => {
  const lo: Vec3 = [p[0] - half, p[1] - half, p[2] - half];
  const hi: Vec3 = [p[0] + half, p[1] + half, p[2] + half];
  if (!existing) {
    return { min: lo, max: hi };
  }
  return {
    min: [Math.min(existing.min[0], lo[0]), Math.min(existing.min[1], lo[1]), Math.min(existing.min[2], lo[2])],
    max: [Math.max(existing.max[0], hi[0]), Math.max(existing.max[1], hi[1]), Math.max(existing.max[2], hi[2])],
  };
};

/** The 8 world-space corners of each foot bone's rest-pose voxel bounding box; precompute once per actor. */
export const footRestExtents = (bones: readonly Bone[], voxels: Voxels): ReadonlyMap<string, Extent> => {
  const extents = new Map<string, Extent>();
  const [nx, ny, nz] = voxels.dims;
  const half = voxels.size / 2;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const owner = voxels.owner[cellIndex(voxels.dims, i, j, k)];
        if (!owner) {
          continue;
        }
        const bone = bones[owner - 1]!;
        if (!FEET_BONES.includes(bone.id)) {
          continue;
        }
        const p = worldPosition(voxels, i, j, k);
        extents.set(bone.id, mergeExtent(extents.get(bone.id), p, half));
      }
    }
  }
  return extents;
};

/** Exported for tests: the 8 corners of a rest-pose extent, e.g. from footRestExtents. */
export const corners = (e: Extent): Vec3[] => {
  const out: Vec3[] = [];
  for (const x of [e.min[0], e.max[0]]) {
    for (const y of [e.min[1], e.max[1]]) {
      for (const z of [e.min[2], e.max[2]]) {
        out.push([x, y, z]);
      }
    }
  }
  return out;
};

/** 2-bone planar IK in the Y-Z (sagittal) plane: absolute angle-from-vertical (degrees, forward positive)
 * for each segment so the end effector reaches `target` from `origin`. */
const solveTwoBone = (origin: Vec3, target: Vec3, l1: number, l2: number): { a1: number; a2: number } => {
  const dy = target[1] - origin[1];
  const dz = target[2] - origin[2];
  const rawD = Math.hypot(dy, dz) || 1e-6;
  const d = clamp(rawD, Math.abs(l1 - l2) + 1e-4, l1 + l2 - 1e-4);
  const scaleFactor = d / rawD;
  const cy = dy * scaleFactor;
  const cz = dz * scaleFactor;
  const baseAngle = Math.atan2(-cz, -cy);
  const cosAlpha = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const alpha = Math.acos(cosAlpha);
  const a1 = baseAngle + alpha; // "knee/elbow forward" branch
  const kneeY = origin[1] - l1 * Math.cos(a1);
  const kneeZ = origin[2] - l1 * Math.sin(a1);
  const a2 = Math.atan2(-(target[2] - kneeZ), -(target[1] - kneeY));
  return { a1: toDeg(a1), a2: toDeg(a2) };
};

/** Rotates the rest vector (y0, z0) — from a fixed ground pivot to the ankle — by `phiRad` in the
 * sagittal (Y, Z) plane. Because this is a proper rotation, the vector's absolute angle (in the same
 * atan2(z, y) sense restAngleDeg reads off a bone) shifts by exactly `phiRad`: that's why footPitchDeg
 * below can just be toDeg(phi), with no inverse trig needed to re-derive it. */
const rotateYZ = (y0: number, z0: number, phiRad: number): readonly [number, number] => {
  const c = Math.cos(phiRad);
  const s = Math.sin(phiRad);
  return [y0 * c - z0 * s, y0 * s + z0 * c];
};

const HEEL_FRAC = 0.15; // fraction of stance, at its start, spent rolling from heel-strike to flat
const TOE_FRAC = 0.2; // fraction of stance, at its end, spent rolling from flat to toe-off
const HEEL_ROLL_MAX_DEG = 25; // toe-up pitch at heel-strike (foot rotating about the heel)
const TOE_ROLL_MAX_DEG = 35; // heel-up pitch at push-off (foot rotating about the toe)
// Ankle-to-heel distance, as a fraction of ankle-to-toe (footLen), used only as a fallback when the
// actual voxel extent isn't available (there's no explicit heel joint in this rig — the foot bone only
// runs ankle-to-toe — so legAndFootRotations prefers measuring both distances directly off the foot's
// rest-pose voxel extent, which is exact).
const HEEL_LEN_FRAC = 0.35;

interface FootTarget {
  /** Ankle height, in the pelvis's own (unrotated) rest frame, before any pelvis-drop or root shift. */
  readonly y: number;
  /** Ankle offset from the hip along Z (forward is -Z; conventions.ts), same frame as `y`. */
  readonly z: number;
  /** rotX delta applied to the foot bone on top of "keep it level" — 0 is flat/level, as before. */
  readonly footPitchDeg: number;
}

/**
 * The stance foot's ankle target and sole pitch across stance (t: 0 at heel-strike, 1 at toe-off).
 * Mid-stance is flat, ankle sweeping linearly from ahead to behind. At each end the foot instead rolls
 * about the heel (touchdown) or toe (push-off) — a real bounded rotation about the fixed ground pivot,
 * which is what keeps that point from sliding while letting the ankle lag/lead it (see strideLength).
 * The roll fraction is smoothstep-eased so its rate is 0 at the flat handoff (t=HEEL_FRAC / 1-TOE_FRAC),
 * matching the flat segment's own zero slope with no kink.
 *
 * The pivot (heel or toe) tracks flatZ(t) at the same slope, shifted by a constant (heelLen or -toeLen)
 * — not frozen — because a ground-fixed point's hip-relative Z must keep advancing at the hip's rate;
 * freezing it would read back as the foot skidding forward once the root's own translation is added.
 */
/** Everything about a leg's own foot needed to place it, besides phase and stride. */
interface FootGeometry {
  readonly ankleRestY: number;
  readonly heelLen: number;
  readonly toeLen: number;
  readonly footLift: number;
}

const stanceFootTarget = (t: number, stride: number, geom: FootGeometry): FootTarget => {
  const { ankleRestY, heelLen, toeLen } = geom;
  const flatZ = (u: number): number => stride * (u - 0.5);
  if (t < HEEL_FRAC) {
    const pivotZ = flatZ(t) + heelLen;
    const theta = toRad(HEEL_ROLL_MAX_DEG * smoothstep(1 - t / HEEL_FRAC)); // max at t=0, 0 (and flat-rate) at t=HEEL_FRAC
    const [y, zRel] = rotateYZ(ankleRestY, -heelLen, theta);
    return { y, z: pivotZ + zRel, footPitchDeg: toDeg(theta) };
  }
  if (t > 1 - TOE_FRAC) {
    const pivotZ = flatZ(t) - toeLen;
    const theta = toRad(TOE_ROLL_MAX_DEG * smoothstep((t - (1 - TOE_FRAC)) / TOE_FRAC)); // 0 (flat-rate) there, max at t=1
    const [y, zRel] = rotateYZ(ankleRestY, toeLen, -theta);
    return { y, z: pivotZ + zRel, footPitchDeg: -toDeg(theta) };
  }
  return { y: ankleRestY, z: flatZ(t), footPitchDeg: 0 };
};

const HERMITE_H = 1e-4; // step for the numeric d/dt of stanceFootTarget at its own endpoints

interface Keyframe {
  readonly value: number;
  readonly slope: number;
}

/** Cubic Hermite basis: k0 at t=0, k1 at t=1. */
const hermite = (t: number, k0: Keyframe, k1: Keyframe): number => {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * k0.value +
    (t3 - 2 * t2 + t) * k0.slope +
    (-2 * t3 + 3 * t2) * k1.value +
    (t3 - t2) * k1.slope
  );
};

/** Central-difference d/dt of stanceFootTarget at t, extending slightly past [0,1] — safe since each
 * branch's formula is just a smooth polynomial in t past its nominal domain. */
const stanceTargetDeriv = (t: number, stride: number, geom: FootGeometry): FootTarget => {
  const a = stanceFootTarget(t - HERMITE_H, stride, geom);
  const b = stanceFootTarget(t + HERMITE_H, stride, geom);
  const d = (x: number, y: number): number => (y - x) / (2 * HERMITE_H);
  return { y: d(a.y, b.y), z: d(a.z, b.z), footPitchDeg: d(a.footPitchDeg, b.footPitchDeg) };
};

/** Swing: a Hermite curve from stance's toe-off (t=1) to its heel-strike (t=0), matching stance's own
 * position and velocity at both ends (C1 handoff), plus a lift bump whose value *and* slope are 0 at
 * both ends (sin²) so it can't disturb that continuity. */
const swingFootTarget = (t: number, stride: number, geom: FootGeometry): FootTarget => {
  const p0 = stanceFootTarget(1, stride, geom);
  const p1 = stanceFootTarget(0, stride, geom);
  const m0 = stanceTargetDeriv(1, stride, geom);
  const m1 = stanceTargetDeriv(0, stride, geom);
  const lift = geom.footLift * Math.sin(Math.PI * t) ** 2;
  const field = (key: 'y' | 'z' | 'footPitchDeg'): number =>
    hermite(t, { value: p0[key], slope: m0[key] }, { value: p1[key], slope: m1[key] });
  return { y: field('y') + lift, z: field('z'), footPitchDeg: field('footPitchDeg') };
};

const footTargetFor = (legPhase: number, stride: number, geom: FootGeometry): FootTarget => {
  const stance = legPhase < 0.5;
  const t = stance ? legPhase / 0.5 : (legPhase - 0.5) / 0.5;
  return stance ? stanceFootTarget(t, stride, geom) : swingFootTarget(t, stride, geom);
};

// Max leg extension, as a fraction of l1+l2, before the knee would start reading as locked straight.
const REACH_MARGIN = 0.99;

/** How far the hip must drop (see legAndFootRotations) for `target` to be reachable at no more than
 * REACH_MARGIN of the leg's full length — explicit and bounded, rather than whatever solveTwoBone's own
 * clamp happens to produce (which is what used to cause foot-slide: see strideLength's doc comment). */
const requiredDrop = (hipY: number, target: FootTarget, legLen: number): number => {
  const reachCap = REACH_MARGIN * legLen;
  const dz = clamp(target.z, -reachCap, reachCap); // strideLength's cap keeps |z| well inside reachCap
  const neededH = Math.sqrt(Math.max(reachCap * reachCap - dz * dz, 0));
  return Math.max(0, hipY - target.y - neededH);
};

/** Speed-dependent crouch: a little extra hip drop as speed rises toward chase, sized by the genome's
 * own kneeBend (no new sampled param) — a lurching, more bent-kneed chase instead of a straight-legged
 * sprint the rig can't really do. Moderate on purpose: this rides on top of requiredDrop, which already
 * uses most of the reach budget. */
const crouchDrop = (speed: number, params: HumanoidParams, legLen: number): number =>
  chaseBlend(speed) * clamp(params.kneeBend / 25, 0, 1) * 0.03 * legLen;

const BOB_SAMPLES = 128; // resolution for sampling one leg's peak required drop over a full cycle
const BOB_SAFETY = 1.05; // margin over the sampled peak, so BOB_SAMPLES quantization can't undershoot it

/** Largest requiredDrop a leg needs anywhere in its cycle, sampled at BOB_SAMPLES phases (plus a safety
 * margin: the true continuous peak can fall slightly between samples). */
const peakRequiredDrop = (hipY: number, stride: number, geom: FootGeometry, legLen: number): number => {
  let peak = 0;
  for (let i = 0; i < BOB_SAMPLES; i++) {
    peak = Math.max(peak, requiredDrop(hipY, footTargetFor(i / BOB_SAMPLES, stride, geom), legLen));
  }
  return peak * BOB_SAFETY;
};

// requiredDrop actually peaks a little *inside* each roll window, not at the handoff instant itself
// (the roll's own ankle lift briefly reduces the reach needed right at heel-strike/toe-off) — checked by
// sampling (see mobgen's report). BOB_PLATEAU covers the larger of the two roll windows so the bob stays
// at its max D across that whole peak, easing smoothly to 0 exactly by the true mid-stance/mid-swing
// point (a quarter-cycle later), where requiredDrop is genuinely ~0.
const BOB_PLATEAU = 0.5 * Math.max(HEEL_FRAC, TOE_FRAC);
const BOB_TRANSITION = 0.25 - BOB_PLATEAU;

/** Smooth hip bob, 0..1: 1 through the double-support handoffs' roll windows (phase 0, 0.5 ± BOB_PLATEAU),
 * 0 by mid-stance/mid-swing (phase 0.25, 0.75) — replaces max(dropL, dropR), whose kinks were there. */
const bobShape = (phase: number): number => {
  const q = ((phase % 0.5) + 0.5) % 0.5;
  const dist = Math.min(q, 0.5 - q);
  if (dist <= BOB_PLATEAU) {
    return 1;
  }
  if (dist >= BOB_PLATEAU + BOB_TRANSITION) {
    return 0;
  }
  return smoothstep(1 - (dist - BOB_PLATEAU) / BOB_TRANSITION);
};

/** Rotate `p` about `pivot` by the inverse of R — pulls a world-frame target back into a parent's rest frame. */
const unrotate = (p: Vec3, pivot: Vec3, r: Mat3): Vec3 => add(pivot, mulMV(transpose(r), sub(p, pivot)));

const legPhaseOf = (side: Side, phase: number): number => (side === 'L' ? phase : phase + 0.5) % 1;

interface GaitContext {
  readonly bones: ReadonlyMap<string, Bone>;
  readonly extents: ReadonlyMap<string, Extent>;
  readonly params: HumanoidParams;
  readonly phase: number;
  readonly speed: number;
  readonly pelvisR: Mat3;
  readonly pelvisPivot: Vec3;
}

const legAndFootRotations = (ctx: GaitContext): Record<string, Mat3> => {
  const { params, speed } = ctx;

  const perSide = SIDES.map((side) => {
    const thigh = ctx.bones.get(`thigh.${side}`)!;
    const shin = ctx.bones.get(`shin.${side}`)!;
    const foot = ctx.bones.get(`foot.${side}`)!;
    const l1 = boneLen(thigh);
    const l2 = boneLen(shin);
    const legLen = l1 + l2;
    const footLen = boneLen(foot); // ankle-to-toe: matches the extent almost exactly (toe = bone tip)
    // Ankle-to-heel: there's no heel joint in the rig, so measure it off the actual voxel extent
    // (heel is the side of the sole furthest *behind* the ankle, i.e. largest rest Z) when we have
    // it — falling back to a fixed fraction of footLen only for callers without extents (there are
    // none in this codebase today, but the fallback keeps this function total). Getting this from the
    // real geometry, not a guessed fraction, is what keeps the heel-roll pivot's position matching
    // where the foot's own voxels actually are — a mismatch here is exactly what would make the
    // "planted" heel corner drift instead of staying put (see gait.test.ts's planted-foot test).
    const footExtent = ctx.extents.get(`foot.${side}`);
    const [, , ankleZ] = shin.tail;
    const heelLen = footExtent ? footExtent.max[2] - ankleZ : footLen * HEEL_LEN_FRAC;
    const toeLen = footExtent ? ankleZ - footExtent.min[2] : footLen;
    const limpFactor = side === 'R' ? 1 - clamp(params.limp, 0, 1) : 1;
    const stride = (strideLength(params, legLen, speed) / 2) * limpFactor;
    const legPhase = legPhaseOf(side, ctx.phase);
    const geom: FootGeometry = { ankleRestY: shin.tail[1], heelLen, toeLen, footLift: params.footLift };
    const target = footTargetFor(legPhase, stride, geom);
    const bobPeak = peakRequiredDrop(thigh.head[1], stride, geom, legLen);
    return { side, thigh, shin, foot, l1, l2, legLen, target, bobPeak };
  });

  // One drop for both legs (it's a single root-level shift), smoothly bobbing between 0 and the
  // cycle's peak required drop D, plus the speed-crouch — see bobShape's doc comment for why this has
  // no kink where max(dropL, dropR) used to. Feeding it into both legs' targets keeps them consistent.
  const avgLegLen = (perSide[0]!.legLen + perSide[1]!.legLen) / 2;
  const D = Math.max(perSide[0]!.bobPeak, perSide[1]!.bobPeak);
  const drop = D * bobShape(ctx.phase) + crouchDrop(speed, params, avgLegLen);

  const out: Record<string, Mat3> = {};
  for (const p of perSide) {
    const worldTarget: Vec3 = [p.thigh.head[0], p.target.y + drop, p.thigh.head[2] + p.target.z];
    const target = unrotate(worldTarget, ctx.pelvisPivot, ctx.pelvisR);

    const { a1: thighAbs, a2: shinAbs } = solveTwoBone(p.thigh.head, target, p.l1, p.l2);
    const thighDelta = thighAbs - restAngleDeg(p.thigh);
    const shinDelta = shinAbs - restAngleDeg(p.shin) - thighDelta;
    const thighR = rotX(thighDelta);
    const shinR = rotX(shinDelta);
    // Keep the foot level in *world* space: undo pelvis-roll ∘ thigh ∘ shin exactly, by matrix
    // inverse (transpose, since these are all rotations) rather than trying to cancel it with another
    // rotX angle. A scalar angle only cancels rotations about the same axis; pelvis roll is about Z,
    // not X, so it can't be undone that way — it has to be the real inverse. Then pitch the sole by
    // footPitchDeg on top (0 during flat stance and swing — same "level" result as before).
    const footLevelR = transpose(mulMM(mulMM(ctx.pelvisR, thighR), shinR));
    const footR = mulMM(footLevelR, rotX(p.target.footPitchDeg));

    out[`thigh.${p.side}`] = thighR;
    out[`shin.${p.side}`] = shinR;
    out[`foot.${p.side}`] = footR;
  }
  return out;
};

const armRotations = (phase: number, params: HumanoidParams): Record<string, Mat3> => {
  const out: Record<string, Mat3> = {};
  for (const side of SIDES) {
    const offset = side === 'L' ? 0 : Math.PI;
    const swing = params.armSwing * Math.sin(TAU * phase + offset);
    out[`upperArm.${side}`] = rotX(swing + params.armRaise);
    out[`forearm.${side}`] = rotX(20 + 15 * Math.sin(TAU * phase + offset));
  }
  return out;
};

const groundOffset = (
  bones: readonly Bone[],
  extents: ReadonlyMap<string, Extent>,
  rotations: Record<string, Mat3>,
): number => {
  const transforms = boneTransforms(bones, { root: [0, 0, 0], rotations });
  let minY = Number.POSITIVE_INFINITY;
  for (const [boneId, extent] of extents) {
    const t = transforms.get(boneId);
    if (!t) {
      continue;
    }
    for (const c of corners(extent)) {
      minY = Math.min(minY, applyPoint(t, c)[1]);
    }
  }
  return Number.isFinite(minY) ? -minY : 0;
};

export interface WalkActor {
  readonly bones: readonly Bone[];
  readonly extents: ReadonlyMap<string, Extent>;
  readonly params: HumanoidParams;
}

/**
 * The walk cycle. `phase` is 0..1 per stride cycle and should advance with
 * distance travelled (phase += distanceMoved / strideLength(...)); `speed`
 * (m/s) drives stride length and the standing/walking blend. Speed 0 gives a
 * still standing pose, regardless of phase.
 */
export const walkPose = (actor: WalkActor, phase: number, speed: number): Pose => {
  const { bones, extents, params } = actor;
  const byId = boneMap(bones);
  const pelvis = byId.get('pelvis')!;

  if (speed <= 0) {
    const root: Vec3 = [0, groundOffset(bones, extents, {}), 0];
    return { root, rotations: {} };
  }

  const p = ((phase % 1) + 1) % 1;
  // Pelvis sway: a fore-aft rock (rotX), not a side-to-side roll — deliberately, not just for looks.
  // The leg IK below works entirely in the Y-Z (sagittal) plane and only cancels rotations about the
  // same axis it swings in (X); a Z-axis roll would leak into the plane it can't correct for (see
  // legAndFootRotations's comment), and re-deriving a general 3D IK isn't worth it for a cosmetic
  // wobble. A speed-dependent forward lean (sized by the genome's own hunch, no new sampled param) is
  // added on top — purely cosmetic (a steady tilt, not oscillating), it reads as more of a forward
  // lurch at chase speed. It doesn't feed into the leg reach math (legAndFootRotations solves in the
  // pelvis's own unrotated frame), so it can't affect whether a stride is reachable.
  const leanDeg = chaseBlend(speed) * clamp(params.hunch / 25, 0, 1) * 8;
  const pelvisRollDeg = params.pelvisSway * Math.sin(TAU * p * 2) + leanDeg;
  const pelvisR = rotX(pelvisRollDeg);
  const legCtx: GaitContext = { bones: byId, extents, params, phase: p, speed, pelvisR, pelvisPivot: pelvis.head };

  const rotations: Record<string, Mat3> = {
    pelvis: pelvisR,
    spine: rotY(params.spineTwist * Math.sin(TAU * p * 2 + Math.PI)),
    head: rotX(params.headLoll * Math.sin(TAU * p * 2)),
    jaw: rotX(params.jawChatter * Math.abs(Math.sin(TAU * p * 8))),
    ...armRotations(p, params),
    ...legAndFootRotations(legCtx),
  };

  const root: Vec3 = [0, groundOffset(bones, extents, rotations), 0];
  return { root, rotations };
};
