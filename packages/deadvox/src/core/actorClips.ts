// Reads baked actor clips (`schema/actors.ts`, `ActorClipsSchema`) and composes them onto a body. Rules match
// the skelly-assets twin `packages/skelly-assets/tools/actorCompose.mjs`; the arithmetic is deadvox's own, with the mobgen helpers it needs
// copied below so this module never imports mobgen.
//
// Layer order for the poser that adopts this module:
//   humanoid: walk (cross-faded to the stance idle) → attack → head yaw → flinch;
//   acid: idle → walk → attack → spitDraw → head yaw → hit.

import {
  applyPoint,
  clamp,
  IDENTITY_M,
  type Mat3,
  mulMM,
  normalize,
  type Quat,
  quatToMat3,
  rotX,
  rotY,
  rotZ,
  slerpQuat,
  transpose,
  type Vec3,
} from './boneMath.ts';
import { type Bone, bodySkeleton } from './bones.ts';
import { clampJointAngles, jointAngles, jointRotation } from './joints.ts';
import { blendPose, boneTransforms, type EulerDeg, type Pose } from './pose.ts';
import type {
  ActorBody,
  DeathClip,
  HumanoidIdle,
  JointDeltaClip,
  OverlayClip,
  OverlayFrame,
  PoseClip,
  PoseFrame,
  StanceIdle,
} from './schema/actors.ts';

const TAU = 2 * Math.PI;
const IDENTITY_Q: Quat = [0, 0, 0, 1];

interface Extent {
  readonly min: Vec3;
  readonly max: Vec3;
}

// The producer's arithmetic, kept equal so a runtime refit matches the baked frames: see
// `packages/skelly-assets/tools/packages/mobgen/src/mob/gait.ts`, `groundOffset`;
// `packages/skelly-assets/tools/packages/mobgen/src/mob/attack.ts`, `blendArmBase`; and
// `packages/skelly-assets/tools/packages/mobgen/src/core/math.ts`, `rotAxis`.

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

