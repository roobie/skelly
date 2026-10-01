// Height fog: a mist that is dense near the low ground and thins with altitude, layered over
// three.js's linear distance fog. It lives in each scene material's own shader (patched in by
// `patchHeightFog`), so it needs no depth texture or extra pass and works with or without
// post-processing. The parameters are one shared set of uniforms, driven by `Mood`.

import {
  Color,
  type IUniform,
  type Material,
  ShaderChunk,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { type HotCategory, patchHotCheck } from './hotCheck.ts';

/** Mist is at full density at and below this height (metres); terrain spans about 8 to 56 m. */
export const HEIGHT_FOG_BASE_M = 16;
/** Metres of climb over which the mist thins by a factor e. */
export const HEIGHT_FOG_SCALE_M = 14;

/** `uHeightFog` = (density per metre at the base, 1 / scale, base height); density 0 turns it off. */
export const heightFogUniforms: { uHeightFog: IUniform<Vector3>; uHeightFogColor: IUniform<Color> } = {
  uHeightFog: { value: new Vector3(0, 1 / HEIGHT_FOG_SCALE_M, HEIGHT_FOG_BASE_M) },
  uHeightFogColor: { value: new Color() },
};

// The fragment's world height comes from its view-space position (a varying that three's own
// fog code doesn't provide), so instanced and patched vertex shaders need no model matrix.
// Rotating a view-space offset back to the world takes the transpose of the view rotation,
// whose y row is the y components of the view matrix's columns.
//
// The mist is mixed in before three's own fog_fragment, so the two compose as
// (1 - mist) * (1 - distance fog) and the far plane still ends in pure fog colour. The mist
// density is taken at the mean height of camera and fragment, a cheap stand-in for integrating
// along the ray.
//
// Both varyings the mist reads (vHeightFogView and three's vFogDepth) are `centroid`: under MSAA an
// edge pixel is shaded at its centre even outside the triangle, and on a grazing silhouette the
// extrapolated depth goes negative, so exp() blows up and mix() throws the colour far below zero
// (ACES then tone-maps it to white). three declares vFogDepth as a plain `varying float` in its two
// fog_pars chunks, so those chunks are re-emitted with centroid added. (three's GLSL3 prefix maps
// `varying` to out/in.) The clamp on the mist is the guard for drivers without proper centroid.
const centroidFogDepth = (chunk: string): string => {
  const patched = chunk.replace('varying float vFogDepth;', 'centroid varying float vFogDepth;');
  if (patched === chunk) {
    throw new Error('heightFog: vFogDepth declaration not found in three fog_pars chunk');
  }
  return patched;
};
const FOG_PARS_VERTEX = centroidFogDepth(ShaderChunk.fog_pars_vertex);
const FOG_PARS_FRAGMENT = centroidFogDepth(ShaderChunk.fog_pars_fragment);
const VERTEX_PARS = 'centroid varying vec3 vHeightFogView;';
const VERTEX_SET = `#ifdef USE_FOG
vHeightFogView = mvPosition.xyz;
#endif`;
const FRAGMENT_PARS = `uniform vec3 uHeightFog;
uniform vec3 uHeightFogColor;
centroid varying vec3 vHeightFogView;`;
const FRAGMENT_MIX = `#ifdef USE_FOG
if (uHeightFog.x > 0.0) {
  float hfY = cameraPosition.y + dot(vec3(viewMatrix[0].y, viewMatrix[1].y, viewMatrix[2].y), vHeightFogView);
  float hfH = max(0.5 * (cameraPosition.y + hfY) - uHeightFog.z, 0.0);
  float hfMist = clamp(1.0 - exp(-uHeightFog.x * vFogDepth * exp(-hfH * uHeightFog.y)), 0.0, 1.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uHeightFogColor, hfMist);
}
#endif`;

/** Adds the mist to a three.js built-in material's shader. Call from `onBeforeCompile`. */
export const patchHeightFog = (shader: WebGLProgramParametersWithUniforms, category: HotCategory = 'other'): void => {
  shader.uniforms.uHeightFog = heightFogUniforms.uHeightFog;
  shader.uniforms.uHeightFogColor = heightFogUniforms.uHeightFogColor;
  shader.vertexShader = shader.vertexShader
    .replace('#include <fog_pars_vertex>', `${FOG_PARS_VERTEX}\n${VERTEX_PARS}`)
    .replace('#include <fog_vertex>', `#include <fog_vertex>\n${VERTEX_SET}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <fog_pars_fragment>', `${FOG_PARS_FRAGMENT}\n${FRAGMENT_PARS}`)
    .replace('#include <fog_fragment>', `${FRAGMENT_MIX}\n#include <fog_fragment>`);
  // Every world material that gets the mist also gets the debug hot-pixel check (render/hotCheck.ts).
  patchHotCheck(shader, category);
};

/** A built-in material that has no shader patch of its own, fogged with the mist. */
export const withHeightFog = <T extends Material>(material: T, category: HotCategory = 'other'): T => {
  material.onBeforeCompile = (shader) => patchHeightFog(shader, category);
  material.customProgramCacheKey = () => 'deadvox-height-fog';
  return material;
};
