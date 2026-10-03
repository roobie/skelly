// Native craft effects and live admission. Item progress/inputs stay Inventory-owned.
import type { CraftCharacter } from './character.ts';
import type { RecipeDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import { type Inventory, validateWorkItem } from './inventory.ts';
import type { Item } from './items.ts';
import type { CraftActionHooks } from './longAction.ts';
import type { ReachSnapshot } from './reach.ts';

const hasQuality = (snapshot: ReachSnapshot, inventory: Inventory, quality: string, level: number) =>
  snapshot.entries.some(
    ({ item }) =>
      item.condition > 0 && (inventory.registry.items.get(item.type)?.tool?.qualities[quality] ?? 0) >= level,
  );

const inputsValid = (inventory: Inventory, item: Item): boolean => {
  try {
    validateWorkItem(inventory.registry, item);
    return true;
  } catch {
    return false;
  }
};

const missingEquipment = (inventory: Inventory, recipe: RecipeDef, snapshot: ReachSnapshot): string | undefined => {
  const missing = Object.entries(recipe.qualities).find(
    ([quality, level]) => !hasQuality(snapshot, inventory, quality, level),
  );
  if (missing) {
    return `Required ${missing[0]} tool is not in reach`;
  }
  if (
    recipe.workstation &&
    !snapshot.workstations.some(
      (station) => inventory.entities.defOf(station.entity).workstation?.id === recipe.workstation,
    )
  ) {
    return 'Required workstation is not in reach';
  }
  return undefined;
};

export const craftActionHooks = (
  inventory: Inventory,
  character: CraftCharacter,
  reach: () => ReachSnapshot,
  feet: () => Vec3,
): CraftActionHooks => ({
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
    if (inventory.hands.right !== item || inventory.hands.left) {
      return 'The work needs both hands';
    }
    const recipe = inventory.registry.recipes.get(work.recipe);
    if (!(recipe && character.knownRecipes.has(recipe.id))) {
      return 'Recipe not known';
    }
    if (Object.entries(recipe.skills).some(([skill, level]) => (character.skills[skill] ?? 0) < level)) {
      return 'Skill level too low';
    }
    return missingEquipment(inventory, recipe, reach());
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
