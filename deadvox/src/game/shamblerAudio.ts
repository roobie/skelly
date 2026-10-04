import type { Body } from '@mobgen/core/body.ts';
import { SHAMBLER_FIGURE_SEEDS, shamblerFigure } from '@mobgen/mob/shamblerFigure.ts';

export const SHAMBLER_PITCH_CLAMP = [0.8, 1.2] as const;
const REFERENCE_BODY_HEIGHT_METRES = 1.7;

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

const SMALLEST_COMPARISON_HEIGHT = Math.min(
  ...SHAMBLER_FIGURE_SEEDS.map((seed) => bodyHeight(shamblerFigure(seed).realized.body)),
);

const debugVoicePitch = (search: string): number => {
  const params = new URLSearchParams(search);
  if (params.get('debug') !== '1' || params.get('site') !== 'voice_size') {
    return 1;
  }
  const factor = Number(params.get('voicePitch'));
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
};

/** Taller bodies resonate lower; square-root scaling keeps ordinary figure variation subtle. */
export const shamblerBodyPitch = (
  body: Body,
  search = typeof globalThis.location === 'undefined' ? '' : globalThis.location.search,
): number => {
  const height = bodyHeight(body);
  const pitch = Math.sqrt(REFERENCE_BODY_HEIGHT_METRES / height);
  const clamped = Math.max(SHAMBLER_PITCH_CLAMP[0], Math.min(SHAMBLER_PITCH_CLAMP[1], pitch));
  return clamped * (height === SMALLEST_COMPARISON_HEIGHT ? debugVoicePitch(search) : 1);
};
