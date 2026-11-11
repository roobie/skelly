import type { Clouds, DomeShape, Rgb, Sky } from '@skelly/engine/sky';
import { PerspectiveCamera, type ShaderMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { createSkyDome, physicalShare, preethamTerms } from '../src/render/skyDome.ts';

const physical = { weight: 0.6, exposure: 0.35, turbidity: 3, rayleigh: 1.3, mie: 0.005, mieDirectional: 0.8 };
const physicalBand = [0.05, 0.3] as const;
const HEIGHTS = [-0.5, -0.1, 0, 0.05, 0.15, 0.3, 0.6, 1];

describe('the dome around a low sun', () => {
  it('allows no physical sky with the sun at the horizon and all of it with the sun high', () => {
    expect(physicalShare(0, physicalBand)).toBe(0);
    expect(physicalShare(-0.4, physicalBand)).toBe(0);
    expect(physicalShare(1, physicalBand)).toBe(1);
  });

  it('brings the physical sky in as the sun climbs', () => {
    const shares = HEIGHTS.map((height) => physicalShare(height, physicalBand));
    expect(shares).toEqual([...shares].sort((a, b) => a - b));
  });
});

describe('the physical sky terms', () => {
  it('has no sun once it is well below the horizon and more of it as it climbs', () => {
    expect(preethamTerms(-0.5, physical).sunIntensity).toBe(0);
    const intensities = HEIGHTS.map((height) => preethamTerms(height, physical).sunIntensity);
    expect(intensities).toEqual([...intensities].sort((a, b) => a - b));
    expect(intensities.at(-1)!).toBeGreaterThan(0);
  });

  it('scales the air terms with the content values and leaves them zero when content zeroes them', () => {
    const hazy = preethamTerms(0.5, { ...physical, rayleigh: 2.6, mie: 0.01 });
    const clear = preethamTerms(0.5, physical);
    expect(hazy.rayleigh[0]).toBeCloseTo(clear.rayleigh[0] * 2, 12);
    expect(hazy.mie[2]).toBeCloseTo(clear.mie[2] * 2, 12);
    const none = preethamTerms(0.5, { ...physical, rayleigh: 0, mie: 0 });
    expect([...none.rayleigh, ...none.mie]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('the dome driven by a sky', () => {
  const colour: Rgb = [0.5, 0.5, 0.5];
  const body = { disc: [0.9, 0.99], discGain: 1, tightHalo: { power: 8, gain: 1 }, wideHalo: { power: 2, gain: 1 } };
  const shape = {
    horizonBand: [0, 0.2],
    glowBand: [0.2, 0.8],
    physicalBand,
    starField: { density: 0.1, size: 0.3, twinkle: 0.5 },
    moon: body,
    sun: body,
    cloudLight: { light: 1, ambient: 1, facing: 0.5 },
    cloudShape: { coverGain: 1, edgeSoftness: 0.1, horizonFade: [0, 0.2] },
  } as DomeShape;
  const clouds = { warp: 0, layers: [{ scale: 1, angle: 0, drift: [0, 0], opacity: 1 }] } as Clouds;
  const skyWithSunAt = (height: number): Sky =>
    ({
      sky: colour,
      sunDirection: [0, height, Math.sqrt(1 - height * height)],
      light: [0, 1, 0],
      lightColor: colour,
      lightIntensity: 1,
      ambientSky: colour,
      ambientIntensity: 1,
      dome: {
        zenith: colour,
        horizonGlow: colour,
        physical,
        clouds: { cover: 0, opacity: 0 },
        stars: 0,
        moon: { colour, brightness: 0 },
        sun: { colour, brightness: 1, glowColour: colour, glow: 1 },
      },
    }) as Sky;
  const physicalWeightWithSunAt = (height: number): number => {
    const dome = createSkyDome(clouds, shape);
    dome.update({ sky: skyWithSunAt(height), simSeconds: 0, camera: new PerspectiveCamera(), skyVisibility: 1 });
    const { uniforms } = dome.mesh.material as ShaderMaterial;
    const weight = uniforms.uPhysicalWeight!.value as number;
    dome.dispose();
    return weight;
  };

  it('draws none of the physical sky with the sun low, however much weight the look gives it', () => {
    expect(physicalWeightWithSunAt(0)).toBe(0);
  });

  it("draws the look's whole physical weight with the sun high", () => {
    expect(physicalWeightWithSunAt(1)).toBe(physical.weight);
  });
});
