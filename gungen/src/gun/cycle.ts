import type { PartMotion, Resolved } from '@skelly/engine/assembly/schema.ts';
import { compose, length, scale, sub, translation, type Vec3 } from '@skelly/engine/foundation/math.ts';
import {
  boundsOfPoints,
  lowerBoundDistanceWorld,
  obbPolyhedron,
  penetrationWorld,
  type WorldSolid,
  worldSolid,
} from '@skelly/engine/shapes/geometry.ts';
import type { Solid } from '@skelly/engine/shapes/solid.ts';
import { AR_CYCLIC_RPM, SMALL_AR_FRAME } from './arFrames.ts';

export type GunAction = 'ak' | 'ar' | 'smg';
export type CycleMode = 'fire' | 'hand';

export interface ActionCycleProfile {
  readonly rpm: number;
  readonly holdOpenOnEmpty: boolean;
  readonly ejectAt: number;
  /** Unit vector in the model frame; +Z is right, +X is muzzleward. */
  readonly ejectDirection: Vec3;
  readonly rearwardSpeedMetresPerSecond: number;
  readonly dwellSeconds: number;
}

const unit = (v: Vec3): Vec3 => scale(v, 1 / length(v));

/**
 * All cycle values are visual estimates. AK cyclic rate: about 600 rpm (Soviet/Russian AKM technical data).
 * SMG cyclic rate: about 800 rpm (HK MP5 specification); its bolt does not hold open on an empty magazine.
 */
export const ACTION_CYCLE_PROFILES: Readonly<Record<GunAction, ActionCycleProfile>> = {
  ak: {
    rpm: 600,
    holdOpenOnEmpty: false,
    ejectAt: 0.72,
    ejectDirection: unit([0.34, 0.2, 0.92]),
    rearwardSpeedMetresPerSecond: 3.75,
    dwellSeconds: 0.006,
  },
  ar: {
    // A frame passes its own rate to `cycleMotion`; this default is the small frame's.
    rpm: AR_CYCLIC_RPM[SMALL_AR_FRAME.id]!,
    holdOpenOnEmpty: true,
    ejectAt: 0.76,
    ejectDirection: unit([-0.16, 0.16, 0.97]),
    rearwardSpeedMetresPerSecond: 3.75,
    dwellSeconds: 0.006,
  },
  smg: {
    rpm: 800,
    holdOpenOnEmpty: false,
    ejectAt: 0.7,
    ejectDirection: unit([0.2, 0.2, 0.96]),
    rearwardSpeedMetresPerSecond: 3.75,
    dwellSeconds: 0.006,
  },
};

/** Estimated spring return shared by the hand and firing timelines. */
const CARRIER_MASS_KG = 0.52;
const NET_FORCE_AT_BATTERY_N = 20;
const NET_FORCE_AT_REAR_N = 40;

interface SpringReturn {
  readonly durationSeconds: number;
  /** Remaining stroke fraction (1 at the rear, 0 at battery) after `seconds`. */
  readonly remaining: (seconds: number) => number;
  readonly arrivalSpeedMetresPerSecond: number;
}

/** Closed-form return for a linear spring/drag estimate; every force and mass here is a tuning estimate. */
const springReturn = (strokeMetres: number): SpringReturn => {
  if (!(Number.isFinite(strokeMetres) && strokeMetres > 0)) {
    throw new RangeError('strokeMetres must be a finite positive number');
  }
  const forceSlope = (NET_FORCE_AT_REAR_N - NET_FORCE_AT_BATTERY_N) / strokeMetres;
  const omega = Math.sqrt(forceSlope / CARRIER_MASS_KG);
  const offset = NET_FORCE_AT_BATTERY_N / forceSlope;
  const amplitude = strokeMetres + offset;
  const durationSeconds = Math.acos(offset / amplitude) / omega;
  return {
    durationSeconds,
    remaining: (seconds) =>
      Math.max(
        0,
        (amplitude * Math.cos(omega * Math.min(Math.max(seconds, 0), durationSeconds)) - offset) / strokeMetres,
      ),
    arrivalSpeedMetresPerSecond: amplitude * omega * Math.sin(omega * durationSeconds),
  };
};

