// A piece's pose as a quarter-turn rotation (`DESIGN.md`, "Moving furniture"). Stored as the heading every
// standing piece already has plus the face it lies on, so doors, ladders and worldgen keep reading `facing`;
// as a rotation it composes, so a carried piece turns about fixed world axes from any pose.

import type { Vec3 } from './coords.ts';
import { type Facing, turnFacing } from './templates.ts';

/** Which of its own faces a piece lies on, when not its bottom. Its front is local −z and its right local +x. */
export type Tip = 'back' | 'front' | 'left' | 'right' | 'top';

/** Where a piece's own x, y and z axes point in the world; each is a signed world axis. */
export type Rotation = readonly [Readonly<Vec3>, Readonly<Vec3>, Readonly<Vec3>];

/** The world axes a carried piece turns about: x tips it over, y turns it about the vertical. */
export type WorldAxis = 'x' | 'y';

export interface Pose {
  facing: Facing;
  tip?: Tip | undefined;
}

const IDENTITY: Rotation = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** A quarter turn about a world axis, anticlockwise looking down that axis toward the origin when `sign` is 1. */
const quarter = (axis: 'x' | 'y' | 'z', sign: 1 | -1): Rotation => {
  if (axis === 'x') {
    return [
      [1, 0, 0],
      [0, 0, sign],
      [0, -sign, 0],
    ];
  }
  if (axis === 'y') {
    return [
      [0, 0, -sign],
      [0, 1, 0],
      [sign, 0, 0],
    ];
  }
  return [
    [0, sign, 0],
    [-sign, 0, 0],
    [0, 0, 1],
  ];
};

const apply = (rotation: Rotation, [x, y, z]: Readonly<Vec3>): Vec3 => {
  const [ax, ay, az] = rotation;
  return [0, 1, 2].map((i) => ax[i]! * x + ay[i]! * y + az[i]! * z) as Vec3;
};

/** `outer` after `inner`. */
const compose = (outer: Rotation, inner: Rotation): Rotation => [
  apply(outer, inner[0]),
  apply(outer, inner[1]),
  apply(outer, inner[2]),
];

const same = (a: Rotation, b: Rotation): boolean => a.every((axis, i) => axis.every((value, j) => value === b[i]![j]));

/** A quarter clockwise seen from above takes a north-facing front to east. */
const CLOCKWISE = quarter('y', -1);

const heading = (facing: Facing): Rotation => {
  let rotation = IDENTITY;
  for (let at: Facing = 'n'; at !== facing; at = turnFacing(at, 1)) {
    rotation = compose(CLOCKWISE, rotation);
  }
  return rotation;
};

/** Each tip lays the named face down, seen from a north-facing piece. */
const TILTS: Readonly<Record<Tip, Rotation>> = {
  back: quarter('x', 1),
  front: quarter('x', -1),
  right: quarter('z', -1),
  left: quarter('z', 1),
  top: compose(quarter('x', 1), quarter('x', 1)),
};

const TIPS: readonly (Tip | undefined)[] = [undefined, 'back', 'front', 'left', 'right', 'top'];
const FACINGS: readonly Facing[] = ['n', 'e', 's', 'w'];

/** The press each world axis makes; turning about y matches a standing piece's clockwise turn. */
const PRESSES: Readonly<Record<WorldAxis, Rotation>> = { x: quarter('x', 1), y: CLOCKWISE };

export const rotationOf = ({ facing, tip }: Pose): Rotation =>
  tip ? compose(heading(facing), TILTS[tip]) : heading(facing);

/** The pose a rotation stands for; each of the 24 quarter-turn rotations has exactly one. */
const poseOf = (rotation: Rotation): Pose => {
  for (const tip of TIPS) {
    for (const facing of FACINGS) {
      if (same(rotationOf({ facing, tip }), rotation)) {
        return { facing, tip };
      }
    }
  }
  throw new Error('not a quarter-turn rotation');
};

/** A quarter turn about a fixed world axis, so a press gives the same pose wherever the player stands. */
export const turnPose = (pose: Pose, axis: WorldAxis): Pose => poseOf(compose(PRESSES[axis], rotationOf(pose)));

/** The world box a piece of `size` cells fills under `rotation`. */
export const rotatedSize = (size: Readonly<Vec3>, rotation: Rotation): Vec3 =>
  [0, 1, 2].map((world) => rotation.reduce((sum, axis, own) => sum + Math.abs(axis[world]!) * size[own]!, 0)) as Vec3;
