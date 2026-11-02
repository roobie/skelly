import { type Character, SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MIN } from '../core/character.ts';

/** Fresh debug games may compare inventory-handling effects without editing a save or adding a UI control. */
export const setDebugInventoryManagementSkill = (
  character: Character,
  search: string,
  enabled: boolean,
  fresh: boolean,
): void => {
  const raw = new URLSearchParams(search).get('inventoryManagement');
  const skillId = character.skillForCapability('inventoryManagement');
  if (!(enabled && fresh && raw !== null && skillId && Object.hasOwn(character.skills, skillId))) {
    return;
  }
  const level = Number(raw);
  if (Number.isSafeInteger(level) && level >= SKILL_LEVEL_MIN && level <= SKILL_LEVEL_LEGENDARY) {
    character.skills[skillId] = level;
  }
};