/** Minimum-jerk hand reach with zero velocity at both ends. */
const minimumJerk = (fraction: number): number => {
  const x = Math.min(1, Math.max(0, fraction));
  return x ** 3 * (10 - 15 * x + 6 * x * x);
};

export interface CycleTimeline {
  readonly mode: CycleMode;
  readonly durationSeconds: number;
  readonly rearwardSeconds: number;
  readonly dwellSeconds: number;
  readonly forwardSeconds: number;
  readonly unlockSeconds?: number;
  readonly lockSeconds?: number;
  readonly turnAt?: (seconds: number) => number;
  /** A held hand stops here, rear and turned into the notch, until released; see `advanceCycleClock`. */
  readonly holdSeconds?: number;
  readonly ejectAt: number;
  readonly ejectDirection: Vec3;
  readonly holdOpenOnEmpty: boolean;
  /** Carrier travel fraction: 0 at battery, 1 at the rear. Fire cycles repeat unless an AR is empty. */
  readonly at: (seconds: number, empty?: boolean) => number;
}

interface CyclePhase {
  readonly time: number;
  readonly rearwardSeconds: number;
  readonly dwellSeconds: number;
  readonly mechanicalSeconds: number;
  readonly spring: SpringReturn;
}

const firePosition = ({
  time,
  rearwardSeconds,
  dwellSeconds,
  mechanicalSeconds,
  spring,
  empty,
  profile,
}: CyclePhase & {
  readonly empty: boolean;
  readonly profile: ActionCycleProfile;
}): number => {
  if (time < rearwardSeconds) {
    return Math.min(1, time / rearwardSeconds);
  }
  if (empty && profile.holdOpenOnEmpty) {
    return 1;
  }
  if (time < rearwardSeconds + dwellSeconds) {
    return 1;
  }
  if (time < mechanicalSeconds) {
    return spring.remaining(time - rearwardSeconds - dwellSeconds);
  }
  return 0;
};

const handPosition = ({ time, rearwardSeconds, dwellSeconds, mechanicalSeconds, spring }: CyclePhase): number => {
  if (time < rearwardSeconds) {
    return minimumJerk(time / rearwardSeconds);
  }
  if (time < rearwardSeconds + dwellSeconds) {
    return 1;
  }
  if (time < mechanicalSeconds) {
    return spring.remaining(time - rearwardSeconds - dwellSeconds);
  }
  return 0;
};

/** Visual estimate for turning a hand-only handle into or out of its notch. */
const NOTCH_TURN_SECONDS = 0.1;

/**
 * The hand turns the handle into the notch and back out inside the rear dwell, so the carrier
 * stays at the rear throughout and the phases Deadvox reads keep their meaning.
 */
const notchTurn = (rearwardSeconds: number, dwellSeconds: number) => {
  if (!(2 * NOTCH_TURN_SECONDS < dwellSeconds)) {
    throw new RangeError('notch turn must fit inside the hand dwell');
  }
  const outStart = rearwardSeconds + dwellSeconds - NOTCH_TURN_SECONDS;
  return {
    holdSeconds: rearwardSeconds + NOTCH_TURN_SECONDS,
    turnAt: (time: number) => {
      if (time < rearwardSeconds) {
        return 0;
      }
      if (time < outStart) {
        return minimumJerk((time - rearwardSeconds) / NOTCH_TURN_SECONDS);
      }
      return 1 - minimumJerk((time - outStart) / NOTCH_TURN_SECONDS);
    },
  };
};

