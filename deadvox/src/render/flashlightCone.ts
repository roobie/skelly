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
  // Neutral radius gives equal smoothstep edges; return the plain cone before that undefined GLSL operation.
  return `uniform vec2 uFlashlightSpill;\n${chunk.replace(
    ORIGINAL,
    `float hotspot = smoothstep( coneCosine, penumbraCosine, angleCosine );
    if ( uFlashlightSpill.y == 0.0 ) return hotspot;
    float spillCosine = coneCosine / sqrt( uFlashlightSpill.x + ( 1.0 - uFlashlightSpill.x ) * coneCosine * coneCosine );
    float spill = uFlashlightSpill.y * smoothstep( spillCosine, coneCosine, angleCosine );
    return mix( spill, 1.0, hotspot );`,
  )}`;
};

// UniformsUtils.clone preserves typed-array identity, unlike Vector2 or ordinary arrays.
// Every built-in material therefore observes active-light changes without shader recompiles.
const spillUniform = { value: new Float32Array([1, 0]) };
export const setFlashlightSpill = (profile: BeamSpill | undefined): void => {
  spillUniform.value[0] = profile ? profile.radiusRatio ** 2 : 1;
  spillUniform.value[1] = profile?.intensity ?? 0;
};

let installed = false;

/** Install before warm-up so existing and later-created materials share one program. */
export const installFlashlightSpill = (): void => {
  if (installed) {
    return;
  }
  ShaderChunk.lights_pars_begin = withFlashlightSpill(ShaderChunk.lights_pars_begin);
  for (const shader of Object.values(ShaderLib)) {
    shader.uniforms.uFlashlightSpill = spillUniform;
  }
  installed = true;
};
