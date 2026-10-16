import type { Vec3 } from '../core/coords.ts';
import type { HandSide } from '../core/inventory.ts';
import type { RoundFeedPoseTuning } from '../core/schema.ts';

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
  {
    elapsed,
    duration,
    topFeed = false,
    feed = FEED,
  }: {
    readonly elapsed: number;
    readonly duration?: number | undefined;
    readonly topFeed?: boolean;
    readonly feed?: RoundFeedPoseTuning;
  },
): { wrist: Vec3; shell: Vec3; visible: boolean } | undefined => {
  if (!(duration && Number.isFinite(duration) && duration > 0 && Number.isFinite(elapsed))) {
    return undefined;
  }
  const progress = Math.max(0, Math.min(1, elapsed / duration));
  const vertical = topFeed ? -1 : 1;
  const pickup: Vec3 = [
    port[0] + (side === 'right' ? feed.pickupSide : -feed.pickupSide),
    port[1] - vertical * feed.pickupBelow,
    port[2] + feed.pickupBack,
  ];
  const feeding: Vec3 = [port[0], port[1] - vertical * feed.palmBelow, port[2] + feed.palmBack];
  const seated: Vec3 = [feeding[0], feeding[1] + vertical * feed.thumbLift, feeding[2] - feed.thumbTravel];
  let wrist: Vec3;
  if (progress < feed.pickupEnd) {
    wrist = between(rest, pickup, progress / feed.pickupEnd);
  } else if (progress < feed.approachEnd) {
    wrist = between(pickup, feeding, (progress - feed.pickupEnd) / (feed.approachEnd - feed.pickupEnd));
  } else if (progress < feed.thumbEnd) {
    wrist = between(feeding, seated, (progress - feed.approachEnd) / (feed.thumbEnd - feed.approachEnd));
  } else {
    wrist = between(seated, rest, (progress - feed.thumbEnd) / (1 - feed.thumbEnd));
  }
  return {
    wrist,
    shell: [wrist[0], wrist[1] + vertical * feed.palmBelow, wrist[2] - feed.palmBack],
    visible: progress < feed.thumbEnd,
  };
};
