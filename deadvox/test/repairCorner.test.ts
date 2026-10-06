import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Character, practiceForNextLevel, SKILL_LEVEL_LEGENDARY } from '../src/core/character.ts';
import { buildRegistry, type RecipeDef, type Registry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { planCraft } from '../src/core/crafting.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import { startingLoadout } from '../src/game/loadout.ts';
import { populateTestHouseRepairCorner } from '../src/game/testHouse.ts';
import { gameMinutes } from '../src/core/time.ts';

const { registry: baseRegistry } = buildRegistry(
  readdirSync('src/content/base')
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      source: file,
      data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown,
    })),
);

const fixtureRecipe = (): RecipeDef => {
  const items = [...baseRegistry.items.values()].sort((a, b) => a.id.localeCompare(b.id));
  const target = items.find((item) => item.weapon?.melee) ?? items[0]!;
  const component = items.find((item) => item.id !== target.id)!;
  const provider = items.find((item) => item.tool && Object.keys(item.tool.qualities).length > 0)!;
  const [quality, level] = Object.entries(provider.tool!.qualities)[0]!;
  const skill = baseRegistry.skills.keys().next().value ?? 'fixture_skill';
  return {
    id: 'fixture_repair_corner',
    kind: 'repair',
    result: { item: target.id, count: 1 },
    repair: { skill, amount: 0.2, perSkill: 0 },
    timeGameMinutes: gameMinutes(1),
    skills: { [skill]: 1 },
    qualities: { [quality]: level },
    components: [[{ item: component.id, count: 1 }]],
  };
};

const repairFixture = fixtureRecipe();
const scenarioRegistry: Registry = {
  ...baseRegistry,
  recipes: new Map([...baseRegistry.recipes, [repairFixture.id, repairFixture]]),
};

const repairRecipes = [...scenarioRegistry.recipes.values()].filter((recipe) => recipe.kind === 'repair');

const addRepairCorner = (inventory: Inventory, site: string): void => {
  populateTestHouseRepairCorner({
    inventory,
    registry: scenarioRegistry,
    site,
    spawn: [-4, 0, -0.5],
    blockSize: 0.5,
  });
};

interface PileItem {
  item: { uid: number; type: string; count: number; condition: number };
}

interface RepairPlanCheck {
  recipe: string;
  targetCount: number;
  expectedTargets: number;
  components: { type: string; available: number; required: number }[];
  qualities: { quality: string; provided: boolean }[];
}

const cornerPosition = (inventory: Inventory): Vec3 => {
  const positions = [...inventory.piles.values()].map(({ pos }) => pos);
  return [
    positions.reduce((sum, pos) => sum + pos[0] + 0.5, 0) / positions.length,
    positions[0]![1],
    positions.reduce((sum, pos) => sum + pos[2] + 0.5, 0) / positions.length,
  ];
};

const repairCharacter = (): Character => {
  const character = new Character(scenarioRegistry);
  character.learnRecipes(repairRecipes.map(({ id }) => id));
  for (const recipe of repairRecipes) {
    for (const [skill, required] of Object.entries(recipe.skills)) {
      while ((character.skills[skill] ?? 0) < required) {
        character.awardPractice(skill, practiceForNextLevel(character.skills[skill] ?? 0), SKILL_LEVEL_LEGENDARY);
      }
    }
  }
  return character;
};

const targetUidsFor = (piles: readonly PileItem[]): Set<number> => {
  const targetTypes = new Set(repairRecipes.map((recipe) => recipe.result.item));
  return new Set(
    piles.filter(({ item }) => targetTypes.has(item.type) && item.condition < 1).map(({ item }) => item.uid),
  );
};

const repairPlanCheck = ({
  recipe,
  piles,
  reach,
  character,
  targetUids,
}: {
  recipe: RecipeDef;
  piles: readonly PileItem[];
  reach: ReturnType<typeof bindReach>;
  character: Character;
  targetUids: ReadonlySet<number>;
}): RepairPlanCheck => {
  const targets = piles.filter(
    ({ item }) => item.type === recipe.result.item && item.count === 1 && item.condition > 0 && item.condition < 1,
  );
  const result = planCraft(recipe, reach(), character);
  if (!('plan' in result)) {
    throw new Error(`${recipe.id}: ${result.missing.reason}`);
  }
  const required = new Map<string, number>();
  for (const { item, count } of result.plan.components) {
    required.set(item.type, (required.get(item.type) ?? 0) + count * 2);
  }
  const toolUids = new Set(result.plan.tools.map(({ item }) => item.uid));
  const available = new Map<string, number>();
  for (const { item } of piles) {
    if (toolUids.has(item.uid) || targetUids.has(item.uid)) {
      continue;
    }
    available.set(item.type, (available.get(item.type) ?? 0) + item.count);
  }
  return {
    recipe: recipe.id,
    targetCount: targets.length,
    expectedTargets: repairRecipes.filter((candidate) => candidate.result.item === recipe.result.item).length,
    components: [...required].map(([type, requiredCount]) => ({
      type,
      required: requiredCount,
      available: available.get(type) ?? 0,
    })),
    qualities: Object.entries(recipe.qualities).map(([quality, level]) => ({
      quality,
      provided: result.plan.tools.some(
        ({ item, quality: plannedQuality }) =>
          plannedQuality === quality && (scenarioRegistry.items.get(item.type)?.tool?.qualities[quality] ?? 0) >= level,
      ),
    })),
  };
};

describe('test-house repair corner', () => {
  it('stocks every repair target, two planned repairs of components, and the required tool qualities', () => {
    const inventory = new Inventory(scenarioRegistry);
    addRepairCorner(inventory, 'testHouse');
    const piles = [...inventory.items()].filter(({ location }) => location.kind === 'pile');
    const targetUids = targetUidsFor(piles);
    const reach = bindReach({ inventory, position: cornerPosition(inventory), blockSize: 0.5 });
    const character = repairCharacter();
    const checks = repairRecipes.map((recipe) => repairPlanCheck({ recipe, piles, reach, character, targetUids }));

    for (const check of checks) {
      expect(check.targetCount, `${check.recipe} targets`).toBe(check.expectedTargets);
      for (const component of check.components) {
        expect(component.available, `${check.recipe} component ${component.type}`).toBeGreaterThanOrEqual(
          component.required,
        );
      }
      for (const quality of check.qualities) {
        expect(quality.provided, `${check.recipe} quality ${quality.quality}`).toBe(true);
      }
    }
  });

  it('adds no corner piles to the default or authored sites', () => {
    const authoredSite = [...scenarioRegistry.layouts.keys()].sort()[0]!;
    for (const site of ['hamlet', authoredSite]) {
      const inventory = new Inventory(scenarioRegistry);
      startingLoadout(inventory);
      addRepairCorner(inventory, site);
      expect(inventory.piles.size).toBe(0);
    }
  });
});
