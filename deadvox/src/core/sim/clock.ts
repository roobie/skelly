// Game time. The simulation advances in simulation seconds; the calendar runs
// CLOCK_RATIO times faster (DESIGN.md, "Time"). Rates in content are per game hour,
// so tuning the ratio doesn't touch content.

/** Calendar seconds per simulation second: a game day lasts 3 real hours. */
export const CLOCK_RATIO = 8;

export const MINUTE = 60;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Where a new world's calendar starts: day 1 at 08:00. (1.6 moves spawn to dusk.) */
export const START_TIME = 8 * HOUR;

export class Clock {
  /** Simulation seconds since the world started. */
  sim = 0;
  /** Calendar seconds since day 1 00:00. */
  calendar: number;

  constructor(calendar = START_TIME) {
    this.calendar = calendar;
  }

  /** Advances by simulation seconds; returns the calendar seconds that passed. */
  advance(simSeconds: number): number {
    const elapsed = simSeconds * CLOCK_RATIO;
    this.sim += simSeconds;
    this.calendar += elapsed;
    return elapsed;
  }
}

/** Day number, starting at 1. */
export const dayOf = (calendar: number): number => Math.floor(calendar / DAY) + 1;

/** Hours since midnight, 0 ≤ h < 24. */
export const hourOf = (calendar: number): number => (((calendar % DAY) + DAY) % DAY) / HOUR;

/** "Day 2, 07:05" */
export const formatClock = (calendar: number): string => {
  const minutes = Math.floor((((calendar % DAY) + DAY) % DAY) / MINUTE);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `Day ${dayOf(calendar)}, ${hh}:${mm}`;
};
