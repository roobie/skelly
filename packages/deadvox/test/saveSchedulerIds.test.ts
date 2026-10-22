import { expect, it } from 'vitest';
import { KNOWN_SCHEDULER_IDS } from '../src/core/schedulerIds.ts';
import { createRuntime } from './snapshotTestSupport.ts';

it('lists every registered scheduler system as one the decoder accepts, and nothing else', () => {
  const registered = createRuntime().sim.scheduler.persistedIds();
  expect([...registered].filter((id) => !KNOWN_SCHEDULER_IDS.has(id))).toEqual([]);
  expect([...KNOWN_SCHEDULER_IDS].filter((id) => !registered.has(id))).toEqual([]);
});
