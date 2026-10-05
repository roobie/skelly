import type { Vec3 } from '../core/coords.ts';
import type { Job } from '../core/handling.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';

/** Presentation estimate; BR's look, not handling mechanics, owns these values. */
export const RUMMAGE_POSE = {
  center: [0, -0.18, -0.38] as Vec3,
  handSpacing: 0.06,
  amplitude: 0.008,
  cyclesPerSecond: 3,
  transitionSeconds: 0.16,
} as const;

const HELD_ACTION_PRESENTATION: Readonly<
  Partial<Record<string, { readonly itemParam: string; readonly dedicated: boolean }>>
> = {
  'item.unpack': { itemParam: 'uid', dedicated: false },
  'survival.eat': { itemParam: 'itemUid', dedicated: false },
  'survival.battery': { itemParam: 'lightUid', dedicated: false },
  // Dedicated handling must win even before a firearm's model finishes loading.
  'firearm.cock': { itemParam: 'uid', dedicated: true },
  'firearm.load': { itemParam: 'uid', dedicated: true },
};

export interface RummageFrame {
  readonly holdingSide: HandSide;
  readonly elapsed: number;
  readonly weight: number;
}

export const rummageFrame = (
  inventory: Readonly<Pick<Inventory, 'hands'>>,
  job: Readonly<Job> | undefined,
  primaryHandSide: HandSide,
): RummageFrame | undefined => {
  if (!job || job.duration <= 0 || job.elapsed >= job.duration) {
    return undefined;
  }
  let uid: unknown;
  if (job.kind === 'move') {
    uid = job.itemUid;
  } else {
    const action = HELD_ACTION_PRESENTATION[job.jobType];
    if (!action || action.dedicated) {
      return undefined;
    }
    uid = job.params[action.itemParam];
  }
  if (typeof uid !== 'number' || !Number.isSafeInteger(uid)) {
    return undefined;
  }
  const offHandSide = primaryHandSide === 'right' ? 'left' : 'right';
  const holdingSide = ([primaryHandSide, offHandSide] as const).find((side) => inventory.hands[side]?.uid === uid);
  if (!holdingSide) {
    return undefined;
  }
  const ramp = Math.max(
    0,
    Math.min(
      1,
      job.elapsed / RUMMAGE_POSE.transitionSeconds,
      (job.duration - job.elapsed) / RUMMAGE_POSE.transitionSeconds,
    ),
  );
  return { holdingSide, elapsed: job.elapsed, weight: ramp * ramp * (3 - 2 * ramp) };
};

export const rummageGrip = (rest: Vec3, side: HandSide, frame: RummageFrame): Vec3 => {
  const sign = side === 'right' ? 1 : -1;
  const wave = Math.sin(frame.elapsed * RUMMAGE_POSE.cyclesPerSecond * 2 * Math.PI);
  const target: Vec3 = [
    RUMMAGE_POSE.center[0] + sign * RUMMAGE_POSE.handSpacing,
    RUMMAGE_POSE.center[1] + sign * wave * RUMMAGE_POSE.amplitude,
    RUMMAGE_POSE.center[2] + wave * RUMMAGE_POSE.amplitude,
  ];
  return rest.map((value, axis) => value + (target[axis]! - value) * frame.weight) as Vec3;
};
