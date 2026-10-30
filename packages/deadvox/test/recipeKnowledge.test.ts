import { expect, it } from 'vitest';
import { bookReadingHooks } from '../src/core/bookReading.ts';
import { Character, practiceForNextLevel, SKILL_LEVEL_LEGENDARY } from '../src/core/character.ts';
import { Inventory } from '../src/core/inventory.ts';
import { buildFixtureRegistry } from './economyFixtures.ts';

const fixture = (skill = 'fixture_skill', level = 2, taughtRecipe = 'fixture_recipe') =>
  buildFixtureRegistry([
    {
      source: 'recipe-knowledge-fixture.json',
      data: {
        skillProgression: [{ id: 'core', practicePerLevel: 10 }],
        skills: [{ id: 'fixture_skill', name: 'Fixture skill' }],
        items: [
          {
            id: 'fixture_result',
            name: 'Fixture result',
            category: 'material',
            weight: 1,
            size: [1, 1],
            disassembly: {
              timeGameMinutes: 1,
              skill: 'fixture_skill',
              yields: [{ item: 'fixture_material_item', count: 1, fractions: [0.5, 1], rounding: 'floor' }],
            },
          },
          { id: 'fixture_material_item', name: 'Fixture material', category: 'material', weight: 1, size: [1, 1] },
          {
            id: 'fixture_book',
            name: 'Fixture book',
            category: 'book',
            weight: 1,
            size: [1, 1],
            book: { title: 'Fixture book', recipes: [taughtRecipe], readingGameMinutes: 1 },
          },
        ],
        recipes: [
          {
            id: 'fixture_recipe',
            result: { item: 'fixture_result', count: 1 },
            timeGameMinutes: 1,
            skills: {},
            qualities: {},
            components: [[{ item: 'fixture_material_item', count: 1 }]],
            skillUnlock: { skill, level },
          },
        ],
      },
    },
  ]);

const make = () => {
  const { registry, issues } = fixture();
  if (issues.length > 0) {
    throw new Error(JSON.stringify(issues));
  }
  return { registry, character: new Character(registry) };
};

it('learns at the skill unlock threshold, not below, and retains knowledge through save round-trip', () => {
  const { registry, character } = make();
  expect(character.knownRecipes.has('fixture_recipe')).toBe(false);
  character.awardPractice('fixture_skill', practiceForNextLevel(registry, 0));
  expect(character.knownRecipes.has('fixture_recipe')).toBe(false);
  character.awardPractice('fixture_skill', practiceForNextLevel(registry, 1));
  expect(character.knownRecipes.has('fixture_recipe')).toBe(true);
  const saved = JSON.parse(JSON.stringify(character.snapshotState()));
  const restored = Character.restoreState(registry, saved);
  expect(restored.knownRecipes.has('fixture_recipe')).toBe(true);
});

it('learns the same recipe from a book below its skill threshold', () => {
  const { registry, character } = make();
  const inventory = new Inventory(registry);
  const book = inventory.create('fixture_book');
  expect(inventory.add(book, { kind: 'hand', side: 'right' })).toBe(true);
  const hooks = bookReadingHooks(inventory, character, () => undefined);
  expect(hooks.validate(book.uid)).toBeUndefined();
  hooks.finish(book.uid);
  expect(character.skills.fixture_skill).toBe(0);
  expect(character.knownRecipes.has('fixture_recipe')).toBe(true);
});

it('learns level-zero unlocks on creation and crossed unlocks in a multi-level award', () => {
  const { registry, issues } = fixture('fixture_skill', 0);
  expect(issues).toEqual([]);
  expect(new Character(registry).knownRecipes.has('fixture_recipe')).toBe(true);
  const runtime = make();
  runtime.character.awardPractice(
    'fixture_skill',
    practiceForNextLevel(runtime.registry, 0) +
      practiceForNextLevel(runtime.registry, 1) +
      practiceForNextLevel(runtime.registry, 2),
  );
  expect(runtime.character.knownRecipes.has('fixture_recipe')).toBe(true);
});

it('rejects unknown unlock skills, missing taught recipes, and out-of-range unlock levels', () => {
  expect(fixture('missing_skill').issues.some((issue) => issue.message.includes('no skill'))).toBe(true);
  expect(
    fixture('fixture_skill', 2, 'missing_recipe').issues.some((issue) => issue.message.includes('no recipe')),
  ).toBe(true);
  for (const level of [-1, 0.5, SKILL_LEVEL_LEGENDARY + 1]) {
    expect(fixture('fixture_skill', level).issues.length).toBeGreaterThan(0);
  }
  expect(fixture('fixture_skill', SKILL_LEVEL_LEGENDARY).issues).toEqual([]);
});
