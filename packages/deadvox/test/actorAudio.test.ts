import { actorVoiceLaw } from '@skelly/engine/internal/game/actorAudio.ts';
import { describe, expect, it } from 'vitest';
import { BASE_SENSE_TUNING } from './senseFixture.ts';

// Fixture bodies: the law is calibrated on whatever pool it is given, so this file keeps its own.
const bodies = [1.52, 1.61, 1.68, 1.74, 1.79, 1.86, 1.93, 2.01].map((height) => ({ height }));
const { pitchClamp, bodyPitch } = actorVoiceLaw(bodies, BASE_SENSE_TUNING.actorVoice);
const smallest = bodies[0]!;
const tallest = bodies.at(-1)!;

describe('shambler body-sized audio', () => {
  it('decreases monotonically with body height and keeps every body inside the clamp', () => {
    const measured = bodies.map((body) => ({ height: body.height, pitch: bodyPitch(body) }));

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
    const smallestPitch = bodyPitch(smallest);
    const tallestPitch = bodyPitch(tallest);
    expect(bodyPitch(smallest, { voicePitch: 1.01 })).toBeGreaterThan(smallestPitch);
    expect(bodyPitch(tallest, { voicePitchLarge: 0.99 })).toBeLessThan(tallestPitch);
    expect(bodyPitch(smallest, { voicePitchLarge: 0.9 })).toBeCloseTo(smallestPitch, 12);
    expect(bodyPitch(tallest, { voicePitch: 1.1 })).toBeCloseTo(tallestPitch, 12);
  });

  it('gives an equal-height pool the midpoint pitch of a converging range', () => {
    const height = 1.8;
    const converging = actorVoiceLaw([{ height }, { height: height * (1 + 1e-9) }], BASE_SENSE_TUNING.actorVoice);
    const midpoint = converging.bodyPitch({ height: height * (1 + 5e-10) });
    for (const pool of [[{ height }], [{ height }, { height }]]) {
      expect(actorVoiceLaw(pool, BASE_SENSE_TUNING.actorVoice).bodyPitch({ height })).toBeCloseTo(midpoint, 6);
    }
  });

  it('refuses a body without a positive height', () => {
    expect(() => bodyPitch({ height: 0 })).toThrow();
  });
});
