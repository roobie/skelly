import type { Vec3 } from '../core/coords.ts';
import type { Job } from '../core/handling.ts';
import { type HandSide, type Inventory, SIDES } from '../core/inventory.ts';
import { MAGAZINE_LOAD_ACTION, MAGAZINE_STRIP_ACTION } from '../game/magazineHandling.ts';

/** Presentation estimates; each round's job owns time, and BR's look owns this path. */
export const MAGAZINE_LOAD_POSE = {
  /** Where the raised magazine's hand goes in view metres, for the right hand; the left mirrors it. */
  raised: [0.05, -0.1, -0.4] as Vec3,
  /** How far the raised magazine tips its top toward the eye. */
  raisedTiltRadians: 0.35,
  /** To raise or lower the magazine. */
  raiseRealSeconds: 0.18,
  /** The magazine stays up this long once no round's job is running. */
  holdRealSeconds: 0.12,
  /** Shares of a round's job: the hand reaches the lips, presses the round down, slides it back under them. */
  reachEnd: 0.3,
  pressEnd: 0.55,
  seatEnd: 0.75,
  /** Where the fingers hold the round, in the magazine model's frame relative to its top seat. */
  above: [0.012, 0.024, 0] as Vec3,
  pressed: [0.012, 0, 0] as Vec3,
} as const;

export interface MagazineLoadFrame {
  uid: number;
  holdingSide: HandSide;
  /** The running job's own progress, 0 to 1. */
  progress: number;
  /** Stripping plays the load in reverse. */
  strip: boolean;
  roundType: string | undefined;
}

export const createMagazineLoadFrame = (): MagazineLoadFrame => ({
  uid: 0,
  holdingSide: 'right',
  progress: 0,
  strip: false,
  roundType: undefined,
});

/**
 * Reads the round being loaded into, or stripped from, a held magazine from the running job alone, into `out`.
 * False when no such job runs, so the press can never show a round the simulation hasn't moved.
 */
export const readMagazineLoadFrame = (
  inventory: Readonly<Pick<Inventory, 'hands' | 'itemByUid'>>,
  job: Readonly<Job> | undefined,
  out: MagazineLoadFrame,
): boolean => {
  if (
    !(
      job?.kind === 'action' &&
      (job.jobType === MAGAZINE_LOAD_ACTION || job.jobType === MAGAZINE_STRIP_ACTION) &&
      job.duration > 0 &&
      job.elapsed < job.duration
    )
  ) {
    return false;
  }
  const { uid } = job.params;
  const holdingSide = SIDES.find((side) => inventory.hands[side]?.uid === uid);
  const magazine = holdingSide && inventory.hands[holdingSide];
  if (!(holdingSide && magazine)) {
    return false;
  }
  out.uid = magazine.uid;
  out.holdingSide = holdingSide;
  out.progress = Math.max(0, job.elapsed / job.duration);
  out.strip = job.jobType === MAGAZINE_STRIP_ACTION;
  const { ammoUid } = job.params;
  if (out.strip) {
    out.roundType = magazine.cartridges?.[0];
  } else {
    out.roundType = typeof ammoUid === 'number' ? inventory.itemByUid(ammoUid)?.type : undefined;
  }
  return true;
};

export interface MagazinePress {
  /** Where the fingers hold the round, in the magazine model's frame relative to its top seat. */
  readonly round: [number, number, number];
  /** How far the off hand has gone from its rest to the round, 0 to 1. */
  reach: number;
  /** Whether the round is out of the magazine: in the fingers, not yet seated or already stripped. */
  visible: boolean;
}

export const createMagazinePress = (): MagazinePress => ({ round: [0, 0, 0], reach: 0, visible: false });

const smooth = (value: number): number => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

const lerpInto = (out: [number, number, number], from: Vec3, to: Vec3, amount: number): void => {
  const t = smooth(amount);
  out[0] = from[0] + (to[0] - from[0]) * t;
  out[1] = from[1] + (to[1] - from[1]) * t;
  out[2] = from[2] + (to[2] - from[2]) * t;
};

const SEAT: Vec3 = [0, 0, 0];

/** One round's press from its job's progress, into `out`; a strip is the same press played backwards. */
export const magazinePress = (frame: Readonly<MagazineLoadFrame>, out: MagazinePress): void => {
  const pose = MAGAZINE_LOAD_POSE;
  const progress = frame.strip ? 1 - frame.progress : frame.progress;
  if (progress < pose.reachEnd) {
    lerpInto(out.round, pose.above, pose.above, 0);
    out.reach = smooth(progress / pose.reachEnd);
  } else if (progress < pose.pressEnd) {
    lerpInto(out.round, pose.above, pose.pressed, (progress - pose.reachEnd) / (pose.pressEnd - pose.reachEnd));
    out.reach = 1;
  } else if (progress < pose.seatEnd) {
    lerpInto(out.round, pose.pressed, SEAT, (progress - pose.pressEnd) / (pose.seatEnd - pose.pressEnd));
    out.reach = 1;
  } else {
    lerpInto(out.round, SEAT, SEAT, 0);
    out.reach = 1 - smooth((progress - pose.seatEnd) / (1 - pose.seatEnd));
  }
  out.visible = progress < pose.seatEnd;
};

export interface MagazineRaise {
  /** The hand holding the raised magazine, kept while it lowers. */
  side: HandSide | undefined;
  uid: number | undefined;
  /** 0 held as usual to 1 raised. */
  weight: number;
  /** Real seconds left before an idle magazine starts to lower. */
  hold: number;
}

export const createMagazineRaise = (): MagazineRaise => ({ side: undefined, uid: undefined, weight: 0, hold: 0 });

/**
 * Raises the magazine while its round's job runs and lowers it after, over real time. Each round is its own job,
 * so the queue is empty for a frame between rounds; the hold keeps the magazine up across that gap.
 */
export const stepMagazineRaise = (
  raise: MagazineRaise,
  running: Readonly<MagazineLoadFrame> | undefined,
  dt: number,
): void => {
  if (running && (raise.uid !== running.uid || raise.side !== running.holdingSide)) {
    raise.weight = 0;
  }
  if (running) {
    raise.side = running.holdingSide;
    raise.uid = running.uid;
    raise.hold = MAGAZINE_LOAD_POSE.holdRealSeconds;
  } else {
    raise.hold = Math.max(0, raise.hold - dt);
  }
  const step = dt / MAGAZINE_LOAD_POSE.raiseRealSeconds;
  raise.weight = running || raise.hold > 0 ? Math.min(1, raise.weight + step) : Math.max(0, raise.weight - step);
  if (raise.weight === 0 && !running) {
    raise.side = undefined;
    raise.uid = undefined;
  }
};
