import type { WebGLProgramParametersWithUniforms } from 'three';
import { describe, expect, it } from 'vitest';
import { patchHeightFog } from '../src/render/heightFog.ts';
import { HOT_CHECK_LIMIT, hotCheckOn, hotCheckUniform, patchHotCheck, setHotCheck } from '../src/render/hotCheck.ts';

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
    expect(code).toContain('vec3(0.0, 1.0, 1.0)');
  });

  it('comes with the height-fog patch, so every world material has it', () => {
    const s = shader();
    patchHeightFog(s);
    expect(s.uniforms.uHotCheck).toBe(hotCheckUniform);
  });

  it('is a plain on/off switch, off by default', () => {
    expect(hotCheckOn()).toBe(false);
    setHotCheck(true);
    expect(hotCheckOn()).toBe(true);
    setHotCheck(false);
    expect(hotCheckUniform.value).toBe(0);
  });
});
