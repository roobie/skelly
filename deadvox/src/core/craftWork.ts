// Native craft effects and live admission. Item progress/inputs stay Inventory-owned.
import { type CraftCharacter, dominantSide, offSide } from './character.ts';
import type { Vec3 } from './coords.ts';
import { admissionRefusal } from './crafting.ts';
import { type Inventory, validateWorkItem } from './inventory.ts';
import type { Item } from './items.ts';
import type { CraftActionHooks } from './longAction.ts';
import type { ReachSnapshot } from './reach.ts';

const inputsValid = (inventory: Inventory, item: Item): boolean => {
  try {
    validateWorkItem(inventory.registry, item);
    return true;
  } catch {
    return false;
  }
};

export const craftActionHooks = (
  inventory: Inventory,
  character: CraftCharacter,
  reach: () => ReachSnapshot,
  feet: () => Vec3,
): CraftActionHooks => ({
  admit: (plan) => {
    const recipe = inventory.registry.recipes.get(plan.recipe);
    return recipe ? admissionRefusal(recipe, reach(), character) : 'Unknown recipe';
  },
  begin: (plan) => inventory.beginWork(plan)?.uid,
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
    return admissionRefusal(inventory.registry.recipes.get(work.recipe)!, reach(), character);
  },
  advance: (uid, seconds) => {
    const work = inventory.itemByUid(uid)!.work!;
    work.elapsed = Math.min(work.duration, work.elapsed + seconds);
    inventory.version += 1;
    return work.elapsed === work.duration;
  },
  finish: (uid) => {
    const item = inventory.itemByUid(uid);
    if (item) {
      inventory.releaseWork(item, true, feet());
    }
  },
  cancel: (uid) => {
    const item = inventory.itemByUid(uid);
    if (item) {
      inventory.releaseWork(item, false, feet());
    }
  },
});
