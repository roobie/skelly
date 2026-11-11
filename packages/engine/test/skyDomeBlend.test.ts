import { parse } from 'valibot';
import { describe, expect, it } from 'vitest';
import { SECONDS_PER_DAY } from '../src/core/clock.ts';
import { dayPhaseAt } from '../src/core/dayPhase.ts';
import { type DayCycleDef, DayCycleSchema } from '../src/core/schema.ts';
import { skyAt } from '../src/core/sky.ts';

const NIGHT_DOME = {
  zenith: '#102030',
  horizonGlow: '#304050',
  physical: { weight: 0.1, exposure: 0.2, turbidity: 2, rayleigh: 1, mie: 0.004, mieDirectional: 0.2 },
  clouds: { cover: 0.2, opacity: 0.4 },
  stars: 0.9,
  moon: { colour: '#405060', brightness: 0.8 },
  sun: { colour: '#506070', brightness: 0.1, glowColour: '#607080', glow: 0.2 },
};
const DAY_DOME = {
  zenith: '#a0b0c0',
  horizonGlow: '#d0e0f0',
  physical: { weight: 0.7, exposure: 0.6, turbidity: 6, rayleigh: 3, mie: 0.012, mieDirectional: 0.6 },
  clouds: { cover: 0.8, opacity: 1 },
  stars: 0.1,
  moon: { colour: '#c0d0e0', brightness: 0.2 },
  sun: { colour: '#d0e0f0', brightness: 0.9, glowColour: '#e0f0ff', glow: 0.7 },
};

const look = (dome: typeof NIGHT_DOME) => ({
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
  dome,
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
    night: look(NIGHT_DOME),
    deepNight: look(NIGHT_DOME),
    dawn: look(NIGHT_DOME),
    day: look(DAY_DOME),
    dusk: look(NIGHT_DOME),
  },
  weather: { defaultFogginess: 0.2, nearTighten: 0.5, farTighten: 0.5 },
  domeShape: {
    horizonBand: [0.02, 0.1],
    glowBand: [0.1, 0.5],
    physicalBand: [0.1, 0.4],
    starField: { density: 0.02, size: 0.2, twinkle: 0.3 },
    moon: {
      disc: [0.999, 0.9995],
      discGain: 4,
      tightHalo: { power: 300, gain: 0.3 },
      wideHalo: { power: 10, gain: 0.05 },
    },
    sun: {
      disc: [0.9995, 0.9998],
      discGain: 3,
      tightHalo: { power: 500, gain: 0.5 },
      wideHalo: { power: 20, gain: 0.4 },
    },
    cloudLight: { light: 0.7, ambient: 0.3, facing: 0.5 },
    cloudShape: { coverGain: 1, edgeSoftness: 0.25, horizonFade: [0.03, 0.12] },
  },
  clouds: { warp: 0.5, layers: [{ scale: 1, angle: 0, drift: [0, 0], opacity: 0.5 }] },
});

const state = dayPhaseAt(cycle, 0);
const hourOf = (seconds: number): number => seconds / 3600;

const leaves = (value: unknown, path = ''): [string, number][] =>
  typeof value === 'number'
    ? [[path, value]]
    : Object.entries(value as object).flatMap(([key, child]) => leaves(child, `${path}.${key}`));

describe('sky dome blend', () => {
  it('takes a key look unchanged at its key and blends every dome field halfway between two keys', () => {
    expect(skyAt(hourOf(state.nightfall), cycle).dome).toEqual(cycle.looks.night.dome);
    expect(skyAt(hourOf(state.sunrise), cycle).dome).toEqual(cycle.looks.day.dome);

    const nightToDaySeconds = (state.sunrise - state.nightfall + SECONDS_PER_DAY) % SECONDS_PER_DAY;
    const midway = skyAt(hourOf((state.nightfall + nightToDaySeconds / 2) % SECONDS_PER_DAY), cycle).dome;

    const night = new Map(leaves(cycle.looks.night.dome));
    const actual = new Map(leaves(midway));
    const fields = leaves(cycle.looks.day.dome);
    expect(actual.size).toBe(fields.length);
    for (const [path, day] of fields) {
      expect(actual.get(path)).toBeCloseTo((night.get(path)! + day) / 2, 8);
    }
  });
});
