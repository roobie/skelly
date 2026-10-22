import type { Body } from '@mobgen/core/body.ts';
import { shamblerFigure } from '@mobgen/mob/shamblerFigure.ts';

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

const oldLawPitch = (height: number): number => Math.sqrt(OLD_LAW_REFERENCE_HEIGHT_METRES / height);

const debugVoicePitch = (search: string, param: 'voicePitch' | 'voicePitchLarge'): number => {
  const params = new URLSearchParams(search);
  if (params.get('debug') !== '1' || params.get('site') !== 'voice_size') {
    return 1;
  }
  const factor = Number(params.get(param));
  return Number.isFinite(factor) && factor > 0 ? factor : 1;
};

/**
 * The shambler voice-pitch law, calibrated on the bodies of the authored figure pool (`figureSeedPool`):
 * a falling power law between its smallest and tallest bodies, clamped around the smallest body's old-law pitch.
 */
// The tiny end is pitched 1.2× the old law and the large end keeps its old-law pitch; see DESIGN.md.
// The clamp envelope is 0.5×–1.3× that same old-law pitch at the tiny end.
export const shamblerVoiceLaw = (figureSeeds: readonly number[]) => {
  if (figureSeeds.length === 0) {
    throw new Error('The shambler voice law needs at least one authored figure seed');
  }
  const poolHeights = figureSeeds.map((seed) => bodyHeight(shamblerFigure(seed).realized.body));
  const smallestHeight = Math.min(...poolHeights);
  const tallestHeight = Math.max(...poolHeights);
  const smallestOldLawPitch = oldLawPitch(smallestHeight);
  const pitchClamp = [CLAMP_MIN_MULTIPLIER * smallestOldLawPitch, CLAMP_MAX_MULTIPLIER * smallestOldLawPitch] as const;
  const defaultSmallestAnchor = SMALLEST_ANCHOR_MULTIPLIER * smallestOldLawPitch;
  const defaultTallestAnchor = oldLawPitch(tallestHeight);
  const clampPitch = (pitch: number): number => Math.max(pitchClamp[0], Math.min(pitchClamp[1], pitch));

  const bodyPitch = (
    body: Body,
    search = typeof globalThis.location === 'undefined' ? '' : globalThis.location.search,
  ): number => {
    const height = bodyHeight(body);
    const smallestAnchor = clampPitch(defaultSmallestAnchor * debugVoicePitch(search, 'voicePitch'));
    const tallestAnchor = Math.min(
      smallestAnchor,
      clampPitch(defaultTallestAnchor * debugVoicePitch(search, 'voicePitchLarge')),
    );
    const exponent = Math.log(tallestAnchor / smallestAnchor) / Math.log(tallestHeight / smallestHeight);
    return clampPitch(smallestAnchor * (height / smallestHeight) ** exponent);
  };
  return { pitchClamp, bodyPitch };
};
