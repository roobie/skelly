import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_HUD_OPTIONS,
  HUD_OPTION_KEYS,
  type HudSettings,
  hudVisibility,
  readHudOptions,
  writeHudOptions,
} from '../src/ui/hudOptions.ts';

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

const onlyFirstOptionOff = (): HudSettings => ({
  ...DEFAULT_HUD_OPTIONS,
  [HUD_OPTION_KEYS[0]]: false,
  shown: true,
});

describe('HUD options', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('enables every HUD element by default', () => {
    expect(Object.values(DEFAULT_HUD_OPTIONS).every((enabled) => enabled)).toBe(true);
  });

  it.each(HUD_OPTION_KEYS)('enables only the %s element when its toggle is on', (key) => {
    const state = {
      ...Object.fromEntries(HUD_OPTION_KEYS.map((option) => [option, option === key])),
      shown: true,
    } as HudSettings;
    const visible = hudVisibility(state);
    expect(visible[key]).toBe(true);
    for (const other of HUD_OPTION_KEYS.filter((candidate) => candidate !== key)) {
      expect(visible[other]).toBe(false);
    }
  });

  it('keeps every current HUD element enabled in debug mode', () => {
    expect(hudVisibility({ ...DEFAULT_HUD_OPTIONS, shown: true }, true)).toEqual(
      Object.fromEntries(HUD_OPTION_KEYS.map((key) => [key, true])),
    );
  });

  it('hides every element while the HUD is hidden and shows each option as set once it is shown again', () => {
    const settings = onlyFirstOptionOff();
    const shownVisibility = hudVisibility(settings);
    settings.shown = false;
    expect(Object.values(hudVisibility(settings)).some(Boolean)).toBe(false);
    settings.shown = true;
    expect(hudVisibility(settings)).toEqual(shownVisibility);
  });

  it('keeps a hidden HUD and its options across a reload', () => {
    vi.stubGlobal('localStorage', storage());
    writeHudOptions({ ...onlyFirstOptionOff(), shown: false });
    expect(readHudOptions()).toEqual({ ...onlyFirstOptionOff(), shown: false });
  });

  it('reads saved options without a master switch as a shown HUD', () => {
    vi.stubGlobal('localStorage', storage());
    const { shown: _shown, ...options } = onlyFirstOptionOff();
    writeHudOptions(options as HudSettings);
    expect(readHudOptions()).toEqual(onlyFirstOptionOff());
  });
});
