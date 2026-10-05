import { type Character, SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from '../core/character.ts';

/** Fresh debug games may compare skill effects without editing a save or adding a UI control. */
export const setDebugFirearmsSkill = (character: Character, search: string, enabled: boolean, fresh: boolean): void => {
  const raw = new URLSearchParams(search).get('firearmsSkill');
  if (!(enabled && fresh && raw !== null && Object.hasOwn(character.skills, 'firearms'))) {
    return;
  }
  const level = Number(raw);
  if (Number.isSafeInteger(level) && level >= SKILL_LEVEL_MIN && level <= SKILL_LEVEL_MAX) {
    character.skills.firearms = level;
  }
};
