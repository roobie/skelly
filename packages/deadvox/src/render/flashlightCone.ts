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
  return chunk.replace(
    ORIGINAL,
    `float hotspot = smoothstep( coneCosine, penumbraCosine, angleCosine );
    if ( spillProfile.y == 0.0 ) return hotspot;
    float spillCosine = coneCosine / sqrt( spillProfile.x + ( 1.0 - spillProfile.x ) * coneCosine * coneCosine );
    float spill = spillProfile.y * smoothstep( spillCosine, coneCosine, angleCosine );
    return mix( spill, 1.0, hotspot );`,
  );
};

// UniformsUtils.clone preserves typed-array identity, unlike Vector2 or ordinary arrays.
// Every built-in material therefore observes active-light changes without shader recompiles.
const spillUniform = { value: new Float32Array() };
export const setFlashlightSpill = (profiles: readonly (BeamSpill | undefined)[]): void => {
  for (const [index, profile] of profiles.entries()) {
    spillUniform.value[index * 2] = profile ? profile.radiusRatio ** 2 : 1;
    spillUniform.value[index * 2 + 1] = profile?.intensity ?? 0;
  }
};

let installed = false;

/** Install before warm-up so existing and later-created materials share one program. */
export const installFlashlightSpill = (beamLimit: number): void => {
  if (spillUniform.value.length !== beamLimit * 2) {
    spillUniform.value = new Float32Array(beamLimit * 2);
    setFlashlightSpill(Array.from({ length: beamLimit }));
  }
  if (installed) {
    return;
  }
  const pars = ShaderChunk.lights_pars_begin;
  const fragment = ShaderChunk.lights_fragment_begin;
  const attenuationArgs = 'const in float angleCosine )';
  const infoArgs = 'const in SpotLight spotLight, const in vec3 geometryPosition,';
  const attenuationCall = 'spotLight.coneCos, spotLight.penumbraCos, angleCos );';
  const infoCall = 'getSpotLightInfo( spotLight, geometryPosition, directLight );';
  if (
    !([attenuationArgs, infoArgs, attenuationCall].every((text) => pars.includes(text)) && fragment.includes(infoCall))
  ) {
    throw new Error('flashlightCone: spot light shader interface not found');
  }
  ShaderChunk.lights_pars_begin = `#if NUM_SPOT_LIGHTS > 0\nuniform vec2 uFlashlightSpill[ NUM_SPOT_LIGHTS ];\n#endif\n${withFlashlightSpill(
    pars,
  )
    .replace(attenuationArgs, 'const in float angleCosine, const in vec2 spillProfile )')
    .replace(infoArgs, 'const in SpotLight spotLight, const in vec3 geometryPosition, const in vec2 spillProfile,')
    .replace(attenuationCall, 'spotLight.coneCos, spotLight.penumbraCos, angleCos, spillProfile );')}`;
  ShaderChunk.lights_fragment_begin = fragment.replace(
    infoCall,
    'getSpotLightInfo( spotLight, geometryPosition, uFlashlightSpill[ i ], directLight );',
  );
  for (const shader of Object.values(ShaderLib)) {
    shader.uniforms.uFlashlightSpill = spillUniform;
  }
  installed = true;
};
