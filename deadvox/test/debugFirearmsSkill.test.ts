import { expect, it } from 'vitest';
import { Character, SKILL_LEVEL_LEGENDARY, SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from '../src/core/character.ts';
import { setDebugFirearmsSkill } from '../src/debug/debugFirearmsSkill.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';

it('accepts firearms skill overrides only for fresh debug games', () => {
  const character = new Character(BUNDLED_CONTENT.registry);
  const validLevel = SKILL_LEVEL_MIN + 1;
  const ignoredLevel = SKILL_LEVEL_MIN + 2;
  setDebugFirearmsSkill(character, `?firearmsSkill=${validLevel}`, true, true);
  expect(character.skills.firearms).toBe(validLevel);
  setDebugFirearmsSkill(character, `?firearmsSkill=${ignoredLevel}`, false, true);
  expect(character.skills.firearms).toBe(validLevel);
  setDebugFirearmsSkill(character, `?firearmsSkill=${ignoredLevel}`, true, false);
  expect(character.skills.firearms).toBe(validLevel);
  setDebugFirearmsSkill(character, `?firearmsSkill=${SKILL_LEVEL_MAX}`, true, true);
  expect(character.skills.firearms).toBe(SKILL_LEVEL_MAX);
  setDebugFirearmsSkill(character, `?firearmsSkill=${SKILL_LEVEL_LEGENDARY}`, true, true);
  expect(character.skills.firearms).toBe(SKILL_LEVEL_LEGENDARY);
  setDebugFirearmsSkill(character, `?firearmsSkill=${SKILL_LEVEL_LEGENDARY + 1}`, true, true);
  expect(character.skills.firearms).toBe(SKILL_LEVEL_LEGENDARY);
  setDebugFirearmsSkill(character, `?firearmsSkill=${SKILL_LEVEL_MIN - 1}`, true, true);
  expect(character.skills.firearms).toBe(SKILL_LEVEL_LEGENDARY);
});
