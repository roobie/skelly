import { parse } from 'valibot';
import { describe, expect, it } from 'vitest';
import { SECONDS_PER_DAY } from '../src/core/clock.ts';
import { dayPhaseAt } from '../src/core/dayPhase.ts';
import { type DayCycleDef, DayCycleSchema } from '../src/core/schema.ts';
import { skyAt } from '../src/core/sky.ts';

const OVERCAST = {
  kind: 'layered',
  clouds: { cover: 1, opacity: 1 },
  physicalWeight: 0,
  sun: 0,
  light: 0.5,
  ambient: 0.6,
  skyColour: { saturation: 0.5, brightness: 0.8 },
};

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
  weather: {
    defaults: { fogginess: 0.2, cloudiness: 0.2, rain: 0 },
    fog: { nearTighten: 0.5, farTighten: 0.5 },
    fair: { cloudiness: 0.2, kind: 'layered' },
    cloudy: { ...OVERCAST, cloudiness: 0.5 },
    overcast: OVERCAST,
    rain: OVERCAST,
  },
  domeShape: {
    horizonBand: [0.02, 0.1],
    glowBand: [0.1, 0.5],
    physicalBand: [0.1, 0.4],
    starField: { density: 0.02, size: 0.2, twinkle: 0.3 },
    // Above the highest this cycle's sun climbs, so the blend shows whole.
    washOutBand: [0.98, 0.99],
    moon: {
      disc: [0.999, 0.9995],
      discGain: 4,
      limbDarkening: 0.3,
      maria: { depth: 0.2, scale: 2 },
      tightHalo: { power: 300, gain: 0.3 },
      wideHalo: { power: 10, gain: 0.05 },
    },
    sun: {
      disc: [0.9995, 0.9998],
      discGain: 3,
      tightHalo: { power: 500, gain: 0.5 },
      wideHalo: { power: 20, gain: 0.4 },
    },
    cloudLight: { light: 0.7, ambient: 0.3, facing: 0.5, deckLight: 0.5 },
    cloudShape: { coverGain: 1, edgeSoftness: 0.25, horizonFade: [0.03, 0.12] },
  },
  clouds: {
    layered: { warp: 0.5, layers: [{ scale: 1, angle: 0, drift: [0, 0], opacity: 0.5, shade: 0 }] },
    scatter: {
      scale: 1,
      drift: [0, 0],
      billow: 0,
      region: { scale: 1, strength: 0 },
      density: 1,
      shadow: 0.5,
      lining: 0,
    },
  },
  mainLight: { lowestHeight: 0.2, fromMoonAt: 1 },
  environment: { faceSize: 32, rebakeChange: 0.05, rebakeRealSeconds: 0.5, strength: 1 },
});

const state = dayPhaseAt(cycle, 0);
const hourOf = (seconds: number): number => seconds / 3600;

/** A look's dome as the sky draws it, with fair weather's kind of cloud, which the fixture makes the layered kind. */
const inFairWeather = (dome: DayCycleDef['looks']['day']['dome']) => ({
  ...dome,
  clouds: { ...dome.clouds, scatter: 0 },
});

const leaves = (value: unknown, path = ''): [string, number][] =>
  typeof value === 'number'
    ? [[path, value]]
    : Object.entries(value as object).flatMap(([key, child]) => leaves(child, `${path}.${key}`));

describe('sky dome blend', () => {
  it('takes a key look unchanged at its key and blends every dome field halfway between two keys', () => {
    expect(skyAt(hourOf(state.nightfall), cycle).dome).toEqual(inFairWeather(cycle.looks.night.dome));
    expect(skyAt(hourOf(state.sunrise), cycle).dome).toEqual(inFairWeather(cycle.looks.day.dome));

    const nightToDaySeconds = (state.sunrise - state.nightfall + SECONDS_PER_DAY) % SECONDS_PER_DAY;
    const midway = skyAt(hourOf((state.nightfall + nightToDaySeconds / 2) % SECONDS_PER_DAY), cycle).dome;

    const night = new Map(leaves(inFairWeather(cycle.looks.night.dome)));
    const actual = new Map(leaves(midway));
    const fields = leaves(inFairWeather(cycle.looks.day.dome));
    expect(actual.size).toBe(fields.length);
    for (const [path, day] of fields) {
      expect(actual.get(path)).toBeCloseTo((night.get(path)! + day) / 2, 8);
    }
  });
});

describe('the moon and stars in a brightening sky', () => {
  const [from, to] = [-0.1, -0.05];
  const washing: DayCycleDef = { ...cycle, domeShape: { ...cycle.domeShape, washOutBand: [from, to] } };
  /** Every minute's sun height with the moon and stars as the fixture's looks give them and as the sky draws them. */
  const minutes = Array.from({ length: 24 * 60 }, (_, minute) => {
    const hour = minute / 60;
    const whole = skyAt(hour, cycle).dome;
    const drawn = skyAt(hour, washing).dome;
    return { minute, height: skyAt(hour, cycle).sunDirection[1], whole, drawn };
  });

  it('draws them whole with the sun below the band and not at all above it, whatever the looks give them', () => {
    const dark = minutes.filter(({ height }) => height <= from);
    const bright = minutes.filter(({ height }) => height >= to);
    expect(dark.length).toBeGreaterThan(0);
    expect(bright.length).toBeGreaterThan(0);
    for (const { minute, whole, drawn } of dark) {
      expect(drawn.stars, `stars at ${minute}`).toBe(whole.stars);
      expect(drawn.moon.brightness, `moon at ${minute}`).toBe(whole.moon.brightness);
    }
    for (const { minute, whole, drawn } of bright) {
      expect(whole.stars * whole.moon.brightness, `fixture at ${minute}`).toBeGreaterThan(0);
      expect(drawn.stars, `stars at ${minute}`).toBe(0);
      expect(drawn.moon.brightness, `moon at ${minute}`).toBe(0);
    }
  });

  it('fades them out without a jump as the sun rises through the band', () => {
    const rising = minutes.filter(
      ({ minute, height }) => minute * 60 >= state.dawn && minute * 60 <= state.sunrise && height > from && height < to,
    );
    expect(rising.length).toBeGreaterThan(2);
    const shares = rising.map(({ whole, drawn }) => [drawn.stars / whole.stars, drawn.moon.brightness / whole.moon.brightness]);
    for (const [index, [stars, moon]] of shares.entries()) {
      expect(stars).toBeCloseTo(moon!, 12);
      if (index > 0) {
        const previous = shares[index - 1]![0]!;
        expect(stars).toBeLessThan(previous);
        expect(previous - stars!).toBeLessThan(0.25);
      }
    }
  });
});
