import { expect, it, vi } from 'vitest';
import { configFromUrl } from '../src/game/config.ts';

it('restricts handedness overrides to debug URL configuration', () => {
  expect(configFromUrl(new URLSearchParams('debug=1&handedness=left')).debugHandedness).toBe('left');
  expect(configFromUrl(new URLSearchParams('handedness=left')).debugHandedness).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&handedness=unknown')).debugHandedness).toBeUndefined();
});

it('limits wobble-flat ratios to debug URLs and the unit interval', () => {
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleFlat=0.18')).debugWobbleFlat).toBe(0.18);
  expect(configFromUrl(new URLSearchParams('wobbleFlat=0.18')).debugWobbleFlat).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleFlat=1.01')).debugWobbleFlat).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleFlat=0')).debugWobbleFlat).toBe(0);
});

it('limits OU wobble mode and strength overrides to debug URLs', () => {
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleNoise=ou')).debugWobbleNoise).toBe(true);
  expect(configFromUrl(new URLSearchParams('wobbleNoise=ou')).debugWobbleNoise).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleNoise=other')).debugWobbleNoise).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleNoise=ou&wobbleNoiseScale=2')).debugWobbleNoiseScale).toBe(2);
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleNoiseScale=2')).debugWobbleNoiseScale).toBeUndefined();
  expect(
    configFromUrl(new URLSearchParams('debug=1&wobbleNoise=ou&wobbleNoiseScale=-1')).debugWobbleNoiseScale,
  ).toBeUndefined();
  expect(
    configFromUrl(new URLSearchParams('debug=1&wobbleNoise=ou&wobbleNoiseScale=9')).debugWobbleNoiseScale,
  ).toBeUndefined();
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
