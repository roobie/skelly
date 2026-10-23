import type { BlockEntity } from '../core/blockEntities.ts';
import type { RecipeDef, Registry } from '../core/content.ts';
import { toChunk, type Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Site } from '../core/site.ts';
import { type PlacedPiece, placedPieces } from '../core/templates.ts';

/** The site the stock stands in: its authored placements (absent on a generated site) and its furniture spawns. */
type StockSource = Pick<Site, 'authoredPlacements' | 'furnitureIn'>;

/** #231 can provide book item IDs here once content records which recipes each book teaches. */
type RepairBookHook = (registry: Registry, recipes: readonly RecipeDef[]) => readonly string[];

interface TestHouseRepairCornerOptions {
  inventory: Inventory;
  registry: Registry;
  site: string;
  debug: boolean;
  source: StockSource | undefined;
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

const samePiece = (type: string, origin: Vec3, piece: PlacedPiece): boolean =>
  type === piece.furniture && origin.every((value, axis) => value === piece.pos[axis]);

/**
 * The stock exists before its column streams in, so the container is spawned now, whole, from the site's own
 * furniture spawn; arrival then finds its origin claimed and adds nothing twice.
 */
const standingContainer = (inventory: Inventory, source: StockSource, piece: PlacedPiece): BlockEntity => {
  const standing = [...inventory.entities.records].find((record) => samePiece(record.type, record.origin, piece));
  const spawn = source
    .furnitureIn(toChunk(piece.pos[0]), toChunk(piece.pos[2]))
    .find(({ spec }) => samePiece(spec.type, spec.pos, piece));
  const entity = standing ?? (spawn && inventory.furnishSpawn(spawn));
  if (!entity) {
    throw new Error(`Repair stock container ${piece.furniture} could not be placed`);
  }
  return entity;
};

const placeRepairCornerItem = ({
  inventory,
  registry,
  containers,
  type,
  count,
  condition,
}: {
  inventory: Inventory;
  registry: Registry;
  containers: readonly BlockEntity[];
  type: string;
  count: number;
  condition: number;
}): void => {
  const stackSize = registry.items.get(type)?.stack ?? 1;
  let remaining = count;
  while (remaining > 0) {
    const item = inventory.create(type, Math.min(remaining, stackSize), condition);
    const placed = containers.some((entity) =>
      (entity.pockets ?? []).some((_, pocket) => inventory.add(item, { kind: 'furniture', entity, pocket })),
    );
    if (!placed) {
      throw new Error(`No room for ${type} in the test-house repair stock`);
    }
    remaining -= item.count;
  }
};

/** Repairs the stock building can serve: those needing no workstation, or one that stands in it. */
export const repairStockRecipes = (registry: Registry, pieces: readonly PlacedPiece[]): RecipeDef[] => {
  const stations = new Set(pieces.flatMap(({ furniture }) => registry.furniture.get(furniture)?.workstation?.id ?? []));
  return [...registry.recipes.values()]
    .filter((recipe) => recipe.kind === 'repair' && (!recipe.workstation || stations.has(recipe.workstation)))
    .sort((a, b) => a.id.localeCompare(b.id));
};

/** Populate the layout's repair stock building with content-derived repair stock. */
export const populateTestHouseRepairCorner = ({
  inventory,
  registry,
  site,
  debug,
  source,
  repairBooks = () => [],
}: TestHouseRepairCornerOptions): void => {
  const building = registry.layouts.get(site)?.repairStock;
  const placement = source?.authoredPlacements?.find(({ template }) => template.id === building);
  if (!(debug && source && placement)) {
    return;
  }
  const pieces = placedPieces(placement);
  const recipes = repairStockRecipes(registry, pieces);
  if (recipes.length === 0) {
    return;
  }
  const containers = pieces
    .filter(({ furniture }) => registry.furniture.get(furniture)?.container)
    .map((piece) => standingContainer(inventory, source, piece));
  const stock = repairCornerStock(registry, recipes);
  const tools = repairCornerToolTypes(registry, recipes, stock.qualities, repairBooks);
  recipes.forEach((recipe, index) => {
    placeRepairCornerItem({
      inventory,
      registry,
      containers,
      type: recipe.result.item,
      count: 1,
      condition: 0.25 + (0.5 * (index + 1)) / (recipes.length + 1),
    });
  });
  for (const type of [...tools].sort()) {
    placeRepairCornerItem({ inventory, registry, containers, type, count: 1, condition: 1 });
  }
  for (const [type, count] of [...stock.components].sort(([a], [b]) => a.localeCompare(b))) {
    placeRepairCornerItem({ inventory, registry, containers, type, count, condition: 1 });
  }
};
