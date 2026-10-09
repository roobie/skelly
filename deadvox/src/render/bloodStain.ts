// Blood stains on zombie bodies, patched into the crowd material after its gore tint (mobActors.ts). How much
// of a body is stained comes from the crowd texture (mobgen's crowd.ts, `packBloodiness`); which parts are
// stained comes from noise over the bone-local position, so the stains stay put as the body moves.
//
// Noise, not cells: ragged edges and blotches of varied size read as blood soaked into the body, where
// cell-shaped patches read as a pattern.

import { HASH31_GLSL } from './surfacePatterns.ts';

export const BLOOD_STAIN_FRAGMENT_DECLARATIONS = /* glsl */ `
varying float vCrowdBloodiness;
varying vec3 vCrowdLocal;
varying float vCrowdBone;
${HASH31_GLSL}

float stainNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float low = mix(
    mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
    mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x),
    f.y);
  float high = mix(
    mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
    mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x),
    f.y);
  return mix(low, high, f.z);
}

// How strongly a point is stained, 0 to 1. Two octaves of value noise make blotches about 20 cm across with
// ragged edges. The smoothstep spreads the noise's bell-shaped values roughly evenly over 0 to 1, so with the
// bloodiness as the threshold the stained share follows it: none at 0, nearly all of the body at 1. Inside a
// blotch the stain deepens away from its edge.
float bloodStain(float bloodiness, vec3 local, float bone) {
  if (bloodiness <= 0.0) return 0.0;
  vec3 p = local * 5.0 + vec3(bone * 7.31);
  float n = smoothstep(0.2, 0.8, 0.65 * stainNoise(p) + 0.35 * stainNoise(p * 2.3 + 17.17));
  return smoothstep(0.0, 0.08, bloodiness - n) * (0.55 + 0.3 * bloodiness);
}
`;

/** The stain over the body's colour, in the colour of the gore tint at a cut (mobgen's crowd.ts). */
export const BLOOD_STAIN_COLOR_FRAGMENT = /* glsl */ `
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.09, 0.06), bloodStain(vCrowdBloodiness, vCrowdLocal, vCrowdBone));
`;