const buildCycleTimeline = (
  action: GunAction,
  profile: ActionCycleProfile,
  mode: CycleMode,
  { strokeMetres, handNotch }: { readonly strokeMetres: number; readonly handNotch: boolean },
): CycleTimeline => {
  const spring = springReturn(strokeMetres);
  const rearwardSeconds = mode === 'fire' ? strokeMetres / profile.rearwardSpeedMetresPerSecond : 0.65;
  const dwellSeconds = mode === 'fire' ? profile.dwellSeconds : 0.3;
  const forwardSeconds = spring.durationSeconds;
  const mechanicalSeconds = rearwardSeconds + dwellSeconds + forwardSeconds;
  const durationSeconds = mode === 'fire' ? 60 / profile.rpm : mechanicalSeconds + 0.7;
  if (mechanicalSeconds > durationSeconds + 1e-9) {
    throw new RangeError(`${action} ${mode} cycle exceeds its declared duration`);
  }
  const wrap = (seconds: number) => ((seconds % durationSeconds) + durationSeconds) % durationSeconds;
  const notch = mode === 'hand' && handNotch ? notchTurn(rearwardSeconds, dwellSeconds) : undefined;
  return {
    ...(notch ? { holdSeconds: notch.holdSeconds, turnAt: (seconds: number) => notch.turnAt(wrap(seconds)) } : {}),
    mode,
    durationSeconds,
    rearwardSeconds,
    dwellSeconds,
    forwardSeconds,
    ejectAt: profile.ejectAt,
    ejectDirection: profile.ejectDirection,
    holdOpenOnEmpty: profile.holdOpenOnEmpty,
    at: (seconds, empty = false) => {
      const time =
        mode === 'hand' || !(empty && profile.holdOpenOnEmpty)
          ? wrap(seconds)
          : Math.max(0, Math.min(seconds, durationSeconds));
      const phase = { time, rearwardSeconds, dwellSeconds, mechanicalSeconds, spring };
      return mode === 'fire' ? firePosition({ ...phase, empty, profile }) : handPosition(phase);
    },
  };
};

/**
 * Advances a cycle clock. While held, the clock stops at the next hold point and stays there;
 * releasing lets it run on, so the handle turns out of the notch before it goes forward.
 */
export const advanceCycleClock = (
  timeline: CycleTimeline,
  seconds: number,
  deltaSeconds: number,
  held: boolean,
): number => {
  const next = seconds + deltaSeconds;
  if (!(held && timeline.holdSeconds !== undefined && deltaSeconds > 0)) {
    return next;
  }
  const { durationSeconds, holdSeconds } = timeline;
  const cycles = (seconds - holdSeconds) / durationSeconds;
  if (Math.abs(cycles - Math.round(cycles)) * durationSeconds < 1e-9) {
    return seconds;
  }
  return Math.min(next, holdSeconds + (Math.floor(cycles) + 1) * durationSeconds);
};

export interface CycleMotion {
  readonly strokeUnits: number;
  readonly strokeMetres: number;
  readonly fire?: CycleTimeline;
  readonly hand: CycleTimeline;
  readonly ejectAt: number;
  readonly ejectDirection: Vec3;
  readonly holdOpenOnEmpty: boolean;
  readonly rpm?: number;
}

export interface AutomaticCycleMotion extends CycleMotion {
  readonly fire: CycleTimeline;
  readonly rpm: number;
}

/** Manual pump tuning estimates: both legs are hand-driven, not a gas stroke or spring return. */
const PUMP_HAND_TIMING = { rearwardSeconds: 0.5, dwellSeconds: 0.15, forwardSeconds: 0.5, restSeconds: 0.35 };

/** Visual hand timing estimates, including lifting and closing the turn bolt. */
const BOLT_HAND_TIMING = {
  unlockSeconds: 0.25,
  rearwardSeconds: 0.45,
  dwellSeconds: 0.15,
  forwardSeconds: 0.45,
  lockSeconds: 0.25,
  restSeconds: 0.35,
};

