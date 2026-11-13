// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { holdAction } from './browser/input-actions.mjs';
import { waitForSimulation } from './browser/simulation-wait.mjs';

interface FakeSim {
  time: number;
  poll: number;
  keysDown: number;
}

interface WaitHandle {
  jsonValue: () => Promise<unknown>;
  dispose: () => Promise<unknown>;
}

const listeners = new AbortController();
afterEach(() => listeners.abort());

/**
 * A Playwright page stand-in that evaluates the serialized wait predicate as Playwright does, advancing the
 * simulation one tick per poll. Polls run while a key is down; a poll armed with no key down stays pending
 * until the key goes down, as a real page's frames would find it. Node-side key events and the page's own
 * events share one log.
 */
const fakePage = (log: string[]) => {
  const sim: FakeSim = { time: 0, poll: 0, keysDown: 0 };
  Object.assign(globalThis, { fakeSim: sim });
  globalThis.addEventListener('keyup', (event) => log.push(`page up ${event.code} at poll ${sim.poll}`), {
    capture: true,
    signal: listeners.signal,
  });
  let drain: () => void = () => undefined;
  return {
    sim,
    evaluate: async (expression: unknown, argument?: unknown) =>
      typeof expression === 'function'
        ? expression(argument)
        : { primary: { code: 'KeyW', modifier: 'shift' }, gate: null },
    keyboard: {
      down: (code: string) => {
        log.push(`node down ${code}`);
        sim.keysDown += 1;
        document.body.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
        if (code === 'KeyW') {
          drain();
        }
        return Promise.resolve();
      },
      up: (code: string) => Promise.resolve(log.push(`node up ${code}`)),
    },
    waitForFunction: (expression: string | ((argument: string) => unknown), argument?: string) => {
      if (typeof expression === 'function') {
        const value = expression(argument as string);
        return Promise.resolve({ jsonValue: async () => value, dispose: async () => undefined });
      }
      log.push('poll armed');
      return new Promise<WaitHandle>((resolve) => {
        const poll = () => {
          sim.poll += 1;
          sim.time += 0.1;
          const value: unknown = new Function(`return ${expression}`)();
          if (value) {
            resolve({ jsonValue: async () => value, dispose: async () => undefined });
          }
          return Boolean(value);
        };
        const run = () => {
          while (sim.keysDown > 0 && !poll()) {
            // Polls advance until the wait resolves.
          }
        };
        drain = run;
        if (!poll()) {
          run();
        }
      });
    },
  };
};

const sample = () => {
  const { fakeSim } = globalThis as unknown as { fakeSim: FakeSim };
  return { time: fakeSim.time, paused: false, reached: fakeSim.time >= 0.25 };
};
const alreadyReached = () => {
  const { fakeSim } = globalThis as unknown as { fakeSim: FakeSim };
  return { time: fakeSim.time, paused: false, reached: true };
};
const record = async () => undefined;
const MISSING_KEY_UPS = /keyUps/;

it('releases a held key in the page on the poll that ends the wait, in release order, before the Node release', async () => {
  const log: string[] = [];
  const page = fakePage(log);
  const release = await holdAction(page, 'fixture.hold');
  await waitForSimulation(page, sample, undefined, { seconds: 1, label: 'walk', record, stop: release });

  const terminal = page.sim.poll;
  expect(terminal).toBeGreaterThan(1);
  expect(log).toEqual([
    'node down ShiftLeft',
    'node down KeyW',
    'poll armed',
    `page up KeyW at poll ${terminal}`,
    `page up ShiftLeft at poll ${terminal}`,
    'node up KeyW',
    'node up ShiftLeft',
  ]);
});

it('arms the stop before the hold it presses, so no key is down without a stop watching', async () => {
  const log: string[] = [];
  const page = fakePage(log);
  await waitForSimulation(page, sample, undefined, { seconds: 1, label: 'walk', record, hold: 'fixture.hold' });

  const terminal = page.sim.poll;
  expect(log).toEqual([
    'poll armed',
    'node down ShiftLeft',
    'node down KeyW',
    `page up KeyW at poll ${terminal}`,
    `page up ShiftLeft at poll ${terminal}`,
    'node up KeyW',
    'node up ShiftLeft',
  ]);
});

it('does not stop a hold on a destination reached before its key goes down', async () => {
  const log: string[] = [];
  const page = fakePage(log);
  await waitForSimulation(page, alreadyReached, undefined, {
    seconds: 1,
    label: 'walk',
    record,
    hold: 'fixture.hold',
  });

  expect(log.indexOf('node down KeyW')).toBeLessThan(log.indexOf(`page up KeyW at poll ${page.sim.poll}`));
  expect(log.filter((line) => line.startsWith('page up'))).toHaveLength(2);
});

it('refuses a stop that would release a held key only from Node', async () => {
  const page = fakePage([]);
  const release = await holdAction(page, 'fixture.hold');
  await expect(
    waitForSimulation(page, sample, undefined, { seconds: 1, label: 'wrapped', record, stop: () => release() }),
  ).rejects.toThrow(MISSING_KEY_UPS);
});
