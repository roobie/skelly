import { describe, expect, it } from 'vitest';
import { createRefusalPresenter, firearmShotSound } from '../src/game/audioPresentation.ts';

describe('refusal audio presentation', () => {
  it('debounces refusal sounds on simulation time', () => {
    let sounds = 0;
    const refuse = createRefusalPresenter(
      () => {},
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
