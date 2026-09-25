// The game clock. Simulation seconds run `c`× faster during compression; calendar
// seconds run `ratio`× faster than simulation seconds (DESIGN.md, "Time").

export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

/** Calendar seconds per simulation second. 1:8 makes a game day 3 real hours. */
export const CLOCK_RATIO = 8;

/** Slice 1 starts at dusk on day 1 (SLICE-1.md, "Tunables"). */
export const SPAWN_TIME = 19.5 * SECONDS_PER_HOUR;

export interface ClockSettings {
  /** Calendar seconds per simulation second. */
  readonly ratio: number;
  /** Calendar seconds at simulation time 0, counted from midnight of day 1. */
  readonly start: number;
}

export const defaultClock: ClockSettings = { ratio: CLOCK_RATIO, start: SPAWN_TIME };

/** Calendar seconds at a simulation time. */
export const calendarAt = (clock: ClockSettings, simSeconds: number): number => clock.start + simSeconds * clock.ratio;

/** Simulation seconds in one game hour. */
export const simSecondsPerHour = (clock: ClockSettings): number => SECONDS_PER_HOUR / clock.ratio;

/** Game hours for a span of simulation seconds. */
export const gameHours = (clock: ClockSettings, simSeconds: number): number =>
  (simSeconds * clock.ratio) / SECONDS_PER_HOUR;

/** Hour of the day in [0, 24). */
export const hourOfDay = (calendar: number): number =>
  (((calendar % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY) / SECONDS_PER_HOUR;

/** Day number, starting at 1. */
export const dayOf = (calendar: number): number => Math.floor(calendar / SECONDS_PER_DAY) + 1;

/** "Day 1, 19:30". */
export const formatClock = (calendar: number): string => {
  // A millisecond of slack, so float drift in summed steps doesn't show 20:29 for 20:30.
  const t = calendar + 1e-3;
  const minutes = Math.floor(hourOfDay(t) * 60);
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `Day ${dayOf(t)}, ${hh}:${mm}`;
};

const TIME_OF_DAY = /^(\d{1,2}):(\d{2})$/;

/** Parses "HH:MM" into calendar seconds on day 1, or undefined. */
export const parseTimeOfDay = (text: string): number | undefined => {
  const match = TIME_OF_DAY.exec(text);
  if (!match) {
    return undefined;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * SECONDS_PER_HOUR + minutes * 60 : undefined;
};