export const boltCycleMotion = (motion: PartMotion, metresPerUnit: number, ejectAt: number): CycleMotion => {
  const { unlockSeconds, rearwardSeconds, dwellSeconds, forwardSeconds, lockSeconds, restSeconds } = BOLT_HAND_TIMING;
  const strokeUnits = length(sub(motion.end, motion.start));
  if (!(strokeUnits > 0 && metresPerUnit > 0 && ejectAt > 0 && ejectAt < 1)) {
    throw new Error('Bolt stroke must clear the ejection port');
  }
  const drawEnd = unlockSeconds + rearwardSeconds;
  const pushStart = drawEnd + dwellSeconds;
  const pushEnd = pushStart + forwardSeconds;
  const durationSeconds = pushEnd + lockSeconds + restSeconds;
  const ejectDirection = unit([0.12, 0.24, 0.96]);
  const timeAt = (seconds: number) => ((seconds % durationSeconds) + durationSeconds) % durationSeconds;
  return {
    strokeUnits,
    strokeMetres: strokeUnits * metresPerUnit,
    ejectAt,
    ejectDirection,
    holdOpenOnEmpty: false,
    hand: {
      mode: 'hand',
      durationSeconds,
      unlockSeconds,
      rearwardSeconds,
      dwellSeconds,
      forwardSeconds,
      lockSeconds,
      ejectAt,
      ejectDirection,
      holdOpenOnEmpty: false,
      at: (seconds) => {
        const time = timeAt(seconds);
        if (time < unlockSeconds) {
          return 0;
        }
        if (time < drawEnd) {
          return minimumJerk((time - unlockSeconds) / rearwardSeconds);
        }
        if (time < pushStart) {
          return 1;
        }
        return 1 - minimumJerk((time - pushStart) / forwardSeconds);
      },
      turnAt: (seconds) => {
        const time = timeAt(seconds);
        return time < unlockSeconds
          ? minimumJerk(time / unlockSeconds)
          : 1 - minimumJerk((time - pushEnd) / lockSeconds);
      },
    },
  };
};

export const pumpCycleMotion = (motion: PartMotion, metresPerUnit: number): CycleMotion => {
  const strokeUnits = length(sub(motion.end, motion.start));
  if (!(Number.isFinite(metresPerUnit) && metresPerUnit > 0 && strokeUnits > 0)) {
    throw new RangeError('motion stroke and metresPerUnit must be finite and positive');
  }
  const { rearwardSeconds, dwellSeconds, forwardSeconds, restSeconds } = PUMP_HAND_TIMING;
  const durationSeconds = rearwardSeconds + dwellSeconds + forwardSeconds + restSeconds;
  const ejectAt = 0.76;
  const ejectDirection = unit([0.12, 0.24, 0.96]);
  return {
    strokeUnits,
    strokeMetres: strokeUnits * metresPerUnit,
    ejectAt,
    ejectDirection,
    holdOpenOnEmpty: false,
    hand: {
      mode: 'hand',
      durationSeconds,
      rearwardSeconds,
      dwellSeconds,
      forwardSeconds,
      ejectAt,
      ejectDirection,
      holdOpenOnEmpty: false,
      at: (seconds) => {
        const time = ((seconds % durationSeconds) + durationSeconds) % durationSeconds;
        if (time < rearwardSeconds) {
          return minimumJerk(time / rearwardSeconds);
        }
        if (time < rearwardSeconds + dwellSeconds) {
          return 1;
        }
        return Math.max(0, 1 - minimumJerk((time - rearwardSeconds - dwellSeconds) / forwardSeconds));
      },
    },
  };
};

export const cycleMotion = (
  action: GunAction,
  motion: PartMotion,
  metresPerUnit: number,
  {
    rpm = ACTION_CYCLE_PROFILES[action].rpm,
    handNotch = false,
  }: { readonly rpm?: number | undefined; readonly handNotch?: boolean } = {},
): AutomaticCycleMotion => {
  const strokeUnits = length(sub(motion.end, motion.start));
  if (!(Number.isFinite(metresPerUnit) && metresPerUnit > 0 && strokeUnits > 0)) {
    throw new RangeError('motion stroke and metresPerUnit must be finite and positive');
  }
  const strokeMetres = strokeUnits * metresPerUnit;
  const profile = { ...ACTION_CYCLE_PROFILES[action], rpm };
  return {
    strokeUnits,
    strokeMetres,
    fire: buildCycleTimeline(action, profile, 'fire', { strokeMetres, handNotch: false }),
    hand: buildCycleTimeline(action, profile, 'hand', { strokeMetres, handNotch }),
    ejectAt: profile.ejectAt,
    ejectDirection: profile.ejectDirection,
    holdOpenOnEmpty: profile.holdOpenOnEmpty,
    rpm: profile.rpm,
  };
};

