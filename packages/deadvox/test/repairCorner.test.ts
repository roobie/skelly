import { describe, expect, it } from 'vitest';
import { Character, practiceForNextLevel, SKILL_LEVEL_LEGENDARY } from '../src/core/character.ts';
import type { RecipeDef, Registry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { planCraft } from '../src/core/crafting.ts';
import { Inventory } from '../src/core/inventory.ts';
import { bindReach } from '../src/core/reach.ts';
import { cellsOf, footprint, placedPieces } from '../src/core/templates.ts';
import { gameMinutes } from '../src/core/time.ts';
import { startingLoadout } from '../src/game/loadout.ts';
import { populateTestHouseRepairCorner, repairStockRecipes } from '../src/game/testHouseRepair.ts';
import { baseRegistry as loadBaseRegistry } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { testHouseSite } from './testHouseSite.ts';

const baseRegistry = loadBaseRegistry();

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

const house = testHouseSite(scenarioRegistry);
const stockBuilding = house.site.placements.find(({ template }) => template.id === house.layout.repairStock)!;
const repairRecipes = repairStockRecipes(scenarioRegistry, placedPieces(stockBuilding));

const addRepairCorner = (inventory: Inventory, site: string, debug = true): void => {
  populateTestHouseRepairCorner({ inventory, registry: scenarioRegistry, site, debug, source: house.site });
};

/** Column arrival as the session does it, for the stock building's furniture only. */
const arriveStockBuilding = (inventory: Inventory, at = house): void => {
  const [ox, , oz] = stockBuilding.origin;
  const [width, depth] = footprint(stockBuilding);
  for (const spawn of at.furniture) {
    const [x, , z] = spawn.spec.pos;
    if (x >= ox && x < ox + width && z >= oz && z < oz + depth) {
      inventory.furnishSpawn(spawn);
    }
  }
};

/** The stock building with one container mark drawn tipped and holding an authored item, as valid content may. */
const authoredStockFixture = () => {
  const template = scenarioRegistry.templates.get(house.layout.repairStock!)!;
  const marks = Object.entries(template.palette).flatMap(([char, candidate]) =>
    typeof candidate === 'object' && 'furniture' in candidate && candidate.furniture && !candidate.tip
      ? [{ char, entry: candidate, furniture: candidate.furniture }]
      : [],
  );
  const mark = marks.find(({ furniture }) => {
    const def = scenarioRegistry.furniture.get(furniture);
    // Tipping back swaps height and depth, so a piece with equal ones keeps its drawn footprint.
    return def?.container && def.size[1] === def.size[2];
  })!;
  const stockTypes = new Set(
    repairRecipes.flatMap(({ result, components }) => [result.item, ...components.flat().map((part) => part.item)]),
  );
  const item = [...scenarioRegistry.items.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .find(({ id, tool }) => !(tool || stockTypes.has(id)))!.id;
  const authored: typeof template = {
    ...template,
    palette: { ...template.palette, [mark.char]: { ...mark.entry, tip: 'back', items: [{ item, count: 1 }] } },
  };
  const registry: Registry = {
    ...scenarioRegistry,
    templates: new Map([...scenarioRegistry.templates, [template.id, authored]]),
  };
  return { registry, at: testHouseSite(registry), furniture: mark.furniture, item };
};

const furnitureCells = new Set(
  house.furniture.flatMap(({ spec }) =>
    [...cellsOf(spec.size)].map(([dx, , dz]) => [spec.pos[0] + dx, spec.pos[2] + dz].join()),
  ),
);

/** Floor cells inside the stock building where the player can stand. */
const standPoints = (): Vec3[] => {
  const [ox, oy, oz] = stockBuilding.origin;
  const [width, depth] = footprint(stockBuilding);
  const points: Vec3[] = [];
  for (let x = ox; x < ox + width; x += 1) {
    for (let z = oz; z < oz + depth; z += 1) {
      if (house.walkable(x, oy + 1, z) && !furnitureCells.has([x, z].join())) {
        points.push([x + 0.5, oy + 1, z + 0.5]);
      }
    }
  }
  return points;
};

interface StockItem {
  item: { uid: number; type: string; count: number; condition: number };
}

interface RepairPlanCheck {
  recipe: string;
  targetCount: number;
  expectedTargets: number;
  components: { type: string; available: number; required: number }[];
  qualities: { quality: string; provided: boolean }[];
}

const repairCharacter = (): Character => {
  const character = new Character(scenarioRegistry);
  character.learnRecipes(repairRecipes.map(({ id }) => id));
  for (const recipe of repairRecipes) {
    for (const [skill, required] of Object.entries(recipe.skills)) {
      while ((character.skills[skill] ?? 0) < required) {
        character.awardPractice(
          skill,
          practiceForNextLevel(scenarioRegistry, character.skills[skill] ?? 0),
          SKILL_LEVEL_LEGENDARY,
        );
      }
    }
  }
  return character;
};

const targetUidsFor = (stock: readonly StockItem[]): Set<number> => {
  const targetTypes = new Set(repairRecipes.map((recipe) => recipe.result.item));
  return new Set(
    stock.filter(({ item }) => targetTypes.has(item.type) && item.condition < 1).map(({ item }) => item.uid),
  );
};

type CraftPlan = Extract<ReturnType<typeof planCraft>, { plan: unknown }>['plan'];
type ReachSnapshot = ReturnType<ReturnType<typeof bindReach>>;

/** The first stand point in the building that reaches a damaged target and plans its repair, if any. */
const planFromBuilding = (
  recipe: RecipeDef,
  reaches: readonly ReturnType<typeof bindReach>[],
  character: Character,
  targetUids: ReadonlySet<number>,
): { plan: CraftPlan; snapshot: ReachSnapshot } | undefined => {
  for (const reach of reaches) {
    const snapshot = reach();
    if (!snapshot.entries.some(({ item }) => item.type === recipe.result.item && targetUids.has(item.uid))) {
      continue;
    }
    const result = planCraft(recipe, snapshot, character);
    if ('plan' in result) {
      return { plan: result.plan, snapshot };
    }
  }
  return undefined;
};

const repairPlanCheck = ({
  recipe,
  stock,
  plan,
  snapshot,
  targetUids,
}: {
  recipe: RecipeDef;
  stock: readonly StockItem[];
  plan: CraftPlan;
  snapshot: ReachSnapshot;
  targetUids: ReadonlySet<number>;
}): RepairPlanCheck => {
  const targets = stock.filter(
    ({ item }) => item.type === recipe.result.item && item.count === 1 && item.condition > 0 && item.condition < 1,
  );
  const required = new Map<string, number>();
  for (const { item, count } of plan.components) {
    required.set(item.type, (required.get(item.type) ?? 0) + count * 2);
  }
  const toolUids = new Set(plan.tools.map(({ item }) => item.uid));
  const available = new Map<string, number>();
  for (const { item } of stock) {
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
      provided:
        snapshot.workstations.some((station) => (station.qualities[quality] ?? 0) >= level) ||
        plan.tools.some(
          ({ item, quality: plannedQuality }) =>
            plannedQuality === quality &&
            (scenarioRegistry.items.get(item.type)?.tool?.qualities[quality] ?? 0) >= level,
        ),
    })),
  };
};

