import { describe, expect, it } from 'vitest';
import { firearmShotSound } from '../src/game/audioPresentation.ts';

describe('firearm audio presentation', () => {
  it('uses one shared AKM profile while retaining an item-specific extension point', () => {
    expect(firearmShotSound('debug_rifle_assault')).toEqual({
      event: 'gunshot',
      sourceLabel: 'debug_rifle_assault',
    });
    expect(firearmShotSound('future_weapon')).toEqual({ event: 'gunshot', sourceLabel: 'future_weapon' });
  });
});
