import { expect, it } from 'vitest';
import { claimed } from '../src/core/capabilities.ts';
import { Character, practiceForNextLevel } from '../src/core/character.ts';
import { buildRegistry, requiredContentIssues } from '../src/core/content.ts';
import { CraftCommands } from '../src/core/craftCommands.ts';
import { planCraft, requirementStatus } from '../src/core/crafting.ts';
import { craftActionHooks } from '../src/core/craftWork.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import type { ContentFile } from '../src/core/schema.ts';
import { firearmSteadinessSkill } from '../src/core/skillTraining.ts';
import { baseSources } from '../src/game/bundledContent.ts';
import { baseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { Simulation } from './simulationFixture.ts';
import { advance, createRuntime } from './snapshotTestSupport.ts';

const roleRecipe = {
  id: 'fixture_role_recipe',
  category: 'supplies',
  tags: [],
  searchTerms: [],
  result: { item: 'wax', count: 1 },
  timeGameMinutes: 1,
  skills: { crafting: 2 },
  skillUnlock: { skill: 'crafting', level: 2 },
  qualities: {},
  components: [[{ item: 'wax', count: 1 }]],
};

// biome-ignore-start lint/suspicious/noMisplacedAssertion: shared completion assertions run only inside the role tests.
const expectCompleteRecipe = (inventory: Inventory, character: Character) => {
  const sim = new Simulation({ seed: 1 });
  const queue = new HandlingQueue(inventory);
  const position: [number, number, number] = [0, 0, 0];
  const reach = bindReach({ inventory, position, blockSize: 0.5, clock: BASE_CLOCK });
  sim.actions.craft = craftActionHooks(inventory, character, reach, {
    feet: () => position,
    calendar: () => sim.calendar,
  });
  const commands = new CraftCommands({ inventory, character, sim, queue, reach });
  expect(inventory.move(inventory.hands.right!, { kind: 'pile', pos: position }).ok).toBe(true);
  expect(commands.start(roleRecipe.id)).toBeUndefined();
  const work = inventory.hands.right!.work!;
  expect(work).toBeDefined();
  sim.scheduler.advance(Math.ceil(work.duration / sim.clock.ratio) + 1);
  expect(inventory.hands.right!.type).toBe(roleRecipe.result.item);
};
// biome-ignore-end lint/suspicious/noMisplacedAssertion: shared completion assertions.

// This alternative stack omits theme features with explicit skill-id dependencies.
const sourcesWithoutSkills = () =>
  baseSources.map(({ source, data }) => {
    const file = data as ContentFile;
    return {
      source,
      data: {
        ...file,
        skills: undefined,
        skillProgression: undefined,
        items: file.items?.map((item) => ({ ...item, disassembly: undefined, salvageLiquidRecovery: undefined })),
        layouts: file.layouts?.map((layout) => ({
          ...layout,
          showroom: layout.showroom && {
            ...layout.showroom,
            slots: layout.showroom.slots.map((slot) => ({
              ...slot,
              items: slot.items?.map((item) => ({ ...item, craftedLiquids: undefined })),
            })),
          },
        })),
        furniture: file.furniture?.map((entry) => ({ ...entry, door: entry.door && { ...entry.door, methods: {} } })),
      },
    };
  });

it('validates and runs an alternative stack with no skills or progression provider', () => {
  const { registry, issues } = buildRegistry(sourcesWithoutSkills());
  expect(issues).toEqual([]);
  expect(requiredContentIssues(registry)).toEqual([]);
  expect(registry.skills.size).toBe(0);
  const runtime = createRuntime(undefined, false, undefined, { registry });
  advance(runtime, 1);
  expect(runtime.session.character.snapshotState().skills).toEqual({});
});

it('a recipe role without a provider adds neither a skill gate nor an unlock requirement', () => {
  const { registry, issues } = buildRegistry([
    ...sourcesWithoutSkills(),
    { source: 'fixture-role', data: { recipes: [roleRecipe] } },
  ]);
  expect(issues).toEqual([]);
  const character = new Character(registry);
  const inventory = new Inventory(registry, undefined, undefined, character);
  expect(inventory.add(inventory.create('wax'), { kind: 'hand', side: 'right' })).toBe(true);
  const snapshot = bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5, clock: BASE_CLOCK })();
  const recipe = registry.recipes.get(roleRecipe.id)!;
  expect(character.knownRecipes.has(recipe.id)).toBe(true);
  expect(requirementStatus(recipe, snapshot, character).skills).toEqual([]);
  expect(planCraft(recipe, snapshot, character)).toHaveProperty('plan');
  expectCompleteRecipe(inventory, character);
  expect(character.snapshotState().practice).toEqual({});
});

it('recipe gates and unlocks follow a renamed provider, not the role spelling as an id', () => {
  const base = baseRegistry();
  const provider = { ...claimed(base.skills, 'crafting')!, id: 'fixture_provider', startingRecipes: [] };
  const { registry, issues } = buildRegistry([
    ...sourcesWithoutSkills(),
    {
      source: 'fixture-role',
      data: {
        skills: [provider],
        skillProgression: [...base.skillProgression.values()],
        recipes: [roleRecipe],
      },
    },
  ]);
  expect(issues).toEqual([]);
  const character = new Character(registry);
  const inventory = new Inventory(registry, undefined, undefined, character);
  expect(inventory.add(inventory.create('wax'), { kind: 'hand', side: 'right' })).toBe(true);
  const snapshot = bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5, clock: BASE_CLOCK })();
  const recipe = registry.recipes.get(roleRecipe.id)!;
  expect(character.knownRecipes.has(recipe.id)).toBe(false);
  expect(requirementStatus(recipe, snapshot, character).skills).toEqual([
    { skill: provider.id, required: 2, available: 0 },
  ]);
  expect(planCraft(recipe, snapshot, character)).toHaveProperty('missing');
  for (let level = 0; level < roleRecipe.skillUnlock.level; level += 1) {
    character.awardPractice(provider.id, practiceForNextLevel(registry, level));
  }
  expect(character.knownRecipes.has(recipe.id)).toBe(true);
  expect(planCraft(recipe, snapshot, character)).toHaveProperty('plan');
  const practice = character.practice[provider.id]!;
  expectCompleteRecipe(inventory, character);
  expect(character.practice[provider.id]).toBeGreaterThan(practice);
  expect(character.skills).not.toHaveProperty('crafting');
});

it('rejects unrelated providers of the same optional skill role with the role named', () => {
  const { issues } = buildRegistry([
    {
      source: 'first',
      data: { skills: [{ id: 'first', name: 'First', capability: 'mechanics', training: { craftingTierOffset: 1 } }] },
    },
    {
      source: 'second',
      data: {
        skills: [{ id: 'second', name: 'Second', capability: 'mechanics', training: { craftingTierOffset: 1 } }],
      },
    },
  ]);
  expect(
    issues.some(
      ({ message }) =>
        message.includes('competing claimants') &&
        message.includes('"mechanics"') &&
        message.includes('first') &&
        message.includes('second'),
    ),
  ).toBe(true);
});

it('admits firearms without a long-gun steadiness provider', () => {
  const { registry, issues } = buildRegistry(
    baseSources.map(({ source, data }) => {
      const file = data as ContentFile;
      return { source, data: { ...file, skills: file.skills?.filter((skill) => !skill.steadiness) } };
    }),
  );
  expect(issues).toEqual([]);
  const longGun = [...registry.items.values()].find((item) => item.firearm && item.twoHanded);
  expect(longGun).toBeDefined();
  expect(firearmSteadinessSkill(registry, longGun)).toBeUndefined();
});
