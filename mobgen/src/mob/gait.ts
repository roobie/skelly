// The humanoid walk cycle: a pure function of a distance-driven clock and speed. The clock advances with
// distance travelled (CHALLENGES.md §4): callers do `clock = advanceClock(clock, distanceMoved, basis)`
// (basis = { params, geomL, speed, seed }), so a speed change never makes the feet jump or slide.
//
// Sign convention (documented once, used throughout): a hanging limb
// (pointing -Y) swinging forward rotates positively about +X (it moves
// toward -Z). math.ts's rotX(deg) matches this: rotX(delta) maps the
// direction dir(theta) = (0, -cos(theta), -sin(theta)) to dir(theta + delta).
//
// Foot planting: legs are posed by 2-bone IK against an explicit ankle
// target (see legTarget below), not by independently-tuned swing curves, so
// the stance foot lands exactly on its target every phase — no slop to tune
// out. Pelvis roll and yaw are compensated (legs are solved in the pelvis's
// own unrotated frame) so they never drag the planted foot.
//
// Drunk shamble: each step (a stance-to-stance interval, alternating feet) has its own style and jitter
// (steps.ts), deterministic from (seed, step index). "Step k" means the interval culminating in footfall
// k (executed by sideForStep(k)) — see legAndFootRotations for how neighbouring steps' plans combine.

import type { Bone } from '../core/body.ts';
import { add, applyPoint, type Mat3, mulMM, mulMV, rotX, rotY, rotZ, sub, transpose, type Vec3 } from '../core/math.ts';
import { boneTransforms, type Pose } from '../core/pose.ts';
import { cellIndex, type Voxels, worldPosition } from '../core/voxelize.ts';
import { FEET_BONES, type HumanoidParams } from './humanoid.ts';
import { type StepPlan, stepPlanFor } from './steps.ts';

const TAU = Math.PI * 2;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;
const toRad = (deg: number): number => (deg * Math.PI) / 180;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
/** Smooth 0->1 ease with zero slope at both ends (3x²-2x³). */
const smoothstep = (x: number): number => x * x * (3 - 2 * x);
// Smooth minimum of a whole list at once (log-sum-exp): exact min at smoothing=0, otherwise undershoots by
// smoothing*ln(#values within ~smoothing of the true min) — bounded and *not* per-pair-cumulative, unlike
// folding a pairwise smooth-min across many corners one at a time (tried first: a foot's own rest-box
// corners routinely tie exactly, e.g. all 4 bottom corners of a flat sole, and folding through N of them
// each shaved off more, undershooting far past a single pair's own smoothing/2 — see mobgen's report). Used
// where a hard min between two otherwise-smooth curves would have a slope kink right at their crossover
// (see groundOffset).
const smoothMinAll = (values: readonly number[], smoothing: number): number => {
  const trueMin = Math.min(...values);
  if (smoothing <= 0) {
    return trueMin;
  }
  let sum = 0;
  for (const v of values) {
    sum += Math.exp(-(v - trueMin) / smoothing);
  }
  return trueMin - smoothing * Math.log(sum);
};
/** 0 at or below wander speed (0.8 m/s), 1 at or above chase speed (2.8 m/s); blends in the
 * speed-dependent crouch/lean below. */
const chaseBlend = (speed: number): number => clamp((speed - 0.8) / 2, 0, 1);
const MAX_YAW_DEG = 6; // pelvis yaw amplitude at the longest (cap-saturating) strides
const JAW_LAG = 0.08; // fraction of a cycle the jaw bounce lags each heel-strike, as if from inertia

// Sideways sway (width-wise waddle): no new sampled params — girth/pelvisSway/limp (already sampled) drive
// how wide and how much a given actor sways, so a brute (heavy girth) lands widest and a jittery/limping
// actor sways more. Width is a *target total* (girth-driven), not a fixed add-on — the rig's own sampled
// hipWidth already varies a lot on its own, and an add-on stacked on top of that overshot badly (see
// mobgen's report).
/** Extra outward step width beyond the hip (each side), so ankle-to-ankle lands near a girth-driven target
 * (~0.3-0.45 m total across the three templates) regardless of this actor's own sampled hip width. Can be
 * negative (feet land inside the hips) for a narrow-hipped, high-girth-range-relative actor. */
const stepWidthExtra = (params: HumanoidParams, hipWidthTotal: number): number => {
  const swayNorm = clamp(params.pelvisSway / 6, 0, 1);
  const limpNorm = clamp(params.limp, 0, 1);
  const desiredTotal = 0.03 + 0.3 * params.girth + 0.02 * swayNorm + 0.01 * limpNorm;
  return (desiredTotal - hipWidthTotal) / 2;
};
// Floor on a foot's own world-X distance off-centre (see landingX) — keeps a crossover stagger's swing
// path a safe margin clear of the opposite, planted foot.
const MIN_WORLD_OUTWARD = 0.03;
/** Fraction of the stance foot's own (stagger-free) base offset from centre the root sways toward,
 * mid-stance — more at slow speed (drunks sway most when idling along), less at chase. */
const swayFraction = (speed: number): number => 0.27 - 0.09 * chaseBlend(speed);
/** Pelvis roll-about-Z (swing hip drop) and trunk counter-lean amplitudes, degrees — both scale with the
 * genome's own pelvisSway (drunkenness), same driver as the width above, and kept modest to stay
 * proportionate with the (now smaller) sway they ride alongside. */
const zRollAmplitudeDeg = (params: HumanoidParams): number => 2 + 2.5 * clamp(params.pelvisSway / 6, 0, 1);
const trunkLeanAmplitudeDeg = (params: HumanoidParams): number => 2.5 + 3.5 * clamp(params.pelvisSway / 6, 0, 1);

export type Side = 'L' | 'R';
const SIDES: readonly Side[] = ['L', 'R'];
/** Which side is in stance during the interval culminating in footfall k (k-1's side; alternates). */
const sideForStep = (stepIndex: number): Side => (stepIndex % 2 === 0 ? 'L' : 'R');

const boneMap = (bones: readonly Bone[]): ReadonlyMap<string, Bone> => new Map(bones.map((b) => [b.id, b]));