export interface SweepResult {
  readonly declared: number;
  readonly clear: number;
  readonly clashes: readonly { readonly pair: string; readonly at: number }[];
}

type Bounds = ReturnType<typeof boundsOfPoints>;

const pointsOfWorldSolid = (solid: WorldSolid) =>
  'vertices' in solid ? solid.vertices : obbPolyhedron(solid).vertices;

const boundsOfWorldSolid = (solid: WorldSolid): Bounds => boundsOfPoints(pointsOfWorldSolid(solid));

const boundsDistance = (a: Bounds, b: Bounds): number =>
  Math.hypot(...([0, 1, 2] as const).map((axis) => Math.max(0, a[0][axis] - b[1][axis], b[0][axis] - a[1][axis])));

const sweptBounds = (
  solids: readonly Solid[],
  start: ReturnType<typeof translation>,
  end: ReturnType<typeof translation>,
): Bounds =>
  boundsOfPoints(
    solids.flatMap((solid) => [
      ...pointsOfWorldSolid(worldSolid(start, solid)),
      ...pointsOfWorldSolid(worldSolid(end, solid)),
    ]),
  );

const obstaclesFor = (resolved: Resolved, partId: string, swept: Bounds) =>
  [...resolved.defs]
    .filter(([id]) => id !== partId && resolved.placed.has(id))
    .flatMap(([id, other]) =>
      other.solids.flatMap((solid) => {
        const world = worldSolid(resolved.placed.get(id)!, solid);
        return boundsDistance(swept, boundsOfWorldSolid(world)) > 0 ? [] : [{ label: `${id}.${solid.id}`, world }];
      }),
    );

const overlapsAt = (
  solids: readonly Solid[],
  transform: ReturnType<typeof translation>,
  obstacles: readonly { readonly label: string; readonly world: WorldSolid }[],
): string[] =>
  solids.flatMap((solid) => {
    const ownWorld = worldSolid(transform, solid);
    return obstacles
      .filter(({ world }) => lowerBoundDistanceWorld(ownWorld, world) === 0 && penetrationWorld(ownWorld, world) > 1e-6)
      .map(({ label }) => `${solid.id} x ${label}`);
  });

/** Sample actual placed solids along the declared motion; no keep-out proxy is used as the obstacle. */
export const sweepMovingPart = (resolved: Resolved, partId: string, limit: number, step = 0.125): SweepResult => {
  const def = resolved.defs.get(partId);
  const placed = resolved.placed.get(partId);
  const motion = def?.motion;
  if (!(def && placed && motion)) {
    return { declared: 0, clear: 0, clashes: [] };
  }
  const delta = sub(motion.end, motion.start);
  const declared = length(delta);
  const end = compose(placed, translation(scale(delta, limit / (declared || 1))));
  const obstacles = obstaclesFor(resolved, partId, sweptBounds(def.solids, placed, end));
  const first = new Map<string, number>();
  let clear = limit;
  for (let distance = 0; distance <= limit + 1e-9; distance += step) {
    const displacement = scale(delta, declared === 0 ? 0 : distance / declared);
    const moved = compose(placed, translation(displacement));
    const hits = overlapsAt(def.solids, moved, obstacles);
    for (const pair of hits) {
      first.set(pair, first.get(pair) ?? distance);
    }
    if (hits.length > 0 && clear === limit) {
      clear = Math.max(0, distance - step);
    }
  }
  return {
    declared,
    clear,
    clashes: [...first].map(([pair, at]) => ({ pair, at })),
  };
};

/** The profile direction is already expressed in the model frame required by the export contract. */
export const ejectionDirection = (action: GunAction): Vec3 => unit(ACTION_CYCLE_PROFILES[action].ejectDirection);
