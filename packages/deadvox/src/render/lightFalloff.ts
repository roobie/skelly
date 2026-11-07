// A near-field-capped falloff for punctual lights. three.js lights a surface at distance d with 1 / d^decay,
// which grows without bound up close: a beam tuned to reach 10 m blows out a wall at 1 m. Here the distance is
// offset by content's near field (`src/core/schema/senses.ts`, `illumination`), so close surfaces stop brightening while
// the far reach stays. The flashlight (render/flashlight.ts) and made lights both use punctual lights; the sun is directional and the rest
// is hemisphere light. One global patch of three's shared chunk covers every material these sources can hit:
// chunk meshes, mob actors, held items, glTF models and furniture all include `lights_pars_begin`.
//
// This relies on a three.js internal: the exact source line of `getDistanceAttenuation` (0.186). It is checked
// when installed and throws if three changed it, so an upgrade fails loudly instead of silently lighting wrong.

import { ShaderChunk } from 'three';

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

let installedOffset: number | undefined;

/**
 * Patches three's shared light chunk with `offset` metres, once, before any material compiles. Safe to call again
 * with the same offset; another offset throws, since compiled materials and the other patches of this chunk
 * (`src/render/flashlightCone.ts`) cannot follow it.
 */
export const installNearFieldFalloff = (offset: number): void => {
  if (installedOffset !== undefined) {
    if (installedOffset !== offset) {
      throw new Error(`lightFalloff: near field already installed at ${installedOffset} m, not ${offset} m`);
    }
    return;
  }
  ShaderChunk.lights_pars_begin = withNearFieldFalloff(ShaderChunk.lights_pars_begin, offset);
  installedOffset = offset;
};
