import type { Rgb, Sky } from '@skelly/engine/sky';
import { describe, expect, it } from 'vitest';
import { skyBakeSchedule } from '../src/render/skyEnvironment.ts';

const THRESHOLD = 0.1;

const skyWithZenith = (blue: number): Sky => {
  const grey: Rgb = [0.5, 0.5, 0.5];
  return {
    dayPhase: 'day',
    sky: grey,
    light: [0, 1, 0],
    sunDirection: [0, 1, 0],
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
      sun: { colour: grey, brightness: 1, glowColour: grey, glow: 1 },
    },
  };
};

describe('the sky reflection bake schedule', () => {
  it('bakes the first sky, then re-bakes only once the drawn sky has moved past the threshold since the last bake', () => {
    const due = skyBakeSchedule(THRESHOLD);
    const step = THRESHOLD * 0.6;
    expect(due(skyWithZenith(0.5))).toBe(true);
    expect(due(skyWithZenith(0.5 + step))).toBe(false);
    expect(due(skyWithZenith(0.5 + step * 2))).toBe(true);
    expect(due(skyWithZenith(0.5 + step * 2 + THRESHOLD / 2))).toBe(false);
  });
});
