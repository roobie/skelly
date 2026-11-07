import { expect, it } from 'vitest';
import {
  Character,
  practiceForNextLevel,
  SKILL_LEVEL_LEGENDARY,
  SKILL_LEVEL_MAX,
  skillEffectLevel,
} from '../src/core/character.ts';
import { buildRegistry, type Registry } from '../src/core/content.ts';

const makeCharacter = (practicePerLevel = 10): { registry: Registry; character: Character } => {
  const { registry, issues } = buildRegistry([
    {
      source: 'skill.json',
      data: {
        skillProgression: [{ id: 'fixture_progression', capability: 'progression', practicePerLevel }],
        skills: [{ id: 'fixture_skill', name: 'Fixture skill' }],
      },
    },
  ]);
  if (issues.length > 0) {
    throw new Error('Could not build skill progression fixture');
  }
  return { registry, character: new Character(registry) };
};

const trainToOrdinaryTop = (registry: Registry, character: Character): void => {
  while (character.skills.fixture_skill! < SKILL_LEVEL_MAX) {
    character.awardPractice(
      'fixture_skill',
      practiceForNextLevel(registry, character.skills.fixture_skill!),
      SKILL_LEVEL_LEGENDARY,
    );
  }
};

const trainToLegendary = (registry: Registry, character: Character): void => {
  trainToOrdinaryTop(registry, character);
  character.awardPractice('fixture_skill', practiceForNextLevel(registry, SKILL_LEVEL_MAX), SKILL_LEVEL_LEGENDARY);
};

it('banks practice beyond ordinary expertise toward legendary', () => {
  const { registry, character } = makeCharacter();
  trainToOrdinaryTop(registry, character);
  character.awardPractice('fixture_skill', 1, SKILL_LEVEL_LEGENDARY);

  expect(character.skills.fixture_skill).toBe(SKILL_LEVEL_MAX);
  expect(character.practice.fixture_skill).toBe(1);
});

it('reaches legendary when its practice threshold is met', () => {
  const { registry, character } = makeCharacter();
  trainToLegendary(registry, character);

  expect(character.skills.fixture_skill).toBe(SKILL_LEVEL_LEGENDARY);
  expect(character.practice.fixture_skill).toBe(0);
});

it('stops accumulating practice at legendary', () => {
  const { registry, character } = makeCharacter();
  trainToLegendary(registry, character);
  character.awardPractice('fixture_skill', practiceForNextLevel(registry, SKILL_LEVEL_MAX), SKILL_LEVEL_LEGENDARY);

  expect(character.skills.fixture_skill).toBe(SKILL_LEVEL_LEGENDARY);
  expect(character.practice.fixture_skill).toBe(0);
  expect(practiceForNextLevel(registry, SKILL_LEVEL_LEGENDARY)).toBe(Number.POSITIVE_INFINITY);
});

it('drops excess activity practice at its tier', () => {
  const { registry, character } = makeCharacter();
  const excess = practiceForNextLevel(registry, 0) + practiceForNextLevel(registry, 1);
  character.awardPractice('fixture_skill', excess, 1);
  expect(character.skills.fixture_skill).toBe(1);
  expect(character.practice.fixture_skill).toBe(0);
  character.awardPractice('fixture_skill', practiceForNextLevel(registry, 1), 1);
  expect(character.skills.fixture_skill).toBe(1);
  expect(character.practice.fixture_skill).toBe(0);
});

it('preserves harder-activity progress when a lower-tier activity is awarded', () => {
  const { registry, character } = makeCharacter();
  character.awardPractice('fixture_skill', practiceForNextLevel(registry, 0), 1);
  const harderActivityPractice = practiceForNextLevel(registry, 1) / 2;
  character.awardPractice('fixture_skill', harderActivityPractice, 5);
  const practiceBeforeLowerTier = character.practice.fixture_skill;

  character.awardPractice('fixture_skill', 0.01, 1);

  expect(character.skills.fixture_skill).toBe(1);
  expect(character.practice.fixture_skill).toBe(practiceBeforeLowerTier);
});

it('levels up on the authored practice-per-level, not a code constant', () => {
  const { registry, character } = makeCharacter(4);

  character.awardPractice('fixture_skill', 4, SKILL_LEVEL_LEGENDARY);

  expect(character.skills.fixture_skill).toBe(1);
  expect(character.practice.fixture_skill).toBe(0);
  expect(practiceForNextLevel(registry, 1)).toBe(8);
});

it('maps legendary skill to ordinary-top effect level', () => {
  expect(skillEffectLevel(SKILL_LEVEL_LEGENDARY)).toBe(SKILL_LEVEL_MAX);
});
