// Debug hot-pixel check: world materials paint any fragment whose lit colour is NaN, infinite,
// negative or above HOT_CHECK_LIMIT (linear, before tone mapping and fog) pure cyan, so a stray
// bright pixel can be told apart from background showing through (see Mood's crack check).
// One shared uniform drives every patched program, so toggling it never recompiles.

import type { IUniform, WebGLProgramParametersWithUniforms } from 'three';

/** Linear value above which a lit fragment counts as hot (a fully lit surface is about 1). */
export const HOT_CHECK_LIMIT = 8;

export const hotCheckUniform: IUniform<number> = { value: 0 };

export const setHotCheck = (on: boolean): void => {
  hotCheckUniform.value = on ? 1 : 0;
};

export const hotCheckOn = (): boolean => hotCheckUniform.value > 0.5;

const FRAGMENT_PARS = 'uniform float uHotCheck;';
// Written as a range test that NaN fails (every comparison with NaN is false), so it needs no
// isnan(), which an optimiser may assume never fires. Infinity fails the upper bound.
const FRAGMENT_CHECK = `
if (uHotCheck > 0.5) {
  vec3 hotRgb = gl_FragColor.rgb;
  if (!(all(greaterThanEqual(hotRgb, vec3(0.0))) && all(lessThanEqual(hotRgb, vec3(${HOT_CHECK_LIMIT}.0))))) {
    gl_FragColor.rgb = vec3(0.0, 1.0, 1.0);
  }
}`;

/**
 * Adds the check to a three.js built-in material's shader, right after the lit colour is written
 * (`opaque_fragment`) and before tone mapping and fog. Call from `onBeforeCompile`.
 */
export const patchHotCheck = (shader: WebGLProgramParametersWithUniforms): void => {
  shader.uniforms.uHotCheck = hotCheckUniform;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
    .replace('#include <opaque_fragment>', `#include <opaque_fragment>${FRAGMENT_CHECK}`);
};
