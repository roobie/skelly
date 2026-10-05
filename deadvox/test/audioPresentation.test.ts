import { describe, expect, it } from 'vitest';
import { firearmShotSound, HEARTBEAT_TUNING, heartbeatForStamina } from '../src/game/audioPresentation.ts';

describe('heartbeat audio presentation', () => {
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
    expect(HEARTBEAT_TUNING.startStamina).toBe(85);
  });
});

describe('firearm audio presentation', () => {
  it('uses one shared AKM profile while retaining an item-specific extension point', () => {
    expect(firearmShotSound('debug_rifle_assault')).toEqual({
      event: 'gunshot',
      sourceLabel: 'debug_rifle_assault',
      listenerRelative: true,
    });
    expect(firearmShotSound('future_weapon', 'actor')).toEqual({
      event: 'gunshot',
      sourceLabel: 'future_weapon',
      listenerRelative: false,
    });
  });
});
