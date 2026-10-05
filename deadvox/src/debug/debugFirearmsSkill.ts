import type { Character } from '../core/character.ts';

/** Fresh debug games may compare skill effects without editing a save or adding a UI control. */
export const setDebugFirearmsSkill = (character: Character, search: string, enabled: boolean, fresh: boolean): void => {
  const raw = new URLSearchParams(search).get('firearmsSkill');
  if (!(enabled && fresh && raw !== null && Object.hasOwn(character.skills, 'firearms'))) {
    return;
  }
  const level = Number(raw);
  if (Number.isSafeInteger(level) && level >= 0 && level <= 100) {
    character.skills.firearms = level;
  }
};
