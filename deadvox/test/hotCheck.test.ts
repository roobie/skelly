import type { WebGLProgramParametersWithUniforms } from 'three';
import { describe, expect, it } from 'vitest';
import { patchHeightFog } from '../src/render/heightFog.ts';
import { HOT_CHECK_LIMIT, hotCheckOn, hotCheckUniform, patchHotCheck, setHotCheck } from '../src/render/hotCheck.ts';

// A declaration not preceded by `centroid `.
const PLAIN_FOG_DEPTH = /(?<!centroid )varying float vFogDepth;/;
const PLAIN_FOG_VIEW = /(?<!centroid )varying vec3 vHeightFogView;/;

const shader = (): WebGLProgramParametersWithUniforms =>
  ({
    uniforms: {},
    vertexShader: '#include <fog_pars_vertex>\n#include <fog_vertex>',
    fragmentShader:
      '#include <common>\n#include <fog_pars_fragment>\n#include <opaque_fragment>\n#include <tonemapping_fragment>\n#include <fog_fragment>',
  }) as unknown as WebGLProgramParametersWithUniforms;

describe('hot-pixel check patch', () => {
  it('checks the lit colour after it is written and before tone mapping, sharing one uniform', () => {
    const s = shader();
    patchHotCheck(s);
    const code = s.fragmentShader;
    expect(s.uniforms.uHotCheck).toBe(hotCheckUniform);
    expect(code).toContain('uniform float uHotCheck;');
    expect(code.indexOf('#include <opaque_fragment>')).toBeLessThan(code.indexOf('uHotCheck > 0.5'));
    expect(code.indexOf('uHotCheck > 0.5')).toBeLessThan(code.indexOf('#include <tonemapping_fragment>'));
    expect(code).toContain(`vec3(${HOT_CHECK_LIMIT}.0)`);
    expect(code).toContain('uniform vec3 uHotColor;');
  });

  it('checks again after fog_fragment, so values the mist or fog produce are caught', () => {
    const s = shader();
    patchHeightFog(s);
    const code = s.fragmentShader;
    const fog = code.indexOf('#include <fog_fragment>');
    expect(code.indexOf('uHotCheck > 0.5', fog)).toBeGreaterThan(fog);
    expect(code.split('uHotCheck > 0.5')).toHaveLength(3);
  });

  it('gives each material its own category colour without touching the shader text', () => {
    const chunk = shader();
    const mob = shader();
    patchHotCheck(chunk, 'chunk');
    patchHotCheck(mob, 'mob');
    expect(chunk.uniforms.uHotColor?.value.toArray()).toEqual([0, 1, 1]);
    expect(mob.uniforms.uHotColor?.value.toArray()).toEqual([0, 0, 1]);
    expect(chunk.fragmentShader).toBe(mob.fragmentShader);
  });

  it('comes with the height-fog patch, so every world material has it', () => {
    const s = shader();
    patchHeightFog(s);
    expect(s.uniforms.uHotCheck).toBe(hotCheckUniform);
  });

  it('declares the height-fog varyings centroid, once each, and clamps the mist', () => {
    const s = shader();
    patchHeightFog(s);
    for (const code of [s.vertexShader, s.fragmentShader]) {
      expect(code).toContain('centroid varying float vFogDepth;');
      expect(code).not.toMatch(PLAIN_FOG_DEPTH);
      expect(code.split('varying float vFogDepth;')).toHaveLength(2);
      expect(code).toContain('centroid varying vec3 vHeightFogView;');
      expect(code).not.toMatch(PLAIN_FOG_VIEW);
    }
    expect(s.fragmentShader).toContain('float hfMist = clamp(1.0 - exp(');
    expect(s.fragmentShader).toContain('0.0, 1.0);');
  });

  it('is a plain on/off switch, off by default', () => {
    expect(hotCheckOn()).toBe(false);
    setHotCheck(true);
    expect(hotCheckOn()).toBe(true);
    setHotCheck(false);
    expect(hotCheckUniform.value).toBe(0);
  });
});
