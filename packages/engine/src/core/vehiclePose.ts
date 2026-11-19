import { type Motion, type MotionStage, posePoint } from '@skelly/motion/motion';
import type { ModelBox } from '@skelly/thing-core/schema';

/** A point in metres, read-only as thing-core poses it. */
type Vec3 = readonly [number, number, number];

/** The eight corners of a box. */
export const boxCorners = ({ min, max }: ModelBox): readonly Vec3[] =>
  [0, 1, 2, 3, 4, 5, 6, 7].map(
    (corner) => [0, 1, 2].map((axis) => ((corner >> axis) & 1 ? max : min)[axis]!) as unknown as Vec3,
  );

/** The smallest axis-aligned box holding every point. */
export const boundsOf = (points: readonly Vec3[]): ModelBox => ({
  min: [0, 1, 2].map((axis) => Math.min(...points.map((point) => point[axis]!))) as unknown as Vec3,
  max: [0, 1, 2].map((axis) => Math.max(...points.map((point) => point[axis]!))) as unknown as Vec3,
});

/**
 * A rigid move: `rotation` (row-major 3×3) then `translation`. Every motion stage is a hinge or a slide, so any pose of
 * a part, and a pose carried on another's, is one of these; renderers and later collision apply it as a whole.
 */
export interface RigidPose {
  readonly rotation: readonly [number, number, number, number, number, number, number, number, number];
  readonly translation: Vec3;
}

export const IDENTITY_POSE: RigidPose = { rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1], translation: [0, 0, 0] };

export const applyPose = ({ rotation: r, translation: t }: RigidPose, [x, y, z]: Vec3): Vec3 => [
  r[0] * x + r[1] * y + r[2] * z + t[0],
  r[3] * x + r[4] * y + r[5] * z + t[1],
  r[6] * x + r[7] * y + r[8] * z + t[2],
];

/** What a box blocks once posed: a turned box no longer lies on the axes, so it blocks the bounds that hold it. */
export const poseBox = (pose: RigidPose, box: ModelBox): ModelBox =>
  boundsOf(boxCorners(box).map((corner) => applyPose(pose, corner)));

/** `outer` after `inner`. */
export const composePoses = (outer: RigidPose, inner: RigidPose): RigidPose => {
  const [a, b] = [outer.rotation, inner.rotation];
  const row = (i: number) =>
    [0, 1, 2].map((j) => a[i * 3]! * b[j]! + a[i * 3 + 1]! * b[3 + j]! + a[i * 3 + 2]! * b[6 + j]!);
  return {
    rotation: [...row(0), ...row(1), ...row(2)] as unknown as RigidPose['rotation'],
    translation: applyPose(outer, inner.translation),
  };
};

/** The undoing move: a rotation's inverse is its transpose. */
export const invertPose = ({ rotation: r, translation: t }: RigidPose): RigidPose => {
  const rotation: RigidPose['rotation'] = [r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]];
  const back = applyPose({ rotation, translation: [0, 0, 0] }, t);
  return { rotation, translation: [-back[0], -back[1], -back[2]] };
};

/**
 * A motion at `clock` as one rigid move, read off where it carries the origin and the unit axes. `posePoint` stays the
 * one definition of how stages compose, so this cannot drift from what content tools and validation pose.
 */
export const motionPose = (motion: Motion, clock: number): RigidPose => {
  const translation = posePoint(motion, [0, 0, 0], clock);
  const axis = (point: Vec3) => {
    const moved = posePoint(motion, point, clock);
    return [moved[0] - translation[0], moved[1] - translation[1], moved[2] - translation[2]];
  };
  const [x, y, z] = [axis([1, 0, 0]), axis([0, 1, 0]), axis([0, 0, 1])];
  return { rotation: [x[0]!, y[0]!, z[0]!, x[1]!, y[1]!, z[1]!, x[2]!, y[2]!, z[2]!], translation };
};

/** One fitting as the rig reads it: its supports, its own motion in the vehicle frame, and how far along it stands. */
export interface RiggedFitting {
  readonly id: string;
  readonly supportedBy: readonly string[];
  readonly motion?: Motion | undefined;
  /** 0 at rest, 1 at its stop. */
  readonly clock: number;
}

interface CarriedFitting {
  readonly id: string;
  readonly supportedBy: readonly string[];
  /** Whether its own part moves, whatever it rests on. */
  readonly moves: boolean;
}

/**
 * Which fittings can move: those whose part moves, and those resting on one such alone. A fitting resting on a part
 * that moves and on another as well would be torn between them, so `carriedIssues` refuses it and the rig need not
 * choose. Supports are acyclic by then (`supportProblems`); the walk still refuses a cycle rather than loop.
 */
