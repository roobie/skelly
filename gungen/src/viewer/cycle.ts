// SPIKE: timeline and stroke check for animating a part along its `PartDef.motion` (the AK bolt carrier
// group being cocked by hand). Pure: no three.js, so the timing is testable and the sweep reusable.
//
// One loop: hand pull (rearward), hold at the rear, spring return (forward, hard stop), rest at battery.
// Every constant below marked ESTIMATE is a guess, not a sourced figure; see the spike report.

import { penetrationWorld, type WorldSolid, worldSolid } from '../core/geometry.ts';
import { compose, type Transform, translation } from '../core/math.ts';
import type { Resolved } from '../core/resolve.ts';
import type { Solid } from '../core/schema.ts';

/** ESTIMATE: a deliberate pull on an AK's charging handle, from rest to the rear stop. */
export const PULL_SECONDS = 0.65;
/** ESTIMATE: the hand holds at the rear before letting go. */
export const HOLD_SECONDS = 0.3;
/** Pause at battery before the loop restarts, so the viewer can read the rest pose. */
export const REST_SECONDS = 0.7;

/** Moving-parts mass of an AK in kg (ru.wikipedia "Автомат Калашникова": about 520 g). */
const CARRIER_MASS_KG = 0.52;
/**
 * ESTIMATE: net force driving the carrier forward (recoil spring minus friction and feeding drag), linear in
 * position. Chosen so the carrier arrives at battery at about 3 m/s, a little under the 3.5-4 m/s that
 * ru.wikipedia gives for the gas-driven arrival at the rear.
 */
const NET_FORCE_AT_BATTERY_N = 20;
const NET_FORCE_AT_REAR_N = 40;

export interface SpringReturn {
  readonly duration: number;
  /** Fraction of the stroke still to travel (1 at the rear, 0 at battery) after `t` seconds. */
  readonly remaining: (t: number) => number;
  /** Speed on arrival at battery, in m/s. */
  readonly arrivalSpeed: number;
}

/**
 * Carrier released at the rear, driven by a force that falls linearly from `NET_FORCE_AT_REAR_N` to
 * `NET_FORCE_AT_BATTERY_N`. m x'' = -(a + b x) has the closed form x(t) = (S + k) cos(wt) - k.
 */
export const springReturn = (strokeMetres: number): SpringReturn => {
  const a = NET_FORCE_AT_BATTERY_N;
  const b = (NET_FORCE_AT_REAR_N - NET_FORCE_AT_BATTERY_N) / strokeMetres;
  const omega = Math.sqrt(b / CARRIER_MASS_KG);
  const k = a / b;
  const amplitude = strokeMetres + k;
  const duration = Math.acos(k / amplitude) / omega;
  return {
    duration,
    remaining: (t) => Math.max(0, (amplitude * Math.cos(omega * Math.min(t, duration)) - k) / strokeMetres),
    arrivalSpeed: amplitude * omega * Math.sin(omega * duration),
  };
};

/** Minimum-jerk reach, the usual model of a hand moving between two rests: zero speed at both ends. */
const minimumJerk = (tau: number): number => {
  const x = Math.min(1, Math.max(0, tau));
  return x ** 3 * (10 - 15 * x + 6 * x * x);
};

export interface Timeline {
  readonly pull: number;
  readonly hold: number;
  readonly spring: SpringReturn;
  readonly total: number;
  /** Position along the stroke at cycle time `t`: 0 at battery, 1 at the rear. Periodic in `total`. */
  readonly at: (t: number) => number;
}

export const buildTimeline = (strokeMetres: number): Timeline => {
  const spring = springReturn(strokeMetres);
  const returnEnd = PULL_SECONDS + HOLD_SECONDS + spring.duration;
  const total = returnEnd + REST_SECONDS;
  return {
    pull: PULL_SECONDS,
    hold: HOLD_SECONDS,
    spring,
    total,
    at: (time) => {
      const t = ((time % total) + total) % total;
      if (t < PULL_SECONDS) {
        return minimumJerk(t / PULL_SECONDS);
      }
      if (t < PULL_SECONDS + HOLD_SECONDS) {
        return 1;
      }
      if (t < returnEnd) {
        return spring.remaining(t - PULL_SECONDS - HOLD_SECONDS);
      }
      return 0;
    },
  };
};

export interface SweepResult {
  /** The part's declared stroke, in model units. */
  readonly declared: number;
  /** Largest swept distance (at `step` resolution) before the part overlaps anything else, capped at `limit`. */
  readonly clear: number;
  /** First overlap per pair, as `"<own solid> x <part>.<solid>"` at distance `s`. */
  readonly clashes: readonly { readonly pair: string; readonly s: number }[];
}

/** Every placed solid of every other part, in world space. */
const obstaclesFor = (resolved: Resolved, partId: string) =>
  [...resolved.defs]
    .filter(([id]) => id !== partId && resolved.placed.has(id))
    .flatMap(([id, other]) =>
      other.solids.map((solid) => ({
        label: `${id}.${solid.id}`,
        world: worldSolid(resolved.placed.get(id)!, solid),
      })),
    );

/** `"<own solid> x <part>.<solid>"` for every pair of the moving part's solids and an obstacle that overlap. */
const overlapsAt = (
  solids: readonly Solid[],
  transform: Transform,
  obstacles: readonly { readonly label: string; readonly world: WorldSolid }[],
): string[] =>
  solids.flatMap((own) => {
    const ownWorld = worldSolid(transform, own);
    return obstacles
      .filter((obstacle) => penetrationWorld(ownWorld, obstacle.world) > 1e-6)
      .map((obstacle) => `${own.id} x ${obstacle.label}`);
  });

/**
 * Slides a moving part along its own motion axis and reports where its solids first overlap any other part's
 * solids. `limit` is how far to look (the declared stroke plus whatever margin the caller wants to learn).
 */
export const sweepMovingPart = (resolved: Resolved, partId: string, limit: number, step = 0.125): SweepResult => {
  const def = resolved.defs.get(partId);
  const placed = resolved.placed.get(partId);
  const motion = def?.motion;
  if (!(def && placed && motion)) {
    return { declared: 0, clear: 0, clashes: [] };
  }
  const obstacles = obstaclesFor(resolved, partId);
  const first = new Map<string, number>();
  let clear = limit;
  for (let s = 0; s <= limit + 1e-9; s += step) {
    const moved = compose(placed, translation([motion.axis[0] * s, motion.axis[1] * s, motion.axis[2] * s]));
    const hits = overlapsAt(def.solids, moved, obstacles);
    for (const pair of hits) {
      first.set(pair, first.get(pair) ?? s);
    }
    if (hits.length > 0 && clear === limit) {
      clear = Math.max(0, s - step);
    }
  }
  return {
    declared: Math.hypot(...motion.rearmost),
    clear,
    clashes: [...first].map(([pair, s]) => ({ pair, s })),
  };
};
