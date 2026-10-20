// The `auto` tone mapping: three's own Neutral and ACES Filmic curves, mixed by a weight that follows the time
// of day (core/sky.ts `tone`: 0 is Neutral, 1 is ACES). It is three's `CustomToneMapping`, whose body in
// `tonemapping_pars_fragment` is an empty stub; OutputPass defines CUSTOM_TONE_MAPPING for it and calls it.
// The stub is replaced here by a function calling `NeutralToneMapping` and `ACESFilmicToneMapping` from the same
// chunk, so each curve, including the exposure scaling it applies itself (ACES also divides by 0.6), is exactly
// what selecting it alone gives, and at weight 0 or 1 the result is identical.
//
// Only OutputPass (the post chain) can run it: the weight is a uniform of that pass's material, shared through
// `autoToneUniforms`. A plain material has no such uniform, so with post off render/mood.ts draws with the nearer
// of the two curves instead.
//
// This relies on a three.js internal: the exact text of the stub (0.186). It is checked when installed and throws
// if three changed it, so an upgrade fails loudly instead of silently tone mapping wrong (like lightFalloff.ts).

import { ShaderChunk } from 'three';

/** Shared with the OutputPass material (render/mood.ts); `Mood.setSky` writes the weight each frame. */
export const autoToneUniforms = { autoToneWeight: { value: 0 } };

const ORIGINAL = 'vec3 CustomToneMapping( vec3 color ) { return color; }';

const AUTO = `uniform float autoToneWeight;
vec3 CustomToneMapping( vec3 color ) {
	return mix( NeutralToneMapping( color ), ACESFilmicToneMapping( color ), autoToneWeight );
}`;

/** `chunk` (three's `tonemapping_pars_fragment`) with the custom tone mapping set to the blend. Throws if the stub isn't there. */
export const withAutoToneMapping = (chunk: string): string => {
  if (!chunk.includes(ORIGINAL)) {
    throw new Error('autoTone: CustomToneMapping stub not found in three tonemapping_pars_fragment chunk');
  }
  return chunk.replace(ORIGINAL, AUTO);
};

let installed = false;

/** Patches three's shared tone mapping chunk once, before any material compiles. Safe to call again. */
export const installAutoToneMapping = (): void => {
  if (installed) {
    return;
  }
  ShaderChunk.tonemapping_pars_fragment = withAutoToneMapping(ShaderChunk.tonemapping_pars_fragment);
  installed = true;
};

/** Clamps to [0, 1] and sets the weight; NaN reads as 0 (Neutral). */
export const setAutoToneWeight = (weight: number): void => {
  autoToneUniforms.autoToneWeight.value = Number.isFinite(weight) ? Math.min(1, Math.max(0, weight)) : 0;
};
