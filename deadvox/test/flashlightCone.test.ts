import { MathUtils, Scene, ShaderChunk } from 'three';
import { describe, expect, it } from 'vitest';
import { Flashlight } from '../src/render/flashlight.ts';
import {
  FLASHLIGHT_SPILL,
  flashlightConeAttenuation,
  installFlashlightSpill,
  spillHalfAngle,
  withFlashlightSpill,
} from '../src/render/flashlightCone.ts';

describe('flashlight cone', () => {
  it('widens the radius by the profile ratio while keeping spill dimmer and zero beyond its soft edge', () => {
    expect(FLASHLIGHT_SPILL.radiusRatio).toBeGreaterThan(1);
    expect(FLASHLIGHT_SPILL.intensity).toBeGreaterThan(0);
    expect(FLASHLIGHT_SPILL.intensity).toBeLessThan(1);
    for (const halfAngle of [8, 30, 65].map(MathUtils.degToRad)) {
      const outer = spillHalfAngle(halfAngle);
      expect(Math.tan(outer) / Math.tan(halfAngle)).toBeCloseTo(FLASHLIGHT_SPILL.radiusRatio);
      for (const penumbra of [0, 0.35, 1]) {
        const sample = (angle: number) => flashlightConeAttenuation(angle, halfAngle, penumbra);
        const innerSpill = sample(halfAngle + (outer - halfAngle) / 3);
        const outerSpill = sample(halfAngle + ((outer - halfAngle) * 2) / 3);
        expect(innerSpill).toBeGreaterThan(outerSpill);
        expect(outerSpill).toBeGreaterThan(0);
        expect(innerSpill).toBeLessThanOrEqual(FLASHLIGHT_SPILL.intensity);
        expect(innerSpill).toBeLessThan(sample(0));
        expect(sample(outer)).toBeCloseTo(0);
        expect(sample(outer + 0.01)).toBe(0);
        expect(sample(halfAngle - 1e-8)).toBeCloseTo(sample(halfAngle + 1e-8), 5);
      }
    }
  });

  it('installs the blended profile once without adding a second light', () => {
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
