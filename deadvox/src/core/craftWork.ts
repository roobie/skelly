// Native craft effects and live admission. Item progress/inputs stay Inventory-owned.
import { type Character, dominantSide, offSide } from './character.ts';
import type { Vec3 } from './coords.ts';
import { admissionRefusal } from './crafting.ts';
import { planDisassembly, sameDisassemblyOutputs } from './disassembly.ts';
import { type Inventory, validateWorkItem } from './inventory.ts';
import type { Item } from './items.ts';
import type { CraftActionHooks } from './longAction.ts';
import type { ReachSnapshot } from './reach.ts';
import { craftingActivityTier } from './skillTraining.ts';

const inputsValid = (inventory: Inventory, item: Item): boolean => {
  try {
    validateWorkItem(inventory.registry, item);
    return true;
  } catch {
    return false;
  }
};

const repairTargetRefusal = (inventory: Inventory, item: Item, reach: ReachSnapshot): string | undefined => {
  const targetUid = item.work?.repairTargetUid;
  if (targetUid === undefined) {
    return undefined;
  }
  const target = inventory.itemByUid(targetUid);
  const { work } = item;
  if (work?.kind !== 'craft') {
    return 'The repair target is missing';
  }
  const recipe = inventory.registry.recipes.get(work.recipe);
  if (!(recipe && target) || target.uid === item.uid || target.type !== recipe.result.item || target.count !== 1) {
    return 'The repair target is missing';
  }
  return reach.entries.some((entry) => entry.item === target) ? undefined : 'The repair target is out of reach';
};

export const craftActionHooks = (
  inventory: Inventory,
  character: Character,
  reach: () => ReachSnapshot,
  feet: () => Vec3,
): CraftActionHooks => ({
  admit: (plan) => {
    const snapshot = reach();
    if (plan.kind === 'craft') {
      const recipe = inventory.registry.recipes.get(plan.recipe);
      return recipe ? admissionRefusal(recipe, snapshot, character) : 'Unknown recipe';
    }
    const current = planDisassembly(plan.source, snapshot, character);
    const sameTools =
      current &&
      Object.keys(current.toolLevels).length === Object.keys(plan.toolLevels).length &&
      Object.entries(current.toolLevels).every(([quality, level]) => plan.toolLevels[quality] === level);
    return current &&
      current.source === plan.source &&
      current.skillLevel === plan.skillLevel &&
      current.duration === plan.duration &&
      current.gather === plan.gather &&
      sameTools &&
      sameDisassemblyOutputs(current.outputs, plan.outputs)
      ? undefined
      : 'The item or its yield changed';
  },
  begin: (plan, repair) => inventory.beginWork(plan, repair)?.uid,
  owns: (uid) => inventory.itemByUid(uid)?.work !== undefined,
  validate: (uid) => {
    const item = inventory.itemByUid(uid);
    const work = item?.work;
    if (!(item && work)) {
      return 'The work item is missing';
    }
    if (!inputsValid(inventory, item)) {
      return 'Craft inputs changed';
    }
    if (inventory.hands[dominantSide(inventory.character)] !== item || inventory.hands[offSide(inventory.character)]) {
      return 'The work needs both hands';
    }
    const repairRefusal = repairTargetRefusal(inventory, item, reach());
    if (repairRefusal) {
      return repairRefusal;
    }
    return work.kind === 'craft'
      ? admissionRefusal(inventory.registry.recipes.get(work.recipe)!, reach(), character)
      : undefined;
  },
  advance: (uid, seconds) => {
    const work = inventory.itemByUid(uid)!.work!;
    work.elapsed = Math.min(work.duration, work.elapsed + seconds);
    inventory.version += 1;
    return work.elapsed === work.duration;
  },
  finish: (uid) => {
    const item = inventory.itemByUid(uid);
    const work = item?.work;
    if (item && work) {
      const recipe = work.kind === 'craft' ? inventory.registry.recipes.get(work.recipe) : undefined;
      const offset = inventory.registry.skills.get('crafting')?.training?.craftingTierOffset;
      const practice = recipe
        ? Object.entries(recipe.skills).map(([skill, level]) => {
            if (offset === undefined) {
              throw new Error('Missing crafting practice tier offset');
            }
            return { skill, amount: recipe.timeGameMinutes / 3_600, tier: craftingActivityTier(level, offset) };
          })
        : [];
      inventory.releaseWork(item, true, feet());
      for (const entry of practice) {
        character.awardPractice(entry.skill, entry.amount, entry.tier);
      }
    }
  },
  cancel: (uid) => {
    const item = inventory.itemByUid(uid);
    if (item) {
      inventory.releaseWork(item, false, feet());
    }
  },
});
