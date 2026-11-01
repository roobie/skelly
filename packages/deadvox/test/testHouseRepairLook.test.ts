import { describe, expect, it } from 'vitest';
import repairLook from '../src/config/repair-look.json' with { type: 'json' };
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { Character } from '../src/core/character.ts';
import { CORE_CONTENT_IDS } from '../src/core/contentIds.ts';
import { toChunk, type Vec3 } from '../src/core/coords.ts';
import { CraftCommands } from '../src/core/craftCommands.ts';
import { craftActionHooks } from '../src/core/craftWork.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import { makeScale } from '../src/core/scale.ts';
import { Simulation } from '../src/core/sim.ts';
import { selectBundledMods } from '../src/game/bundledMods.ts';
import { repairLookEnabled } from '../src/game/config.ts';
import { stageRepairLook } from '../src/game/testHouseRepairLook.ts';
import { startupContent } from './baseRegistry.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';

const normal = startupContent();
const admitted = withReusedBuilds(() => selectBundledMods([], [repairLook.mod]));

describe('test-house repair look', () => {
  it.each([
    ['debug=1&site=testHouse&repairLook=1', true],
    ['site=testHouse&repairLook=1', false],
    ['debug=1&site=city&repairLook=1', false],
    ['debug=1&site=testHouse', false],
    ['debug=1&site=testHouse&repairLook=1&mods=1', false],
  ] as const)('gates staging and content on the debug look URL: %s', (query, enabled) => {
    expect(repairLookEnabled(new URLSearchParams(query))).toBe(enabled);
  });

  it('admits the preview recipe through content validation without adding it to normal content', () => {
    expect(admitted.issues).toEqual([]);
    expect(new Character(admitted.content.registry).knownRecipes.has(repairLook.recipe)).toBe(true);
    expect(normal.registry.recipes.has(repairLook.recipe)).toBe(false);
  });

  it('preserves the staged target on column arrival and completes its visible repair through the shared recipe', () => {
    const { registry } = admitted.content;
    const character = new Character(registry);
    const inventory = new Inventory(registry, undefined, undefined, character);
    const scale = makeScale(0.5);
    const site = new AuthoredSite(1, registry, scale, registry.layouts.get('testHouse')!);
    const source = {
      furnitureIn: (cx: number, cz: number) => site.furnitureIn(cx, cz).map((spawn) => ({ ...spawn, wear: 0.9 })),
    };
    const config = { debug: true, site: 'testHouse', debugRepairLook: true };
    const untouched = inventory.snapshotState();
    expect(stageRepairLook(inventory, site, { ...config, debug: false }, false)).toBeUndefined();
    expect(stageRepairLook(inventory, site, config, true)).toBeUndefined();
    expect(inventory.snapshotState()).toEqual(untouched);
    const target = stageRepairLook(inventory, source, config, false)!;
    const stagedDamage = target.damage;
    for (const spawn of source.furnitureIn(toChunk(target.origin[0]), toChunk(target.origin[2]))) {
      inventory.furnishSpawn(spawn);
    }
    expect(inventory.entities.byUid(target.uid)).toBe(target);
    expect(target.damage).toBe(stagedDamage);
    expect(target.damage).toBeGreaterThan(0);
    expect(target.damage).toBeLessThan(registry.furniture.get(target.type)!.breach.durability);
    const position = site.focus(repairLook.furniture)!.pos.map((value) => value / scale.blockSize) as Vec3;
    const reach = bindReach({ inventory, position, blockSize: scale.blockSize, clock: BASE_CLOCK });
    const sim = new Simulation({
      seed: 1,
      registry,
      clock: BASE_CLOCK,
      bodyTuning: registry.body.get(CORE_CONTENT_IDS.player)!,
      compressionCaps: registry.compression.get(CORE_CONTENT_IDS.player)!.caps,
    });
    sim.actions.craft = craftActionHooks(inventory, character, reach, {
      feet: () => position,
      calendar: () => sim.calendar,
    });
    const commands = new CraftCommands({ inventory, character, sim, reach, queue: new HandlingQueue(inventory) });
    const preview = commands.previewEntityRepair(repairLook.recipe, target.uid);
    expect(preview.targetName).toBeTruthy();
    expect(preview.requirements).toBeDefined();
    expect(preview.refusal).toBeUndefined();
    expect(commands.repairEntity(repairLook.recipe, target.uid)).toBeUndefined();
    const work = inventory.hands.right!;
    sim.scheduler.advance(work.work!.duration / sim.clock.ratio + 1);
    expect(inventory.entities.conditionOf(target)).toBe(1);
    expect(inventory.itemByUid(work.uid)).toBeUndefined();
  });
});
