import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { searchTime } from '../src/core/blockEntities.ts';
import { Character, practiceForNextLevel, SKILL_LEVEL_MAX, skillSaturation } from '../src/core/character.ts';
import { buildRegistry, type ItemDef, type Registry } from '../src/core/content.ts';
import { firearmsSkillEffects } from '../src/core/firearmsSkill.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { simSeconds } from '../src/core/time.ts';
import { MagazineHandling } from '../src/game/magazineHandling.ts';
import { BOX_UNPACK_SECONDS, Unpacking } from '../src/game/unpacking.ts';
import { advance, capture, createRuntime } from './snapshotTestSupport.ts';

const BASE = 'src/content/base';
const { registry, issues } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}

const fixtureRegistry = (): Registry => {
  const models = new Map(registry.models);
  const existingModel = models.values().next().value;
  if (!existingModel) {
    throw new Error('Registry has no model to adapt for the magazine fixture');
  }
  const modelId = 'fixture_inventory_magazine_model';
  models.set(modelId, { ...existingModel, id: modelId, calibre: 'fixture_calibre', capacity: 3 });
  const items = new Map(registry.items);
  const definitions: ItemDef[] = [
    {
      id: 'fixture_inventory_bag',
      name: 'Fixture bag',
      category: 'misc',
      weight: 1,
      size: [2, 2],
      wearable: { slot: 'back', encumbrance: 0 },
      container: { pockets: [{ grid: [4, 4], handlingSimSeconds: simSeconds(0.2) }] },
    },
    { id: 'fixture_inventory_item', name: 'Fixture item', category: 'misc', weight: 1, size: [1, 1] },
    {
      id: 'fixture_inventory_magazine',
      name: 'Fixture magazine',
      category: 'misc',
      weight: 1,
      size: [2, 2],
      model: modelId,
    },
  ];
  for (const definition of definitions) {
    items.set(definition.id, definition);
  }
  return { ...registry, items, models };
};

const inventoryHandlingTime = (level: number, source: Registry = fixtureRegistry()): number => {
  const character = new Character(source);
  if (Object.hasOwn(character.skills, 'inventory_management')) {
    character.skills.inventory_management = level;
  }
  const inventory = new Inventory(source, undefined, undefined, character);
  const backpack = inventory.create('fixture_inventory_bag');
  const item = inventory.create('fixture_inventory_item');
  if (!(inventory.add(backpack, { kind: 'worn' }) && inventory.add(item, { kind: 'hand', side: 'right' }))) {
    throw new Error('Could not create inventory-handling fixture');
  }
  const from = inventory.locate(item);
  if (!from) {
    throw new Error('Inventory-handling item has no owner');
  }
  return inventory.handlingTime(item, from, { kind: 'pocket', owner: backpack, pocket: 0 });
};

