import type { StartDef } from '@skelly/engine/internal/core/schema/starts.ts';
import { decodeSave } from '@skelly/engine/save';
import { applyStartState } from '@skelly/engine/sim';
import { contentLookup } from '@skelly/presentation/ui';
import { expect, it } from 'vitest';
import { baseRegistryWith } from './baseRegistry.ts';
import { FIXTURE_ABILITY, FIXTURE_POOL, fixtureMagicGrants, fixtureMagicSource } from './fixtures/magic.ts';
import { advance, capture, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const registry = baseRegistryWith([fixtureMagicSource()]);

const start: StartDef = {
  id: 'fixture_magic_start',
  site: 'forest',
  kit: [],
  wounds: [],
  skills: {},
  recipes: [],
  ...fixtureMagicGrants(),
};

it('saves a partly spent pool and ability practice through the codec, and recovers the pool on game time after load', async () => {
  const runtime = createRuntime(undefined, false, undefined, { registry });
  const { character } = runtime.session;
  applyStartState(runtime.inventory, start, {
    fresh: true,
    calendar: runtime.sim.calendar,
    character,
    body: runtime.sim.body,
    damageCell: () => {
      throw new Error('Unexpected start cell damage');
    },
  });
  character.spend(FIXTURE_POOL, character.poolMaximum(FIXTURE_POOL)! / 2);
  character.awardAbilityPractice(FIXTURE_ABILITY);
  const saved = capture(runtime).character.progression;

  const decoded = await decodeSave(await encodeFixture(capture(runtime)), {
    version: formatVersion,
    contentLookup: (kind, id, item) => contentLookup(registry, kind, id, item),
  });
  const restored = createRuntime(decoded.snapshot, false, runtime.columns, {
    registry,
    start: runtime.sim.clock.start,
  });
  expect(capture(restored).character.progression).toEqual(saved);

  advance(restored, 120);
  const recovered = restored.session.character.poolAmount(FIXTURE_POOL)!;
  expect(recovered).toBeGreaterThan(saved.pools[FIXTURE_POOL]!.amount);
  expect(recovered).toBeLessThan(restored.session.character.poolMaximum(FIXTURE_POOL)!);
});
