import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { claimed } from '../src/core/capabilities.ts';
import { Character, practiceForNextLevel, SKILL_LEVEL_MAX, SKILL_LEVEL_MIN } from '../src/core/character.ts';
import { buildRegistry, type ContentSource, type Registry, requiredContentIssues } from '../src/core/content.ts';
import { CraftCommands } from '../src/core/craftCommands.ts';
import { planCraft, requirementStatus } from '../src/core/crafting.ts';
import { craftActionHooks } from '../src/core/craftWork.ts';
import { planDisassembly } from '../src/core/disassembly.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { pryPlan } from '../src/core/prying.ts';
import { bindReach } from '../src/core/reach.ts';
import type { ContentFile, ItemDef } from '../src/core/schema.ts';
import { firearmSteadinessSkill } from '../src/core/skillTraining.ts';
import { baseSources } from '../src/game/bundledContent.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { FIXTURE_BLOW_SOUND, fixtureBreach, fixtureItemEconomy, fixtureMaterials } from './economyFixtures.ts';
import { fixtureIds } from './fixtures/capabilityIds.ts';
import { firearmsSkillSource } from './fixtures/playerInventory.ts';
import { fixtureScenarioSources } from './fixtures/scenario.ts';
import { Simulation } from './simulationFixture.ts';
import { advance, createRuntime } from './snapshotTestSupport.ts';
import { sweepGroup } from './sweeps.ts';

const roleRecipe = {
  id: 'fixture_role_recipe',
  category: 'fixture_category',
  tags: [],
  searchTerms: [],
  result: { item: 'fixture_token', count: 1 },
  timeGameMinutes: 1,
  skills: { crafting: 2 },
  skillUnlock: { skill: 'crafting', level: 2 },
  qualities: {},
  components: [[{ item: 'fixture_token', count: 1 }]],
};

// The small scenario stack with its one skill dropped, not the bundled content: these role rules need only
// crafting, prying and disassembly rows, and a build of the bundled content runs every reference and spatial
// check over every bundled site. Crafting holds its work in the stack's one work-in-progress item.
const stackWithoutSkills = (extra: Record<string, unknown> = {}): ContentSource[] => [
  ...fixtureScenarioSources().map(({ source, data }) => ({
    source,
    data: { ...(data as ContentFile), skills: undefined },
  })),
  {
    source: 'fixture-craft.json',
    data: {
      recipeCategories: [{ id: roleRecipe.category, label: 'Fixture', order: 1 }],
      items: [
        {
          id: 'fixture_work',
          name: 'Fixture work',
          workInProgress: true,
          category: 'material',
          weight: 0,
          size: [2, 2],
        },
      ],
    },
  },
  { source: 'fixture-role.json', data: extra },
];

const residual = (name: string) =>
  JSON.parse(readFileSync(`mods/skelly.deadvox.residual/${name}`, 'utf8')) as ContentFile;
const residualSkill = (id: string) =>
  structuredClone(residual('recipes.json').skills!.find((skill) => skill.id === id)!);
const residualProgression = () => structuredClone(residual('recipes.json').skillProgression!);

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

// Its point is the whole bundled stack: every bundled feature must validate and run with skills removed, so it
// needs a full reference pass over every bundled site and stays behind the slow-test gate.
sweepGroup('bundled stack without skills', () => {
  it('validates and runs an alternative stack with no skills or progression provider', () => {
    const { registry, issues } = buildRegistry(sourcesWithoutSkills());
    expect(issues).toEqual([]);
    expect(requiredContentIssues(registry)).toEqual([]);
    expect(registry.skills.size).toBe(0);
    const runtime = createRuntime(undefined, false, undefined, { registry });
    advance(runtime, 1);
    expect(runtime.session.character.snapshotState().skills).toEqual({});
  });
});

it('a recipe role without a provider adds neither a skill gate nor an unlock requirement', () => {
  const { registry, issues } = buildRegistry(stackWithoutSkills({ recipes: [roleRecipe] }));
  expect(issues).toEqual([]);
  expect(registry.skills.size).toBe(0);
  const character = new Character(registry);
  const inventory = new Inventory(registry, undefined, undefined, character);
  expect(inventory.add(inventory.create(roleRecipe.result.item), { kind: 'hand', side: 'right' })).toBe(true);
  const snapshot = bindReach({ inventory, position: [0, 0, 0], blockSize: 0.5, clock: BASE_CLOCK })();
  const recipe = registry.recipes.get(roleRecipe.id)!;
  expect(character.knownRecipes.has(recipe.id)).toBe(true);
  expect(requirementStatus(recipe, snapshot, character).skills).toEqual([]);
  expect(planCraft(recipe, snapshot, character)).toHaveProperty('plan');
  expectCompleteRecipe(inventory, character);
  expect(character.snapshotState().practice).toEqual({});
});

