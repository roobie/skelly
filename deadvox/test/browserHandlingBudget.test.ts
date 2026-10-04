import { expect, it } from 'vitest';
import { handlingWaitMilliseconds } from './browser/handling-budget.ts';

it('handling wall bounds scale with queued work and observed rendering pace, not a flat 30 seconds', () => {
  // Real pump fixture: H queues 2.3s stow + 1.7s wield; a roughly 1s rendered
  // frame advances at most 0.1s, so the old 30s bound expires before completion.
  expect(handlingWaitMilliseconds(4, 1000)).toBe(63_000);
  expect(handlingWaitMilliseconds(2, 1000)).toBe(33_000);
  // Fast rendering must not make the bound shorter than the simulated work.
  expect(handlingWaitMilliseconds(4, 16)).toBe(6300);
});
