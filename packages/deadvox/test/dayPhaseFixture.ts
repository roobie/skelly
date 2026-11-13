import { type ClockSettings, SECONDS_PER_DAY } from '@skelly/engine/internal/core/clock.ts';
import type { DayCycle, DayPhase } from '@skelly/engine/internal/core/dayPhase.ts';
import { type DayCycleDef, DayCycleSchema } from '@skelly/engine/internal/core/schema.ts';
import { dayPhaseAt, parseTimeOfDay } from '@skelly/engine/sim';
import { parse } from 'valibot';
import coreDayCycle from '../../mods/skelly.day-cycle/dayCycle.json' with { type: 'json' };

/** Base content's day cycle row as the registry holds it, for tests that need a cycle without loading one. */
export const BASE_DAY_CYCLE: DayCycleDef = parse(DayCycleSchema, coreDayCycle.dayCycle);

/** The clock a session built from base content starts with. */
export const BASE_CLOCK: ClockSettings = {
  ratio: BASE_DAY_CYCLE.clockRatio,
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
