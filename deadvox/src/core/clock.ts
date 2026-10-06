// The game clock. Simulation seconds run `c`× faster during compression; calendar
// seconds run `ratio`× faster than simulation seconds (DESIGN.md, "Time").

export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

/** Authored calendar-time boundaries for time-windowed spawn markers. */
export const SPAWN_TIMES = {
  midnight: 0,
  dawn: 6 * SECONDS_PER_HOUR,
  noon: 12 * SECONDS_PER_HOUR,
  dusk: 18 * SECONDS_PER_HOUR,
} as const;

import { type GameTimeOfDay, simTimestamp, simToGameTimestamp } from './time.ts';

export interface SpawnTimeWindow {
  fromGameTimeOfDay: GameTimeOfDay;
  toGameTimeOfDay?: GameTimeOfDay | undefined;
}

export type SpawnTimeWindowField = { [Property in 'window']?: SpawnTimeWindow };

/** Calendar seconds per simulation second. 1:8 makes a game day 3 real hours. */
export const CLOCK_RATIO = 8;

export const SPAWN_TIME = 19.5 * SECONDS_PER_HOUR;

export interface ClockSettings {
  /** Calendar seconds per simulation second. */
  readonly ratio: number;
  /** Calendar seconds at simulation time 0, counted from midnight of day 1. */
  readonly start: number;
}

export const defaultClock: ClockSettings = { ratio: CLOCK_RATIO, start: SPAWN_TIME };

/** Calendar seconds at a simulation time. */
export const calendarAt = (clock: ClockSettings, simTime: number): number =>
  simToGameTimestamp(clock, simTimestamp(simTime));

/** Simulation seconds in one game hour. */
export const simSecondsPerHour = (clock: ClockSettings): number => SECONDS_PER_HOUR / clock.ratio;

/** Game hours for a span of simulation seconds. */
export const gameHours = (clock: ClockSettings, simSeconds: number): number =>
  (simSeconds * clock.ratio) / SECONDS_PER_HOUR;

/** The simulation time `hours` game hours after `from` (a debug time skip's end). */
export const skipTarget = (clock: ClockSettings, from: number, hours: number): number =>
  from + hours * simSecondsPerHour(clock);

/** Hour of the day in [0, 24). */
export const hourOfDay = (calendar: number): number =>
  (((calendar % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY) / SECONDS_PER_HOUR;

/** The next calendar occurrence of a time of day, strictly after `calendar`. */
export const nextTimeOfDay = (calendar: number, timeOfDay: number): number => {
  const today = Math.floor(calendar / SECONDS_PER_DAY) * SECONDS_PER_DAY + timeOfDay;
  return today > calendar ? today : today + SECONDS_PER_DAY;
};

/** Day number, starting at 1. */
const dayOf = (calendar: number): number => Math.floor(calendar / SECONDS_PER_DAY) + 1;

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

/** Named or numeric game-clock time used by authored spawn windows. */
export const parseSpawnTime = (text: string): number | undefined =>
  Object.hasOwn(SPAWN_TIMES, text) ? SPAWN_TIMES[text as keyof typeof SPAWN_TIMES] : parseTimeOfDay(text);

/** Time-of-day windows recur daily; an open-ended window stays eligible after its first start. */
export const spawnWindowOpen = (calendar: number, timeWindow: SpawnTimeWindow): boolean => {
  const from = timeWindow.fromGameTimeOfDay;
  const to = timeWindow.toGameTimeOfDay;
  if (from === undefined || (to !== undefined && !Number.isFinite(to))) {
    return false;
  }
  if (to === undefined) {
    return calendar >= from;
  }
  const now = ((calendar % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  return from < to ? now >= from && now < to : from > to && (now >= from || now < to);
};
