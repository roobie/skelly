import { SECONDS_PER_DAY } from '@skelly/engine/internal/core/clock.ts';
import type { DayCycle, DayPhase } from '@skelly/engine/internal/core/dayPhase.ts';
import type { DayCycleDef } from '@skelly/engine/internal/core/schema.ts';
import { sunDirection as sunDirectionAtCycle } from '@skelly/engine/internal/core/sky.ts';
import { dayPhaseAt } from '@skelly/engine/sim';
import { skyAt as skyAtCycle } from '@skelly/engine/sky';
import { describe, expect, it } from 'vitest';
import { BASE_DAY_CYCLE, phaseMidpoint } from './dayPhaseFixture.ts';

const skyAt = (hour: number, cycle: DayCycleDef = BASE_DAY_CYCLE) => skyAtCycle(hour, cycle);
const sunDirection = (hour: number) => sunDirectionAtCycle(hour, BASE_DAY_CYCLE);
const hourAt = (seconds: number): number => seconds / 3600;
const brightness = (hour: number) => {
  const sky = skyAt(hour);
  return sky.ambientIntensity + sky.lightIntensity;
};

const day = dayPhaseAt(BASE_DAY_CYCLE, phaseMidpoint('day'));
const otherCycle: DayCycleDef = {
  ...BASE_DAY_CYCLE,
  latitudeDegrees:
    BASE_DAY_CYCLE.latitudeDegrees > 80 ? BASE_DAY_CYCLE.latitudeDegrees - 7 : BASE_DAY_CYCLE.latitudeDegrees + 7,
};
const phaseSamples = (cycle: DayCycle): { phase: DayPhase; time: number }[] => {
  const state = dayPhaseAt(cycle, 0);
  const spans: { phase: DayPhase; start: number; end: number }[] = [
    { phase: 'night', start: state.nightfall, end: state.dawn + SECONDS_PER_DAY },
    { phase: 'dawn', start: state.dawn, end: state.sunrise },
    { phase: 'day', start: state.sunrise, end: state.sunset },
    { phase: 'dusk', start: state.sunset, end: state.nightfall },
  ];
  return spans.flatMap(({ phase, start, end }) =>
    [0, 0.5].map((position) => ({ phase, time: (start + (end - start) * position) % SECONDS_PER_DAY })),
  );
};
const lookFields = (sky: ReturnType<typeof skyAt>) => {
  const {
    dayPhase: _dayPhase,
    light: _light,
    sunDirection: _sunDirection,
    moonDirection: _moonDirection,
    ...look
  } = sky;
  return look;
};

const horizontalDot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[2]! * b[2]!;
const angleBetween = (a: readonly number[], b: readonly number[]): number =>
  Math.acos(Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!));
/** The largest turn of the main light between neighbouring samples `step` seconds apart from `start` to `end`. */
const largestLightTurn = (start: number, end: number, step: number): number => {
  let largest = 0;
  let previous = skyAt(hourAt(start % SECONDS_PER_DAY)).light;
  for (let time = start + step; time <= end; time += step) {
    const { light } = skyAt(hourAt(time % SECONDS_PER_DAY));
    largest = Math.max(largest, angleBetween(previous, light));
    previous = light;
  }
  return largest;
};

const numbersOf = (value: unknown): number[] =>
  typeof value === 'number' ? [value] : Object.values(value as object).flatMap(numbersOf);

