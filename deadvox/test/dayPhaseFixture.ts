import { SECONDS_PER_DAY } from '../src/core/clock.ts';
import { type DayCycle, type DayPhase, DEFAULT_DAY_CYCLE, dayPhaseAt } from '../src/core/dayPhase.ts';

export const dayStateAtHour = (hour: number) => dayPhaseAt(DEFAULT_DAY_CYCLE, hour * 3600);

export const phaseMidpoint = (phase: DayPhase, cycle: DayCycle = DEFAULT_DAY_CYCLE): number => {
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
