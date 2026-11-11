import type { Clouds, DomeShape, Rgb, Sky } from '@skelly/engine/sky';
import { Color, LessEqualDepth, PerspectiveCamera, type ShaderMaterial, SRGBColorSpace } from 'three';
import { describe, expect, it } from 'vitest';
import { createSkyDome, physicalShare, preethamTerms } from '../src/render/skyDome.ts';

const physical = { weight: 0.6, exposure: 0.35, turbidity: 3, rayleigh: 1.3, mie: 0.005, mieDirectional: 0.8 };
const physicalBand = [0.05, 0.3] as const;
const HEIGHTS = [-0.5, -0.1, 0, 0.05, 0.15, 0.3, 0.6, 1];

describe('the dome around a low sun', () => {
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

describe('the dome against the opaque geometry', () => {
  it('draws after the opaque geometry, writing no depth and passing only the cleared far plane', () => {
    const dome = createSkyDome(
      { warp: 0, layers: [{ scale: 1, angle: 0, drift: [0, 0], opacity: 1 }] } as Clouds,
      {
        horizonBand: [0, 0.2],
        glowBand: [0.2, 0.8],
        physicalBand: [0.05, 0.3],
        starField: { density: 0.1, size: 0.3, twinkle: 0.5 },
        moon: { disc: [0.9, 0.99], discGain: 1, tightHalo: { power: 8, gain: 1 }, wideHalo: { power: 2, gain: 1 } },
        sun: { disc: [0.9, 0.99], discGain: 1, tightHalo: { power: 8, gain: 1 }, wideHalo: { power: 2, gain: 1 } },
        cloudLight: { light: 1, ambient: 1, facing: 0.5 },
        cloudShape: { coverGain: 1, edgeSoftness: 0.1, horizonFade: [0, 0.2] },
      } as DomeShape,
    );
    const material = dome.mesh.material as ShaderMaterial;
    expect(dome.mesh.renderOrder).toBeGreaterThan(0);
    expect(material.depthWrite).toBe(false);
    expect(material.depthTest).toBe(true);
    expect(material.depthFunc).toBe(LessEqualDepth);
    dome.dispose();
  });
});

describe('the dome driven by a sky', () => {
  const colour: Rgb = [0.5, 0.5, 0.5];
  const ground: Rgb = [0.1, 0.2, 0.3];
  const body = { disc: [0.9, 0.99], discGain: 1, tightHalo: { power: 8, gain: 1 }, wideHalo: { power: 2, gain: 1 } };
  const shape = {
    horizonBand: [0, 0.2],
    glowBand: [0.2, 0.8],
    physicalBand,
    starField: { density: 0.1, size: 0.3, twinkle: 0.5 },
    moon: body,
    sun: body,
    cloudLight: { light: 1, ambient: 1, facing: 0.5, deckLight: 0.5 },
    cloudShape: { coverGain: 1, edgeSoftness: 0.1, horizonFade: [0, 0.2] },
  } as DomeShape;
  const clouds = { warp: 0, layers: [{ scale: 1, angle: 0, drift: [0, 0], opacity: 1, shade: 0 }] } as Clouds;
  const skyWithSunAt = (height: number): Sky =>
    ({
      sky: colour,
      sunDirection: [0, height, Math.sqrt(1 - height * height)],
      light: [0, 1, 0],
      lightColor: colour,
      lightIntensity: 1,
      ambientSky: colour,
      ambientGround: ground,
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

  it("draws half the look's physical weight with the sun midway through the physical band", () => {
    const [from, to] = physicalBand;
    expect(physicalWeightWithSunAt((from + to) / 2)).toBeCloseTo(physical.weight / 2, 12);
  });

  const cloudLightsUnder = (lightIntensity: number): { tops: Color; deck: Color } => {
    const dome = createSkyDome(clouds, shape);
    dome.update({
      sky: { ...skyWithSunAt(1), lightIntensity },
      simSeconds: 0,
      camera: new PerspectiveCamera(),
      skyVisibility: 1,
    });
    const { uniforms } = dome.mesh.material as ShaderMaterial;
    const lights = { tops: uniforms.uCloudLight!.value as Color, deck: uniforms.uCloudDeckLight!.value as Color };
    dome.dispose();
    return lights;
  };

  it('lights the deck less than the tops under a light above its cap, so the tops keep their contrast', () => {
    const { tops, deck } = cloudLightsUnder(1);
    expect(deck.r).toBeLessThan(tops.r);
  });

  it('lights deck and tops alike under a light below its cap, so an overcast is no brighter or darker', () => {
    const { tops, deck } = cloudLightsUnder(shape.cloudLight.deckLight / 2);
    expect(deck.equals(tops)).toBe(true);
  });

  it('shows the ambient ground colour below the horizon in the open sky the reflection bakes, not the fog colour', () => {
    const dome = createSkyDome(clouds, shape);
    dome.update({ sky: skyWithSunAt(1), simSeconds: 0, camera: new PerspectiveCamera(), skyVisibility: 1 });
    const below = (dome.openSky.material as ShaderMaterial).uniforms.uFogColor!.value as Color;
    dome.dispose();
    expect(below.equals(new Color().setRGB(...ground, SRGBColorSpace))).toBe(true);
  });
});
