import { expect, it } from 'vitest';
import { Character, practiceForNextLevel, SKILL_LEVEL_MAX } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';

it('does not bank practice beyond the maximum skill level', () => {
  const { registry, issues } = buildRegistry([
    { source: 'skill.json', data: { skills: [{ id: 'fixture_skill', name: 'Fixture skill' }] } },
  ]);
  expect(issues).toEqual([]);
  const character = new Character(registry);
  while (character.skills.fixture_skill! < SKILL_LEVEL_MAX - 1) {
    character.awardPractice('fixture_skill', practiceForNextLevel(character.skills.fixture_skill!));
  }

  const lastThreshold = practiceForNextLevel(character.skills.fixture_skill!);
  character.awardPractice('fixture_skill', lastThreshold + practiceForNextLevel(SKILL_LEVEL_MAX) * 2);
  expect(character.skills.fixture_skill).toBe(SKILL_LEVEL_MAX);
  expect(character.practice.fixture_skill).toBe(0);
  character.awardPractice('fixture_skill', practiceForNextLevel(character.skills.fixture_skill!));
  expect(character.practice.fixture_skill).toBe(0);
});