describe('Inventory Management skill', () => {
  it('preserves unscaled level-zero time and follows content tuning through level ten', () => {
    const tunedRegistry = fixtureRegistry();
    const withoutInventorySkill: Registry = {
      ...tunedRegistry,
      skills: new Map([...tunedRegistry.skills].filter(([id]) => id !== 'inventory_management')),
    };
    const unscaled = inventoryHandlingTime(0, withoutInventorySkill);
    const skill = registry.skills.get('inventory_management');
    const tuning = skill?.inventory;
    if (!tuning) {
      throw new Error('Inventory Management content has no handling tuning');
    }
    expect(inventoryHandlingTime(0)).toBe(unscaled);

    const times = [0, 1, 5, 10, 11].map((level) => inventoryHandlingTime(level, tunedRegistry));
    expect(times[0]).toBe(unscaled);
    expect(times[1]).toBeLessThan(times[0]!);
    expect(times[2]).toBeLessThan(times[1]!);
    expect(times[3]).toBeLessThan(times[2]!);
    expect(times[4]).toBe(times[3]);
    for (const [index, level] of [0, 1, 5, 10].entries()) {
      const expectedFactor = skillSaturation(level, tuning.handlingFactorFloor, tuning.handlingFactorHalfLifeLevels);
      expect(times[index]! / unscaled).toBeCloseTo(expectedFactor);
    }
    expect(unscaled / times[3]!).toBeCloseTo(
      1 / skillSaturation(10, tuning.handlingFactorFloor, tuning.handlingFactorHalfLifeLevels),
    );
  });

  it('trains only completed inventory moves, and untiered practice reaches level ten', () => {
    const runtime = createRuntime();
    const { inventory, handling: queue, session } = runtime;
    const backpack = inventory.hands.right;
    if (!(backpack && inventory.move(backpack, { kind: 'worn' }).ok)) {
      throw new Error('Could not free the dominant hand for the inventory fixture');
    }
    const item = inventory.create('rag');
    if (!inventory.add(item, { kind: 'hand', side: 'right' })) {
      throw new Error('Could not hold the inventory fixture item');
    }
    const target = { kind: 'pocket', owner: backpack, pocket: 0 } as const;
    const initial = session.character.snapshotState();

    const refused = queue.enqueue(inventory.create('rag'), target);
    expect(refused.ok).toBe(false);
    expect(session.character.snapshotState()).toEqual(initial);

    const cancelled = queue.enqueue(item, target);
    if (!cancelled.ok) {
      throw new Error(cancelled.reason);
    }
    queue.cancel();
    expect(session.character.snapshotState()).toEqual(initial);

    const completed = queue.enqueue(item, target);
    if (!completed.ok) {
      throw new Error(completed.reason);
    }
    queue.tick(completed.job.duration);
    const trained =
      session.character.skills.inventory_management! > initial.skills.inventory_management! ||
      session.character.practice.inventory_management! > initial.practice.inventory_management!;
    expect(trained).toBe(true);

    const actor = new Character(registry);
    while (actor.skills.inventory_management! < SKILL_LEVEL_MAX) {
      actor.awardPractice('inventory_management', practiceForNextLevel(actor.skills.inventory_management!));
    }
    expect(actor.skills.inventory_management).toBe(SKILL_LEVEL_MAX);
  });

  it('scales box unpacking and trains only after successful completion', () => {
    const durations: number[] = [];
    for (const level of [0, 5, 10]) {
      const runtime = createRuntime();
      runtime.session.character.skills.inventory_management = level;
      const backpack = runtime.inventory.hands.right;
      if (!(backpack && runtime.inventory.move(backpack, { kind: 'worn' }).ok)) {
        throw new Error('Could not free the hand for the unpack fixture');
      }
      const box = runtime.inventory.create('shotshell_box');
      if (!runtime.inventory.add(box, { kind: 'hand', side: 'right' })) {
        throw new Error('Could not hold the unpack fixture box');
      }
      const unpacking = new Unpacking(runtime.inventory, runtime.handling, () => runtime.player.body.pos);
      const initial = runtime.session.character.snapshotState();

      expect(unpacking.activate(box)).toBeUndefined();
      const duration = runtime.handling.jobs[0]?.duration;
      if (duration === undefined) {
        throw new Error('Unpacking did not enqueue its action');
      }
      durations.push(duration);
      const tuning = registry.skills.get('inventory_management')!.inventory!;
      expect(duration).toBeCloseTo(
        BOX_UNPACK_SECONDS * skillSaturation(level, tuning.handlingFactorFloor, tuning.handlingFactorHalfLifeLevels),
      );
      expect(runtime.session.character.snapshotState()).toEqual(initial);

      runtime.handling.cancel();
      expect(runtime.session.character.snapshotState()).toEqual(initial);
      expect(unpacking.activate(box)).toBeUndefined();
      advance(runtime, Math.ceil((duration + 0.1) * 60));
      expect(runtime.inventory.itemByUid(box.uid)).toBeUndefined();
      const after = runtime.session.character.snapshotState();
      expect(
        after.skills.inventory_management !== initial.skills.inventory_management ||
          after.practice.inventory_management !== initial.practice.inventory_management,
      ).toBe(level < SKILL_LEVEL_MAX);
    }
    expect(durations[0]).toBe(BOX_UNPACK_SECONDS);
    expect(durations[1]).toBeLessThan(durations[0]!);
    expect(durations[2]).toBeLessThan(durations[1]!);
  });

  it('scales furniture searches and trains only after a successful search', () => {
    const durations: number[] = [];
    const searchBase = searchTime(registry.furniture.get('kitchen_cupboard')!);
    for (const level of [0, 5, 10]) {
      const runtime = createRuntime();
      runtime.session.character.skills.inventory_management = level;
      const cupboard = runtime.inventory.furnish({
        type: 'kitchen_cupboard',
        pos: [0, 0, 0],
        size: [2, 2, 1],
        facing: 'n',
      });
      if (!cupboard) {
        throw new Error('Could not create the furniture-search fixture');
      }
      runtime.inventory.canReachEntity = () => false;
      const initial = runtime.session.character.snapshotState();
      expect(runtime.session.search(cupboard)).toBeUndefined();
      const duration = runtime.handling.jobs[0]?.duration;
      if (duration === undefined) {
        throw new Error('Furniture search did not enqueue its action');
      }
      durations.push(duration);
      const tuning = registry.skills.get('inventory_management')!.inventory!;
      expect(duration).toBeCloseTo(
        searchBase * skillSaturation(level, tuning.handlingFactorFloor, tuning.handlingFactorHalfLifeLevels),
      );
      expect(runtime.session.character.snapshotState()).toEqual(initial);
      advance(runtime, Math.ceil((duration + 0.1) * 60));
      expect(cupboard.searched).toBe(false);
      expect(runtime.session.character.snapshotState()).toEqual(initial);

      runtime.inventory.canReachEntity = () => true;
      expect(runtime.session.search(cupboard)).toBeUndefined();
      advance(runtime, Math.ceil((duration + 0.1) * 60));
      expect(cupboard.searched).toBe(true);
      const after = runtime.session.character.snapshotState();
      expect(
        after.skills.inventory_management !== initial.skills.inventory_management ||
          after.practice.inventory_management !== initial.practice.inventory_management,
      ).toBe(level < SKILL_LEVEL_MAX);
    }
    expect(durations[0]).toBe(searchBase);
    expect(durations[1]).toBeLessThan(durations[0]!);
    expect(durations[2]).toBeLessThan(durations[1]!);
  });

  it('keeps firearm-owned round handling on the firearms-combat curve', () => {
    const firearmTuning = registry.skills.get('firearms_combat')?.combat?.firearms;
    if (!firearmTuning) {
      throw new Error('Firearms Combat content has no reload tuning');
    }
    const actionDuration = (inventoryLevel: number): number => {
      const source = fixtureRegistry();
      const character = new Character(source);
      character.skills.inventory_management = inventoryLevel;
      const inventory = new Inventory(source, undefined, undefined, character);
      const magazine = inventory.create('fixture_inventory_magazine');
      if (!inventory.add(magazine, { kind: 'hand', side: 'right' })) {
        throw new Error('Could not create firearm-handling fixture');
      }
      magazine.cartridges!.push('fixture_round');
      const queue = new HandlingQueue(inventory);
      const handling = new MagazineHandling(inventory, queue, {
        feet: () => [0, 0, 0],
        reloadFactor: () => firearmsSkillEffects(character.skills.firearms_combat!, firearmTuning).reloadDuration,
      });
      const refusal = handling.strip(magazine.uid, 0);
      if (refusal) {
        throw new Error(refusal);
      }
      return queue.jobs[0]!.duration;
    };
    expect(actionDuration(10)).toBe(actionDuration(0));
  });

  it('keeps skill level and practice across a save round trip', () => {
    const runtime = createRuntime();
    const level = runtime.session.character.skills.inventory_management!;
    runtime.session.character.awardPractice('inventory_management', practiceForNextLevel(level));
    const saved = capture(runtime);
    const restored = createRuntime(saved);
    expect(restored.session.character.skills.inventory_management).toBe(
      runtime.session.character.skills.inventory_management,
    );
    expect(restored.session.character.practice.inventory_management).toBe(
      runtime.session.character.practice.inventory_management,
    );
  });
});
