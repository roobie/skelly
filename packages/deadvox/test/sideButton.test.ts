import { ForwardReleaseWatch, isForwardButton, PressDedupe } from '@skelly/engine/input';
import type { Item } from '@skelly/engine/inventory';
import { ActionMenu, HeldActionPress, radialEntries } from '@skelly/engine/sim';
import { describe, expect, it } from 'vitest';
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

describe('ForwardReleaseWatch', () => {
  it('releases a held forward press made while Left is down, once, so the next press is taken', () => {
    const choices = [
      { id: 'own', label: 'Use' },
      { id: 'unload', label: 'Unload' },
    ];
    const taps: string[] = [];
    const press = new HeldActionPress({
      menu: new ActionMenu(),
      item: () => ({ uid: 1 }) as Item,
      actions: () => choices,
      menuActions: () => radialEntries(choices, { own: 0, unload: 180 }),
      holdRealMs: Number.POSITIVE_INFINITY,
      tap: (hand) => taps.push(hand),
      act: () => undefined,
    });
    const watch = new ForwardReleaseWatch();
    const feed = (button: number, buttons: number) => {
      if (watch.released({ button, buttons })) {
        press.release('forward', 0);
      }
    };
    // Chromium's events for Forward down, Left down, a move, Forward up, Left up.
    feed(4, 16);
    expect(press.press('left', 'forward', 0)).toBe(true);
    feed(0, 17);
    feed(-1, 17);
    expect(taps).toEqual([]);
    feed(4, 1);
    feed(0, 0);
    expect(taps).toEqual(['left']);
    expect(press.press('left', 'forward', 0)).toBe(true);
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