describe('test-house repair stock', () => {
  it('plans every repair the stock building serves from a stand point inside it, twice over in components', () => {
    const inventory = new Inventory(scenarioRegistry);
    addRepairCorner(inventory, 'testHouse');
    arriveStockBuilding(inventory);
    for (const entity of inventory.entities.records) {
      if (entity.pockets) {
        inventory.entities.markSearched(entity);
      }
    }
    const stock = [...inventory.items()].filter(({ location }) => location.kind === 'furniture');
    const targetUids = targetUidsFor(stock);
    const obstacles = { isSolid: house.solid, version: 0 };
    const reaches = standPoints().map((position) =>
      bindReach({ inventory, position, blockSize: house.s, clock: BASE_CLOCK, obstacles }),
    );
    const character = repairCharacter();
    expect(repairRecipes.length).toBeGreaterThan(0);
    const checks = repairRecipes.map((recipe) => {
      const planned = planFromBuilding(recipe, reaches, character, targetUids);
      expect(planned, `${recipe.id} plans beside its target inside the stock building`).toBeDefined();
      return repairPlanCheck({ recipe, stock, ...planned!, targetUids });
    });

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

  it('stocks every item with a tool quality in the stock building', () => {
    const inventory = new Inventory(scenarioRegistry);
    addRepairCorner(inventory, 'testHouse');
    arriveStockBuilding(inventory);
    const [ox, , oz] = stockBuilding.origin;
    const [width, depth] = footprint(stockBuilding);
    const stocked = new Set(
      [...inventory.items()].flatMap(({ item, location }) => {
        const [x, , z] = location.kind === 'furniture' ? location.entity.origin : [Number.NaN, 0, Number.NaN];
        return x >= ox && x < ox + width && z >= oz && z < oz + depth ? [item.type] : [];
      }),
    );
    const tools = [...scenarioRegistry.items.values()].filter(
      ({ tool }) => Object.keys(tool?.qualities ?? {}).length > 0,
    );
    expect(tools.length).toBeGreaterThan(0);
    // The listing is by tool quality, not by what loot admits, so a tool that never spawns is stocked too.
    expect(tools.some(({ economy }) => economy?.usage.length === 0)).toBe(true);
    expect(tools.filter(({ id }) => !stocked.has(id)).map(({ id }) => id)).toEqual([]);
  });

  it('keeps the stocked containers when their column arrives', () => {
    const inventory = new Inventory(scenarioRegistry);
    addRepairCorner(inventory, 'testHouse');
    const stocked = [...inventory.entities.records].map(({ uid }) => uid);
    const items = [...inventory.items()].length;
    arriveStockBuilding(inventory);
    const containers = [...inventory.entities.records].filter(({ pockets }) => pockets);
    expect(containers.map(({ uid }) => uid).sort()).toEqual(stocked.sort());
    expect([...inventory.items()].length).toBe(items);
  });

  it('keeps a stock container’s authored pose and contents through early stocking and arrival, once', () => {
    const fixture = authoredStockFixture();
    const inventory = new Inventory(fixture.registry);
    populateTestHouseRepairCorner({
      inventory,
      registry: fixture.registry,
      site: 'testHouse',
      debug: true,
      source: fixture.at.site,
    });
    const state = () => {
      const tipped = [...inventory.entities.records].filter(
        ({ type, tip }) => type === fixture.furniture && tip === 'back',
      );
      const holders = new Set(
        [...inventory.items()].flatMap(({ item, location }) =>
          item.type === fixture.item && location.kind === 'furniture' ? [location.entity.uid] : [],
        ),
      );
      return {
        tipped: tipped.map(({ uid }) => uid).sort(),
        stocked: tipped.every(({ uid }) => holders.has(uid)),
        containers: [...inventory.entities.records]
          .filter(({ type }) => fixture.registry.furniture.get(type)?.container)
          .map(({ uid }) => uid)
          .sort(),
        items: [...inventory.items()].length,
      };
    };
    const early = state();
    expect(early.tipped.length).toBeGreaterThan(0);
    expect(early.stocked).toBe(true);
    arriveStockBuilding(inventory, fixture.at);
    expect(state()).toEqual(early);
  });

  it('keeps derived repair stock out of normal mode', () => {
    const inventory = new Inventory(scenarioRegistry);
    addRepairCorner(inventory, 'testHouse', false);
    expect([...inventory.items()]).toEqual([]);
    expect([...inventory.entities.records]).toEqual([]);
  });

  it('adds no repair stock to the default or authored sites', () => {
    const authoredSite = [...scenarioRegistry.layouts.values()].find((layout) => !layout.repairStock)!.id;
    for (const site of ['gauntlet', authoredSite]) {
      const inventory = new Inventory(scenarioRegistry);
      startingLoadout(inventory);
      const before = [...inventory.items()].length;
      addRepairCorner(inventory, site);
      expect([...inventory.items()].length).toBe(before);
    }
  });
});
