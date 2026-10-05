import { describe, expect, it } from 'vitest';
import { createRefusalPresenter, firearmShotSound } from '../src/game/audioPresentation.ts';
import { DEFAULT_HUD_OPTIONS, hudVisibility } from '../src/ui/hudOptions.ts';
import { playPromptText } from '../src/ui/playHud.ts';

describe('refusal audio presentation', () => {
  it('plays with messages off or on and debounces against simulation time', () => {
    let notice = '';
    let sounds = 0;
    const refuse = createRefusalPresenter(
      (text) => {
        notice = text;
      },
      () => {
        sounds += 1;
        return true;
      },
      1,
    );
    const state = () => ({
      now: 1,
      notice,
      noticeUntil: 2,
      interactionHint: undefined,
      interruption: undefined,
      resting: false,
    });

    refuse('fixture refusal with messages off', 10);
    expect(playPromptText(state(), DEFAULT_HUD_OPTIONS)).toBe('');
    expect(sounds).toBe(1);

    refuse('fixture refusal with messages on', 11);
    expect(playPromptText(state(), hudVisibility({ ...DEFAULT_HUD_OPTIONS, messages: true }))).toContain(notice);
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
