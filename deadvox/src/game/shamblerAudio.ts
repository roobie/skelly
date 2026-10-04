import type { Body } from '@mobgen/core/body.ts';

export const SHAMBLER_PITCH_CLAMP = [0.8, 1.2] as const;
const REFERENCE_BODY_HEIGHT_METRES = 1.7;

/** Taller bodies resonate lower; square-root scaling keeps ordinary figure variation subtle. */
export const shamblerBodyPitch = (body: Body): number => {
  const y = body.bones.flatMap(({ head, tail }) => [head[1], tail[1]]);
  if (y.length === 0) {
    throw new Error('Cannot size the voice of a body with no bones');
  }
  const height = Math.max(...y) - Math.min(...y);
  if (!(height > 0 && Number.isFinite(height))) {
    throw new Error('Cannot size the voice of a body with invalid height');
  }
  const pitch = Math.sqrt(REFERENCE_BODY_HEIGHT_METRES / height);
  return Math.max(SHAMBLER_PITCH_CLAMP[0], Math.min(SHAMBLER_PITCH_CLAMP[1], pitch));
};
