import { realSeconds } from '@skelly/engine/sim';
import type { Rgb, Sky } from '@skelly/engine/sky';
import { describe, expect, it } from 'vitest';
import { skyBakeSchedule } from '../src/render/skyEnvironment.ts';

const THRESHOLD = 0.1;
const NO_INTERVAL = realSeconds(0);
const AT = realSeconds(0);

interface Sun {
  direction?: Sky['sunDirection'];
  light?: Sky['light'];
  glow?: number;
}

const skyWithZenith = (blue: number, { direction = [0, 1, 0], light = [0, 1, 0], glow = 1 }: Sun = {}): Sky => {
  const grey: Rgb = [0.5, 0.5, 0.5];
  return {
    dayPhase: 'day',
    sky: grey,
    light,
    sunDirection: direction,
    lightColor: grey,
    lightIntensity: 1,
    ambientSky: grey,
    ambientGround: grey,
    ambientIntensity: 1,
    fogNear: 0.3,
    fogFar: 0.8,
    heightFog: 0,
    heightFogColor: grey,
    bloom: 0,
    tone: 0,
    dome: {
      zenith: [0.2, 0.3, blue],
      horizonGlow: grey,
      physical: { weight: 0, exposure: 0, turbidity: 2, rayleigh: 1, mie: 0, mieDirectional: 0.5 },
      clouds: { cover: 0, opacity: 0 },
      stars: 0,
      moon: { colour: grey, brightness: 0 },
      sun: { colour: grey, brightness: 1, glowColour: grey, glow },
    },
  };
};

describe('the sky reflection bake schedule', () => {
  it('bakes the first sky, then re-bakes only once the drawn sky has moved past the threshold since the last bake', () => {
    const due = skyBakeSchedule(THRESHOLD, NO_INTERVAL);
    const step = THRESHOLD * 0.6;
    expect(due(skyWithZenith(0.5), AT)).toBe(true);
    expect(due(skyWithZenith(0.5 + step), AT)).toBe(false);
    expect(due(skyWithZenith(0.5 + step * 2), AT)).toBe(true);
    expect(due(skyWithZenith(0.5 + step * 2 + THRESHOLD / 2), AT)).toBe(false);
  });

  it('does not re-bake as the sun moves below the horizon without glow, but does when it rises into view', () => {
    const due = skyBakeSchedule(THRESHOLD, NO_INTERVAL);
    const below = (direction: Sky['sunDirection'], light: Sky['light']): Sky =>
      skyWithZenith(0.5, { direction, light, glow: 0 });
    expect(due(below([1, -0.2, 0], [1, 0.2, 0]), AT)).toBe(true);
    expect(due(below([0, -1, 0], [0, 0.2, 1]), AT)).toBe(false);
    expect(due(below([-1, -0.3, 0], [-1, 0.2, 0]), AT)).toBe(false);
    expect(due(skyWithZenith(0.5, { direction: [0, 1, 0], glow: 0 }), AT)).toBe(true);
  });

  it('re-bakes as a sun below the horizon moves while its glow is drawn, as in twilight', () => {
    const due = skyBakeSchedule(THRESHOLD, NO_INTERVAL);
    expect(due(skyWithZenith(0.5, { direction: [1, -0.2, 0] }), AT)).toBe(true);
    expect(due(skyWithZenith(0.5, { direction: [0, -0.2, 1] }), AT)).toBe(true);
  });

  it('re-bakes as the light that follows the sun moves while the sun is up', () => {
    const due = skyBakeSchedule(THRESHOLD, NO_INTERVAL);
    expect(due(skyWithZenith(0.5, { light: [1, 0.2, 0] }), AT)).toBe(true);
    expect(due(skyWithZenith(0.5, { light: [0, 0.2, 1] }), AT)).toBe(true);
  });

  it('holds a change back until the minimum interval has passed, then bakes it', () => {
    const interval = realSeconds(2);
    const due = skyBakeSchedule(THRESHOLD, interval);
    expect(due(skyWithZenith(0.5), realSeconds(10))).toBe(true);
    expect(due(skyWithZenith(0.9), realSeconds(10.5))).toBe(false);
    expect(due(skyWithZenith(0.9), realSeconds(10 + interval))).toBe(true);
    expect(due(skyWithZenith(0.5), realSeconds(10 + interval + 0.1))).toBe(false);
  });
});
