import { ShaderChunk } from 'three';
import { describe, expect, it } from 'vitest';
import { FLASHLIGHT_DECAY, FLASHLIGHT_INTENSITY } from '../src/render/flashlight.ts';
import { installNearFieldFalloff, NEAR_FIELD_M, withNearFieldFalloff } from '../src/render/lightFalloff.ts';

// three.js's own source is the thing under test: the patch must find the line it replaces.
describe('near-field light falloff', () => {
  it('offsets the distance in three light chunk, and only there', () => {
    const patched = withNearFieldFalloff(ShaderChunk.lights_pars_begin, 4);
    expect(patched).toContain('pow( lightDistance + 4.000, decayExponent )');
    expect(patched).not.toContain('pow( lightDistance, decayExponent )');
    expect(patched.length - ShaderChunk.lights_pars_begin.length).toBe('+ 4.000'.length + 1);
  });

  it('throws when three changes the line, rather than lighting wrong silently', () => {
    expect(() => withNearFieldFalloff('float distanceFalloff = 1.0 / pow( d, e );', 4)).toThrow(/not found/);
  });

  it('rejects an offset that is not a non-negative number of metres', () => {
    for (const offset of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => withNearFieldFalloff(ShaderChunk.lights_pars_begin, offset)).toThrow(/offset/);
    }
  });

  it('patches the shared chunk once, however often it is installed', () => {
    installNearFieldFalloff();
    const once = ShaderChunk.lights_pars_begin;
    installNearFieldFalloff();
    expect(ShaderChunk.lights_pars_begin).toBe(once);
    expect(once).toContain(`lightDistance + ${NEAR_FIELD_M.toFixed(3)}`);
  });

  it('keeps a white block at 1 m under white and a grey at 10 m near 0.15, after exposure 3', () => {
    const exposed = (albedo: number, d: number): number => {
      const window = (1 - (d / 20) ** 4) ** 2;
      return ((FLASHLIGHT_INTENSITY / (d + NEAR_FIELD_M) ** FLASHLIGHT_DECAY) * window * albedo * 3) / Math.PI;
    };
    expect(exposed(0.9, 1)).toBeLessThanOrEqual(0.9);
    expect(exposed(0.9, 0.5)).toBeLessThan(1);
    expect(exposed(0.5, 10)).toBeCloseTo(0.15, 2);
    // Close surfaces vary little: 0.5 m to 2 m is under 2x (a plain 1 / d would be 4x).
    expect(exposed(0.5, 0.5) / exposed(0.5, 2)).toBeLessThan(2);
  });
});
