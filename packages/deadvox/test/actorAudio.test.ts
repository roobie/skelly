import { describe, expect, it } from 'vitest';
import { actorVoiceLaw } from '../src/game/actorAudio.ts';
import { BASE_SENSE_TUNING } from './senseFixture.ts';

// Fixture bodies: the law is calibrated on whatever pool it is given, so this file keeps its own.
const bodies = [1.52, 1.61, 1.68, 1.74, 1.79, 1.86, 1.93, 2.01].map((height) => ({ height }));
const { pitchClamp, bodyPitch } = actorVoiceLaw(bodies, BASE_SENSE_TUNING.actorVoice);
const smallest = bodies[0]!;
const tallest = bodies.at(-1)!;
const comparisonUrl = '?site=voice_size&debug=1';

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
    const smallestPitch = bodyPitch(smallest, comparisonUrl);
    const tallestPitch = bodyPitch(tallest, comparisonUrl);
    expect(bodyPitch(smallest, `${comparisonUrl}&voicePitch=1.01`)).toBeGreaterThan(smallestPitch);
    expect(bodyPitch(tallest, `${comparisonUrl}&voicePitchLarge=0.99`)).toBeLessThan(tallestPitch);
    expect(bodyPitch(smallest, `${comparisonUrl}&voicePitchLarge=0.9`)).toBeCloseTo(smallestPitch, 12);
    expect(bodyPitch(tallest, `${comparisonUrl}&voicePitch=1.1`)).toBeCloseTo(tallestPitch, 12);
  });

  it('ignores both pitch knobs outside the debug voice-size site', () => {
    for (const body of bodies) {
      const baseline = bodyPitch(body);
      expect(bodyPitch(body, '?site=voice_size&voicePitch=1.1&voicePitchLarge=0.9')).toBe(baseline);
      expect(bodyPitch(body, '?site=gauntlet&debug=1&voicePitch=1.1&voicePitchLarge=0.9')).toBe(baseline);
    }
  });

  it('refuses a body without a positive height', () => {
    expect(() => bodyPitch({ height: 0 })).toThrow();
  });
});
