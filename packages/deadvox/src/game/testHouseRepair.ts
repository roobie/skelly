import type { BlockEntity } from '../core/blockEntities.ts';
import type { RecipeDef, Registry } from '../core/content.ts';
import { toChunk, type Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';
import { neverSpawns } from '../core/loot.ts';
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

const repairCornerStock = (recipes: readonly RecipeDef[]) => {
  const components = new Map<string, number>();
  const qualities = new Map<string, number>();
  const liquids = new Map<string, number>();
  for (const recipe of recipes) {
    for (const group of recipe.components) {
      const alternative = group[0]!;
      if ('item' in alternative) {
        components.set(alternative.item, (components.get(alternative.item) ?? 0) + 2 * alternative.count);
      } else {
        liquids.set(alternative.liquid, (liquids.get(alternative.liquid) ?? 0) + 2 * alternative.volumeMicrolitres);
      }
    }
    for (const [quality, level] of Object.entries(recipe.qualities)) {
      qualities.set(quality, Math.max(qualities.get(quality) ?? 0, level));
    }
  }
  return { components, qualities, liquids };
};

/**
 * Every item with a tool quality, so a tool content adds reaches the garage without a test-house edit. A tool that
 * never spawns is left out: content places it by hand, and a shelf copy would hide it.
 */
const garageToolTypes = (registry: Registry): string[] =>
  [...registry.items.values()]
    .filter(({ tool, economy }) => Object.keys(tool?.qualities ?? {}).length > 0 && !neverSpawns(economy))
    .map(({ id }) => id)
    .sort();

const repairCornerToolTypes = (
  registry: Registry,
  recipes: readonly RecipeDef[],
  qualities: ReadonlyMap<string, number>,
  repairBooks: RepairBookHook,
): Set<string> => {
  const tools = new Set(garageToolTypes(registry));
  for (const [quality, level] of qualities) {
    if (![...tools].some((id) => (registry.items.get(id)?.tool?.qualities[quality] ?? 0) >= level)) {
      throw new Error(`No item provides ${quality} quality for the test-house repair corner`);
    }
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
  liquid,
}: {
  inventory: Inventory;
  registry: Registry;
  containers: readonly BlockEntity[];
  type: string;
  count: number;
  condition: number;
  liquid?: string;
}): void => {
  const stackSize = registry.items.get(type)?.stack ?? 1;
  let remaining = count;
  while (remaining > 0) {
    const item = inventory.create(type, Math.min(remaining, stackSize), condition);
    if (liquid) {
      item.liquidContents = {
        kind: 'filled',
        liquid,
        volumeMicrolitres: registry.items.get(type)!.vessel!.capacityMicrolitres,
      };
    }
    const placed = containers.some((entity) =>
      (entity.pockets ?? []).some((_, pocket) => inventory.add(item, { kind: 'furniture', entity, pocket })),
    );
    if (!placed) {
      throw new Error(`No room for ${type} in the test-house repair stock`);
    }
    remaining -= item.count;
  }
};

/**
 * The containers nearest a workstation first. Repair targets and components fill them before the rest, so a repair
 * can be reached beside its station however many tools the shelves hold; the tools' own order is left to the layout.
 */
const nearStations = (
  registry: Registry,
  pieces: readonly PlacedPiece[],
  containers: readonly BlockEntity[],
): BlockEntity[] => {
  const stations = pieces.filter(({ furniture }) => registry.furniture.get(furniture)?.workstation);
  const distance = (entity: BlockEntity) =>
    Math.min(...stations.map(({ pos }) => Math.hypot(...entity.origin.map((value, axis) => value - pos[axis]!))));
  return stations.length === 0 ? [...containers] : [...containers].sort((a, b) => distance(a) - distance(b));
};

/** Repairs the stock building can serve: those needing no workstation, or one that stands in it. */
export const repairStockRecipes = (registry: Registry, pieces: readonly PlacedPiece[]): RecipeDef[] => {
  const stations = new Set(pieces.flatMap(({ furniture }) => registry.furniture.get(furniture)?.workstation?.id ?? []));
  return [...registry.recipes.values()]
    .filter((recipe) => recipe.kind === 'repair' && (!recipe.workstation || stations.has(recipe.workstation)))
    .sort((a, b) => a.id.localeCompare(b.id));
};

/**
 * Populate the layout's repair stock building with content-derived repair stock. Tools go in first, so they fill
 * the building's first containers, its shelves, before the repair targets and components.
 */
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
  const containers = pieces
    .filter(({ furniture }) => registry.furniture.get(furniture)?.container)
    .map((piece) => standingContainer(inventory, source, piece));
  const stock = repairCornerStock(recipes);
  const tools = repairCornerToolTypes(registry, recipes, stock.qualities, repairBooks);
  for (const type of [...tools].sort()) {
    placeRepairCornerItem({ inventory, registry, containers, type, count: 1, condition: 1 });
  }
  const beside = nearStations(registry, pieces, containers);
  for (const [liquid, volume] of stock.liquids) {
    const vessel = [...registry.items.values()].find((item) => item.vessel?.accepts.includes(liquid));
    if (!vessel) {
      throw new Error(`No vessel accepts repair liquid ${liquid}`);
    }
    placeRepairCornerItem({
      inventory,
      registry,
      containers: beside,
      type: vessel.id,
      count: Math.ceil(volume / vessel.vessel!.capacityMicrolitres),
      condition: 1,
      liquid,
    });
  }
  recipes.forEach((recipe, index) => {
    placeRepairCornerItem({
      inventory,
      registry,
      containers: beside,
      type: recipe.result.item,
      count: 1,
      condition: 0.25 + (0.5 * (index + 1)) / (recipes.length + 1),
    });
  });
  for (const [type, count] of [...stock.components].sort(([a], [b]) => a.localeCompare(b))) {
    placeRepairCornerItem({ inventory, registry, containers: beside, type, count, condition: 1 });
  }
};
