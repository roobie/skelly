import { describe, expect, it } from 'vitest';
import { isForwardButton, PressDedupe } from '../src/core/sideButton.ts';
import { formatMouseDiag } from '../src/debug/mouseDiag.ts';

describe('isForwardButton', () => {
  it('recognises button 4', () => {
    expect(isForwardButton({ button: 4, buttons: 16 })).toBe(true);
    expect(isForwardButton({ button: 4, buttons: 0 })).toBe(true);
  });
  it('falls back to the buttons bit when button is not a primary one', () => {
    expect(isForwardButton({ button: -1, buttons: 16 })).toBe(true);
  });
  it('ignores back, primary buttons, and a left click while forward is held', () => {
    expect(isForwardButton({ button: 3, buttons: 8 })).toBe(false);
    expect(isForwardButton({ button: 0, buttons: 1 })).toBe(false);
    expect(isForwardButton({ button: 0, buttons: 17 })).toBe(false);
  });
});

describe('PressDedupe', () => {
  it('accepts one of a pointerdown/mousedown pair and the next separate press', () => {
    const d = new PressDedupe(80);
    expect(d.accept(1000)).toBe(true);
    expect(d.accept(1001)).toBe(false);
    expect(d.accept(1200)).toBe(true);
  });
});

describe('formatMouseDiag', () => {
  it('reports the last event', () => {
    expect(formatMouseDiag({ type: 'mousedown', button: 4, buttons: 16, targetTag: 'canvas', locked: true })).toBe(
      'mouse: mousedown button=4 buttons=16 target=canvas locked=yes',
    );
    expect(formatMouseDiag(undefined)).toContain('no button event');
  });
});
