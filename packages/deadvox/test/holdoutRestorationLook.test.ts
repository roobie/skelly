// The restoration look's production module starts with exactly one failed requirement, and the kit's spare, tools and
// skills restore it through the same service a screen starts; partService.test.ts covers the service rules themselves.
import { composeLayout } from '@skelly/engine/internal/core/composeLayout.ts';
import { housingBlueprint, requirementFailures } from '@skelly/engine/internal/core/housing.ts';
import { placedPowerDevices } from '@skelly/engine/internal/core/sitePower.ts';
import { applyStartState } from '@skelly/engine/internal/core/startState.ts';
import { selectBundledMods } from '@skelly/engine/packs';
import { AuthoredSite, makeScale, type Vec3 } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { productModIntake } from '../src/product/mods.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';
import { advance, createRuntime } from './snapshotTestSupport.ts';

const mod = 'skelly.deadvox.scenario.holdout.restoration-look';

it('restores the look module from the kit spare once its one seeded failure is fitted', () => {
  const selected = withReusedBuilds(() => selectBundledMods(productModIntake, [mod]));
  expect(selected.issues).toEqual([]);
  const { registry } = selected.content;
  const start = registry.starts.get('holdoutrestorationlook');
  const scenario = registry.scenarios.get(start!.site)!;
  if (scenario.kind !== 'composedSite') {
    throw new Error('The restoration look stages a composed site');
  }
  const { layout } = composeLayout(start!.seed!, registry, scenario);
  const devices = placedPowerDevices(
    registry,
    new AuthoredSite(start!.seed!, registry, makeScale(0.5), layout).authoredPlacements,
  );
  const module = devices.find(({ type }) => housingBlueprint(registry, type)?.failure)!;
  const lamp = devices.find(({ type }) => registry.furniture.get(type)!.power!.light)!;
  const def = registry.furniture.get(module.type)!;
  const [mx, my, mz] = module.pos;
  const spawn: Vec3 = [mx + def.size[0] + 1, my, mz + 1];

  const runtime = createRuntime(undefined, false, undefined, { registry, spawn, powerDevices: [module, lamp] });
  const floor = registry.blockIds.get(registry.blocks.find((block) => block.solid)!.id)!;
  for (let x = mx - 4; x <= mx + 8; x++) {
    for (let z = mz - 4; z <= mz + 6; z++) {
      runtime.world.setBlock(x, my - 1, z, floor);
    }
  }
  const { inventory } = runtime;
  // The runtime fixture's own hands stand in for no start, so they go before the look's start applies.
  for (const held of [inventory.hands.left, inventory.hands.right]) {
    if (held && !inventory.consume(held)) {
      throw new Error('Fixture hands did not empty');
    }
  }
  applyStartState(inventory, start!, {
    fresh: true,
    calendar: runtime.sim.calendar,
    character: runtime.session.character,
    body: runtime.sim.body,
    damageCell: () => {
      throw new Error('Unexpected start cell damage');
    },
  });
  const piece = inventory.furnishSpawn({ spec: module.entitySpec!, loot: [] })!;
  const lit = () => {
    advance(runtime, 1);
    return runtime.session.power!.isPowered(lamp);
  };
  advance(runtime, 1);

  const failures = requirementFailures(inventory.entities.housingView(piece), def.power!.requires!);
  expect(failures).toHaveLength(1);
  expect(lit()).toBe(false);

  const { crafting } = runtime.session;
  // A worn failure comes out before its spare goes in; a missing one only needs the fit.
  const serve = (operation: 'remove' | 'fit') => {
    const option = crafting
      .partServiceOptions(piece.uid)
      .find((entry) => entry.operation === operation && entry.slot === failures[0]!.slot)!;
    expect(option.refusal).toBeUndefined();
    const request =
      operation === 'fit'
        ? { slot: option.slot, operation, itemUid: option.itemUid! }
        : { slot: option.slot, operation };
    expect(crafting.servicePart(piece.uid, request)).toBeUndefined();
    const job = piece.work?.work;
    runtime.sim.scheduler.advance((job ? (job.duration - job.elapsed) / runtime.sim.clock.ratio : 0) + 1);
    expect(piece.work).toBeUndefined();
  };
  if (failures[0]!.cause !== 'absent') {
    serve('remove');
  }
  serve('fit');
  expect(requirementFailures(inventory.entities.housingView(piece), def.power!.requires!)).toEqual([]);
  expect(lit()).toBe(true);
});
