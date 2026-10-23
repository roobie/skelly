import type { RecipeDef, Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';

/** #231 can provide book item IDs here once content records which recipes each book teaches. */
type RepairBookHook = (registry: Registry, recipes: readonly RecipeDef[]) => readonly string[];

interface TestHouseRepairCornerOptions {
  inventory: Inventory;
  registry: Registry;
  site: string;
  debug: boolean;
  blockSize: number;
  repairBooks?: RepairBookHook;
}

const repairCornerStock = (registry: Registry, recipes: readonly RecipeDef[]) => {
  const components = new Map<string, number>();
  const qualities = new Map<string, number>();
  for (const recipe of recipes) {
    for (const group of recipe.components) {
      const alternative = group.find(({ item }) => registry.items.has(item));
      if (!alternative) {
        throw new Error(`Repair recipe ${recipe.id} has no component item`);
      }
      components.set(alternative.item, (components.get(alternative.item) ?? 0) + 2 * alternative.count);
    }
    for (const [quality, level] of Object.entries(recipe.qualities)) {
      qualities.set(quality, Math.max(qualities.get(quality) ?? 0, level));
    }
  }
  return { components, qualities };
};

const repairCornerToolTypes = (
  registry: Registry,
  recipes: readonly RecipeDef[],
  qualities: ReadonlyMap<string, number>,
  repairBooks: RepairBookHook,
): Set<string> => {
  const itemsById = [...registry.items.values()].sort((a, b) => a.id.localeCompare(b.id));
  const tools = new Set<string>();
  for (const [quality, level] of [...qualities].sort(([a], [b]) => a.localeCompare(b))) {
    const provider = itemsById.find((item) => (item.tool?.qualities[quality] ?? 0) >= level);
    if (!provider) {
      throw new Error(`No item provides ${quality} quality for the test-house repair corner`);
    }
    tools.add(provider.id);
  }
  for (const book of repairBooks(registry, recipes)) {
    if (!registry.items.has(book)) {
      throw new Error(`Repair book hook returned unknown item ${book}`);
    }
    tools.add(book);
  }
  return tools;
};

const placeRepairCornerItem = ({
  inventory,
  registry,
  pilePositions,
  type,
  count,
  condition,
}: {
  inventory: Inventory;
  registry: Registry;
  pilePositions: readonly Vec3[];
  type: string;
  count: number;
  condition: number;
}): void => {
  const stackSize = registry.items.get(type)?.stack ?? 1;
  let remaining = count;
  while (remaining > 0) {
    const item = inventory.create(type, Math.min(remaining, stackSize), condition);
    if (!pilePositions.some((pos) => inventory.add(item, { kind: 'pile', pos }))) {
      throw new Error(`No room for ${type} in the test-house repair corner`);
    }
    remaining -= item.count;
  }
};

/** Populate the fixture destinations with content-derived repair stock. */
export const populateTestHouseRepairCorner = ({
  inventory,
  registry,
  site,
  debug,
  blockSize,
  repairBooks = () => [],
}: TestHouseRepairCornerOptions): void => {
  if (!debug) {
    return;
  }
  const layout = registry.layouts.get(site);
  if (!layout?.fixturePiles?.length) {
    return;
  }
  // The corner is piles only, so a repair that needs a workstation cannot be served there.
  const recipes = [...registry.recipes.values()]
    .filter((recipe) => recipe.kind === 'repair' && !recipe.workstation)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (recipes.length === 0) {
    return;
  }
  const stock = repairCornerStock(registry, recipes);
  const tools = repairCornerToolTypes(registry, recipes, stock.qualities, repairBooks);
  const pilePositions = layout.fixturePiles.map((pos) => pos.map((value) => Math.round(value / blockSize)) as Vec3);
  recipes.forEach((recipe, index) => {
    placeRepairCornerItem({
      inventory,
      registry,
      pilePositions,
      type: recipe.result.item,
      count: 1,
      condition: 0.25 + (0.5 * (index + 1)) / (recipes.length + 1),
    });
  });
  for (const type of [...tools].sort()) {
    placeRepairCornerItem({ inventory, registry, pilePositions, type, count: 1, condition: 1 });
  }
  for (const [type, count] of [...stock.components].sort(([a], [b]) => a.localeCompare(b))) {
    placeRepairCornerItem({ inventory, registry, pilePositions, type, count, condition: 1 });
  }
};
