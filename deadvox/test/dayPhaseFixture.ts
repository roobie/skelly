import coreDayCycle from '../src/content/base/dayCycle.json' with { type: 'json' };
import { CLOCK_RATIO, type ClockSettings, parseTimeOfDay, SECONDS_PER_DAY } from '../src/core/clock.ts';
import { type DayCycle, type DayPhase, dayPhaseAt } from '../src/core/dayPhase.ts';

/** Base content's day cycle row, for tests that need a cycle without loading a registry. */
export const BASE_DAY_CYCLE: DayCycle = coreDayCycle.dayCycle as DayCycle;

/** The clock a session built from base content starts with. */
export const BASE_CLOCK: ClockSettings = {
  ratio: CLOCK_RATIO,
  start: parseTimeOfDay(coreDayCycle.dayCycle.defaultStartGameTimeOfDay)!,
};

export const dayStateAtHour = (hour: number) => dayPhaseAt(BASE_DAY_CYCLE, hour * 3600);

export const phaseMidpoint = (phase: DayPhase, cycle: DayCycle = BASE_DAY_CYCLE): number => {
  const state = dayPhaseAt(cycle, 0);
  let start: number;
  let end: number;
  if (phase === 'night') {
    start = state.nightfall;
    end = state.dawn + SECONDS_PER_DAY;
  } else if (phase === 'dawn') {
    start = state.dawn;
    end = state.sunrise;
  } else if (phase === 'day') {
    start = state.sunrise;
    end = state.sunset;
  } else {
    start = state.sunset;
    end = state.nightfall;
  }
  return ((start + end) / 2) % SECONDS_PER_DAY;
};
