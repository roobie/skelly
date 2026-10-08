import { describe, expect, it } from 'vitest';
import { updateStartupHintLatch } from '../src/game/startupHint.ts';

describe('updateStartupHintLatch', () => {
  it('does not reopen the startup hint for later dirty columns', () => {
    const loading = updateStartupHintLatch(true, 1);
    expect(loading).toEqual({ pending: true, visible: true });

    const ready = updateStartupHintLatch(loading.pending, 0);
    expect(ready).toEqual({ pending: false, visible: false });

    expect(updateStartupHintLatch(ready.pending, 1)).toEqual({ pending: false, visible: false });
  });
});
