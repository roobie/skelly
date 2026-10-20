import { CustomToneMapping, ShaderChunk } from 'three';
import { describe, expect, it } from 'vitest';
import { AUTO_TONE } from '../src/core/mood.ts';
import {
  autoToneUniforms,
  installAutoToneMapping,
  setAutoToneWeight,
  withAutoToneMapping,
} from '../src/render/autoTone.ts';
import { TONE_MODES, toneKeyOf } from '../src/render/look.ts';
import { autoCurve, TONE_CURVES } from './toneCurves.ts';

// three.js's own source is the thing under test: the patch must find the stub it replaces.
describe('auto tone mapping chunk', () => {
  const original = ShaderChunk.tonemapping_pars_fragment;
  const patched = withAutoToneMapping(original);

  it('replaces only the custom stub, so three Neutral and ACES stay as selecting them alone gives', () => {
    const stub = 'vec3 CustomToneMapping( vec3 color ) { return color; }';
    expect(original).toContain(stub);
    const before = original.slice(0, original.indexOf(stub));
    const after = original.slice(original.indexOf(stub) + stub.length);
    expect(patched.startsWith(before)).toBe(true);
    expect(patched.endsWith(after)).toBe(true);
    expect(patched).not.toContain(stub);
  });

  it('mixes the two curves by the weight and applies no exposure of its own', () => {
    const body = patched.slice(patched.indexOf('vec3 CustomToneMapping'));
    expect(body).toContain('mix( NeutralToneMapping( color ), ACESFilmicToneMapping( color ), autoToneWeight )');
    // Each curve scales by toneMappingExposure itself; doing it here too would apply it twice.
    expect(body).not.toContain('toneMappingExposure');
  });

  it('throws when three changes the stub, rather than tone mapping wrong silently', () => {
    expect(() => withAutoToneMapping('vec3 CustomToneMapping( vec3 c ) { return c; }')).toThrow('not found');
  });

  it('patches the shared chunk once, however often it is installed', () => {
    installAutoToneMapping();
    const once = ShaderChunk.tonemapping_pars_fragment;
    installAutoToneMapping();
    expect(ShaderChunk.tonemapping_pars_fragment).toBe(once);
    expect(once).toContain('uniform float autoToneWeight;');
  });
});

describe('auto tone curve', () => {
  it('is the Neutral curve at weight 0 and the ACES curve at weight 1', () => {
    for (const x of [0, 0.02, 0.1, 0.5, 1, 2, 5, 20]) {
      expect(autoCurve(0, x)).toBe(TONE_CURVES.neutral!(x));
      expect(autoCurve(1, x)).toBe(TONE_CURVES.aces!(x));
    }
  });

  it('lies between the two curves in between', () => {
    for (const x of [0.2, 1, 3]) {
      const [low, high] = [TONE_CURVES.neutral!(x), TONE_CURVES.aces!(x)].sort((a, b) => a - b);
      const mid = autoCurve(0.5, x);
      expect(mid).toBeGreaterThanOrEqual(low!);
      expect(mid).toBeLessThanOrEqual(high!);
    }
  });
});

describe('auto tone mode', () => {
  it('is a custom tone mapping the renderer reads back as auto', () => {
    expect(TONE_MODES.find((mode) => mode.key === AUTO_TONE)?.mapping).toBe(CustomToneMapping);
    expect(toneKeyOf(CustomToneMapping)).toBe(AUTO_TONE);
  });

  it('keeps the weight in [0, 1], with nonsense reading as Neutral', () => {
    setAutoToneWeight(0.4);
    expect(autoToneUniforms.autoToneWeight.value).toBe(0.4);
    setAutoToneWeight(3);
    expect(autoToneUniforms.autoToneWeight.value).toBe(1);
    setAutoToneWeight(-1);
    expect(autoToneUniforms.autoToneWeight.value).toBe(0);
    setAutoToneWeight(Number.NaN);
    expect(autoToneUniforms.autoToneWeight.value).toBe(0);
  });
});
