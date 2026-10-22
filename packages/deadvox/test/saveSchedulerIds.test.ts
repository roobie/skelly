import { expect, it } from 'vitest';
import { decodeSave } from '../src/core/saveFormat.ts';
import { capture, contentLookup, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

it('saves and loads a newly registered scheduler system without a hand-kept id list', async () => {
  const runtime = createRuntime();
  runtime.sim.scheduler.register({ id: 'fixture-new-system', rate: 1, tick: () => undefined });
  expect(runtime.sim.scheduler.persistedIds().has('fixture-new-system')).toBe(true);

  const decoded = await decodeSave(await encodeFixture(capture(runtime)), { version: formatVersion, contentLookup });

  const saved = decoded.snapshot.character.simulation.scheduler.systems.map(({ id }) => id);
  expect(saved).toContain('fixture-new-system');
  expect(new Set(saved)).toEqual(runtime.sim.scheduler.persistedIds());
});
