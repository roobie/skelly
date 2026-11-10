import { parse } from 'valibot';
import { describe, expect, it } from 'vitest';
import { SECONDS_PER_DAY } from '../src/core/clock.ts';
import { dayPhaseAt } from '../src/core/dayPhase.ts';
import { type DayCycleDef, DayCycleSchema } from '../src/core/schema.ts';
import { skyAt } from '../src/core/sky.ts';

const look = ({ colour, lit }: { colour: string; lit: boolean }) => ({
  sky: '#808080',
  lightColor: '#ffffff',
  lightIntensity: 1,
  ambientSky: '#808080',
  ambientGround: '#808080',
  ambientIntensity: 1,
  fogNear: 0.5,
  fogFar: 0.9,
  heightFog: 0.01,
  heightFogColor: '#808080',
  bloom: 0.1,
  tone: 0.5,
  dome: {
    zenith: colour,
    horizonGlow: colour,
    physical: { weight: Number(lit), turbidity: 2, rayleigh: 1, mie: 0.004, mieDirectional: 0.5 },
    clouds: { cover: Number(lit), opacity: 1 },
    stars: Number(!lit),
  },
});

const cycle: DayCycleDef = parse(DayCycleSchema, {
  clockRatio: 1,
  latitudeDegrees: 40,
  date: { month: 6, day: 25 },
  twilight: 'nautical',
  defaultStartGameTimeOfDay: '10:00',
  midnightGameTimeOfDay: '00:00',
  noonGameTimeOfDay: '12:00',
  keys: [
    { phase: 'night', at: 0, look: 'night' },
    { phase: 'day', at: 0, look: 'day' },
  ],
  looks: {
    night: look({ colour: '#000000', lit: false }),
    deepNight: look({ colour: '#000000', lit: false }),
    dawn: look({ colour: '#000000', lit: false }),
    day: look({ colour: '#ffffff', lit: true }),
    dusk: look({ colour: '#000000', lit: false }),
  },
  weather: { defaultFogginess: 0.2, nearTighten: 0.5, farTighten: 0.5 },
  clouds: { warp: 0.5, layers: [{ scale: 1, angle: 0, drift: [0, 0], opacity: 0.5 }] },
});

const state = dayPhaseAt(cycle, 0);
const hourOf = (seconds: number): number => seconds / 3600;

describe('sky dome blend', () => {
  it('takes a key look unchanged at its key and blends every dome field halfway between two keys', () => {
    const atNight = skyAt(hourOf(state.nightfall), cycle).dome;
    expect(atNight).toEqual(cycle.looks.night.dome);

    const atDay = skyAt(hourOf(state.sunrise), cycle).dome;
    expect(atDay).toEqual(cycle.looks.day.dome);

    const nightToDaySeconds = (state.sunrise - state.nightfall + SECONDS_PER_DAY) % SECONDS_PER_DAY;
    const midway = skyAt(hourOf((state.nightfall + nightToDaySeconds / 2) % SECONDS_PER_DAY), cycle).dome;
    expect(midway.zenith[0]).toBeCloseTo(0.5, 8);
    expect(midway.horizonGlow[2]).toBeCloseTo(0.5, 8);
    expect(midway.physical.weight).toBeCloseTo(0.5, 8);
    expect(midway.physical.turbidity).toBeCloseTo(2, 8);
    expect(midway.clouds.cover).toBeCloseTo(0.5, 8);
    expect(midway.stars).toBeCloseTo(0.5, 8);
  });
});
