import { expect, it } from 'vitest';
import { handlingWaitMilliseconds } from './browser/handling-budget.ts';

it('handling wall bounds scale with queued work and observed rendering pace, not a flat 30 seconds', () => {
  // Real pump fixture: H queues 2.3s stow + 1.7s wield; a roughly 1s rendered
  // frame advances at most 0.1s, so the old 30s bound expires before completion.
  const workSeconds = 4;
  const slow = handlingWaitMilliseconds(workSeconds, 1000);
  const fast = handlingWaitMilliseconds(workSeconds, 16);
  expect(slow).toBeGreaterThan(handlingWaitMilliseconds(workSeconds / 2, 1000));
  expect(slow).toBeGreaterThan(fast);
  // Fast rendering must not make the bound shorter than the fixture's simulated work.
  expect(fast).toBeGreaterThanOrEqual(workSeconds * 1000);
});