it('recipe gates and unlocks follow a renamed provider, not the role spelling as an id', () => {
  const provider = { ...residualSkill(fixtureIds.crafting), id: 'fixture_provider' };
  const { registry, issues } = buildRegistry(
    stackWithoutSkills({ skills: [provider], skillProgression: residualProgression(), recipes: [roleRecipe] }),
  );
  expect(issues).toEqual([]);
  const character = new Character(registry);
  const inventory = new Inventory(registry, undefined, undefined, character);
  expect(inventory.add(inventory.create(roleRecipe.result.item), { kind: 'hand', side: 'right' })).toBe(true);
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

it('rejects unrelated providers of the same optional skill role with the role and both sources named', () => {
  const { issues } = buildRegistry([
    {
      source: 'fixture.alpha/skills.json',
      data: { skills: [{ id: 'first', name: 'First', capability: 'mechanics', training: { craftingTierOffset: 1 } }] },
    },
    {
      source: 'fixture.beta/skills.json',
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
        message.includes('second') &&
        message.includes('fixture.alpha/skills.json') &&
        message.includes('fixture.beta/skills.json'),
    ),
  ).toBe(true);
});

it('admits firearms without a long-gun steadiness provider', () => {
  const firearms = firearmsSkillSource();
  const firearmsFile = firearms.data as ContentFile;
  const { registry, issues } = buildRegistry([
    ...stackWithoutSkills(),
    { ...firearms, data: { ...firearmsFile, skills: firearmsFile.skills?.filter((skill) => !skill.steadiness) } },
  ]);
  expect(issues).toEqual([]);
  expect(claimed(registry.skills, 'firearmsCombat')?.combat?.firearms?.longGunSteadinessRole).toBeDefined();
  const longGun = residual('models-firearms.json').items?.find((item) => item.firearm && item.twoHanded) as ItemDef;
  expect(longGun).toBeDefined();
  expect(firearmSteadinessSkill(registry, longGun)).toBeUndefined();
});

// A lockable door one fixture tool can force, faster at the forcing role's top level.
const forcedDoor = {
  id: 'fixture_forced_door',
  name: 'Fixture door',
  size: [2, 4, 1] as [number, number, number],
  color: '#808080',
  breach: fixtureBreach(),
  material: 'fixture_pry_material',
  door: {
    handlingSimSeconds: 0.2,
    methods: {
      pry: {
        quality: 'prying',
        level: 1,
        skill: 'mechanics',
        timeSimSeconds: 4,
        fastestTimeSimSeconds: 2,
        strikeIntervalSimSeconds: 0.5,
        strikeSound: FIXTURE_BLOW_SOUND,
      },
    },
  },
};
const forcingTuning = forcedDoor.door.methods.pry;
const forcingTool = {
  id: 'fixture_pry_tool',
  workInProgress: false,
  name: 'Fixture pry tool',
  category: 'tool',
  weight: 1,
  size: [1, 1],
  tool: { qualities: { [forcingTuning.quality]: forcingTuning.level } },
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
    name: 'Fixture part',
    category: 'material',
    weight: 1,
    size: [1, 1],
  };
  const takeApartFixture = {
    id: 'fixture_take_apart',
    workInProgress: false,
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

  const mechanisms = {
    furnitureMaterials: [{ ...fixtureMaterials()[0]!, id: forcedDoor.material, methods: ['pry'] }],
    items: [takeApartFixture, partFixture, forcingTool],
    itemEconomy: fixtureItemEconomy(takeApartFixture.id, partFixture.id, forcingTool.id),
    furniture: [forcedDoor],
  };

  // With no providers at all, both mechanisms still plan at their unskilled baseline.
  const bare = buildRegistry(stackWithoutSkills(mechanisms));
  expect(bare.issues).toEqual([]);
  expect(bare.registry.skills.size).toBe(0);
  const bareCharacter = new Character(bare.registry);
  const bareInventory = new Inventory(bare.registry, undefined, undefined, bareCharacter);
  const bareDoor = bareInventory.furnish({
    type: forcedDoor.id,
    pos: [0, 1, 1],
    size: forcedDoor.size,
    facing: 'n',
    lock: { id: 'fixture_lock', locked: true },
  })!;
  const bareTool = bareInventory.create(forcingTool.id);
  expect(bareInventory.add(bareTool, { kind: 'hand', side: 'right' })).toBe(true);
  const barePry = pryPlan(bareInventory, bareDoor, { toolUid: bareTool.uid }, bareCharacter);
  if (!barePry.ok) {
    throw new Error(barePry.reason);
  }
  expect(barePry.time).toBe(forcingTuning.timeSimSeconds);
  const bareSource = bareInventory.create(takeApartFixture.id);
  expect(bareInventory.add(bareSource, { kind: 'hand', side: 'left' })).toBe(true);
  const bareReach = bindReach({ inventory: bareInventory, position: [0, 0, 0], blockSize: 0.5, clock: BASE_CLOCK });
  const barePlan = planDisassembly(bareSource, bareReach(), bareCharacter);
  expect(barePlan).toBeDefined();
  expect(barePlan!.skillLevel).toBe(SKILL_LEVEL_MIN);

  // With providers whose ids differ from the role spellings, levels and times follow the mapped skills.
  const provided = buildRegistry(
    stackWithoutSkills({
      ...mechanisms,
      skills: [recoveryProvider, forcingProvider],
      skillProgression: residualProgression(),
    }),
  );
  expect(provided.issues).toEqual([]);
  const character = new Character(provided.registry);
  const inventory = new Inventory(provided.registry, undefined, undefined, character);
  const door = inventory.furnish({
    type: forcedDoor.id,
    pos: [0, 1, 1],
    size: forcedDoor.size,
    facing: 'n',
    lock: { id: 'fixture_lock', locked: true },
  })!;
  const tool = inventory.create(forcingTool.id);
  expect(inventory.add(tool, { kind: 'hand', side: 'left' })).toBe(true);
  practiceTo(provided.registry, character, forcingProvider.id, SKILL_LEVEL_MAX);
  const pry = pryPlan(inventory, door, { toolUid: tool.uid }, character);
  if (!pry.ok) {
    throw new Error(pry.reason);
  }
  expect(pry.time).toBe(forcingTuning.fastestTimeSimSeconds);
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
