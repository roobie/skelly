import { describe, expect, it } from 'vitest';
import { isAudioSettingsShortcut } from '../src/game/audioSettings.ts';

describe('audio settings shortcut', () => {
  it('uses F9 and leaves F10 unhandled for the browser', () => {
    expect(isAudioSettingsShortcut('F9')).toBe(true);
    expect(isAudioSettingsShortcut('F10')).toBe(false);
  });
});
