import { describe, expect, it } from 'vitest';
import { syncKeyboardLock } from '../src/ui/fullscreenOptions.ts';

describe('keyboard lock follows fullscreen', () => {
  it('locks while fullscreen is held, unlocks when it ends, and never locks Escape', () => {
    const calls: string[] = [];
    const keyboard = {
      lock: (codes: string[]) => {
        calls.push(`lock:${codes.includes('Escape')}`);
        return Promise.resolve();
      },
      unlock: () => calls.push('unlock'),
    };
    syncKeyboardLock({ fullscreenElement: {} as Element }, keyboard);
    syncKeyboardLock({ fullscreenElement: null }, keyboard);
    expect(calls).toEqual(['lock:false', 'unlock']);
  });

  it('does nothing where the Keyboard Lock API is missing', () => {
    expect(() => syncKeyboardLock({ fullscreenElement: {} as Element }, undefined)).not.toThrow();
    expect(() => syncKeyboardLock({ fullscreenElement: null }, {})).not.toThrow();
  });
});
