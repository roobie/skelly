import { expect, it } from 'vitest';
import { Character, SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from '../src/core/character.ts';
import { setDebugFirearmsSkill } from '../src/debug/debugFirearmsSkill.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';

it('accepts firearms-combat skill overrides only for fresh debug games', () => {
  const character = new Character(BUNDLED_CONTENT.registry);
  const validLevel = SKILL_LEVEL_MIN + 1;
  const ignoredLevel = SKILL_LEVEL_MIN + 2;
  setDebugFirearmsSkill(character, `?firearmsCombat=${validLevel}`, true, true);
  expect(character.skills.firearms_combat).toBe(validLevel);
  setDebugFirearmsSkill(character, `?firearmsCombat=${ignoredLevel}`, false, true);
  expect(character.skills.firearms_combat).toBe(validLevel);
  setDebugFirearmsSkill(character, `?firearmsCombat=${ignoredLevel}`, true, false);
  expect(character.skills.firearms_combat).toBe(validLevel);
  setDebugFirearmsSkill(character, `?firearmsCombat=${SKILL_LEVEL_MAX}`, true, true);
  expect(character.skills.firearms_combat).toBe(SKILL_LEVEL_MAX);
  setDebugFirearmsSkill(character, `?firearmsCombat=${SKILL_LEVEL_LEGENDARY}`, true, true);
  expect(character.skills.firearms_combat).toBe(SKILL_LEVEL_LEGENDARY);
  setDebugFirearmsSkill(character, `?firearmsCombat=${SKILL_LEVEL_LEGENDARY + 1}`, true, true);
  expect(character.skills.firearms_combat).toBe(SKILL_LEVEL_LEGENDARY);
  setDebugFirearmsSkill(character, `?firearmsCombat=${SKILL_LEVEL_MIN - 1}`, true, true);
  expect(character.skills.firearms_combat).toBe(SKILL_LEVEL_LEGENDARY);
});
