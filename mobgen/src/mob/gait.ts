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
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

type Side = 'L' | 'R';
const SIDES: readonly Side[] = ['L', 'R'];

const boneMap = (bones: readonly Bone[]): ReadonlyMap<string, Bone> => new Map(bones.map((b) => [b.id, b]));

/** Angle from straight down, in degrees, of a bone's rest direction; forward (-Z) is positive. */
const restAngleDeg = (bone: Bone): number =>
  toDeg(Math.atan2(-(bone.tail[2] - bone.head[2]), -(bone.tail[1] - bone.head[1])));
const boneLen = (bone: Bone): number =>
  Math.hypot(bone.tail[0] - bone.head[0], bone.tail[1] - bone.head[1], bone.tail[2] - bone.head[2]);

/** Distance (metres) travelled per full stride cycle (both feet), from speed, leg length and the genome's strideFactor. */
export const strideLength = (params: HumanoidParams, legLen: number, speed: number): number => {
  if (speed <= 0) {
    return legLen; // unused when standing (speed 0), kept positive so callers never divide by zero
  }
  return legLen * (0.85 + 0.22 * speed) * params.strideFactor;
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

/** Where the foot should be this phase, relative to the hip, in the pelvis's own (unrotated) rest frame.
 * Forward is -Z (conventions.ts), so "ahead of the hip" is the more-negative z. Stance (legPhase < 0.5):
 * the target sweeps from ahead (-stride/2) to behind (+stride/2) as the body (and the root's own
 * translation) passes over the planted foot — the two exactly cancel, which is the whole point (see
 * strideLength's doc comment and mobgen's planted-foot test). Swing (legPhase >= 0.5): it returns from
 * behind to ahead, continuous at both ends, lifting clear of the ground along the way. */
interface StanceState {
  readonly ankleRestY: number;
  readonly footLift: number;
  readonly stride: number;
  readonly legPhase: number;
}

const legTarget = (hip: Vec3, s: StanceState): Vec3 => {
  const stance = s.legPhase < 0.5;
  const t = stance ? s.legPhase / 0.5 : (s.legPhase - 0.5) / 0.5;
  const z = stance ? s.stride * (t - 0.5) : s.stride * (0.5 - t);
  const lift = stance ? 0 : s.footLift * Math.sin(Math.PI * t);
  return [hip[0], s.ankleRestY + lift, hip[2] + z];
};

/** Rotate `p` about `pivot` by the inverse of R — pulls a world-frame target back into a parent's rest frame. */
const unrotate = (p: Vec3, pivot: Vec3, r: Mat3): Vec3 => add(pivot, mulMV(transpose(r), sub(p, pivot)));

const legPhaseOf = (side: Side, phase: number): number => (side === 'L' ? phase : phase + 0.5) % 1;

interface GaitContext {
  readonly bones: ReadonlyMap<string, Bone>;
  readonly params: HumanoidParams;
  readonly phase: number;
  readonly speed: number;
  readonly pelvisR: Mat3;
  readonly pelvisPivot: Vec3;
}

const legRotations = (ctx: GaitContext, side: Side): Record<string, Mat3> => {
  const { params } = ctx;
  const thigh = ctx.bones.get(`thigh.${side}`)!;
  const shin = ctx.bones.get(`shin.${side}`)!;
  const l1 = boneLen(thigh);
  const l2 = boneLen(shin);
  const legLen = l1 + l2;
  const stride = strideLength(params, legLen, ctx.speed) / 2;
  const limpFactor = side === 'R' ? 1 - clamp(params.limp, 0, 1) : 1;
  const legPhase = legPhaseOf(side, ctx.phase);
  const worldTarget = legTarget(thigh.head, {
    ankleRestY: shin.tail[1],
    footLift: params.footLift,
    stride: stride * limpFactor,
    legPhase,
  });
  const target = unrotate(worldTarget, ctx.pelvisPivot, ctx.pelvisR);

  const { a1: thighAbs, a2: shinAbs } = solveTwoBone(thigh.head, target, l1, l2);
  const thighDelta = thighAbs - restAngleDeg(thigh);
  const shinDelta = shinAbs - restAngleDeg(shin) - thighDelta;
  const thighR = rotX(thighDelta);
  const shinR = rotX(shinDelta);
  // Keep the foot level in *world* space: undo pelvis-roll ∘ thigh ∘ shin exactly, by matrix
  // inverse (transpose, since these are all rotations) rather than trying to cancel it with another
  // rotX angle. A scalar angle only cancels rotations about the same axis; pelvis roll is about Z,
  // not X, so it can't be undone that way — it has to be the real inverse.
  const footR = transpose(mulMM(mulMM(ctx.pelvisR, thighR), shinR));

  return {
    [`thigh.${side}`]: thighR,
    [`shin.${side}`]: shinR,
    [`foot.${side}`]: footR,
  };
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
  // legRotations's comment), and re-deriving a general 3D IK isn't worth it for a cosmetic wobble.
  const pelvisRollDeg = params.pelvisSway * Math.sin(TAU * p * 2);
  const pelvisR = rotX(pelvisRollDeg);
  const legCtx: GaitContext = { bones: byId, params, phase: p, speed, pelvisR, pelvisPivot: pelvis.head };

  const rotations: Record<string, Mat3> = {
    pelvis: pelvisR,
    spine: rotY(params.spineTwist * Math.sin(TAU * p * 2 + Math.PI)),
    head: rotX(params.headLoll * Math.sin(TAU * p * 2)),
    jaw: rotX(params.jawChatter * Math.abs(Math.sin(TAU * p * 8))),
    ...armRotations(p, params),
    ...legRotations(legCtx, 'L'),
    ...legRotations(legCtx, 'R'),
  };

  const root: Vec3 = [0, groundOffset(bones, extents, rotations), 0];
  return { root, rotations };
};
