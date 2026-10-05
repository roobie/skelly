import { expect, it } from 'vitest';
import { Character } from '../src/core/character.ts';
import { setDebugFirearmsSkill } from '../src/debug/debugFirearmsSkill.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';

it('accepts firearms skill overrides only for fresh debug games', () => {
  const character = new Character(BUNDLED_CONTENT.registry);
  setDebugFirearmsSkill(character, '?firearmsSkill=8', true, true);
  expect(character.skills.firearms).toBe(8);
  setDebugFirearmsSkill(character, '?firearmsSkill=2', false, true);
  expect(character.skills.firearms).toBe(8);
  setDebugFirearmsSkill(character, '?firearmsSkill=2', true, false);
  expect(character.skills.firearms).toBe(8);
  setDebugFirearmsSkill(character, '?firearmsSkill=-1', true, true);
  expect(character.skills.firearms).toBe(8);
});
