import { expect, it } from 'vitest';
import {
  Character,
  practiceForNextLevel,
  SKILL_LEVEL_LEGENDARY,
  SKILL_LEVEL_MAX,
  skillEffectLevel,
} from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';

const makeCharacter = (): Character => {
  const { registry, issues } = buildRegistry([
    { source: 'skill.json', data: { skills: [{ id: 'fixture_skill', name: 'Fixture skill' }] } },
  ]);
  if (issues.length > 0) {
    throw new Error('Could not build skill progression fixture');
  }
  return new Character(registry);
};

const trainToOrdinaryTop = (character: Character): void => {
  while (character.skills.fixture_skill! < SKILL_LEVEL_MAX) {
    character.awardPractice(
      'fixture_skill',
      practiceForNextLevel(character.skills.fixture_skill!),
      SKILL_LEVEL_LEGENDARY,
    );
  }
};

const trainToLegendary = (character: Character): void => {
  trainToOrdinaryTop(character);
  character.awardPractice('fixture_skill', practiceForNextLevel(SKILL_LEVEL_MAX), SKILL_LEVEL_LEGENDARY);
};

it('banks practice beyond ordinary expertise toward legendary', () => {
  const character = makeCharacter();
  trainToOrdinaryTop(character);
  character.awardPractice('fixture_skill', 1, SKILL_LEVEL_LEGENDARY);

  expect(character.skills.fixture_skill).toBe(SKILL_LEVEL_MAX);
  expect(character.practice.fixture_skill).toBe(1);
});

it('reaches legendary when its practice threshold is met', () => {
  const character = makeCharacter();
  trainToLegendary(character);

  expect(character.skills.fixture_skill).toBe(SKILL_LEVEL_LEGENDARY);
  expect(character.practice.fixture_skill).toBe(0);
});

it('stops accumulating practice at legendary', () => {
  const character = makeCharacter();
  trainToLegendary(character);
  character.awardPractice('fixture_skill', practiceForNextLevel(SKILL_LEVEL_MAX), SKILL_LEVEL_LEGENDARY);

  expect(character.skills.fixture_skill).toBe(SKILL_LEVEL_LEGENDARY);
  expect(character.practice.fixture_skill).toBe(0);
  expect(practiceForNextLevel(SKILL_LEVEL_LEGENDARY)).toBe(Number.POSITIVE_INFINITY);
});

it('drops excess activity practice at its tier', () => {
  const character = makeCharacter();
  const excess = practiceForNextLevel(0) + practiceForNextLevel(1);
  character.awardPractice('fixture_skill', excess, 1);
  expect(character.skills.fixture_skill).toBe(1);
  expect(character.practice.fixture_skill).toBe(0);
  character.awardPractice('fixture_skill', practiceForNextLevel(1), 1);
  expect(character.skills.fixture_skill).toBe(1);
  expect(character.practice.fixture_skill).toBe(0);
});

it('preserves harder-activity progress when a lower-tier activity is awarded', () => {
  const character = makeCharacter();
  character.awardPractice('fixture_skill', practiceForNextLevel(0), 1);
  const harderActivityPractice = practiceForNextLevel(1) / 2;
  character.awardPractice('fixture_skill', harderActivityPractice, 5);
  const practiceBeforeLowerTier = character.practice.fixture_skill;

  character.awardPractice('fixture_skill', 0.01, 1);

  expect(character.skills.fixture_skill).toBe(1);
  expect(character.practice.fixture_skill).toBe(practiceBeforeLowerTier);
});

it('maps legendary skill to ordinary-top effect level', () => {
  expect(skillEffectLevel(SKILL_LEVEL_LEGENDARY)).toBe(SKILL_LEVEL_MAX);
});
