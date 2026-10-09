import { describe, expect, it } from 'vitest';
import { DEFAULT_HUD_OPTIONS, HUD_OPTION_KEYS, hudVisibility } from '../src/ui/hudOptions.ts';

describe('HUD options', () => {
  it('enables every HUD element by default', () => {
    expect(hudVisibility({ ...DEFAULT_HUD_OPTIONS })).toEqual(DEFAULT_HUD_OPTIONS);
  });

  it.each(HUD_OPTION_KEYS)('enables only the %s element when its toggle is on', (key) => {
    const state = Object.fromEntries(
      HUD_OPTION_KEYS.map((option) => [option, option === key]),
    ) as typeof DEFAULT_HUD_OPTIONS;
    const visible = hudVisibility(state);
    expect(visible[key]).toBe(true);
    for (const other of HUD_OPTION_KEYS.filter((candidate) => candidate !== key)) {
      expect(visible[other]).toBe(false);
    }
  });

  it('keeps every current HUD element enabled in debug mode', () => {
    expect(hudVisibility({ ...DEFAULT_HUD_OPTIONS }, true)).toEqual(
      Object.fromEntries(HUD_OPTION_KEYS.map((key) => [key, true])),
    );
  });
});
