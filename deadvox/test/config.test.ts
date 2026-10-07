import { expect, it, vi } from 'vitest';
import { configFromUrl } from '../src/game/config.ts';

it('restricts handedness overrides to debug URL configuration', () => {
  expect(configFromUrl(new URLSearchParams('debug=1&handedness=left')).debugHandedness).toBe('left');
  expect(configFromUrl(new URLSearchParams('handedness=left')).debugHandedness).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&handedness=unknown')).debugHandedness).toBeUndefined();
});

it('uses content weathering by default and clamps only a debug URL override', () => {
  const contentValue = configFromUrl(new URLSearchParams()).weathering;
  expect(configFromUrl(new URLSearchParams('weathering=0')).weathering).toBe(contentValue);
  expect(configFromUrl(new URLSearchParams('debug=1&weathering=0')).weathering).toBe(0);
  expect(configFromUrl(new URLSearchParams('debug=1&weathering=2')).weathering).toBe(1);
});

it('warns and falls back when a debug start position is malformed', () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    expect(configFromUrl(new URLSearchParams('debug=1&at=12,,90')).debugStart).toBeUndefined();
    expect(warning).toHaveBeenCalledOnce();
  } finally {
    warning.mockRestore();
  }
});