/** Angle from straight down, in degrees, of a bone's rest direction; forward (-Z) is positive. */
const restAngleDeg = (bone: Bone): number =>
  toDeg(Math.atan2(-(bone.tail[2] - bone.head[2]), -(bone.tail[1] - bone.head[1])));
const boneLen = (bone: Bone): number =>
  Math.hypot(bone.tail[0] - bone.head[0], bone.tail[1] - bone.head[1], bone.tail[2] - bone.head[2]);

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
const FOOTFALL_PEAK_SAMPLES = 12; // resolution for finding each footfall's true (inside-the-roll) peak drop
const HEEL_ROLL_MAX_DEG = 25; // toe-up pitch at heel-strike (foot rotating about the heel)
const TOE_ROLL_MAX_DEG = 35; // heel-up pitch at push-off (foot rotating about the toe)
// Ankle-to-heel distance, as a fraction of ankle-to-toe (footLen), used only as a fallback when the
// actual voxel extent isn't available (there's no explicit heel joint in this rig — the foot bone only
// runs ankle-to-toe — so legBonesFor prefers measuring both distances directly off the foot's rest-pose
// voxel extent, which is exact).
const HEEL_LEN_FRAC = 0.35;

interface FootTarget {
  /** Hip-relative lateral offset (added to thigh.head[0] for the pre-root-shift world X). */
  readonly x: number;
  /** Ankle height, in the pelvis's own (unrotated) rest frame, before any pelvis-drop or root shift. */
  readonly y: number;
  /** Ankle offset from the hip along Z (forward is -Z; conventions.ts), same frame as `y`. */
  readonly z: number;
  /** rotX delta applied to the foot bone on top of "keep it level" — 0 is flat/level, as before. */
  readonly footPitchDeg: number;
}

/** Everything about a leg's own foot needed to place it, besides phase and length: geometry plus this
 * step's own heel/toe roll multiplier (drag: barely rolls at all). */
interface FootGeometry {
  readonly ankleRestY: number;
  readonly heelLen: number;
  readonly toeLen: number;
  readonly rollMul: number;
}

/**
 * The stance foot's ankle target and sole pitch across stance (t: 0 at heel-strike, 1 at toe-off), for a
 * stance of length `len` metres landing at hip-relative `lateralX`. Mid-stance is flat, ankle sweeping
 * linearly from ahead to behind. At each end the foot instead rolls about the heel (touchdown) or toe
 * (push-off) — a real bounded rotation about the fixed ground pivot, which is what keeps that point from
 * sliding while letting the ankle lag/lead it. The roll fraction is smoothstep-eased so its rate is 0 at
 * the flat handoff, matching the flat segment's own zero slope with no kink.
 *
 * The pivot (heel or toe) tracks flatZ(t) at the same slope, shifted by a constant (heelLen or -toeLen)
 * — not frozen — because a ground-fixed point's hip-relative Z must keep advancing at the hip's rate;
 * freezing it would read back as the foot skidding forward once the root's own translation is added.
 */
