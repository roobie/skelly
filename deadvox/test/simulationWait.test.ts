// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { holdAction } from './browser/input-actions.mjs';
import { waitForSimulation } from './browser/simulation-wait.mjs';

interface FakeSim {
  time: number;
  poll: number;
}

const listeners = new AbortController();
afterEach(() => listeners.abort());

/**
 * A Playwright page stand-in that evaluates the serialized wait predicate as Playwright does, advancing the
 * simulation one tick per poll. Node-side key events and the keyups the page receives share one log.
 */
const fakePage = (log: string[]) => {
  const sim: FakeSim = { time: 0, poll: 0 };
  Object.assign(globalThis, { fakeSim: sim });
  globalThis.addEventListener('keyup', (event) => log.push(`page up ${event.code} at poll ${sim.poll}`), {
    capture: true,
    signal: listeners.signal,
  });
  return {
    sim,
    evaluate: async (expression: unknown, argument?: unknown) =>
      typeof expression === 'function'
        ? expression(argument)
        : { primary: { code: 'KeyW', modifier: 'shift' }, gate: null },
    keyboard: {
      down: async (code: string) => log.push(`node down ${code}`),
      up: async (code: string) => log.push(`node up ${code}`),
    },
    waitForFunction: (expression: string) => {
      for (;;) {
        sim.poll += 1;
        sim.time += 0.1;
        const value: unknown = new Function(`return ${expression}`)();
        if (value) {
          return Promise.resolve({ jsonValue: async () => value, dispose: async () => undefined });
        }
      }
    },
  };
};

const sample = () => {
  const { fakeSim } = globalThis as unknown as { fakeSim: FakeSim };
  return { time: fakeSim.time, paused: false, reached: fakeSim.time >= 0.25 };
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
    `page up KeyW at poll ${terminal}`,
    `page up ShiftLeft at poll ${terminal}`,
    'node up KeyW',
    'node up ShiftLeft',
  ]);
});

it('refuses a stop that would release a held key only from Node', async () => {
  const page = fakePage([]);
  const release = await holdAction(page, 'fixture.hold');
  await expect(
    waitForSimulation(page, sample, undefined, { seconds: 1, label: 'wrapped', record, stop: () => release() }),
  ).rejects.toThrow(MISSING_KEY_UPS);
});
