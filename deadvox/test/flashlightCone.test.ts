import { MathUtils, Scene, ShaderChunk, ShaderLib, UniformsUtils } from 'three';
import { safeParse } from 'valibot';
import { describe, expect, it } from 'vitest';
import { validateContent } from '../src/core/content.ts';
import { BeamSpillSchema } from '../src/core/schema.ts';
import { Flashlight } from '../src/render/flashlight.ts';
import {
  installFlashlightSpill,
  setFlashlightSpill,
  spillHalfAngle,
  withFlashlightSpill,
} from '../src/render/flashlightCone.ts';

const profile = { radiusRatio: 1.8, intensity: 0.2 };

describe('flashlight cone', () => {
  it('requires spill metadata for a content-defined beam', () => {
    const beam = { angleDegrees: 50, penumbra: 0.5 };
    const source = (shape: object) => ({
      source: 'fixture-beam.json',
      data: {
        items: [
          {
            id: 'fixture_beam',
            name: 'Fixture beam',
            category: 'light',
            economy: { usage: [], tiers: [] },
            weight: 10,
            size: [1, 1],
            light: { radius: 10, seenFrom: 10, color: '#ffffff', intensity: 1, beam: shape },
          },
        ],
      },
    });
    expect(validateContent(source({ ...beam, spill: profile }))).toEqual([]);
    expect(validateContent(source(beam)).some(({ path }) => path.endsWith('.beam.spill'))).toBe(true);
  });

  it('rejects malformed profiles at the shared content boundary', () => {
    expect(safeParse(BeamSpillSchema, profile).success).toBe(true);
    for (const invalid of [
      { ...profile, radiusRatio: 1 },
      { ...profile, intensity: 1 },
      { ...profile, intensity: -0.1 },
      { ...profile, radiusRatio: Number.POSITIVE_INFINITY },
    ]) {
      expect(safeParse(BeamSpillSchema, invalid).success).toBe(false);
    }
  });

  it('widens the shadow cone radius by the content profile ratio', () => {
    for (const halfAngle of [8, 30, 65].map(MathUtils.degToRad)) {
      const outer = spillHalfAngle(halfAngle, profile);
      expect(Math.tan(outer) / Math.tan(halfAngle)).toBeCloseTo(profile.radiusRatio);
    }
  });

  it('shares active-light values with cloned built-in uniforms without changing shader source', () => {
    installFlashlightSpill();
    const programs = Object.values(ShaderLib).map(({ uniforms }) => UniformsUtils.clone(uniforms));
    const source = ShaderChunk.lights_pars_begin;
    for (const next of [profile, { radiusRatio: 2.3, intensity: 0.08 }]) {
      setFlashlightSpill(next);
      for (const uniforms of programs) {
        const value = uniforms.uFlashlightSpill!.value as Float32Array;
        expect(value[0]).toBeCloseTo(next.radiusRatio ** 2);
        expect(value[1]).toBeCloseTo(next.intensity);
      }
      expect(ShaderChunk.lights_pars_begin).toBe(source);
    }
  });

  it('installs the content profile once without adding a second light', () => {
    const scene = new Scene();
    const first = new Flashlight(scene);
    const once = ShaderChunk.lights_pars_begin;
    installFlashlightSpill();
    expect(ShaderChunk.lights_pars_begin).toBe(once);
    expect(once).toContain('return mix( spill, 1.0, hotspot );');
    expect(scene.children.filter((child) => child.type === 'SpotLight')).toEqual([first.light]);
    expect(() => withFlashlightSpill('changed upstream shader')).toThrow('spot attenuation not found');
  });
});
