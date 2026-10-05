import { describe, expect, it } from 'vitest';
import { firearmShotSound, HEARTBEAT_QUIET_FLOOR, heartbeatForStamina } from '../src/game/audioPresentation.ts';

describe('heartbeat audio presentation', () => {
  it('gets no slower or quieter as stamina falls and is quiet at full stamina', () => {
    const samples = [0, 20, 40, 60, 80, 100].map(heartbeatForStamina);
    for (let index = 1; index < samples.length; index++) {
      expect(samples[index - 1]!.bpm).toBeGreaterThanOrEqual(samples[index]!.bpm);
      expect(samples[index - 1]!.gain).toBeGreaterThanOrEqual(samples[index]!.gain);
    }
    expect(heartbeatForStamina(100).gain).toBeLessThan(HEARTBEAT_QUIET_FLOOR);
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
