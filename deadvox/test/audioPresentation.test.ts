import { describe, expect, it } from 'vitest';
import {
  createRefusalPresenter,
  firearmShotSound,
  HEARTBEAT_TUNING,
  heartbeatForStamina,
} from '../src/game/audioPresentation.ts';

describe('heartbeat audio presentation', () => {
  it('uses the tuning anchors at the start stamina and exhaustion', () => {
    const { startStamina, normalGain, veryHighGain } = HEARTBEAT_TUNING;
    expect(heartbeatForStamina(startStamina).gain).toBe(normalGain);
    expect(heartbeatForStamina(0).gain).toBe(veryHighGain);
  });

  it('is silent above the ruled start and meets the ruled rate endpoints', () => {
    expect(heartbeatForStamina(100).gain).toBe(0);
    expect(heartbeatForStamina(86).gain).toBe(0);
    expect(heartbeatForStamina(85).bpm).toBe(60);
    expect(heartbeatForStamina(0).bpm).toBe(180);
    expect(heartbeatForStamina(85).gain).toBeGreaterThan(0);
  });

  it('raises rate and loudness monotonically from the start to exhaustion', () => {
    const samples = [85, 60, 30, 0].map(heartbeatForStamina);
    for (let index = 1; index < samples.length; index++) {
      expect(samples[index]!.bpm).toBeGreaterThanOrEqual(samples[index - 1]!.bpm);
      expect(samples[index]!.gain).toBeGreaterThanOrEqual(samples[index - 1]!.gain);
    }
    expect(samples.at(-1)!.gain).toBeGreaterThan(samples[0]!.gain);
  });

  it('interpolates rate and loudness linearly halfway to exhaustion', () => {
    const { startStamina, startHz, exhaustedHz, normalGain, veryHighGain } = HEARTBEAT_TUNING;
    const halfway = heartbeatForStamina(startStamina / 2);
    expect(halfway.bpm).toBeCloseTo(((startHz + exhaustedHz) / 2) * 60);
    expect(halfway.gain).toBeCloseTo((normalGain + veryHighGain) / 2);
  });
});

describe('refusal audio presentation', () => {
  it('debounces refusal sounds on simulation time', () => {
    let sounds = 0;
    const refuse = createRefusalPresenter(
      () => undefined,
      () => {
        sounds += 1;
        return true;
      },
      1,
    );

    refuse('fixture refusal', 10);
    expect(sounds).toBe(1);

    refuse('fixture refusal', 11);
    expect(sounds).toBe(2);

    refuse('repeated fixture refusal', 11.5);
    expect(sounds).toBe(2);
  });
});

describe('firearm audio presentation', () => {
  it('uses one shared AKM profile while retaining an item-specific extension point', () => {
    expect(firearmShotSound('rifle_assault')).toEqual({
      event: 'gunshot',
      sourceLabel: 'rifle_assault',
      listenerRelative: true,
    });
    expect(firearmShotSound('future_weapon', 'actor')).toEqual({
      event: 'gunshot',
      sourceLabel: 'future_weapon',
      listenerRelative: false,
    });
  });
});
