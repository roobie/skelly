import coreDayCycle from '../content/base/dayCycle.json' with { type: 'json' };
import type { Vec3 } from './coords.ts';

export type DayPhase = 'night' | 'dawn' | 'day' | 'dusk';

export interface DayCycle {
  readonly latitudeDegrees: number;
  readonly date: { readonly month: number; readonly day: number };
  readonly twilight: 'nautical';
}

export interface DayPhaseState {
  readonly phase: DayPhase;
  /** 0 at full night, 1 at full day, blended by solar elevation through twilight. */
  readonly sightBlend: number;
  /** Direct sun direction in east/up/north axes. */
  readonly sunDirection: Vec3;
  /** Solar elevation angle in radians. */
  readonly sunElevation: number;
  readonly sunrise: number;
  readonly sunset: number;
  readonly dawn: number;
  readonly nightfall: number;
}

export const DEFAULT_DAY_CYCLE = coreDayCycle.dayCycle as DayCycle;

const DAY_SECONDS = 24 * 60 * 60;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const TWILIGHT_ELEVATION = { nautical: -12 } as const;
const radians = (value: number): number => (value * Math.PI) / 180;
const degrees = (angle: number): number => (angle * 180) / Math.PI;
const wrapSeconds = (seconds: number): number => ((seconds % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
const smoothstep = (from: number, to: number, value: number): number => {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

const dayOfYear = (date: DayCycle['date']): number =>
  MONTH_DAYS.slice(0, date.month - 1).reduce((sum, days) => sum + days, 0) + date.day;

const solarDeclination = (cycle: DayCycle): number =>
  radians(23.44) * Math.sin((2 * Math.PI * (284 + dayOfYear(cycle.date))) / 365);

const eventHours = (cycle: DayCycle, elevationDegrees: number): readonly [number, number] => {
  const latitude = radians(cycle.latitudeDegrees);
  const declination = solarDeclination(cycle);
  const cosineHourAngle =
    (Math.sin(radians(elevationDegrees)) - Math.sin(latitude) * Math.sin(declination)) /
    (Math.cos(latitude) * Math.cos(declination));
  const hourAngle = Math.acos(Math.max(-1, Math.min(1, cosineHourAngle)));
  const span = (degrees(hourAngle) / 15) * 3600;
  return [wrapSeconds(12 * 3600 - span), wrapSeconds(12 * 3600 + span)];
};

const inInterval = (time: number, start: number, end: number): boolean =>
  start < end ? time >= start && time < end : time >= start || time < end;

/** Compute the sun and its derived phase from the authored latitude and calendar date. */
export const dayPhaseAt = (cycle: DayCycle, timeOfDay: number): DayPhaseState => {
  const time = wrapSeconds(timeOfDay);
  const [sunrise, sunset] = eventHours(cycle, 0);
  const [dawn, nightfall] = eventHours(cycle, -12);
  const latitude = radians(cycle.latitudeDegrees);
  const declination = solarDeclination(cycle);
  const hourAngle = radians((time / 3600 - 12) * 15);
  const east = -Math.cos(declination) * Math.sin(hourAngle);
  const north =
    Math.sin(declination) * Math.cos(latitude) - Math.cos(declination) * Math.cos(hourAngle) * Math.sin(latitude);
  const up =
    Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle);
  const sunElevation = Math.asin(Math.max(-1, Math.min(1, up)));
  const length = Math.hypot(east, up, north);
  let phase: DayPhase;
  if (inInterval(time, sunrise, sunset)) {
    phase = 'day';
  } else if (inInterval(time, dawn, sunrise)) {
    phase = 'dawn';
  } else if (inInterval(time, sunset, nightfall)) {
    phase = 'dusk';
  } else {
    phase = 'night';
  }
  const twilightFloor = radians(TWILIGHT_ELEVATION[cycle.twilight]);
  let sightBlend: number;
  if (phase === 'day') {
    sightBlend = 1;
  } else if (phase === 'night') {
    sightBlend = 0;
  } else {
    sightBlend = smoothstep(twilightFloor, 0, sunElevation);
  }
  return {
    phase,
    sightBlend,
    sunDirection: [east / length, up / length, north / length],
    sunElevation,
    sunrise,
    sunset,
    dawn,
    nightfall,
  };
};

export const dayCycleFor = (cycle: DayCycle | undefined): DayCycle => cycle ?? DEFAULT_DAY_CYCLE;
