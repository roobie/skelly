import { describe, expect, it } from 'vitest';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { shouldConfirmPageLeave } from '../src/ui/leaveConfirmation.ts';

const confirmationWindow = BUNDLED_CONTENT.registry.saves.get('autosave')!.leaveConfirmationRealSeconds;

describe('page-leave confirmation', () => {
  it('confirms only when a live save-backed game has gone beyond its recent completed save', () => {
    const clock = { nowRealSeconds: 100 };
    const common = {
      gameRunning: true,
      gameDead: false,
      saveAvailable: true,
      lastSaveCompletedAtRealSeconds: clock.nowRealSeconds - confirmationWindow,
      confirmationWindowRealSeconds: confirmationWindow,
    };

    expect(shouldConfirmPageLeave({ ...common, nowRealSeconds: clock.nowRealSeconds })).toBe(false);
    clock.nowRealSeconds += 0.001;
    expect(shouldConfirmPageLeave({ ...common, nowRealSeconds: clock.nowRealSeconds })).toBe(true);
    expect(
      shouldConfirmPageLeave({
        ...common,
        gameRunning: false,
        nowRealSeconds: clock.nowRealSeconds,
      }),
    ).toBe(false);
    expect(
      shouldConfirmPageLeave({
        ...common,
        gameDead: true,
        nowRealSeconds: clock.nowRealSeconds,
      }),
    ).toBe(false);
    expect(
      shouldConfirmPageLeave({
        ...common,
        saveAvailable: false,
        lastSaveCompletedAtRealSeconds: undefined,
        nowRealSeconds: clock.nowRealSeconds,
      }),
    ).toBe(false);
    expect(
      shouldConfirmPageLeave({
        ...common,
        lastSaveCompletedAtRealSeconds: undefined,
        nowRealSeconds: clock.nowRealSeconds,
      }),
    ).toBe(true);
  });
});
