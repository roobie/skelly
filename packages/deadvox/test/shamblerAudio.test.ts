import { shamblerFigure } from '@mobgen/mob/shamblerFigure.ts';
import { describe, expect, it } from 'vitest';
import { shamblerVoiceLaw } from '../src/game/shamblerAudio.ts';
import { BASE_SENSE_TUNING } from './senseFixture.ts';

// Fixture seeds: the law is calibrated on whatever pool it is given, so this file keeps its own.
const FIGURE_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const { pitchClamp, bodyPitch } = shamblerVoiceLaw(FIGURE_SEEDS, BASE_SENSE_TUNING.shamblerVoice);
const figures = FIGURE_SEEDS.map((seed) => shamblerFigure(seed).realized.body);
const bodyHeight = (body: (typeof figures)[number]): number => {
  const y = body.bones.flatMap(({ head, tail }) => [head[1], tail[1]]);
  return Math.max(...y) - Math.min(...y);
};
const smallestHeight = Math.min(...figures.map(bodyHeight));
const tallestHeight = Math.max(...figures.map(bodyHeight));
const smallest = figures.find((body) => bodyHeight(body) === smallestHeight)!;
const tallest = figures.find((body) => bodyHeight(body) === tallestHeight)!;
const comparisonUrl = '?site=voice_size&debug=1';

describe('shambler body-sized audio', () => {
  it('decreases monotonically with realized body height and keeps every figure inside the clamp', () => {
    const measured = figures.map((body) => ({ height: bodyHeight(body), pitch: bodyPitch(body) }));

    for (const smaller of measured) {
      expect(smaller.pitch).toBeGreaterThanOrEqual(pitchClamp[0]);
      expect(smaller.pitch).toBeLessThanOrEqual(pitchClamp[1]);
      for (const larger of measured) {
        if (larger.height > smaller.height) {
          expect(larger.pitch).toBeLessThanOrEqual(smaller.pitch);
        }
      }
    }
  });

  it('lets the debug knobs tune their respective endpoint anchors', () => {
    const smallestPitch = bodyPitch(smallest, comparisonUrl);
    const tallestPitch = bodyPitch(tallest, comparisonUrl);
    expect(bodyPitch(smallest, `${comparisonUrl}&voicePitch=1.01`)).toBeGreaterThan(smallestPitch);
    expect(bodyPitch(tallest, `${comparisonUrl}&voicePitchLarge=0.99`)).toBeLessThan(tallestPitch);
    expect(bodyPitch(smallest, `${comparisonUrl}&voicePitchLarge=0.9`)).toBe(smallestPitch);
    expect(bodyPitch(tallest, `${comparisonUrl}&voicePitch=1.1`)).toBe(tallestPitch);
  });

  it('ignores both pitch knobs outside the debug voice-size site', () => {
    for (const body of figures) {
      const baseline = bodyPitch(body);
      expect(bodyPitch(body, '?site=voice_size&voicePitch=1.1&voicePitchLarge=0.9')).toBe(baseline);
      expect(bodyPitch(body, '?site=gauntlet&debug=1&voicePitch=1.1&voicePitchLarge=0.9')).toBe(baseline);
    }
  });
});
