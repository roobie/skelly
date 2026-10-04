import type { Body } from '@mobgen/core/body.ts';
import { SHAMBLER_FIGURE_SEEDS, shamblerFigure } from '@mobgen/mob/shamblerFigure.ts';

const OLD_LAW_REFERENCE_HEIGHT_METRES = 1.7;
const SMALLEST_ANCHOR_MULTIPLIER = 1.2;
const CLAMP_MIN_MULTIPLIER = 0.5;
const CLAMP_MAX_MULTIPLIER = 1.3;

const bodyHeight = (body: Body): number => {
  const y = body.bones.flatMap(({ head, tail }) => [head[1], tail[1]]);
  if (y.length === 0) {
    throw new Error('Cannot size the voice of a body with no bones');
  }
  const height = Math.max(...y) - Math.min(...y);
  if (!(height > 0 && Number.isFinite(height))) {
    throw new Error('Cannot size the voice of a body with invalid height');
  }
  return height;
};

const POOL_HEIGHTS = SHAMBLER_FIGURE_SEEDS.map((seed) => bodyHeight(shamblerFigure(seed).realized.body));
const SMALLEST_HEIGHT = Math.min(...POOL_HEIGHTS);
const TALLEST_HEIGHT = Math.max(...POOL_HEIGHTS);
const oldLawPitch = (height: number): number => Math.sqrt(OLD_LAW_REFERENCE_HEIGHT_METRES / height);
const SMALLEST_OLD_LAW_PITCH = oldLawPitch(SMALLEST_HEIGHT);

// BR picked 1.2× the old law at the tiny end; the large end stays on its old-law pitch until the ear check.
// The clamp envelope is 0.5×–1.3× that same old-law pitch at the tiny end.
export const SHAMBLER_PITCH_CLAMP = [
  CLAMP_MIN_MULTIPLIER * SMALLEST_OLD_LAW_PITCH,
  CLAMP_MAX_MULTIPLIER * SMALLEST_OLD_LAW_PITCH,
] as const;
const DEFAULT_SMALLEST_ANCHOR = SMALLEST_ANCHOR_MULTIPLIER * SMALLEST_OLD_LAW_PITCH;
const DEFAULT_TALLEST_ANCHOR = oldLawPitch(TALLEST_HEIGHT);

const debugVoicePitch = (search: string, param: 'voicePitch' | 'voicePitchLarge'): number => {
  const params = new URLSearchParams(search);
  if (params.get('debug') !== '1' || params.get('site') !== 'voice_size') {
    return 1;
  }
  const factor = Number(params.get(param));
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
};

const clampPitch = (pitch: number): number =>
  Math.max(SHAMBLER_PITCH_CLAMP[0], Math.min(SHAMBLER_PITCH_CLAMP[1], pitch));

/** Interpolate a falling power law between the realized pool's smallest and tallest bodies. */
export const shamblerBodyPitch = (
  body: Body,
  search = typeof globalThis.location === 'undefined' ? '' : globalThis.location.search,
): number => {
  const height = bodyHeight(body);
  const smallestAnchor = clampPitch(DEFAULT_SMALLEST_ANCHOR * debugVoicePitch(search, 'voicePitch'));
  const tallestAnchor = Math.min(
    smallestAnchor,
    clampPitch(DEFAULT_TALLEST_ANCHOR * debugVoicePitch(search, 'voicePitchLarge')),
  );
  const exponent = Math.log(tallestAnchor / smallestAnchor) / Math.log(TALLEST_HEIGHT / SMALLEST_HEIGHT);
  const pitch = smallestAnchor * (height / SMALLEST_HEIGHT) ** exponent;
  return clampPitch(pitch);
};
