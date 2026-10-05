// A near-field-capped falloff for punctual lights. three.js lights a surface at distance d with 1 / d^decay,
// which grows without bound up close: a beam tuned to reach 10 m blows out a wall at 1 m. Here the distance is
// offset, 1 / (d + NEAR_FIELD_M)^decay, so close surfaces stop brightening while the far reach stays. The
// flashlight (render/flashlight.ts) and made lights both use punctual lights; the sun is directional and the rest
// is hemisphere light. One global patch of three's shared chunk covers every material these sources can hit:
// chunk meshes, mob actors, held items, glTF models and furniture all include `lights_pars_begin`.
//
// This relies on a three.js internal: the exact source line of `getDistanceAttenuation` (0.186). It is checked
// when installed and throws if three changed it, so an upgrade fails loudly instead of silently lighting wrong.

import { ShaderChunk } from 'three';

/** Metres added to the distance in the falloff; see render/flashlight.ts for how it and the intensity were chosen. */
export const NEAR_FIELD_M = 4;

const ORIGINAL = 'float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );';

/** `chunk` (three's `lights_pars_begin`) with the falloff's distance offset by `offset` metres. Throws if the line isn't there. */
export const withNearFieldFalloff = (chunk: string, offset: number): string => {
  if (!(Number.isFinite(offset) && offset >= 0)) {
    throw new Error(`lightFalloff: offset must be a finite number of metres, not ${offset}`);
  }
  if (!chunk.includes(ORIGINAL)) {
    throw new Error('lightFalloff: getDistanceAttenuation not found in three lights_pars_begin chunk');
  }
  return chunk.replace(
    ORIGINAL,
    `float distanceFalloff = 1.0 / max( pow( lightDistance + ${offset.toFixed(3)}, decayExponent ), 0.01 );`,
  );
};

let installed = false;

/** Patches three's shared light chunk once, before any material compiles. Safe to call again. */
export const installNearFieldFalloff = (): void => {
  if (installed) {
    return;
  }
  ShaderChunk.lights_pars_begin = withNearFieldFalloff(ShaderChunk.lights_pars_begin, NEAR_FIELD_M);
  installed = true;
};
