// The game clock. Simulation seconds run `c`× faster during compression; calendar
// seconds run `ratio`× faster than simulation seconds (`DESIGN.md`, "Time").

export const SECONDS_PER_HOUR = 3600;
export const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;

import { type DayCycle, dayPhaseAt } from './dayPhase.ts';
import { type GameTimeOfDay, gameTimeOfDay, simTimestamp, simToGameTimestamp } from './time.ts';

/** Names a spawn window may use for a time; the day cycle content gives them their values. */
export const SPAWN_TIME_NAMES = ['midnight', 'dawn', 'noon', 'dusk'] as const;
type SpawnTimeName = (typeof SPAWN_TIME_NAMES)[number];
export type SpawnTime = GameTimeOfDay | SpawnTimeName;

/** The parts of the day cycle content that name spawn times. */
export interface SpawnTimeCycle extends DayCycle {
  readonly midnightGameTimeOfDay: number;
  readonly noonGameTimeOfDay: number;
}

export interface SpawnTimeWindow {
  fromGameTimeOfDay: SpawnTime;
  toGameTimeOfDay?: SpawnTime | undefined;
}

/** The one place a named spawn time becomes a time of day: dawn and dusk follow the cycle's sun. */
export const resolveSpawnTime = (cycle: SpawnTimeCycle, time: SpawnTime): GameTimeOfDay => {
  switch (time) {
    case 'midnight':
      return gameTimeOfDay(cycle.midnightGameTimeOfDay);
    case 'noon':
      return gameTimeOfDay(cycle.noonGameTimeOfDay);
    case 'dawn':
      return gameTimeOfDay(dayPhaseAt(cycle, 0).dawn);
    case 'dusk':
      return gameTimeOfDay(dayPhaseAt(cycle, 0).sunset);
    default:
      return time;
  }
};

export type SpawnTimeWindowField = { [Property in 'window']?: SpawnTimeWindow };

export interface ClockSettings {
  /** Calendar seconds per simulation second. */
  readonly ratio: number;
  /** Calendar seconds at simulation time 0, counted from midnight of day 1. */
  readonly start: number;
}

/** Calendar seconds at a simulation time. */
export const calendarAt = (clock: ClockSettings, simTime: number): number =>
  simToGameTimestamp(clock, simTimestamp(simTime));

/** Simulation seconds in one game hour. */
export const simSecondsPerHour = (clock: ClockSettings): number => SECONDS_PER_HOUR / clock.ratio;

/** Game hours for a span of simulation seconds. */
export const simToGameHours = (clock: ClockSettings, simSeconds: number): number =>
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

/** The simulation time the clock next shows a time of day, strictly after `simTime`. */
export const nextSimTimeAt = (clock: ClockSettings, simTime: number, timeOfDay: number): number => {
  const calendar = calendarAt(clock, simTime);
  return simTime + (nextTimeOfDay(calendar, timeOfDay) - calendar) / clock.ratio;
};

/** Day number, starting at 1. */
const dayOf = (calendar: number): number => Math.floor(calendar / SECONDS_PER_DAY) + 1;

/** "Day 1, 10:00". */
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

/** Time-of-day windows recur daily; an open-ended window stays eligible after its first start. */
export const spawnWindowOpen = (calendar: number, timeWindow: SpawnTimeWindow, cycle: SpawnTimeCycle): boolean => {
  const from = resolveSpawnTime(cycle, timeWindow.fromGameTimeOfDay);
  const to = timeWindow.toGameTimeOfDay === undefined ? undefined : resolveSpawnTime(cycle, timeWindow.toGameTimeOfDay);
  if (from === undefined || (to !== undefined && !Number.isFinite(to))) {
    return false;
  }
  if (to === undefined) {
    return calendar >= from;
  }
  const now = ((calendar % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  return from < to ? now >= from && now < to : from > to && (now >= from || now < to);
};
