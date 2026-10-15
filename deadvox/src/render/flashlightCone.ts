import { ShaderChunk } from 'three';

export const FLASHLIGHT_SPILL = { radiusRatio: 1.5, intensity: 0.18, minimumSoftness: 0.1 } as const;

/** Cone radius, not angle, grows by the spill ratio at every axial distance. */
export const spillHalfAngle = (beamHalfAngle: number): number =>
  Math.atan(FLASHLIGHT_SPILL.radiusRatio * Math.tan(beamHalfAngle));

const ORIGINAL = 'return smoothstep( coneCosine, penumbraCosine, angleCosine );';

/** One spot and one shadow map keep both lobes occluded by the same geometry. */
export const withFlashlightSpill = (chunk: string): string => {
  if (!chunk.includes(ORIGINAL)) {
    throw new Error('flashlightCone: spot attenuation not found in three lights_pars_begin chunk');
  }
  const { radiusRatio, intensity, minimumSoftness } = FLASHLIGHT_SPILL;
  return chunk.replace(
    ORIGINAL,
    `float spillCosine = coneCosine / sqrt( ${radiusRatio ** 2} + ${1 - radiusRatio ** 2} * coneCosine * coneCosine );
    float hotspot = smoothstep( coneCosine, max( penumbraCosine, mix( coneCosine, 1.0, ${minimumSoftness} ) ), angleCosine );
    float spill = ${intensity} * smoothstep( spillCosine, coneCosine, angleCosine );
    return mix( spill, 1.0, hotspot );`,
  );
};

/** CPU reference of the shader profile, for angular property checks. */
export const flashlightConeAttenuation = (angle: number, beamHalfAngle: number, penumbra: number): number => {
  const smoothstep = (lo: number, hi: number, value: number): number => {
    const t = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
  };
  const coneCosine = Math.cos(beamHalfAngle);
  const angleCosine = Math.cos(angle);
  const hotspot = smoothstep(
    coneCosine,
    Math.max(
      Math.cos(beamHalfAngle * (1 - penumbra)),
      coneCosine + (1 - coneCosine) * FLASHLIGHT_SPILL.minimumSoftness,
    ),
    angleCosine,
  );
  const spill =
    FLASHLIGHT_SPILL.intensity * smoothstep(Math.cos(spillHalfAngle(beamHalfAngle)), coneCosine, angleCosine);
  return spill + (1 - spill) * hotspot;
};

let installed = false;

/** Install before material compilation; the shared spot chunk covers every receiving material. */
export const installFlashlightSpill = (): void => {
  if (installed) {
    return;
  }
  ShaderChunk.lights_pars_begin = withFlashlightSpill(ShaderChunk.lights_pars_begin);
  installed = true;
};
