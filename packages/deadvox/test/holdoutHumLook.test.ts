// The hum look shows a wave drawn to a running plant only if its module hums from the start and the wave is released
// where it hears that hum, so both are checked against the look's own seed.
import { soundTier } from '@skelly/engine/internal/core/agentPerception.ts';
import { composeLayout } from '@skelly/engine/internal/core/composeLayout.ts';
import { housingBlueprint } from '@skelly/engine/internal/core/housing.ts';
import { placedPowerDevices } from '@skelly/engine/internal/core/sitePower.ts';
import { playerSenseTuning } from '@skelly/engine/internal/game/player.ts';
import { selectBundledMods } from '@skelly/engine/packs';
import { AuthoredSite, makeScale, type Vec3 } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { productModIntake } from '../src/product/mods.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';
import { advance, createRuntime } from './snapshotTestSupport.ts';

const mod = 'skelly.deadvox.scenario.holdout.hum-look';
const BLOCK_SIZE = 0.5;

it('starts the hum look with its module humming and releases its first wave where the walled hum is heard', () => {
  const selected = withReusedBuilds(() => selectBundledMods(productModIntake, [mod]));
  expect(selected.issues).toEqual([]);
  const { registry } = selected.content;
  const start = registry.starts.get('holdouthumlook')!;
  const scenario = registry.scenarios.get(start.site)!;
  if (scenario.kind !== 'composedSite') {
    throw new Error('The hum look stages a composed site');
  }
  const { layout, eventRules } = composeLayout(start.seed!, registry, scenario);
  const devices = placedPowerDevices(
    registry,
    new AuthoredSite(start.seed!, registry, makeScale(BLOCK_SIZE), layout).authoredPlacements,
  );
  const module = devices.find(({ type }) => housingBlueprint(registry, type) !== undefined)!;
  const lamp = devices.find(({ type }) => registry.furniture.get(type)!.power!.light)!;
  const [mx, my, mz] = module.pos;
  const runtime = createRuntime(undefined, false, undefined, {
    registry,
    spawn: [mx + registry.furniture.get(module.type)!.size[0] + 1, my, mz + 1] satisfies Vec3,
    powerDevices: [module, lamp],
    seed: start.seed!,
  });
  runtime.inventory.furnishSpawn({ spec: module.entitySpec!, loot: [] });
  advance(runtime, 1);

  const [hum] = runtime.session.power!.sounds();
  expect(hum).toBeDefined();
  const [wave] = eventRules;
  for (const effect of wave!.effects) {
    const hearing = soundTier({
      def: registry.actors.get(effect.actor)!,
      from: effect.at,
      source: hum!,
      blockSize: BLOCK_SIZE,
      isSolid: () => true,
      tuning: playerSenseTuning(registry),
    });
    expect(hearing).toBeDefined();
  }
});