const movingFittings = (fittings: readonly CarriedFitting[]): ReadonlySet<string> => {
  const byId = new Map(fittings.map((fitting) => [fitting.id, fitting]));
  const moving = new Set<string>();
  const visit = (fitting: CarriedFitting, path: ReadonlySet<string>): boolean => {
    if (path.has(fitting.id)) {
      throw new Error(`Vehicle supports cycle through ${fitting.id}`);
    }
    const [carrier, ...others] = fitting.supportedBy.map((id) => byId.get(id));
    const carried = carrier !== undefined && others.length === 0 && visit(carrier, new Set([...path, fitting.id]));
    if (fitting.moves || carried) {
      moving.add(fitting.id);
    }
    return moving.has(fitting.id);
  };
  for (const fitting of fittings) {
    visit(fitting, new Set());
  }
  return moving;
};

/** Fittings resting on a part that moves and on anything else. Content and saved builds share the rule. */
export const carriedIssues = (fittings: readonly CarriedFitting[]): readonly string[] => {
  const moving = movingFittings(fittings);
  return fittings
    .filter(({ supportedBy }) => supportedBy.length > 1 && supportedBy.some((id) => moving.has(id)))
    .map(({ id }) => `${id} rests on a part that moves and on another`);
};

/**
 * Each fitting's pose in the vehicle frame: its own motion at its clock, carried on the pose of the one part it rests
 * on, so a mirror on a door swings with the door. A fitting resting on several parts rests on still ones
 * (`carriedIssues`), so it stays where it is built unless it moves itself.
 */
export const fittingPoses = (fittings: readonly RiggedFitting[]): ReadonlyMap<string, RigidPose> => {
  const byId = new Map(fittings.map((fitting) => [fitting.id, fitting]));
  const poses = new Map<string, RigidPose>();
  const poseOf = (fitting: RiggedFitting, path: ReadonlySet<string>): RigidPose => {
    const known = poses.get(fitting.id);
    if (known) {
      return known;
    }
    if (path.has(fitting.id)) {
      throw new Error(`Vehicle supports cycle through ${fitting.id}`);
    }
    const [carrier, ...others] = fitting.supportedBy.map((id) => byId.get(id));
    const carried =
      carrier !== undefined && others.length === 0 ? poseOf(carrier, new Set([...path, fitting.id])) : IDENTITY_POSE;
    // At rest a part is exactly where it is built, not where rounding through its stages leaves it.
    const own = fitting.motion && fitting.clock > 0 ? motionPose(fitting.motion, fitting.clock) : IDENTITY_POSE;
    const pose = composePoses(carried, own);
    poses.set(fitting.id, pose);
    return pose;
  };
  for (const fitting of fittings) {
    poseOf(fitting, new Set());
  }
  return poses;
};

/** The fitting and every fitting it carries, as `fittingPoses` carries them, so what swings with a part is known. */
export const carriedWith = (
  fittings: readonly Pick<RiggedFitting, 'id' | 'supportedBy'>[],
  id: string,
): ReadonlySet<string> => {
  const carried = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const fitting of fittings) {
      const [carrier, ...others] = fitting.supportedBy;
      if (!carried.has(fitting.id) && others.length === 0 && carrier !== undefined && carried.has(carrier)) {
        carried.add(fitting.id);
        grew = true;
      }
    }
  }
  return carried;
};

/** How far one stage carries a point from rest to its stop: a slide its travel, a hinge the arc about its axis. */
const stageTravel = (stage: MotionStage, [x, y, z]: Vec3): number => {
  if (stage.kind === 'slide') {
    return stage.travel;
  }
  const { from, to } = stage.axis;
  const axis = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  const offset = [x - from[0], y - from[1], z - from[2]];
  const across = [
    axis[1]! * offset[2]! - axis[2]! * offset[1]!,
    axis[2]! * offset[0]! - axis[0]! * offset[2]!,
    axis[0]! * offset[1]! - axis[1]! * offset[0]!,
  ];
  const radius = Math.hypot(...across) / Math.hypot(...axis);
  return (Math.abs(stage.angle) * Math.PI * radius) / 180;
};

/**
 * The clocks a swing is looked at from rest to its stop, close enough that no point of `points` (in the motion's rest
 * frame) travels further than `spacing` between two of them. Each stage runs linearly through its share of the clock,
 * so a stage is cut into equal steps by how far it carries its furthest point; the spacing is the caller's geometry.
 */
export const sweepClocks = (motion: Motion, points: readonly Vec3[], spacing: number): readonly number[] => {
  const clocks = [0];
  let start = 0;
  for (const stage of motion.stages) {
    const travel = Math.max(0, ...points.map((point) => stageTravel(stage, point)));
    const steps = Math.max(1, Math.ceil(travel / spacing));
    for (let step = 1; step <= steps; step++) {
      clocks.push(start + (stage.share * step) / steps);
    }
    start += stage.share;
  }
  // The stop is clock 1, whatever the shares sum to once rounded.
  clocks[clocks.length - 1] = 1;
  return clocks;
};
