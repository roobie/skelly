import { SHAMBLER_FIGURE_SEEDS, shamblerFigure } from '@mobgen/mob/shamblerFigure.ts';
import { describe, expect, it } from 'vitest';
import { SHAMBLER_PITCH_CLAMP, shamblerBodyPitch } from '../src/game/shamblerAudio.ts';

const figures = SHAMBLER_FIGURE_SEEDS.map((seed) => shamblerFigure(seed).realized.body);
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
    const measured = figures.map((body) => ({ height: bodyHeight(body), pitch: shamblerBodyPitch(body) }));

    for (const smaller of measured) {
      expect(smaller.pitch).toBeGreaterThanOrEqual(SHAMBLER_PITCH_CLAMP[0]);
      expect(smaller.pitch).toBeLessThanOrEqual(SHAMBLER_PITCH_CLAMP[1]);
      for (const larger of measured) {
        if (larger.height > smaller.height) {
          expect(larger.pitch).toBeLessThanOrEqual(smaller.pitch);
        }
      }
    }
  });

  it('lets the debug knobs tune their respective endpoint anchors', () => {
    const smallestPitch = shamblerBodyPitch(smallest, comparisonUrl);
    const tallestPitch = shamblerBodyPitch(tallest, comparisonUrl);
    expect(shamblerBodyPitch(smallest, `${comparisonUrl}&voicePitch=1.01`)).toBeGreaterThan(smallestPitch);
    expect(shamblerBodyPitch(tallest, `${comparisonUrl}&voicePitchLarge=0.99`)).toBeLessThan(tallestPitch);
    expect(shamblerBodyPitch(smallest, `${comparisonUrl}&voicePitchLarge=0.9`)).toBe(smallestPitch);
    expect(shamblerBodyPitch(tallest, `${comparisonUrl}&voicePitch=1.1`)).toBe(tallestPitch);
  });

  it('ignores both pitch knobs outside the debug voice-size site', () => {
    for (const body of figures) {
      const baseline = shamblerBodyPitch(body);
      expect(shamblerBodyPitch(body, '?site=voice_size&voicePitch=1.1&voicePitchLarge=0.9')).toBe(baseline);
      expect(shamblerBodyPitch(body, '?site=hamlet&debug=1&voicePitch=1.1&voicePitchLarge=0.9')).toBe(baseline);
    }
  });
});
