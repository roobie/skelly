// Height fog: a mist that is dense near the low ground and thins with altitude, layered over
// three.js's linear distance fog. It lives in each scene material's own shader (patched in by
// `patchHeightFog`), so it needs no depth texture or extra pass and works with or without
// post-processing. The parameters are one shared set of uniforms, driven by `Mood`.

import {
  Color,
  type IUniform,
  type Material,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import type { LookDefaultsDef } from '../core/schema.ts';
import { type HotCategory, patchHotCheck } from './hotCheck.ts';

export type HeightFogTuning = LookDefaultsDef['heightFog'];

/** `uHeightFog` = (density per metre at the base, 1 / scale, base height); density 0 turns it off. */
export const heightFogUniforms: { uHeightFog: IUniform<Vector3>; uHeightFogColor: IUniform<Color> } = {
  uHeightFog: { value: new Vector3() },
  uHeightFogColor: { value: new Color() },
};

/** Sets the authored height-fog shape before scene materials compile. */
export const setHeightFogTuning = ({ baseMetres, scaleMetres }: HeightFogTuning): void => {
  heightFogUniforms.uHeightFog.value.set(0, 1 / scaleMetres, baseMetres);
};

// The fragment's world height comes from its view-space position (a varying that three's own
// fog code doesn't provide), so instanced and patched vertex shaders need no model matrix.
// Rotating a view-space offset back to the world takes the transpose of the view rotation,
// whose y row is the view matrix's second column.
//
// The mist is mixed in before three's own fog_fragment, so the two compose as
// (1 - mist) * (1 - distance fog) and the far plane still ends in pure fog colour. It goes as far
// as the distance fog (render/distanceFog.ts, `fogDistance`). The mist density is taken at the
// mean height of camera and fragment, a cheap stand-in for integrating along the ray.
//
// vHeightFogView is `centroid`: under MSAA an edge pixel is shaded at its centre even outside the
// triangle, and centroid keeps its height inside it. (three's GLSL3 prefix maps `varying` to out/in.)
// The mist's distance is never negative and its height above the base is clamped at zero, so exp()
// stays in range; a mist outside [0, 1] would throw the colour below zero, which ACES tone-maps to
// white, and the clamp on the mist guards against that.
const VERTEX_PARS = 'centroid varying vec3 vHeightFogView;';
const VERTEX_SET = `#ifdef USE_FOG
vHeightFogView = mvPosition.xyz;
#endif`;
const FRAGMENT_PARS = `uniform vec3 uHeightFog;
uniform vec3 uHeightFogColor;
centroid varying vec3 vHeightFogView;`;
const FRAGMENT_MIX = `#ifdef USE_FOG
if (uHeightFog.x > 0.0) {
  float hfY = cameraPosition.y + dot(viewMatrix[1].xyz, vHeightFogView);
  float hfH = max(0.5 * (cameraPosition.y + hfY) - uHeightFog.z, 0.0);
  float hfMist = clamp(1.0 - exp(-uHeightFog.x * fogDistance() * exp(-hfH * uHeightFog.y)), 0.0, 1.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uHeightFogColor, hfMist);
}
#endif`;

/** Adds the mist to a three.js built-in material's shader. Call from `onBeforeCompile`. */
export const patchHeightFog = (shader: WebGLProgramParametersWithUniforms, category: HotCategory = 'other'): void => {
  shader.uniforms.uHeightFog = heightFogUniforms.uHeightFog;
  shader.uniforms.uHeightFogColor = heightFogUniforms.uHeightFogColor;
  shader.vertexShader = shader.vertexShader
    .replace('#include <fog_pars_vertex>', `#include <fog_pars_vertex>\n${VERTEX_PARS}`)
    .replace('#include <fog_vertex>', `#include <fog_vertex>\n${VERTEX_SET}`);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <fog_pars_fragment>', `#include <fog_pars_fragment>\n${FRAGMENT_PARS}`)
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
