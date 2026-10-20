import { describe, expect, it } from 'vitest';
import { realTimestamp } from '../src/core/time.ts';
import { startupContent } from './baseRegistry.ts';

const BUNDLED_CONTENT = startupContent();

import { shouldConfirmPageLeave } from '../src/ui/leaveConfirmation.ts';

const confirmationWindow = BUNDLED_CONTENT.registry.saves.get('autosave')!.leaveConfirmationRealSeconds;

describe('page-leave confirmation', () => {
  it('confirms only when a live save-backed game has gone beyond its recent completed save', () => {
    const clock = { now: 100 };
    const common = {
      gameRunning: true,
      gameDead: false,
      saveAvailable: true,
      lastSaveCompletedAtRealTimestamp: realTimestamp(clock.now - confirmationWindow),
      confirmationWindowRealSeconds: confirmationWindow,
    };

    expect(shouldConfirmPageLeave({ ...common, nowRealTimestamp: realTimestamp(clock.now) })).toBe(false);
    clock.now += 0.001;
    expect(shouldConfirmPageLeave({ ...common, nowRealTimestamp: realTimestamp(clock.now) })).toBe(true);
    expect(
      shouldConfirmPageLeave({
        ...common,
        gameRunning: false,
        nowRealTimestamp: realTimestamp(clock.now),
      }),
    ).toBe(false);
    expect(
      shouldConfirmPageLeave({
        ...common,
        gameDead: true,
        nowRealTimestamp: realTimestamp(clock.now),
      }),
    ).toBe(false);
    expect(
      shouldConfirmPageLeave({
        ...common,
        saveAvailable: false,
        lastSaveCompletedAtRealTimestamp: undefined,
        nowRealTimestamp: realTimestamp(clock.now),
      }),
    ).toBe(false);
    expect(
      shouldConfirmPageLeave({
        ...common,
        lastSaveCompletedAtRealTimestamp: undefined,
        nowRealTimestamp: realTimestamp(clock.now),
      }),
    ).toBe(true);
  });
});
