import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Character } from '../src/core/character.ts';
import { buildRegistry, type RecipeDef, type Registry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { Inventory } from '../src/core/inventory.ts';
import { planCraft } from '../src/core/crafting.ts';
import { bindReach } from '../src/core/reach.ts';
import { startingLoadout } from '../src/game/loadout.ts';
import { populateTestHouseRepairCorner } from '../src/game/testHouse.ts';

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
    time: 1,
    skills: {},
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
  populateTestHouseRepairCorner(inventory, scenarioRegistry, site, [-4, 0, -0.5], 0.5);
};

describe('test-house repair corner', () => {
  it('stocks every repair target, two planned repairs of components, and the required tool qualities', () => {
    const inventory = new Inventory(scenarioRegistry);
    addRepairCorner(inventory, 'testHouse');
    const piles = [...inventory.items()].filter(({ location }) => location.kind === 'pile');
    const positions = [...inventory.piles.values()].map(({ pos }) => pos);
    const position: Vec3 = [
      positions.reduce((sum, pos) => sum + pos[0] + 0.5, 0) / positions.length,
      positions[0]![1],
      positions.reduce((sum, pos) => sum + pos[2] + 0.5, 0) / positions.length,
    ];
    const reach = bindReach({ inventory, position, blockSize: 0.5 });
    const character = new Character(scenarioRegistry);
    for (const recipe of repairRecipes) {
      character.knownRecipes.add(recipe.id);
      for (const [skill, required] of Object.entries(recipe.skills)) {
        character.skills[skill] = Math.max(character.skills[skill] ?? 0, required);
      }
    }

    for (const recipe of repairRecipes) {
      const targets = piles.filter(
        ({ item }) =>
          item.type === recipe.result.item && item.count === 1 && item.condition > 0 && item.condition < 1,
      );
      expect(targets).toHaveLength(repairRecipes.filter((candidate) => candidate.result.item === recipe.result.item).length);

      const planned = planCraft(recipe, reach(), character);
      if (!('plan' in planned)) {
        throw new Error(`${recipe.id}: ${planned.missing.reason}`);
      }
      const requiredComponents = new Map<string, number>();
      for (const { item, count } of planned.plan.components) {
        requiredComponents.set(item.type, (requiredComponents.get(item.type) ?? 0) + count * 2);
      }
      const toolUids = new Set(planned.plan.tools.map(({ item }) => item.uid));
      const targetTypes = new Set(repairRecipes.map((candidate) => candidate.result.item));
      const targetUids = new Set(
        piles
          .filter(({ item }) => targetTypes.has(item.type) && item.condition < 1)
          .map(({ item }) => item.uid),
      );
      const available = new Map<string, number>();
      for (const { item } of piles) {
        if (toolUids.has(item.uid) || targetUids.has(item.uid)) {
          continue;
        }
        available.set(item.type, (available.get(item.type) ?? 0) + item.count);
      }
      for (const [type, count] of requiredComponents) {
        expect(available.get(type) ?? 0, `${recipe.id} component ${type}`).toBeGreaterThanOrEqual(count);
      }
      for (const [quality, level] of Object.entries(recipe.qualities)) {
        expect(
          planned.plan.tools.some(
            ({ item, quality: plannedQuality }) =>
              plannedQuality === quality && (scenarioRegistry.items.get(item.type)?.tool?.qualities[quality] ?? 0) >= level,
          ),
          `${recipe.id} quality ${quality}`,
        ).toBe(true);
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
