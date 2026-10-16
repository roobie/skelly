import { ShaderChunk, ShaderLib } from 'three';
import type { BeamSpill } from '../core/schema.ts';

/** Cone radius, not angle, grows by the spill ratio at every axial distance. */
export const spillHalfAngle = (beamHalfAngle: number, profile: BeamSpill): number =>
  Math.atan(profile.radiusRatio * Math.tan(beamHalfAngle));

const ORIGINAL = 'return smoothstep( coneCosine, penumbraCosine, angleCosine );';

/** One spot and one shadow map keep both lobes occluded by the same geometry. */
export const withFlashlightSpill = (chunk: string): string => {
  if (!chunk.includes(ORIGINAL)) {
    throw new Error('flashlightCone: spot attenuation not found in three lights_pars_begin chunk');
  }
  return `uniform vec2 uFlashlightSpill;\n${chunk.replace(
    ORIGINAL,
    `float spillCosine = coneCosine / sqrt( uFlashlightSpill.x + ( 1.0 - uFlashlightSpill.x ) * coneCosine * coneCosine );
    float hotspot = smoothstep( coneCosine, penumbraCosine, angleCosine );
    float spill = uFlashlightSpill.y * smoothstep( spillCosine, coneCosine, angleCosine );
    return mix( spill, 1.0, hotspot );`,
  )}`;
};

// UniformsUtils.clone preserves typed-array identity, unlike Vector2 or ordinary arrays.
// Every built-in material therefore observes active-light changes without shader recompiles.
const spillUniform = { value: new Float32Array([1, 0]) };
export const setFlashlightSpill = (profile: BeamSpill): void => {
  spillUniform.value[0] = profile.radiusRatio ** 2;
  spillUniform.value[1] = profile.intensity;
};

let installed = false;

/** Returns whether receiving materials need a different shader variant. */
export const installFlashlightSpill = (enabled = true): boolean => {
  if (installed === enabled) {
    return false;
  }
  if (enabled) {
    ShaderChunk.lights_pars_begin = withFlashlightSpill(ShaderChunk.lights_pars_begin);
  } else {
    const patched = withFlashlightSpill(ORIGINAL);
    ShaderChunk.lights_pars_begin = ShaderChunk.lights_pars_begin
      .replace('uniform vec2 uFlashlightSpill;\n', '')
      .replace(patched.replace('uniform vec2 uFlashlightSpill;\n', ''), ORIGINAL);
  }
  for (const shader of Object.values(ShaderLib)) {
    if (enabled) {
      shader.uniforms.uFlashlightSpill = spillUniform;
    } else {
      // biome-ignore lint/performance/noDelete: plain-cone shader variants must not carry spill uniforms.
      delete shader.uniforms.uFlashlightSpill;
    }
  }
  installed = enabled;
  return true;
};
