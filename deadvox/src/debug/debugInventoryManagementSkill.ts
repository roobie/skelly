import { type Character, SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MIN } from '../core/character.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';

/** Fresh debug games may compare inventory-handling effects without editing a save or adding a UI control. */
export const setDebugInventoryManagementSkill = (
  character: Character,
  search: string,
  enabled: boolean,
  fresh: boolean,
): void => {
  const raw = new URLSearchParams(search).get('inventoryManagement');
  if (!(enabled && fresh && raw !== null && Object.hasOwn(character.skills, CORE_CONTENT_IDS.inventoryManagement))) {
    return;
  }
  const level = Number(raw);
  if (Number.isSafeInteger(level) && level >= SKILL_LEVEL_MIN && level <= SKILL_LEVEL_LEGENDARY) {
    character.skills.inventory_management = level;
  }
};
