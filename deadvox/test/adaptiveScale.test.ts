import { expect, it } from 'vitest';
import type { GraphicsOptions } from '../src/core/graphics.ts';
import { AdaptiveScale } from '../src/render/adaptiveScale.ts';

const policy: GraphicsOptions['renderScale'] = {
  label: 'Fixture',
  default: 0.7,
  min: 0.2,
  max: 1,
  adaptive: { enabled: true, targetRealMs: 12, min: 0.3, max: 0.9, step: 0.04, hysteresisRealMs: 2, sampleWindow: 5 },
};
const window = (control: AdaptiveScale, ms: number) => {
  const { scale } = control;
  for (let i = 0; i < policy.adaptive.sampleWindow; i++) {
    control.sample(ms, scale);
  }
};

it('requires sustained GPU overload, then recovers when the next size has headroom', () => {
  const control = new AdaptiveScale(policy);
  const start = control.scale;
  control.sample(policy.adaptive.targetRealMs * 2, start);
  expect(control.scale).toBe(start);
  window(control, policy.adaptive.targetRealMs * 2);
  expect(control.scale).toBeLessThan(start);
  const lower = control.scale;
  window(control, policy.adaptive.targetRealMs / 4);
  expect(control.scale).toBeGreaterThan(lower);
});

it('holds resolution throughout both sides of the hysteresis band', () => {
  const control = new AdaptiveScale(policy);
  const start = control.scale;
  for (const direction of [-1, 1]) {
    window(control, policy.adaptive.targetRealMs + (direction * policy.adaptive.hysteresisRealMs) / 2);
    expect(control.scale).toBe(start);
  }
});

it('clamps sustained load and recovery to content bounds', () => {
  const control = new AdaptiveScale(policy);
  const windows = Math.ceil((policy.adaptive.max - policy.adaptive.min) / policy.adaptive.step) + 1;
  for (let i = 0; i < windows; i++) {
    window(control, policy.adaptive.targetRealMs * 2);
  }
  expect(control.scale).toBe(policy.adaptive.min);
  for (let i = 0; i < windows; i++) {
    window(control, 0);
  }
  expect(control.scale).toBe(policy.adaptive.max);
});

it('ignores delayed old-size and invalid timings', () => {
  const control = new AdaptiveScale(policy);
  const old = control.scale;
  window(control, policy.adaptive.targetRealMs * 2);
  const lower = control.scale;
  for (let i = 0; i < policy.adaptive.sampleWindow; i++) {
    control.sample(0, old);
    control.sample(Number.NaN, lower);
  }
  expect(control.scale).toBe(lower);
});

it('yields to explicit fixed choices and resumes content ownership when cleared', () => {
  const control = new AdaptiveScale(policy);
  const chosen = policy.min;
  control.setChoice(chosen, true);
  window(control, 0);
  expect(control.scale).toBe(chosen);
  control.setChoice(policy.default, false);
  expect(control.scale).toBe(policy.default);
  window(control, policy.adaptive.targetRealMs * 2);
  expect(control.scale).toBeLessThan(policy.default);
});

it('keeps the content fixed default when adaptation is disabled', () => {
  const control = new AdaptiveScale({ ...policy, adaptive: { ...policy.adaptive, enabled: false } });
  window(control, policy.adaptive.targetRealMs * 2);
  expect(control.scale).toBe(policy.default);
  window(control, 0);
  expect(control.scale).toBe(policy.default);
});