const corners = (e: Extent): Vec3[] => {
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

const groundOffset = (
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

const GROUND_SMOOTHING = 0.006;

const eulerToMat3 = ([x, y, z]: readonly [number, number, number]): Mat3 => mulMM(mulMM(rotZ(z), rotY(y)), rotX(x));

const rotAxis = (axis: Vec3, deg: number): Mat3 => {
  const [x, y, z] = normalize(axis);
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const k = 1 - c;
  return [
    x * x * k + c,
    x * y * k - z * s,
    x * z * k + y * s,
    y * x * k + z * s,
    y * y * k + c,
    y * z * k - x * s,
    z * x * k - y * s,
    z * y * k + x * s,
    z * z * k + c,
  ];
};

const blendArmBase = (baseR: Mat3, weight: number): Mat3 => {
  if (weight >= 1) {
    return baseR;
  }
  const cosAngle = clamp((baseR[0] + baseR[4] + baseR[8] - 1) / 2, -1, 1);
  const angle = Math.acos(cosAngle);
  if (weight <= 0 || angle < 1e-9) {
    return IDENTITY_M;
  }
  const sinAngle = Math.sin(angle);
  const axis: Vec3 = [
    (baseR[7] - baseR[5]) / (2 * sinAngle),
    (baseR[2] - baseR[6]) / (2 * sinAngle),
    (baseR[3] - baseR[1]) / (2 * sinAngle),
  ];
  return rotAxis(axis, (angle * 180 * weight) / Math.PI);
};

// ---- decoding and sampling ----

/** A stored frame as a pose; decode after interpolating, never per bone before it. */
export const decodeFrame = (frame: PoseFrame): Pose => ({
  root: [frame.root[0], frame.root[1], frame.root[2]],
  rotations: Object.fromEntries(Object.entries(frame.rotations).map(([id, q]) => [id, quatToMat3(q)])),
});

type FiniteSpan = Pick<PoseClip, 'durationSimSeconds'> | Pick<DeathClip, 'durationRealSeconds'>;

/**
 * A pose clip at `cursor`: normalised for a looping clip (the last frame wraps to frame zero), seconds for a
 * finite one (the last frame holds at and after its span). Exact frame cursors return the stored frame.
 */
export const sampleClip = (clip: PoseClip | DeathClip, cursor: number): PoseFrame => {
  const count = clip.frames.length;
  if (count === 1) {
    return clip.frames[0]!;
  }
  const u = clip.loop
    ? (((cursor % 1) + 1) % 1) * count
    : (clamp(cursor, 0, finiteDuration(clip)) / finiteDuration(clip)) * (count - 1);
  const i = Math.floor(u);
  const w = u - i;
  const a = clip.frames[i]!;
  if (w === 0) {
    return a;
  }
  const b = clip.frames[(i + 1) % count]!;
  const ids = new Set([...Object.keys(a.rotations), ...Object.keys(b.rotations)]);
  return {
    root: [
      a.root[0] + (b.root[0] - a.root[0]) * w,
      a.root[1] + (b.root[1] - a.root[1]) * w,
      a.root[2] + (b.root[2] - a.root[2]) * w,
    ],
    rotations: Object.fromEntries(
      [...ids].map((id) => {
        const [x, y, z, s] = slerpQuat(a.rotations[id] ?? IDENTITY_Q, b.rotations[id] ?? IDENTITY_Q, w);
        return [id, [x, y, z, s]];
      }),
    ),
  };
};

/** A finite clip's span in its own clock's seconds; the sampler stays clock-free, its caller picks the clock. */
const finiteDuration = (clip: FiniteSpan): number => {
  const sim = 'durationSimSeconds' in clip ? clip.durationSimSeconds : undefined;
  const real = 'durationRealSeconds' in clip ? clip.durationRealSeconds : undefined;
  if (sim !== undefined && real === undefined) {
    return sim;
  }
  if (real !== undefined && sim === undefined) {
    return real;
  }
  throw new Error('a finite clip needs exactly one of durationSimSeconds and durationRealSeconds');
};

/** A walk clip's wrapped cursor: one normalised span covers `cycles` gait cycles. */
export const walkCursor = (gaitPhase: number, cycles: number): number => (((gaitPhase / (TAU * cycles)) % 1) + 1) % 1;

// ---- stance idle ----

/** The stance idle's base between slack (0) and aggravated (1). */
export const idleBase = (idle: HumanoidIdle, stanceWeight: number): Pose =>
  blendPose(decodeFrame(idle.slack.base), decodeFrame(idle.aggravated.base), stanceWeight);

/** The oscillators of the stance `stanceWeight` selects: slack below one half, aggravated from it. */
export const stanceMotion = (idle: HumanoidIdle, stanceWeight: number): StanceIdle['motion'] =>
  stanceWeight < 0.5 ? idle.slack.motion : idle.aggravated.motion;

const phaseFor = (seed: number, salt: number): number => {
  const h = Math.sin(seed * 12.9898 + salt * 78.233) * 43_758.5453;
  return (h - Math.floor(h)) * TAU;
};

const AXIS_ROTATIONS = { x: rotX, y: rotY, z: rotZ } as const;

/** Each oscillator right-multiplies its bones' rotations, in list order; the root is unchanged. */
export const applyMotion = (base: Pose, motion: StanceIdle['motion'], time: number, seed: number): Pose => {
  const rotations: Record<string, Mat3> = { ...base.rotations };
  for (const oscillator of motion) {
    const angle =
      Math.sin((TAU * time) / oscillator.periodSimSeconds + phaseFor(seed, oscillator.salt)) * oscillator.amplitudeDeg;
    for (const { bone, axis, scale } of oscillator.bones) {
      rotations[bone] = mulMM(rotations[bone] ?? IDENTITY_M, AXIS_ROTATIONS[axis](angle * scale));
    }
  }
  return { root: [base.root[0], base.root[1], base.root[2]], rotations };
};

/** How far the walk has faded into the idle: 1 standing still, 0 at and above `idleBlendSpeed`. */
export const idleBlendWeight = (speed: number, idleBlendSpeed: number): number =>
  clamp(1 - speed / idleBlendSpeed, 0, 1);

export const walkToIdle = (walk: Pose, idle: Pose, speed: number, idleBlendSpeed: number): Pose =>
  blendPose(walk, idle, idleBlendWeight(speed, idleBlendSpeed));

// ---- ground fits ----

/** The lowest point of each listed bone's hull voxels, posed; bones without a hull are skipped. */
export const groundFit = (
  body: ActorBody,
  pose: Pose,
  boneIds: readonly string[],
): { lowest: number; byBone: Map<string, number> } => {
  const transforms = boneTransforms(bodySkeleton(body), pose);
  const half = body.voxelSize / 2;
  const hulls = new Map(body.bones.map((bone) => [bone.id, bone.hull]));
  const byBone = new Map<string, number>();
  for (const id of boneIds) {
    const transform = transforms.get(id);
    const centres = hulls.get(id);
    if (!(transform && centres)) {
      continue;
    }
    const { r } = transform;
    const verticalHalfExtent = half * (Math.abs(r[3]) + Math.abs(r[4]) + Math.abs(r[5]));
    let lowest = Number.POSITIVE_INFINITY;
    for (const centre of centres) {
      lowest = Math.min(lowest, applyPoint(transform, centre)[1] - verticalHalfExtent);
    }
    byBone.set(id, lowest);
  }
  return { lowest: Math.min(...byBone.values()), byBone };
};

/** Root y that stands the body's extent bones on the ground for these rotations. */
export const standingFit = (body: ActorBody, rotations: Record<string, Mat3>): number =>
  groundOffset(bodySkeleton(body), new Map(Object.entries(body.extents)), rotations, GROUND_SMOOTHING);

/** Root y that rests the body's ground contact bones on the ground, fitted at root height zero. */
const crawlingFit = (body: ActorBody, root: Vec3, rotations: Record<string, Mat3>): number => {
  if (!body.groundContactBones) {
    throw new Error(`body ${body.type} has no ground contact bones`);
  }
  return -groundFit(body, { root: [root[0], 0, root[2]], rotations }, body.groundContactBones).lowest;
};

/** Root y that grounds these rotations the way the stance's overlays ground theirs. */
export const stanceFit = (
  body: ActorBody,
  root: Vec3,
  rotations: Record<string, Mat3>,
  stance: 'standing' | 'crawling',
): number => (stance === 'crawling' ? crawlingFit(body, root, rotations) : standingFit(body, rotations));

// ---- overlays ----

/** Overlay values at `time` seconds, linear between frames; a stored frame at an exact frame time. */
const sampleOverlay = (clip: OverlayClip, time: number): OverlayFrame => {
  const u = clamp(time / clip.durationSimSeconds, 0, 1) * (clip.frames.length - 1);
  const i = Math.floor(u);
  const w = u - i;
  const a = clip.frames[i]!;
  if (w === 0) {
    return a;
  }
  const b = clip.frames[i + 1]!;
  const lerp = (x: number, y: number): number => x + (y - x) * w;
  const ids = new Set([...Object.keys(a.angles), ...Object.keys(b.angles)]);
  return {
    angles: Object.fromEntries(
      [...ids].map((id) => {
        const from = a.angles[id] ?? [0, 0, 0];
        const to = b.angles[id] ?? [0, 0, 0];
        return [id, [lerp(from[0], to[0]), lerp(from[1], to[1]), lerp(from[2], to[2])]];
      }),
    ),
    walkBlendWeight: lerp(a.walkBlendWeight, b.walkBlendWeight),
    dropMetres: lerp(a.dropMetres, b.dropMetres),
  };
};

/** An overlay composed onto `base`, then refitted to the ground for the stance and lowered by the frame's drop. */
// biome-ignore lint/complexity/useMaxParams: the skelly-assets twin `packages/skelly-assets/tools/actorCompose.mjs` takes the same arguments, so the two read side by side.
export const applyOverlay = (
  body: ActorBody,
  base: Pose,
  clip: OverlayClip,
  time: number,
  side: number,
  stance: 'standing' | 'crawling',
): Pose => {
  const frame = sampleOverlay(clip, time);
  const rotations: Record<string, Mat3> = { ...base.rotations };
  const blendBones = new Set(clip.walkBlendBones);
  for (const [id, [x, y, z]] of Object.entries(frame.angles)) {
    const baseR = base.rotations[id] ?? IDENTITY_M;
    const blended = blendBones.has(id) ? blendArmBase(baseR, frame.walkBlendWeight) : baseR;
    rotations[id] = mulMM(blended, eulerToMat3([x, y, z * (clip.sideScalesZ ? side : 1)]));
  }
  return {
    root: [base.root[0], stanceFit(body, base.root, rotations, stance) - frame.dropMetres, base.root[2]],
    rotations,
  };
};

// ---- joint deltas ----

const boneById = (bones: ReadonlyMap<string, Bone>, id: string): Bone => {
  const bone = bones.get(id);
  if (!bone) {
    throw new Error(`missing joint delta bone ${id}`);
  }
  return bone;
};

type Angles = JointDeltaClip['frames'][number]['angles'];

/** The two neighbouring frames' angles and the weight between them at `cursor`. */
const deltaFrames = (clip: JointDeltaClip, cursor: number): { a: Angles; b: Angles; w: number } => {
  const count = clip.frames.length;
  const u =
    clip.cursor === 'gaitPhase'
      ? ((((cursor / TAU) % 1) + 1) % 1) * count
      : clamp(cursor / (clip.durationSimSeconds ?? 1), 0, 1) * (count - 1);
  const i = Math.floor(u);
  return { a: clip.frames[i]!.angles, b: clip.frames[(i + 1) % count]!.angles, w: u - i };
};

/** Each foot's sole turned level with the ground: the inverse of its parent's world rotation, inside its limits. */
const holdSoles = (chain: readonly Bone[], bones: ReadonlyMap<string, Bone>, pose: Pose): Record<string, Mat3> => {
  const transforms = boneTransforms(chain, pose);
  const rotations: Record<string, Mat3> = { ...pose.rotations };
  for (const id of ['foot.L', 'foot.R']) {
    const foot = boneById(bones, id);
    const parent = foot.parent === null ? undefined : transforms.get(foot.parent);
    if (!parent) {
      throw new Error(`sole hold needs the parent of ${id}`);
    }
    rotations[id] = jointRotation(foot, clampJointAngles(foot, jointAngles(foot, transpose(parent.r))));
  }
  return rotations;
};

/**
 * Joint-angle deltas added to `base` inside each bone's limits, then the whole body refitted to the ground.
 * The cursor is a gait phase in radians, a progress fraction or seconds, per the clip's `cursor`.
 */
// biome-ignore lint/complexity/useMaxParams: the skelly-assets twin `packages/skelly-assets/tools/actorCompose.mjs` takes the same arguments, so the two read side by side.
export const applyJointDelta = (
  body: ActorBody,
  base: Pose,
  clip: JointDeltaClip,
  cursor: number,
  { speed, side }: { readonly speed: number; readonly side: number },
): Pose => {
  if (clip.speedWeight && speed <= 0) {
    return base;
  }
  const { a, b, w } = deltaFrames(clip, cursor);
  const chain = bodySkeleton(body);
  const bones = new Map(chain.map((bone) => [bone.id, bone]));
  const weight = clip.speedWeight ? clamp(speed, 0, 1) : 1;
  const sideScale = clip.sideScalesZ ? clamp(side, -1, 1) : 1;
  const scales: EulerDeg = [weight, weight, weight * sideScale];
  let rotations: Record<string, Mat3> = { ...base.rotations };
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const bone = boneById(bones, id);
    const from = a[id] ?? [0, 0, 0];
    const to = b[id] ?? [0, 0, 0];
    const old = jointAngles(bone, rotations[id] ?? IDENTITY_M);
    const step = (axis: 0 | 1 | 2): number => old[axis] + (from[axis] + (to[axis] - from[axis]) * w) * scales[axis];
    rotations[id] = jointRotation(bone, clampJointAngles(bone, [step(0), step(1), step(2)]));
  }
  if (clip.footSoleHold) {
    rotations = holdSoles(chain, bones, { root: base.root, rotations });
  }
  const { lowest } = groundFit(
    body,
    { root: base.root, rotations },
    chain.map((bone) => bone.id),
  );
  return { root: [base.root[0], base.root[1] - lowest, base.root[2]], rotations };
};
