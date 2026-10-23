import { ShaderChunk } from 'three';
import { describe, expect, it } from 'vitest';
import { installNearFieldFalloff, withNearFieldFalloff } from '../src/render/lightFalloff.ts';
import { CALIBRATED_BEAM_INTENSITY, CALIBRATED_NEAR_FIELD_M as NEAR_FIELD_M } from './flashlightFixture.ts';

// three.js's own source is the thing under test: the patch must find the line it replaces.
describe('near-field light falloff', () => {
  it('offsets the distance in three light chunk, and only there', () => {
    const patched = withNearFieldFalloff(ShaderChunk.lights_pars_begin, 4);
    expect(patched).toContain('pow( lightDistance + 4.000, decayExponent )');
    expect(patched).not.toContain('pow( lightDistance, decayExponent )');
    expect(patched.length - ShaderChunk.lights_pars_begin.length).toBe('+ 4.000'.length + 1);
  });

  it('throws when three changes the line, rather than lighting wrong silently', () => {
    expect(() => withNearFieldFalloff('float distanceFalloff = 1.0 / pow( d, e );', 4)).toThrow('not found');
  });

  it('rejects an offset that is not a non-negative number of metres', () => {
    for (const offset of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => withNearFieldFalloff(ShaderChunk.lights_pars_begin, offset)).toThrow('offset');
    }
  });

  it('patches the shared chunk once with the given offset, and refuses another offset', () => {
    installNearFieldFalloff(NEAR_FIELD_M);
    const once = ShaderChunk.lights_pars_begin;
    installNearFieldFalloff(NEAR_FIELD_M);
    expect(ShaderChunk.lights_pars_begin).toBe(once);
    expect(once).toContain(`lightDistance + ${NEAR_FIELD_M.toFixed(3)}`);
    expect(() => installNearFieldFalloff(NEAR_FIELD_M + 1)).toThrow('already installed');
    expect(ShaderChunk.lights_pars_begin).toBe(once);
  });

  it('limits close-surface brightness variation for a fixture light', () => {
    const exposed = (albedo: number, d: number): number => {
      const window = (1 - (d / 20) ** 4) ** 2;
      return ((CALIBRATED_BEAM_INTENSITY / (d + NEAR_FIELD_M)) * window * albedo * 3) / Math.PI;
    };
    // Close surfaces vary little: 0.5 m to 2 m is under 2x (a plain 1 / d would be 4x).
    expect(exposed(0.5, 0.5) / exposed(0.5, 2)).toBeLessThan(2);
  });
});
