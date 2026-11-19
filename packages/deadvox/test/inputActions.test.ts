import { describe, expect, it } from 'vitest';
import { pressAction, pressCdpAction } from './browser/input-actions.mjs';

type Kind = 'press' | 'tap-or-hold';

const TIMED_REFUSAL = /fixture\.action is timed.*tapAction/;

const snapshot = (kind: Kind) => async () => ({
  primary: { code: 'KeyF' },
  gate: null,
  commands: [{ id: 'fixture.action', kind }],
});

const drivers = {
  pressAction: async (kind: Kind, keys: string[]) =>
    pressAction(
      {
        evaluate: snapshot(kind),
        keyboard: {
          down: async (code: string) => keys.push(code),
          up: async () => undefined,
        },
      },
      'fixture.action',
    ),
  pressCdpAction: async (kind: Kind, keys: string[]) => {
    // A CDP stand-in that records key downs; the fixture only sends Input.dispatchKeyEvent.
    const send = ((_method: string, params?: { type?: string; code?: string }) => {
      if (params?.type === 'keyDown' && params.code) {
        keys.push(params.code);
      }
      return Promise.resolve({});
    }) as Parameters<typeof pressCdpAction>[1];
    await pressCdpAction(snapshot(kind), send, 'fixture.action');
  },
};

describe.each(Object.entries(drivers))('%s', (_name, drive) => {
  it('refuses a timed action before any key goes down, so its tap cannot straddle page tasks', async () => {
    const keys: string[] = [];
    await expect(drive('tap-or-hold', keys)).rejects.toThrow(TIMED_REFUSAL);
    expect(keys).toEqual([]);
  });

  it('presses an untimed action', async () => {
    const keys: string[] = [];
    await drive('press', keys);
    expect(keys).toEqual(['KeyF']);
  });
});
