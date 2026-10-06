import { type Character, SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MIN } from '../core/character.ts';

/** Fresh debug games may compare skill effects without editing a save or adding a UI control. */
export const setDebugFirearmsSkill = (character: Character, search: string, enabled: boolean, fresh: boolean): void => {
  const raw = new URLSearchParams(search).get('firearmsCombat');
  if (!(enabled && fresh && raw !== null && Object.hasOwn(character.skills, 'firearms_combat'))) {
    return;
  }
  const level = Number(raw);
  if (Number.isSafeInteger(level) && level >= SKILL_LEVEL_MIN && level <= SKILL_LEVEL_LEGENDARY) {
    character.skills.firearms_combat = level;
  }
};