describe('sky', () => {
  it('keys the sky look to phase position across different solar cycles', () => {
    const reference = phaseSamples(BASE_DAY_CYCLE);
    const comparison = phaseSamples(otherCycle);
    reference.forEach(({ phase, time }, index) => {
      expect(comparison[index]!.phase).toBe(phase);
      const first = lookFields(skyAt(hourAt(time), BASE_DAY_CYCLE));
      const second = lookFields(skyAt(hourAt(comparison[index]!.time), otherCycle));
      const expected = numbersOf(second);
      for (const [numberIndex, value] of numbersOf(first).entries()) {
        expect(value).toBeCloseTo(expected[numberIndex]!, 8);
      }
    });
  });

  it('keeps sun direction and sky labels aligned with derived solar phases', () => {
    for (let minute = 0; minute < 24 * 60; minute++) {
      const time = minute * 60;
      const state = dayPhaseAt(BASE_DAY_CYCLE, time);
      const hour = hourAt(time);
      expect(sunDirection(hour)[1] > 0, `sun at ${time}`).toBe(state.phase === 'day');
      expect(skyAt(hour).dayPhase, `sky at ${time}`).toBe(state.phase);
      const [x, y, z] = skyAt(hour).light;
      expect(y).toBeGreaterThan(0);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
    }
    expect(sunDirection(hourAt(day.sunrise))[0]).toBeGreaterThan(0);
    expect(sunDirection(hourAt(day.sunset))[0]).toBeLessThan(0);
  });

  it('lights the night from the side the moon is drawn on', () => {
    const { nightfall, dawn } = dayPhaseAt(BASE_DAY_CYCLE, 0);
    const nightSeconds = (dawn - nightfall + SECONDS_PER_DAY) % SECONDS_PER_DAY;
    for (const position of [0.1, 0.5, 0.9]) {
      const sky = skyAt(hourAt((nightfall + nightSeconds * position) % SECONDS_PER_DAY));
      expect(horizontalDot(sky.light, sky.moonDirection), `night at ${position}`).toBeGreaterThan(0);
      expect(horizontalDot(sky.light, sky.sunDirection), `night at ${position}`).toBeLessThan(0);
    }
  });

  it('turns the main light without a jump through dusk and dawn', () => {
    const { sunset, nightfall, dawn, sunrise } = dayPhaseAt(BASE_DAY_CYCLE, 0);
    const spans = [
      [sunset, nightfall + (nightfall < sunset ? SECONDS_PER_DAY : 0)],
      [dawn, sunrise + (sunrise < dawn ? SECONDS_PER_DAY : 0)],
    ] as const;
    for (const [start, end] of spans) {
      // A continuous turn shrinks with the sampling step; a jump keeps its size however fine the step.
      const coarse = largestLightTurn(start, end, 60);
      const fine = largestLightTurn(start, end, 6);
      expect(fine, `from ${start} to ${end}`).toBeLessThan(coarse / 4);
    }
  });

  it('makes full night darker and foggier than full day', () => {
    const daySky = skyAt(hourAt(phaseMidpoint('day')));
    const nightSky = skyAt(hourAt(phaseMidpoint('night')));
    expect(brightness(hourAt(phaseMidpoint('day')))).toBeGreaterThan(brightness(hourAt(phaseMidpoint('night'))));
    expect(daySky.fogFar).toBeGreaterThan(nightSky.fogFar);
    expect(Math.max(...nightSky.sky)).toBeLessThan(Math.max(...daySky.sky));
  });

  it('changes smoothly through the full day and midnight', () => {
    let previousBrightness = brightness(0);
    let previousTone = skyAt(0).tone;
    for (let minute = 1; minute <= 24 * 60; minute++) {
      const hour = (minute / 60) % 24;
      const step = Math.abs(brightness(hour) - previousBrightness);
      expect(step).toBeLessThan(0.1);
      const { tone } = skyAt(hour);
      expect(Math.abs(tone - previousTone)).toBeLessThan(0.05);
      previousBrightness = brightness(hour);
      previousTone = tone;
    }
  });

  it('keeps sky fields finite and within their normalized ranges all day', () => {
    for (let time = 0; time < SECONDS_PER_DAY; time += 60) {
      const sky = skyAt(hourAt(time));
      expect(Number.isFinite(sky.heightFog)).toBe(true);
      expect(sky.bloom).toBeGreaterThanOrEqual(0);
      expect(sky.bloom).toBeLessThanOrEqual(1);
      expect(sky.tone).toBeGreaterThanOrEqual(0);
      expect(sky.tone).toBeLessThanOrEqual(1);
      for (const channel of [...sky.sky, ...sky.lightColor, ...sky.ambientSky, ...sky.ambientGround]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(1);
      }
    }
  });
});
