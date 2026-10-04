import { describe, expect, it } from 'vitest';
import { SHAMBLER_FIGURE_SEEDS, shamblerFigure } from '@mobgen/mob/shamblerFigure.ts';
import { SHAMBLER_PITCH_CLAMP, shamblerBodyPitch } from '../src/game/shamblerAudio.ts';

const bodyHeight = (body: ReturnType<typeof shamblerFigure>['realized']['body']): number => {
  const y = body.bones.flatMap(({ head, tail }) => [head[1], tail[1]]);
  return Math.max(...y) - Math.min(...y);
};

describe('shambler body-sized audio', () => {
  it('never raises pitch for a larger body and keeps every figure within the pitch clamp', () => {
    const figures = SHAMBLER_FIGURE_SEEDS.map((seed) => shamblerFigure(seed).realized.body);
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
});
