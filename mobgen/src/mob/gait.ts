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
 * Mid-stance (flat) is exactly the old ankle-only model: the target sweeps linearly from ahead
 * (-stride/2) to behind (+stride/2) as the body passes over the planted foot, unrotated. At each end,
 * the foot instead rolls — about the heel while it's touching down, about the toe while it's pushing
 * off — which is what actually stays planted now: not the ankle (which is free to lag behind, at
 * heel-strike, or lead ahead of, at push-off, that fixed ground point by rolling around it), but the
 * heel/toe pivot itself. That roll is a real, bounded rotation, not a coordinate trick: it both raises
 * the ankle above the fixed pivot and shortens its horizontal distance from the hip, which is what lets
 * strideLength (see its doc comment) allow a longer stride without the 2-bone leg IK below ever
 * over-reaching (solveTwoBone's own clamp is what caused the old foot-slide).
 *
 * The pivot itself (heel or toe) is *not* frozen at its sub-phase's boundary value — it tracks flatZ(t)
 * at the same slope, just shifted by a constant (heelLen or -toeLen). A truly ground-fixed point's
 * hip-relative Z has to keep advancing at exactly this rate as the hip (and the root's own forward
 * translation, external to this function — see strideLength's doc comment) moves over it; freezing it
 * would leave it advancing at *zero* rate while the hip keeps moving, which reads back, once the
 * caller's own root translation is added, as the foot skidding forward at close to the hip's full
 * speed. The shift is what keeps the ankle continuous with the flat formula at the handoff (t=HEEL_FRAC
 * or t=1-TOE_FRAC): at theta=0 there, rotateYZ returns the rest vector unchanged, and this pivot is
 * defined so adding that rest vector back exactly cancels the shift.
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
    const theta = toRad(HEEL_ROLL_MAX_DEG * (1 - t / HEEL_FRAC)); // max at heel-strike (t=0), 0 at t=HEEL_FRAC
    const [y, zRel] = rotateYZ(ankleRestY, -heelLen, theta);
    return { y, z: pivotZ + zRel, footPitchDeg: toDeg(theta) };
  }
  if (t > 1 - TOE_FRAC) {
    const pivotZ = flatZ(t) - toeLen;
    const theta = toRad((TOE_ROLL_MAX_DEG * (t - (1 - TOE_FRAC))) / TOE_FRAC); // 0 there, max at toe-off (t=1)
    const [y, zRel] = rotateYZ(ankleRestY, toeLen, -theta);
    return { y, z: pivotZ + zRel, footPitchDeg: -toDeg(theta) };
  }
  return { y: ankleRestY, z: flatZ(t), footPitchDeg: 0 };
};

/** Swing: unchanged from the original model — the ankle returns from behind to ahead, continuous with
 * stance at both ends, lifting clear of the ground along the way (footLift). */
const swingFootTarget = (t: number, stride: number, geom: FootGeometry): FootTarget => ({
  y: geom.ankleRestY + geom.footLift * Math.sin(Math.PI * t),
  z: stride * (0.5 - t),
  footPitchDeg: 0,
});

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
    const drop = requiredDrop(thigh.head[1], target, legLen);
    return { side, thigh, shin, foot, l1, l2, legLen, target, drop };
  });

  // One drop for both legs (it's a single root-level shift): whichever leg needs more this phase, plus
  // the speed-crouch. Feeding it into both legs' targets (not just the binding one) keeps them
  // consistent — see requiredDrop and crouchDrop's doc comments for why this doesn't disturb the
  // ankles' true (post root-shift) ground heights.
  const avgLegLen = (perSide[0]!.legLen + perSide[1]!.legLen) / 2;
  const drop = Math.max(perSide[0]!.drop, perSide[1]!.drop) + crouchDrop(speed, params, avgLegLen);

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