const stanceFootTarget = (t: number, len: number, lateralX: number, geom: FootGeometry): FootTarget => {
  const { ankleRestY, heelLen, toeLen, rollMul } = geom;
  const flatZ = (u: number): number => len * (u - 0.5);
  if (t < HEEL_FRAC) {
    const pivotZ = flatZ(t) + heelLen;
    const theta = toRad(HEEL_ROLL_MAX_DEG * rollMul * smoothstep(1 - t / HEEL_FRAC)); // max at t=0, 0 (and flat-rate) at t=HEEL_FRAC
    const [y, zRel] = rotateYZ(ankleRestY, -heelLen, theta);
    return { x: lateralX, y, z: pivotZ + zRel, footPitchDeg: toDeg(theta) };
  }
  if (t > 1 - TOE_FRAC) {
    const pivotZ = flatZ(t) - toeLen;
    const theta = toRad(TOE_ROLL_MAX_DEG * rollMul * smoothstep((t - (1 - TOE_FRAC)) / TOE_FRAC)); // 0 (flat-rate) there, max at t=1
    const [y, zRel] = rotateYZ(ankleRestY, toeLen, -theta);
    return { x: lateralX, y, z: pivotZ + zRel, footPitchDeg: -toDeg(theta) };
  }
  return { x: lateralX, y: ankleRestY, z: flatZ(t), footPitchDeg: 0 };
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
const stanceTargetDeriv = (t: number, len: number, lateralX: number, geom: FootGeometry): FootTarget => {
  const a = stanceFootTarget(t - HERMITE_H, len, lateralX, geom);
  const b = stanceFootTarget(t + HERMITE_H, len, lateralX, geom);
  const d = (x: number, y: number): number => (y - x) / (2 * HERMITE_H);
  return { x: d(a.x, b.x), y: d(a.y, b.y), z: d(a.z, b.z), footPitchDeg: d(a.footPitchDeg, b.footPitchDeg) };
};

/** One end of a swing: the neighbouring stance's own length/landing/geometry (steps are jittered, so
 * neighbours generally differ from the current step and from each other). */
interface StanceEnd {
  readonly len: number;
  readonly lateralX: number;
  readonly geom: FootGeometry;
}

/** Rescales a d/dt from a stance of length `fromLen` into a d/du for a swing of length `toLen` — same
 * physical rate (per metre travelled), just reparameterized since steps have different lengths. */
const rescaleRate = (rate: number, fromLen: number, toLen: number): number => (rate / fromLen) * toLen;

/** Swing: a Hermite curve from the previous stance's toe-off to the next stance's heel-strike, matching
 * each stance's own position and (length-rescaled) velocity — a C1 handoff even though neighbouring
 * stances have different lengths, landing spots and roll amounts — plus a lift bump whose value *and*
 * slope are 0 at both ends (sin²) so it can't disturb that continuity. */
const swingFootTarget = (opts: {
  readonly t: number;
  readonly len: number;
  readonly footLift: number;
  readonly prev: StanceEnd;
  readonly next: StanceEnd;
}): FootTarget => {
  const { t, len, footLift, prev, next } = opts;
  const p0 = stanceFootTarget(1, prev.len, prev.lateralX, prev.geom);
  const p1 = stanceFootTarget(0, next.len, next.lateralX, next.geom);
  const d0 = stanceTargetDeriv(1, prev.len, prev.lateralX, prev.geom);
  const d1 = stanceTargetDeriv(0, next.len, next.lateralX, next.geom);
  const lift = footLift * Math.sin(Math.PI * t) ** 2;
  const field = (key: 'x' | 'y' | 'z' | 'footPitchDeg'): number =>
    hermite(
      t,
      { value: p0[key], slope: rescaleRate(d0[key], prev.len, len) },
      { value: p1[key], slope: rescaleRate(d1[key], next.len, len) },
    );
  return { x: field('x'), y: field('y') + lift, z: field('z'), footPitchDeg: field('footPitchDeg') };
};

/** Smoothly blends a per-footfall scalar across step k's own span: `at(k-1)` at progress 0 (footfall
 * k-1) easing to `at(k)` at progress 1 (footfall k), zero slope at both ends. The two adjacent intervals
 * always agree at their shared footfall (same `at(k)` call), so this is C1 across step boundaries. */
const blendStepScalar = (stepIndex: number, progress: number, at: (k: number) => number): number =>
  hermite(progress, { value: at(stepIndex - 1), slope: 0 }, { value: at(stepIndex), slope: 0 });

// Max leg extension, as a fraction of l1+l2, before the knee would start reading as locked straight.
// 2-bone IK's knee angle has an unbounded d(angle)/d(reach) as reach approaches l1+l2 (a genuine
// singularity of the acos law-of-cosines solve, worst when l1≈l2) — 0.99 left legAndFootRotations right
// at the edge of it, where per-step jitter's tiny sample-to-sample reach changes produced multi-degree
// snaps (see mobgen's report); 0.92 keeps the same "never visibly locks straight" intent with real margin.
const REACH_MARGIN = 0.92;

/** How far the hip must drop (see legAndFootRotations) for `target` to be reachable at no more than
 * REACH_MARGIN of the leg's full length — explicit and bounded, rather than whatever solveTwoBone's own
 * clamp happens to produce (which is what used to cause foot-slide: see strideLength's doc comment). */
const requiredDrop = (hipY: number, target: FootTarget, legLen: number): number => {
  const reachCap = REACH_MARGIN * legLen;
  // A nonzero lateral target (the wider base, or a stagger) also eats into this leg's reach budget (the
  // 2-bone solve targets hypot(lateral, vertical), not vertical alone — see legAndFootRotations' abduction
  // comment) — reserving that lateral share of reachCap here first keeps drop's own margin honest instead
  // of a same-instant lateral demand quietly exceeding l1+l2 (solveTwoBone's own clamp would fall short of
  // the intended lateral placement instead of erroring — see mobgen's report).
  const lateralCap = Math.min(Math.abs(target.x), reachCap * 0.999);
  const zCap = Math.sqrt(Math.max(reachCap * reachCap - lateralCap * lateralCap, 0));
  const dz = clamp(target.z, -zCap, zCap); // strideLength's cap keeps |z| well inside reachCap
  const neededH = Math.sqrt(Math.max(zCap * zCap - dz * dz, 0));
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

/** Largest requiredDrop a leg needs anywhere in a cycle of this length, sampled at BOB_SAMPLES phases
 * (plus a safety margin: the true continuous peak can fall slightly between samples). */
const peakRequiredDrop = (hipY: number, len: number, geom: FootGeometry, legLen: number): number => {
  let peak = 0;
  for (let i = 0; i < BOB_SAMPLES; i++) {
    const t = i / BOB_SAMPLES;
    const target = t < 0.5 ? stanceFootTarget(t * 2, len, 0, geom) : stanceFootTarget((t - 0.5) * 2, len, 0, geom);
    peak = Math.max(peak, requiredDrop(hipY, target, legLen));
  }
  return peak * BOB_SAFETY;
};

/** A leg's fixed shape (besides phase/stride): reach and where its foot's roll pivots are. */
export interface LegGeometry {
  readonly legLen: number;
  readonly hipY: number;
  readonly heelLen: number;
  readonly toeLen: number;
  readonly ankleRestY: number;
}

interface LegBones extends LegGeometry {
  readonly thigh: Bone;
  readonly shin: Bone;
  readonly l1: number;
  readonly l2: number;
}

const legBonesFor = (byId: ReadonlyMap<string, Bone>, extents: ReadonlyMap<string, Extent>, side: Side): LegBones => {
  const thigh = byId.get(`thigh.${side}`)!;
  const shin = byId.get(`shin.${side}`)!;
  const foot = byId.get(`foot.${side}`)!;
  const l1 = boneLen(thigh);
  const l2 = boneLen(shin);
  const footLen = boneLen(foot);
  // Heel/toe length come from the foot's rest voxel extent when available, exact to the actual geometry,
  // falling back to a fixed fraction of footLen otherwise (there's no heel joint in this rig).
  const footExtent = extents.get(`foot.${side}`);
  const [, , ankleZ] = shin.tail;
  const heelLen = footExtent ? footExtent.max[2] - ankleZ : footLen * HEEL_LEN_FRAC;
  const toeLen = footExtent ? ankleZ - footExtent.min[2] : footLen;
  return { thigh, shin, l1, l2, legLen: l1 + l2, hipY: thigh.head[1], heelLen, toeLen, ankleRestY: shin.tail[1] };
};

/** A leg's geometry (for strideLength's reach-based cap), read off its bones and rest-pose foot extent. */
export const legGeometryFor = (bones: readonly Bone[], extents: ReadonlyMap<string, Extent>, side: Side): LegGeometry =>
  legBonesFor(boneMap(bones), extents, side);

const MAX_BOB_FRAC = 0.15; // largest peak hip drop (fraction of leg length) strideLength's cap allows

const strideCapCache = new Map<string, number>();

/** Largest full-cycle stride whose peak required hip drop (peakRequiredDrop, no crouch, no style) stays
 * within MAX_BOB_FRAC of leg length — found by bisection and memoized per geometry (not speed, so callers
 * that re-derive `geom` fresh every frame still hit the cache every time). */
const strideCap = (geom: LegGeometry, footLift: number): number => {
  const key = `${geom.legLen}|${geom.hipY}|${geom.heelLen}|${geom.toeLen}|${geom.ankleRestY}|${footLift}`;
  const cached = strideCapCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const budget = MAX_BOB_FRAC * geom.legLen;
  const footGeom: FootGeometry = {
    ankleRestY: geom.ankleRestY,
    heelLen: geom.heelLen,
    toeLen: geom.toeLen,
    rollMul: 1,
  };
  let lo = 0;
  let hi = 4 * geom.legLen; // generous — the true cap is well under this
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (peakRequiredDrop(geom.hipY, mid / 2, footGeom, geom.legLen) <= budget) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  strideCapCache.set(key, lo);
  return lo;
};

/** Distance (metres) travelled per full stride cycle (both feet), from speed, leg length and the genome's
 * strideFactor. 0.6 + 0.95·speed targets human walking data. The cap is a *crouch* limit, not a reach
 * limit (legAndFootRotations' hip-drop solve has slack well past it): the longest stride whose peak
 * required hip drop stays within MAX_BOB_FRAC of leg length (see strideCap). Above the cap, cadence alone
 * carries speed — see gait.test.ts. Per-step jitter/style (steps.ts) scales this further, per step. */
export const strideLength = (params: HumanoidParams, geom: LegGeometry, speed: number): number => {
  if (speed <= 0) {
    return geom.legLen; // unused when standing (speed 0), kept positive so callers never divide by zero
  }
  const raw = geom.legLen * (0.6 + 0.95 * speed) * params.strideFactor;
  return Math.min(raw, strideCap(geom, params.footLift));
};

// A step's own length is half its horizontal reach (flatZ spans -len/2..len/2); beyond STEP_REACH_FRAC of
// legLen the required hip drop pushes the ankle target most of the way to hip height, collapsing the
// hip-abduction lever arm (legAndFootRotations' yPrime) toward 0 — a real leg-splayed-flat degeneracy, not
// just a numerical one. strideLength's own cap (MAX_BOB_FRAC) already keeps the *base* stride well inside
// this, so it only bites lurch's own lengthMul, which is exactly what needs bounding.
const STEP_REACH_FRAC = 0.85;

/** The 4 inputs that determine every step's own length (stepLengthMeters/advanceClock): the genome's
 * params/seed and the current speed/left-leg geometry. Grouped since they always travel together and
 * individually would put both functions over useMaxParams. */
export interface GaitBasis {
  readonly params: HumanoidParams;
  readonly geomL: LegGeometry;
  readonly speed: number;
  readonly seed: number;
}

/** This step's own length in metres (half the base full-cycle stride, times this step's jittered/style
 * multiplier, reach-capped — see STEP_REACH_FRAC) — shared by advanceClock and legAndFootRotations so both
 * agree on how far the body travels during step k. Uses the left leg as a shared reference (matches
 * walkPose's own yaw reference). */
export const stepLengthMeters = (basis: GaitBasis, stepIndex: number): number => {
  const { params, geomL, speed, seed } = basis;
  const raw = (strideLength(params, geomL, speed) / 2) * stepPlanFor(seed, stepIndex, params).lengthMul;
  return Math.min(raw, 2 * STEP_REACH_FRAC * geomL.legLen);
};

/** Walk clock: which step is current, and how far into it (0..1). Replaces the old single `phase`
 * number now that steps have their own (jittered) lengths instead of a shared stride. */
export interface GaitClock {
  readonly stepIndex: number;
  readonly progress: number;
}

export const INITIAL_CLOCK: GaitClock = { stepIndex: 0, progress: 0 };

/** Advances the clock by `distance` metres, rolling into as many subsequent steps as needed — each
 * step's own length (stepLengthMeters), not a shared stride, so steps aren't uniform. */
export const advanceClock = (clock: GaitClock, distance: number, basis: GaitBasis): GaitClock => {
  let { stepIndex, progress } = clock;
  let remaining = distance;
  for (let guard = 0; guard < 10_000; guard++) {
    const len = stepLengthMeters(basis, stepIndex) || 1e-6;
    const remainingInStep = (1 - progress) * len;
    if (remaining < remainingInStep) {
      return { stepIndex, progress: progress + remaining / len };
    }
    remaining -= remainingInStep;
    stepIndex += 1;
    progress = 0;
  }
  return { stepIndex, progress };
};

/** Solves for the local (pre-rotation) ankle Y, Z that land the ankle exactly at world (y, z) once
 * rotation `r` carries it — a 2x2 solve of the Y, Z rows of `pivot + r·(local - pivot) = world`, given
 * local X is fixed at `hipX`. Callers pass roll only (not yaw — see legAndFootRotations), for which this
 * is exact: roll doesn't mix X into Y/Z, so the discarded X row never mattered anyway. */
const sagittalTarget = (
  world: { readonly y: number; readonly z: number },
  hipX: number,
  pivot: Vec3,
  r: Mat3,
): readonly [number, number] => {
  const dx0 = hipX - pivot[0];
  const fy = world.y - pivot[1] - r[3] * dx0;
  const fz = world.z - pivot[2] - r[6] * dx0;
  const det = r[4] * r[8] - r[5] * r[7];
  const dy = (fy * r[8] - fz * r[5]) / det;
  const dz = (r[4] * fz - r[7] * fy) / det;
  return [dy + pivot[1], dz + pivot[2]];
};

interface GaitContext {
  readonly bones: ReadonlyMap<string, Bone>;
  readonly extents: ReadonlyMap<string, Extent>;
  readonly params: HumanoidParams;
  readonly clock: GaitClock;
  readonly speed: number;
  readonly seed: number;
  /** Full pelvis rotation (roll ∘ zRoll ∘ yaw) — for keeping the foot level in world space. */
  readonly pelvisR: Mat3;
  readonly pelvisRollDeg: number;
  readonly yawDeg: number;
  /** Swing-hip-drop about Z (see walkPose) — cancelled at the thigh exactly like yaw. */
  readonly pelvisZRollDeg: number;
  readonly pelvisPivot: Vec3;
}

/** Per-side leg-placement result: rotations plus the (pre-root) world X the ankle actually reaches. */
interface LegResult {
  readonly rotations: Record<string, Mat3>;
  /** Root X including the weight-transfer sway (see legAndFootRotations) — the one value walkPose's root
   * and this function's own per-leg abduction (vx) must agree on. */
  readonly rootX: number;
  readonly armStyle: Record<
    Side,
    { readonly wideExtraDeg: number; readonly forwardExtraDeg: number; readonly hang: number }
  >;
}

const legAndFootRotations = (ctx: GaitContext): LegResult => {
  const { params, speed, seed } = ctx;
  const { stepIndex: k, progress } = ctx.clock;

  const byId = ctx.bones;
  const legL = legBonesFor(byId, ctx.extents, 'L');
  const legR = legBonesFor(byId, ctx.extents, 'R');
  const legFor = (side: Side): LegBones => (side === 'L' ? legL : legR);
  const limpOf = (side: Side): number => (side === 'R' ? 1 - clamp(params.limp, 0, 1) : 1);
  const plan = (i: number): StepPlan => stepPlanFor(seed, i, params);
  const basis: GaitBasis = { params, geomL: legL, speed, seed };
  const lenAt = (i: number): number => stepLengthMeters(basis, i);
  const geomFor = (side: Side, rollMul: number): FootGeometry => {
    const leg = legFor(side);
    return { ankleRestY: leg.ankleRestY, heelLen: leg.heelLen, toeLen: leg.toeLen, rollMul };
  };
  // Wider base: a step's landing X is the plan's own jitter plus a fixed offset for its side that brings
  // ankle-to-ankle width to a girth-driven target regardless of this actor's own sampled hip width (see
  // stepWidthExtra). widthSign reads the actual rig's sign convention off the bone rather than assuming one.
  const widthSign = (side: Side): number => Math.sign(legFor(side).thigh.head[0]) || (side === 'L' ? -1 : 1);
  const hipWidthTotal = legR.thigh.head[0] - legL.thigh.head[0];
  const widthExtra = stepWidthExtra(params, hipWidthTotal);
  // The step's *base* (stagger-free) landing X — used for the sway amplitude below, so a stagger's own
  // drift never inflates it (see mobgen's report: it used to read the full, stagger-included landing X).
  const baseFootX = (side: Side): number => legFor(side).thigh.head[0] + widthSign(side) * widthExtra;
  // Limit crossover: even a stagger's own inward jitter can't pull this foot's *world* X past
  // MIN_WORLD_OUTWARD off-centre — swingFootTarget's Hermite has zero slope at both ends (see its own
  // comment), so it never overshoots past its two landing endpoints, meaning clamping each landing spot
  // this way also bounds the whole swing path in between, keeping it clear of the opposite, planted foot.
  const landingX = (side: Side, i: number): number => {
    const sign = widthSign(side);
    const raw = sign * widthExtra + plan(i).lateralX;
    const minOutwardRaw = MIN_WORLD_OUTWARD - Math.abs(legFor(side).thigh.head[0]);
    return sign * Math.max(sign * raw, minOutwardRaw);
  };

  const stanceSide = sideForStep(k - 1);
  const swingSide = sideForStep(k);
  const stanceLimp = limpOf(stanceSide);
  const swingLimp = limpOf(swingSide);

  const stancePlan = plan(k - 1);
  const stanceLen = lenAt(k) * stanceLimp;
  const stanceTarget = stanceFootTarget(
    progress,
    stanceLen,
    landingX(stanceSide, k - 1),
    geomFor(stanceSide, stancePlan.rollMul),
  );

  const prevPlan = plan(k - 2);
  const nextPlan = plan(k);
  const swingLen = lenAt(k) * swingLimp;
  const prevEnd: StanceEnd = {
    len: lenAt(k - 1) * swingLimp,
    lateralX: landingX(swingSide, k - 2),
    geom: geomFor(swingSide, prevPlan.rollMul),
  };
  const nextEnd: StanceEnd = {
    len: lenAt(k + 1) * swingLimp,
    lateralX: landingX(swingSide, k),
    geom: geomFor(swingSide, nextPlan.rollMul),
  };
  const swingTarget = swingFootTarget({
    t: progress,
    len: swingLen,
    footLift: params.footLift * nextPlan.liftMul,
    prev: prevEnd,
    next: nextEnd,
  });

  const targets: Record<Side, FootTarget> = { [stanceSide]: stanceTarget, [swingSide]: swingTarget } as Record<
    Side,
    FootTarget
  >;

  // One drop for both legs (a single root-level shift): one smooth curve through *footfall-indexed* peak
  // values, each computed once (not per sample) from a short scan of the two legs' own exact targets near
  // that instant — not a live, per-sample max(stance, swing) (tried first: exact and automatically C1 at
  // every footfall, since stance/swing targets already match there, but requiredDrop's own reachCap sqrt
  // has the same near-full-extension steepness as solveTwoBone's, and the roll's true peak reach falls a
  // little *inside* the roll window, not at the boundary sample — sampling that live, continuously, hit
  // it square on and no amount of smoothMax-ing the crossover tamed the resulting per-frame jumps; see
  // mobgen's report). A short scan finds that true inside-the-roll peak once per footfall instead, then a
  // Hermite from peak(footfall k-1) down to 0 over the step's first half and back up to peak(footfall k)
  // over the second (requiredDrop is genuinely ~0 at flat mid-stance/mid-swing) keeps the *playback* curve
  // smooth by construction regardless of how steep the sampled peak is.
  const avgLegLen = (legL.legLen + legR.legLen) / 2;
  // A rest-straight leg can already sit close to REACH_MARGIN of its own length (needed for the
  // hip-abduction singularity margin — see REACH_MARGIN's own comment), so requiredDrop can be nonzero
  // even at zero horizontal reach (flat mid-stance/mid-swing). That baseline is the same for every step
  // (a function of leg geometry only), so it's split out and applied unconditionally, like crouchDrop —
  // otherwise it inflates every footfall's peak by a constant amount the Hermite curve below would have
  // to "spend" all over again on every transition, for no visual benefit.
  const flatDrop = (side: Side): number =>
    requiredDrop(
      legFor(side).hipY,
      { x: widthSign(side) * widthExtra, y: legFor(side).ankleRestY, z: 0, footPitchDeg: 0 },
      legFor(side).legLen,
    );
  const baselineDrop = Math.max(flatDrop('L'), flatDrop('R'));
  // Scans stanceFootTarget across whichever roll window (heel- or toe-side of footfall j) `side` is
  // rolling through, to find the true peak requiredDrop inside it (see this block's own doc comment).
  const peakNear = (opts: {
    readonly side: Side;
    readonly len: number;
    readonly lateralX: number;
    readonly rollMul: number;
    readonly atHeel: boolean;
  }): number => {
    const { side, len, lateralX, rollMul, atHeel } = opts;
    const geom = geomFor(side, rollMul);
    let peak = 0;
    for (let i = 0; i <= FOOTFALL_PEAK_SAMPLES; i += 1) {
      const frac = i / FOOTFALL_PEAK_SAMPLES;
      const t = atHeel ? frac * HEEL_FRAC : 1 - frac * TOE_FRAC;
      const target = stanceFootTarget(t, len, lateralX, geom);
      peak = Math.max(peak, requiredDrop(legFor(side).hipY, target, legFor(side).legLen));
    }
    return peak;
  };
  const footfallPeak = (j: number): number => {
    const landing = sideForStep(j);
    const trailing = sideForStep(j - 1);
    const landingPlan = plan(j);
    const trailingPlan = plan(j - 1);
    const raw = Math.max(
      peakNear({
        side: landing,
        len: lenAt(j + 1) * limpOf(landing),
        lateralX: landingX(landing, j),
        rollMul: landingPlan.rollMul,
        atHeel: true,
      }) * landingPlan.hipDropMul,
      peakNear({
        side: trailing,
        len: lenAt(j) * limpOf(trailing),
        lateralX: landingX(trailing, j - 1),
        rollMul: trailingPlan.rollMul,
        atHeel: false,
      }) * trailingPlan.hipDropMul,
    );
    // hipDropMul (lurch) multiplies an already-large requirement, which can ask for more drop than the leg
    // physically has room for (foot target Y approaching hip height, collapsing legAndFootRotations' own
    // abduction lever arm) — STEP_REACH_FRAC bounds length's own contribution, but not this multiplier's.
    return Math.max(0, Math.min(raw, 0.5 * avgLegLen) - baselineDrop);
  };
  const bobCurve =
    progress <= 0.5
      ? hermite(progress / 0.5, { value: footfallPeak(k - 1), slope: 0 }, { value: 0, slope: 0 })
      : hermite((progress - 0.5) / 0.5, { value: 0, slope: 0 }, { value: footfallPeak(k), slope: 0 });
  const drop = bobCurve + baselineDrop + crouchDrop(speed, params, avgLegLen);

  const out: Record<string, Mat3> = {};
  const worldX: Record<Side, number> = { L: 0, R: 0 };
  for (const side of SIDES) {
    worldX[side] = legFor(side).thigh.head[0] + targets[side].x;
  }
  const naturalRootX = (worldX.L + worldX.R) / 2;
  // Weight-transfer sway: the root shifts toward the stance foot's own *base* (stagger-free) X, easing up
  // from 0 at each footfall to a fraction of it at mid-stance and back to 0 — same two-segment Hermite
  // shape as the hip drop above, so it's C1 across footfalls automatically. Deliberately reads baseFootX,
  // not the actual (possibly stagger-shifted) landing X: a stagger's own drift is a separate, slower
  // component (the landing itself still reflects it) and must not also blow up this faster oscillation —
  // see mobgen's report.
  const swayPeak = swayFraction(speed) * baseFootX(stanceSide);
  const sway =
    progress <= 0.5
      ? hermite(progress / 0.5, { value: 0, slope: 0 }, { value: swayPeak, slope: 0 })
      : hermite((progress - 0.5) / 0.5, { value: swayPeak, slope: 0 }, { value: 0, slope: 0 });
  const rootX = naturalRootX + sway;

  for (const side of SIDES) {
    const leg = legFor(side);
    const { thigh, shin, l1, l2 } = leg;
    const target = targets[side];
    const worldY = target.y + drop;
    const worldZ = thigh.head[2] + target.z;
    // The hip socket's own world shift from the *full* pelvis rotation (roll+yaw) — the leg hangs off
    // this actual, moved point, not the rest thigh.head, even though yaw gets cancelled below.
    const hipShift = sub(add(ctx.pelvisPivot, mulMV(ctx.pelvisR, sub(thigh.head, ctx.pelvisPivot))), thigh.head);
    // Roll only, not yaw: yaw is cancelled at the thigh instead (below), so the leg's own sagittal
    // solve never sees it and has no X to discard — see sagittalTarget's doc comment for why that's
    // exact for a roll-only rotation. The target is shifted by -hipShift first, so solving relative to
    // thigh.head (solveTwoBone's own origin) is solving relative to the hip's true, moved position.
    const rollR = rotX(ctx.pelvisRollDeg);
    const shiftedTarget = { y: worldY - hipShift[1], z: worldZ - hipShift[2] };
    const [ly, lz] = sagittalTarget(shiftedTarget, thigh.head[0], thigh.head, rollR);

    // Cancel pelvis yaw at the hip (the femur rotating in its socket) so the leg's own bend stays in the
    // world sagittal plane regardless of pelvis yaw. The hip socket's own X shift (hipShift), this step's
    // own lateral target (target.x), *and* root's own X (rootX, added back on after this loop — see
    // walkPose) are all closed by a hip-abduction (rotZ) applied *outside* the sagittal bend (rotX) — so
    // this leg reaches thigh.head[0]+target.x in *true* world space regardless of what rootX is doing,
    // the same as every other leg; rootX is otherwise just a cosmetic pelvis shift, never something a
    // planted foot (whose own target.x is constant across its stance) has to absorb by sliding.
    // The rotZ tilt also foreshortens the leg's sagittal reach by cos(abduction) (it mixes X into Y, not
    // just out of it): solving rotZ(θ)·(0, yb, lz-hipZ) = (vx, ly-hipY, lz-hipZ) for θ and yb gives an
    // exact (non-iterative) fix — yb = -hypot(vx, ly-hipY), θ = atan2(vx, hipY-ly) — so the 2-bone solve
    // below targets yb, not ly directly, and ends up exactly on target once abducted. (No division:
    // hypot/atan2 stay well-behaved even as the lever arm shrinks, unlike the plain asin(vx/yPrime) this
    // replaced.)
    const vx = target.x - hipShift[0] - rootX;
    const vy = ly - thigh.head[1];
    // This rig's own thigh/shin rest vectors already lean inward (hip wider than ankle) — nativeX is that
    // fixed lateral offset (rotX, used for the sagittal bend, never touches X, so it survives any bend
    // angle unchanged). The old formula implicitly assumed nativeX = 0 — fine while abduction only had to
    // cancel yaw (tiny), but the wider base's routine, larger lateral targets exposed a real gap between
    // the intended and actual placement (see mobgen's report). Solving rotZ(θ)·(nativeX, yPrime) = (vx, vy)
    // for θ and yPrime generalizes the old (nativeX=0) closed form exactly.
    const nativeX = shin.tail[0] - thigh.head[0];
    const yPrime = -Math.sqrt(Math.max(vx * vx + vy * vy - nativeX * nativeX, 0));
    const abductionDeg = toDeg(Math.atan2(vy, vx) - Math.atan2(yPrime, nativeX));
    const yb = thigh.head[1] + yPrime;

    const { a1: thighAbs, a2: shinAbs } = solveTwoBone(thigh.head, [thigh.head[0], yb, lz], l1, l2);
    const thighDelta = thighAbs - restAngleDeg(thigh);
    const shinDelta = shinAbs - restAngleDeg(shin) - thighDelta;
    // Cancel pelvis Z-roll (swing-hip drop, see walkPose) here too: it's a rotZ term, same axis as
    // abduction, so cancelling it is just subtracting it from that same angle — pelvisR ∘ thighR then
    // reduces to the same rotX(roll) ∘ rotZ(abduction) ∘ rotX(bend) as before, algebraically unchanged.
    const thighR = mulMM(mulMM(rotY(-ctx.yawDeg), rotZ(abductionDeg - ctx.pelvisZRollDeg)), rotX(thighDelta));
    const shinR = rotX(shinDelta);
    // Keep the foot level in *world* space: undo pelvis(roll+yaw) ∘ thigh ∘ shin exactly, by matrix
    // inverse (transpose), since pelvis yaw is a different axis (Y) than thigh/shin's rotX — a scalar
    // rotX can't cancel it. Then pitch the sole by footPitchDeg on top (0 during flat stance/swing).
    const footLevelR = transpose(mulMM(mulMM(ctx.pelvisR, thighR), shinR));
    const footR = mulMM(footLevelR, rotX(target.footPitchDeg));

    out[`thigh.${side}`] = thighR;
    out[`shin.${side}`] = shinR;
    out[`foot.${side}`] = footR;
  }

  const armStyle: LegResult['armStyle'] = {
    L: { wideExtraDeg: 0, forwardExtraDeg: 0, hang: 0 },
    R: { wideExtraDeg: 0, forwardExtraDeg: 0, hang: 0 },
  };
  for (const side of SIDES) {
    armStyle[side] = {
      wideExtraDeg: blendStepScalar(k, progress, (i) => plan(i).armWideExtraDeg),
      forwardExtraDeg: blendStepScalar(k, progress, (i) => plan(i).armForwardExtraDeg),
      hang: blendStepScalar(k, progress, (i) => (plan(i).armHangSide === side ? 1 : 0)),
    };
  }

  return { rotations: out, rootX, armStyle };
};

/** Arms swing forward/back as before, plus this step's own style: wider (stagger, rotZ, mirrored per
 * side), more forward swing (lurch flail), or slack (drag: that side's swing fades toward 0). */
const armRotations = (
  progress: number,
  params: HumanoidParams,
  armStyle: LegResult['armStyle'],
): Record<string, Mat3> => {
  const out: Record<string, Mat3> = {};
  for (const side of SIDES) {
    const offset = side === 'L' ? 0 : Math.PI;
    const sign = side === 'L' ? -1 : 1;
    const style = armStyle[side];
    const hangFactor = 1 - 0.85 * style.hang;
    const swing = (params.armSwing * Math.sin(TAU * progress + offset) + style.forwardExtraDeg) * hangFactor;
    out[`upperArm.${side}`] = mulMM(rotZ(sign * style.wideExtraDeg), rotX(swing + params.armRaise * hangFactor));
    out[`forearm.${side}`] = rotX((20 + 15 * Math.sin(TAU * progress + offset)) * hangFactor);
  }
  return out;
};

/**
 * Root Y that puts the lowest extent corner (over all bones in `extents`, e.g. just the feet) on the
 * ground, for the given rotations — reused by attack.ts to re-ground after layering a pose on top.
 * `smoothing` (default 0, exact) folds a smooth-min across corners instead of a hard Math.min: mid-walk,
 * which of two feet's corners is lowest can swap (a rolling stance foot vs. a landing swing foot, each on
 * its own smooth trajectory) — exact-min tracks whichever is lower and so has a slope kink right at the
 * swap, a visible per-frame pop in root Y (see mobgen's report); walkPose passes a few mm here so the
 * swap blends instead of snapping, at the cost of also floating everything else by a similar few mm.
 */
export const groundOffset = (
  bones: readonly Bone[],
  extents: ReadonlyMap<string, Extent>,
  rotations: Record<string, Mat3>,
  smoothing = 0,
): number => {
  const transforms = boneTransforms(bones, { root: [0, 0, 0], rotations });
  const ys: number[] = [];
  for (const [boneId, extent] of extents) {
    const t = transforms.get(boneId);
    if (!t) {
      continue;
    }
    for (const c of corners(extent)) {
      const [, y] = applyPoint(t, c);
      ys.push(y);
    }
  }
  return ys.length > 0 ? -smoothMinAll(ys, smoothing) : 0;
};

// See smoothMinAll: undershoot is this times ln(#near-tied corners), not a flat half-this — small next to
// the half-voxel ground tolerance the "lowest foot point" tests check even for a whole foot's worth (~8-16
// corners) of ties.
export const GROUND_SMOOTHING = 0.006;

export interface WalkActor {
  readonly bones: readonly Bone[];
  readonly extents: ReadonlyMap<string, Extent>;
  readonly params: HumanoidParams;
  /** The genome's own seed — drives the deterministic per-step style/jitter stream (steps.ts). */
  readonly seed: number;
}

/**
 * The walk cycle. `clock` (see GaitClock) is a step index and progress within it, advanced by distance
 * travelled (advanceClock); `speed` (m/s) drives step length and the standing/walking blend. Speed 0
 * gives a still standing pose, regardless of clock. The root may drift sideways (X) as steps stagger —
 * forward progress (Z) stays the caller's job, as before.
 */
export const walkPose = (actor: WalkActor, clock: GaitClock, speed: number): Pose => {
  const { bones, extents, params, seed } = actor;
  const byId = boneMap(bones);
  const pelvis = byId.get('pelvis')!;

  if (speed <= 0) {
    const root: Vec3 = [0, groundOffset(bones, extents, {}, GROUND_SMOOTHING), 0];
    return { root, rotations: {} };
  }

  const k = clock.stepIndex;
  const progress = clamp(clock.progress, 0, 1);
  const p = (k + progress) / 2; // legacy-style 0..1 cycle phase, for the cosmetic sways below
  // Pelvis sway: a fore-aft rock (rotX) plus a speed-dependent forward lean (sized by the genome's own
  // hunch, plus this step's own lean style — doesn't depend on the leg IK, so it's safe to compute up
  // front) — purely cosmetic, doesn't feed into leg reach (legAndFootRotations solves in the pelvis's
  // own unrotated frame).
  const legL = legBonesFor(byId, extents, 'L');
  const legR = legBonesFor(byId, extents, 'R');
  const legForSide = (side: Side): typeof legL => (side === 'L' ? legL : legR);
  const strideFrac = clamp(strideLength(params, legL, speed) / strideCap(legL, params.footLift), 0, 1);
  const yawDeg = MAX_YAW_DEG * strideFrac * Math.cos(TAU * p);
  const leanStyle = blendStepScalar(k, progress, (i) => stepPlanFor(seed, i, params).leanExtraDeg);
  const leanDeg = chaseBlend(speed) * clamp(params.hunch / 25, 0, 1) * 8 + leanStyle;
  const pelvisRollDeg = params.pelvisSway * Math.sin(TAU * p * 2) + leanDeg;
  // Pelvis roll-about-Z: the swing hip drops a few degrees, 0 at each footfall (double support, pelvis
  // level) and peaking mid-swing — sign read off the swing leg's own hip X so it drops *that* side
  // regardless of the rig's L/R convention. Cancelled exactly at the thigh (see legAndFootRotations).
  const swingNow = sideForStep(k);
  const stanceNow = sideForStep(k - 1);
  const signOf = (x: number, side: Side): number => Math.sign(x) || (side === 'L' ? -1 : 1);
  const zRollSign = -signOf(legForSide(swingNow).thigh.head[0], swingNow);
  const pelvisZRollDeg = zRollSign * zRollAmplitudeDeg(params) * Math.sin(Math.PI * progress);
  // Trunk counter-lean: spine+chest tip toward the stance side (opposite sign to the swing-hip drop, since
  // stance and swing are opposite sides), same 0-at-footfall/peak-mid-stance timing. Head partly cancels it
  // to stay nearer level.
  const trunkLeanSign = -signOf(legForSide(stanceNow).thigh.head[0], stanceNow);
  const trunkLeanDeg = trunkLeanSign * trunkLeanAmplitudeDeg(params) * Math.sin(Math.PI * progress);
  // Roll outermost, yaw innermost, zRoll between: this order (and cancelling zRoll at the same rotZ step
  // as abduction) is what lets the thigh and spine cancel yaw exactly, same reasoning as before zRoll
  // existed — see legAndFootRotations' own comment on why that composition is unaffected by it.
  const pelvisR = mulMM(mulMM(rotX(pelvisRollDeg), rotZ(pelvisZRollDeg)), rotY(yawDeg));
  const legCtx: GaitContext = {
    bones: byId,
    extents,
    params,
    clock: { stepIndex: k, progress },
    speed,
    seed,
    pelvisR,
    pelvisRollDeg,
    yawDeg,
    pelvisZRollDeg,
    pelvisPivot: pelvis.head,
  };
  const legResult = legAndFootRotations(legCtx);
  // Arms swing slightly wider, away from the lean, for balance.
  const balanceWideDeg = 0.5 * Math.abs(trunkLeanDeg);
  const armStyle: LegResult['armStyle'] = {
    L: { ...legResult.armStyle.L, wideExtraDeg: legResult.armStyle.L.wideExtraDeg + balanceWideDeg },
    R: { ...legResult.armStyle.R, wideExtraDeg: legResult.armStyle.R.wideExtraDeg + balanceWideDeg },
  };

  const rotations: Record<string, Mat3> = {
    pelvis: pelvisR,
    // Counter-rotate the spine by -yawDeg so the shoulders don't swing with the hips — exact, same
    // reasoning as the thigh's own yaw cancellation above. rotZ adds the waddle (split spine/chest so
    // it reads through the whole torso, not a kink at one joint).
    spine: mulMM(rotZ(trunkLeanDeg * 0.6), rotY(params.spineTwist * Math.sin(TAU * p * 2 + Math.PI) - yawDeg)),
    chest: rotZ(trunkLeanDeg * 0.4),
    head: mulMM(rotZ(-0.4 * trunkLeanDeg), rotX(params.headLoll * Math.sin(TAU * p * 2))),
    // Slack jaw: a constant sag plus a soft bounce once per footfall (cos², so both ends are smooth),
    // lagging heel-strike by JAW_LAG as if from inertia.
    jaw: rotX(0.4 * params.jawChatter + 0.6 * params.jawChatter * Math.cos(TAU * (p - JAW_LAG)) ** 2),
    ...armRotations(progress, params, armStyle),
    ...legResult.rotations,
  };

  const root: Vec3 = [legResult.rootX, groundOffset(bones, extents, rotations, GROUND_SMOOTHING), 0];
  return { root, rotations };
};
