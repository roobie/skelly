import { ShaderChunk, ShaderLib } from 'three';
import type { BeamSpill } from '../core/schema.ts';

const MINIMUM_SOFTNESS = 0.1;

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
    float hotspot = smoothstep( coneCosine, max( penumbraCosine, mix( coneCosine, 1.0, ${MINIMUM_SOFTNESS} ) ), angleCosine );
    float spill = uFlashlightSpill.y * smoothstep( spillCosine, coneCosine, angleCosine );
    return mix( spill, 1.0, hotspot );`,
  )}`;
};

/** CPU reference of the shader profile, for angular property checks. */
export const flashlightConeAttenuation = (
  angle: number,
  beamHalfAngle: number,
  penumbra: number,
  profile: BeamSpill,
): number => {
  const smoothstep = (lo: number, hi: number, value: number): number => {
    const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
  };
  const coneCosine = Math.cos(beamHalfAngle);
  const angleCosine = Math.cos(angle);
  const hotspot = smoothstep(
    coneCosine,
    Math.max(Math.cos(beamHalfAngle * (1 - penumbra)), coneCosine + (1 - coneCosine) * MINIMUM_SOFTNESS),
    angleCosine,
  );
  const spill =
    profile.intensity * smoothstep(Math.cos(spillHalfAngle(beamHalfAngle, profile)), coneCosine, angleCosine);
  return spill + (1 - spill) * hotspot;
};

// UniformsUtils.clone preserves typed-array identity, unlike Vector2 or ordinary arrays.
// Every built-in material therefore observes active-light changes without shader recompiles.
const spillUniform = { value: new Float32Array([1, 0]) };
export const setFlashlightSpill = (profile: BeamSpill): void => {
  spillUniform.value[0] = profile.radiusRatio ** 2;
  spillUniform.value[1] = profile.intensity;
};

let installed = false;

/** Install before material compilation; shared chunks and uniforms cover all built-in receiving materials. */
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
