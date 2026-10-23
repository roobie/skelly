import { expect, it } from 'vitest';
import { KNOWN_SCHEDULER_IDS } from '../src/core/schedulerIds.ts';
import { createRuntime, registry } from './snapshotTestSupport.ts';

it('lists every registered scheduler system as one the decoder accepts, and nothing else', () => {
  const device = [...registry.furniture.values()].find(({ power }) => power);
  if (!device) {
    throw new Error('Scheduler fixture needs powered furniture');
  }
  const registered = createRuntime(undefined, false, undefined, {
    powerDevices: [
      {
        type: device.id,
        pos: [0, 0, 0],
        entitySpec: { type: device.id, pos: [0, 0, 0], size: device.size, facing: 'n' },
      },
    ],
  }).sim.scheduler.persistedIds();
  expect(registered.size).toBeGreaterThan(0);
  expect([...registered].filter((id) => !KNOWN_SCHEDULER_IDS.has(id))).toEqual([]);
  expect([...KNOWN_SCHEDULER_IDS].filter((id) => !registered.has(id))).toEqual([]);
});
