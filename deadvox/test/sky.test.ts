import { describe, expect, it } from 'vitest';
import { SECONDS_PER_DAY } from '../src/core/clock.ts';
import { type DayCycle, type DayPhase, DEFAULT_DAY_CYCLE, dayPhaseAt } from '../src/core/dayPhase.ts';
import { skyAt, sunDirection } from '../src/core/sky.ts';
import { phaseMidpoint } from './dayPhaseFixture.ts';

const hourAt = (seconds: number): number => seconds / 3600;
const brightness = (hour: number) => {
  const sky = skyAt(hour);
  return sky.ambientIntensity + sky.lightIntensity;
};

const day = dayPhaseAt(DEFAULT_DAY_CYCLE, phaseMidpoint('day'));
const otherCycle: DayCycle = {
  ...DEFAULT_DAY_CYCLE,
  latitudeDegrees:
    DEFAULT_DAY_CYCLE.latitudeDegrees > 80
      ? DEFAULT_DAY_CYCLE.latitudeDegrees - 7
      : DEFAULT_DAY_CYCLE.latitudeDegrees + 7,
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
  const { dayPhase: _dayPhase, light: _light, ...look } = sky;
  return look;
};

describe('sky', () => {
  it('keys the sky look to phase position across different solar cycles', () => {
    const reference = phaseSamples(DEFAULT_DAY_CYCLE);
    const comparison = phaseSamples(otherCycle);
    reference.forEach(({ phase, time }, index) => {
      expect(comparison[index]!.phase).toBe(phase);
      const first = lookFields(skyAt(hourAt(time), DEFAULT_DAY_CYCLE));
      const second = lookFields(skyAt(hourAt(comparison[index]!.time), otherCycle));
      for (const key of Object.keys(first) as (keyof typeof first)[]) {
        const a = first[key];
        const b = second[key];
        if (Array.isArray(a) && Array.isArray(b)) {
          a.forEach((value, index) => expect(value).toBeCloseTo(b[index]!, 8));
        } else {
          expect(a).toBeCloseTo(b as number, 8);
        }
      }
    });
  });

  it('keeps sun direction and sky labels aligned with derived solar phases', () => {
    for (let minute = 0; minute < 24 * 60; minute++) {
      const time = minute * 60;
      const state = dayPhaseAt(DEFAULT_DAY_CYCLE, time);
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
