import { expect, it, vi } from 'vitest';
import { configFromUrl } from '../src/game/config.ts';

it('restricts handedness overrides to debug URL configuration', () => {
  expect(configFromUrl(new URLSearchParams('debug=1&handedness=left')).debugHandedness).toBe('left');
  expect(configFromUrl(new URLSearchParams('handedness=left')).debugHandedness).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&handedness=unknown')).debugHandedness).toBeUndefined();
});

it('uses content weathering by default and applies only debug URL overrides', () => {
  const content = configFromUrl(new URLSearchParams()).weathering;
  expect(content).toBeDefined();
  expect(configFromUrl(new URLSearchParams('weathering=0')).weathering?.strength).toBe(content?.strength);
  expect(configFromUrl(new URLSearchParams('debug=1&weathering=0')).weathering?.strength).toBe(0);
  expect(configFromUrl(new URLSearchParams('debug=1&weathering=2')).weathering?.strength).toBe(1);
});

it('turns off only world-scale weathering variation through a debug URL override', () => {
  const content = configFromUrl(new URLSearchParams()).weathering;
  expect(content).toBeDefined();
  expect(configFromUrl(new URLSearchParams('weatheringVariation=0')).weathering?.variationStrength).toBe(
    content?.variationStrength,
  );
  const variationOff = configFromUrl(new URLSearchParams('debug=1&weatheringVariation=0')).weathering;
  expect(variationOff?.strength).toBe(content?.strength);
  expect(variationOff?.variationStrength).toBe(0);
  expect(configFromUrl(new URLSearchParams('debug=1&weatheringVariation=2')).weathering?.variationStrength).toBe(
    content?.variationStrength,
  );
});

it('limits wobble-flat ratios to debug URLs and the unit interval', () => {
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleFlat=0.18')).debugWobbleFlat).toBe(0.18);
  expect(configFromUrl(new URLSearchParams('wobbleFlat=0.18')).debugWobbleFlat).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleFlat=1.01')).debugWobbleFlat).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleFlat=0')).debugWobbleFlat).toBe(0);
});

it('limits wobble-noise strength overrides to debug URLs and the accepted range', () => {
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleNoiseScale=2')).debugWobbleNoiseScale).toBe(2);
  expect(configFromUrl(new URLSearchParams('wobbleNoiseScale=2')).debugWobbleNoiseScale).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleNoiseScale=-1')).debugWobbleNoiseScale).toBeUndefined();
  expect(configFromUrl(new URLSearchParams('debug=1&wobbleNoiseScale=9')).debugWobbleNoiseScale).toBeUndefined();
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
