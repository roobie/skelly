import { describe, expect, it } from 'vitest';
import { renderFreeFromUrl } from '../src/game/renderMode.ts';

describe('development render-free selection', () => {
  it('requires the explicit render=0 opt-in', () => {
    expect(renderFreeFromUrl(new URLSearchParams(), true)).toBe(false);
    expect(renderFreeFromUrl(new URLSearchParams('render=1'), true)).toBe(false);
    expect(renderFreeFromUrl(new URLSearchParams('render=0'), true)).toBe(true);
  });

  it('ignores render=0 outside development', () => {
    expect(renderFreeFromUrl(new URLSearchParams('render=0'), false)).toBe(false);
  });

  it('does not apply the play-only mode to benchmarks', () => {
    expect(renderFreeFromUrl(new URLSearchParams('bench=report&render=0'), true)).toBe(false);
    expect(renderFreeFromUrl(new URLSearchParams('bench=1&render=0'), true)).toBe(false);
  });
});
