import { expect, it } from 'vitest';
import { claimed } from '../src/core/capabilities.ts';
import { Character, practiceForNextLevel, SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from '../src/core/character.ts';
import { buildRegistry, type Registry, requiredContentIssues } from '../src/core/content.ts';
import { CraftCommands } from '../src/core/craftCommands.ts';
import { planCraft, requirementStatus } from '../src/core/crafting.ts';
import { craftActionHooks } from '../src/core/craftWork.ts';
import { planDisassembly } from '../src/core/disassembly.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { pryPlan } from '../src/core/prying.ts';
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

// This alternative stack omits theme features with explicit skill-id dependencies. Recovery and
// door-forcing rows stay in: their role fields need no provider, which is the rule under test below.
const sourcesWithoutSkills = () =>
  baseSources.map(({ source, data }) => {
    const file = data as ContentFile;
    return {
      source,
      data: {
        ...file,
        skills: undefined,
        skillProgression: undefined,
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
  const provider = { ...claimed(base.skills, 'crafting')!, id: 'fixture_provider' };
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

// The first door some carried-or-carriable tool can force, found by property so no shipped row is pinned.
const forcingCase = (registry: Registry) => {
  for (const furniture of registry.furniture.values()) {
    for (const [method, tuning] of Object.entries(furniture.door?.methods ?? {})) {
      const tool = [...registry.items.values()].find(
        (item) => !item.twoHanded && (item.tool?.qualities?.[tuning.quality] ?? 0) >= tuning.level,
      );
      if (tool && tuning.fastestTimeSimSeconds < tuning.timeSimSeconds) {
        return { furniture, method, tuning, toolId: tool.id };
      }
    }
  }
  throw new Error('Fixture stack has no door a tool can force');
};

const practiceTo = (registry: Registry, character: Character, id: string, target: number): void => {
  while ((character.skills[id] ?? SKILL_LEVEL_MIN) < target) {
    character.awardPractice(id, practiceForNextLevel(registry, character.skills[id] ?? SKILL_LEVEL_MIN), target);
  }
};

it('recovery and door forcing follow their role provider, and a provider-less role adds no requirement', () => {
  const curve = { saturationFloor: 0.42, saturationHalfLifeLevels: 4 };
  const partFixture = {
    id: 'fixture_part',
    workInProgress: false,
    notLoot: false,
    economy: { usage: [], tiers: [] },
    name: 'Fixture part',
    category: 'material',
    weight: 1,
    size: [1, 1],
  };
  const takeApartFixture = {
    id: 'fixture_take_apart',
    workInProgress: false,
    notLoot: false,
    economy: { usage: [], tiers: [] },
    name: 'Fixture take apart',
    category: 'material',
    weight: 1,
    size: [1, 1],
    disassembly: {
      skill: 'crafting',
      timeGameMinutes: 1,
      yields: [{ item: partFixture.id, count: 1, fractions: [0.5, 1], rounding: 'floor' as const }],
    },
  };
  const recoveryProvider = {
    id: 'fixture_recovery_skill',
    capability: 'crafting',
    name: 'Fixture recovery',
    curve,
    training: { craftingTierOffset: 1 },
  };
  const forcingProvider = {
    id: 'fixture_forcing_skill',
    capability: 'mechanics',
    name: 'Fixture forcing',
    curve,
    training: { craftingTierOffset: 1 },
  };

  // With no providers at all, both mechanisms still plan at their unskilled baseline.
  const bare = buildRegistry([
    ...sourcesWithoutSkills(),
    { source: 'fixture-role-mechanisms', data: { items: [takeApartFixture, partFixture] } },
  ]);
  expect(bare.issues).toEqual([]);
  const bareCase = forcingCase(bare.registry);
  const bareCharacter = new Character(bare.registry);
  const bareInventory = new Inventory(bare.registry, undefined, undefined, bareCharacter);
  const bareDoor = bareInventory.furnish({
    type: bareCase.furniture.id,
    pos: [0, 1, 1],
    size: bareCase.furniture.size,
    facing: 'n',
    lock: { id: 'fixture_lock', locked: true },
  })!;
  const bareTool = bareInventory.create(bareCase.toolId);
  expect(bareInventory.add(bareTool, { kind: 'hand', side: 'right' })).toBe(true);
  const barePry = pryPlan(bareInventory, bareDoor, { toolUid: bareTool.uid }, bareCharacter);
  if (!barePry.ok) {
    throw new Error(barePry.reason);
  }
  expect(barePry.time).toBe(bareCase.tuning.timeSimSeconds);
  const bareSource = bareInventory.create(takeApartFixture.id);
  expect(bareInventory.add(bareSource, { kind: 'hand', side: 'left' })).toBe(true);
  const bareReach = bindReach({ inventory: bareInventory, position: [0, 0, 0], blockSize: 0.5, clock: BASE_CLOCK });
  const barePlan = planDisassembly(bareSource, bareReach(), bareCharacter);
  expect(barePlan).toBeDefined();
  expect(barePlan!.skillLevel).toBe(SKILL_LEVEL_MIN);

  // With providers whose ids differ from the role spellings, levels and times follow the mapped skills.
  const provided = buildRegistry([
    ...sourcesWithoutSkills(),
    {
      source: 'fixture-role-mechanisms',
      data: {
        skills: [recoveryProvider, forcingProvider],
        skillProgression: [...baseRegistry().skillProgression.values()],
        items: [takeApartFixture, partFixture],
      },
    },
  ]);
  expect(provided.issues).toEqual([]);
  const providedCase = forcingCase(provided.registry);
  const character = new Character(provided.registry);
  const inventory = new Inventory(provided.registry, undefined, undefined, character);
  const door = inventory.furnish({
    type: providedCase.furniture.id,
    pos: [0, 1, 1],
    size: providedCase.furniture.size,
    facing: 'n',
    lock: { id: 'fixture_lock', locked: true },
  })!;
  const tool = inventory.create(providedCase.toolId);
  expect(inventory.add(tool, { kind: 'hand', side: 'left' })).toBe(true);
  practiceTo(provided.registry, character, forcingProvider.id, SKILL_LEVEL_MAX);
  const pry = pryPlan(inventory, door, { toolUid: tool.uid }, character);
  if (!pry.ok) {
    throw new Error(pry.reason);
  }
  expect(pry.time).toBe(providedCase.tuning.fastestTimeSimSeconds);
  expect(pry.time).toBeLessThan(barePry.time);
  const source = inventory.create(takeApartFixture.id);
  expect(inventory.add(source, { kind: 'hand', side: 'right' })).toBe(true);
  const reach = bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5, clock: BASE_CLOCK });
  practiceTo(provided.registry, character, recoveryProvider.id, 3);
  const plan = planDisassembly(source, reach(), character);
  expect(plan).toBeDefined();
  expect(plan!.skillLevel).toBe(3);
  expect(character.skills).not.toHaveProperty('crafting');
});
