import type { Vec3 } from '../core/coords.ts';
import type { HandSide } from '../core/inventory.ts';

/** Presentation estimates; the load job owns time and BR's look owns this path. */
const FEED = {
  pickupEnd: 0.2,
  approachEnd: 0.7,
  thumbEnd: 0.84,
  pickupSide: 0.05,
  pickupBelow: 0.1,
  pickupBack: 0.1,
  palmBelow: 0.018,
  palmBack: 0.04,
  thumbLift: 0.01,
  thumbTravel: 0.045,
} as const;

const between = (from: Vec3, to: Vec3, fraction: number): Vec3 => {
  const t = Math.max(0, Math.min(1, fraction));
  const weight = t * t * (3 - 2 * t);
  return from.map((value, axis) => value + (to[axis]! - value) * weight) as Vec3;
};

export const shellLoadPose = (
  rest: Vec3,
  port: Vec3,
  side: HandSide,
  { elapsed, duration }: { readonly elapsed: number; readonly duration?: number | undefined },
): { wrist: Vec3; shell: Vec3; visible: boolean } | undefined => {
  if (!(duration && Number.isFinite(duration) && duration > 0 && Number.isFinite(elapsed))) {
    return undefined;
  }
  const progress = Math.max(0, Math.min(1, elapsed / duration));
  const pickup: Vec3 = [
    port[0] + (side === 'right' ? FEED.pickupSide : -FEED.pickupSide),
    port[1] - FEED.pickupBelow,
    port[2] + FEED.pickupBack,
  ];
  const feeding: Vec3 = [port[0], port[1] - FEED.palmBelow, port[2] + FEED.palmBack];
  const seated: Vec3 = [feeding[0], feeding[1] + FEED.thumbLift, feeding[2] - FEED.thumbTravel];
  let wrist: Vec3;
  if (progress < FEED.pickupEnd) {
    wrist = between(rest, pickup, progress / FEED.pickupEnd);
  } else if (progress < FEED.approachEnd) {
    wrist = between(pickup, feeding, (progress - FEED.pickupEnd) / (FEED.approachEnd - FEED.pickupEnd));
  } else if (progress < FEED.thumbEnd) {
    wrist = between(feeding, seated, (progress - FEED.approachEnd) / (FEED.thumbEnd - FEED.approachEnd));
  } else {
    wrist = between(seated, rest, (progress - FEED.thumbEnd) / (1 - FEED.thumbEnd));
  }
  return {
    wrist,
    shell: [wrist[0], wrist[1] + FEED.palmBelow, wrist[2] - FEED.palmBack],
    visible: progress < FEED.thumbEnd,
  };
};
