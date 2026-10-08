import { SECONDS_PER_DAY } from '../src/core/clock.ts';
import { DEFAULT_DAY_CYCLE, dayPhaseAt, type DayCycle, type DayPhase } from '../src/core/dayPhase.ts';

export const dayStateAtHour = (hour: number) => dayPhaseAt(DEFAULT_DAY_CYCLE, hour * 3600);

export const phaseMidpoint = (phase: DayPhase, cycle: DayCycle = DEFAULT_DAY_CYCLE): number => {
  const state = dayPhaseAt(cycle, 0);
  const [start, end] =
    phase === 'night'
      ? [state.nightfall, state.dawn + SECONDS_PER_DAY]
      : phase === 'dawn'
        ? [state.dawn, state.sunrise]
        : phase === 'day'
          ? [state.sunrise, state.sunset]
          : [state.sunset, state.nightfall];
  return ((start + end) / 2) % SECONDS_PER_DAY;
};
