// Milestone 1.0's test scene: a small two-room house next to spawn, defined in
// metres so it can be compared at different block sizes. Its rooms have a front door,
// windows, a kitchen counter, a table, a bed, and full-block stairs up to a roof
// terrace. The ground around it is levelled. Stonework for looking at stone: a plinth
// under the walls, an outside chimney, a low garden wall with a gate gap, and a flagstone path.
// Colour variety for telling materials apart: painted siding on the north wall and a
// small shed with a galvanized roof, a mossy cobblestone wall cap, dressed stone on the
// chimney and doorstep, and a little hazard yellow on the gate posts. Furniture (a crate, a
// kitchen cupboard, a fridge and a wardrobe) stands in and around it for comparing objects with structure.

import type { EntitySpec } from '../core/blockEntities.ts';
import type { RecipeDef, Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';
import type { MetreBox } from '../core/structure.ts';
import { type Facing, pieceSize } from '../core/templates.ts';

export interface HouseBlocks {
  brick: number;
  plaster: number;
  planks: number;
  tiles: number;
  fabric: number;
  roof: number;
  dirt: number;
  grass: number;
  stone: number;
  sidingRed: number;
  sidingBlue: number;
  galvanized: number;
  cobblestone: number;
  dressedStone: number;
  hazard: number;
}

/** Storey height in metres. */
const STOREY = 3;

/**
 * The house as boxes applied in order.
 * @param origin the lot's north-west corner at floor level, in whole metres
 * @param blockSize stairs rise one block per step, so they depend on it
 */
export const testHouse = (origin: Vec3, b: HouseBlocks, blockSize: number): MetreBox[] => {
  const [ox, oy, oz] = origin;
  const box = (min: Vec3, max: Vec3, block: number): MetreBox => ({
    min: [ox + min[0], oy + min[1], oz + min[2]],
    max: [ox + max[0], oy + max[1], oz + max[2]],
    block,
  });
  const air = 0;
  const boxes: MetreBox[] = [
    // Level lot: solid ground below the floor, nothing above it.
    box([-10, -8, -3], [13, 0, 10], b.dirt),
    box([-10, -0.5, -3], [13, 0, 10], b.grass),
    box([-10, 0, -3], [13, 16, 10], air),
    // Flagstone path from the spawn area to the front door, flush with the ground.
    box([-8, -0.5, 3], [0, 0, 4], b.stone),
    // Floor (kitchen tiled), outer walls, interior wall, roof.
    box([0, -0.5, 0], [10, 0, 7], b.planks),
    box([0.5, -0.5, 0.5], [5, 0, 6.5], b.tiles),
    box([0, 0, 0], [10, STOREY, 0.5], b.brick),
    box([0, 0, 6.5], [10, STOREY, 7], b.brick),
    box([0, 0, 0], [0.5, STOREY, 7], b.brick),
    box([9.5, 0, 0], [10, STOREY, 7], b.brick),
    box([5, 0, 0.5], [5.5, STOREY, 6.5], b.plaster),
    box([0, STOREY, 0], [10, STOREY + 0.5, 7], b.roof),
    // Stone plinth: the bottom half metre of the outer walls. Before the openings, so the door still cuts through.
    box([0, 0, 0], [10, 0.5, 0.5], b.stone),
    box([0, 0, 6.5], [10, 0.5, 7], b.stone),
    box([0, 0, 0], [0.5, 0.5, 7], b.stone),
    box([9.5, 0, 0], [10, 0.5, 7], b.stone),
    // Siding clads the north wall outside, above the plinth: red over the kitchen, blue-grey over the bedroom.
    box([0, 0.5, -0.5], [5, STOREY, 0], b.sidingRed),
    box([5, 0.5, -0.5], [10, STOREY, 0], b.sidingBlue),
    // Openings: front door (west), interior doorway, windows (the north one also through the siding), roof hatch over the stairs.
    box([0, 0, 3], [0.5, 2, 4], air),
    box([5, 0, 3], [5.5, 2, 4], air),
    box([2, 1, -0.5], [3, 2, 0.5], air),
    box([2, 1, 6.5], [3, 2, 7], air),
    box([7, 1, 6.5], [8, 2, 7], air),
    box([9.5, 1, 3], [10, 2, 4], air),
    box([6, STOREY, 0.5], [9, STOREY + 0.5, 1.5], air),
    // Outside: a stone chimney against the east wall, and a dry-stone garden wall along the south side with a 1 m gate gap.
    box([10, 0, 5], [11, STOREY + 1.5, 6.5], b.stone),
    box([-6, 0, 8.5], [2, 1, 9], b.stone),
    box([3, 0, 8.5], [10, 1, 9], b.stone),
    // The wall's top half metre is mossy cobblestone; the gate posts' tops are hazard yellow, and the chimney has a dressed-stone cap.
    box([-6, 0.5, 8.5], [2, 1, 9], b.cobblestone),
    box([3, 0.5, 8.5], [10, 1, 9], b.cobblestone),
    box([1.5, 0.5, 8.5], [2, 1, 9], b.hazard),
    box([3, 0.5, 8.5], [3.5, 1, 9], b.hazard),
    box([9.5, STOREY + 1.5, 4.5], [11.5, STOREY + 2, 7], b.dressedStone),
    // A dressed-stone doorstep, flush with the path.
    box([-1, -0.5, 2.5], [0, 0, 4.5], b.dressedStone),
    // A shed north-west of the path: siding walls, a doorway facing south, a galvanized roof overhanging its walls.
    box([-9, 0, -3], [-6, 2.5, -2.5], b.sidingBlue),
    box([-9, 0, -1], [-6, 2.5, -0.5], b.sidingBlue),
    box([-9, 0, -3], [-8.5, 2.5, -0.5], b.sidingBlue),
    box([-6.5, 0, -3], [-6, 2.5, -0.5], b.sidingBlue),
    box([-8, 0, -1], [-7, 2, -0.5], air),
    box([-9.5, 2.5, -3], [-5.5, 3, 0], b.galvanized),
    // Kitchen: counter along the north wall, table. Bedroom: bed.
    box([1, 0, 0.5], [4, 0.9, 1.1], b.tiles),
    box([2.5, 0, 4.5], [4, 0.75, 5.5], b.planks),
    box([7.5, 0, 4.5], [9.5, 0.5, 6.5], b.fabric),
  ];
  // Stairs in the bedroom, rising east along the north wall: one block per step.
  const steps = Math.round(STOREY / blockSize);
  for (let i = 0; i < steps; i++) {
    const x = 6 + i * blockSize;
    boxes.push(box([x, 0, 0.5], [x + blockSize, (i + 1) * blockSize, 1.5], b.planks));
  }
  return boxes;
};

/** Where to put the house relative to the world origin, and where the player starts (metres). */
export const HOUSE_OFFSET: readonly [number, number] = [4, -4];
/** On the lot, 8 m out from the front door and facing it, so the whole house is in view. */
export const SPAWN_OFFSET: Vec3 = [-8, 0, 3.5];
/** Yaw that faces +x (east), toward the front door. */
export const SPAWN_YAW = -Math.PI / 2;
/** The lot's centre, used to pick its floor height. */
export const LOT_CENTRE: readonly [number, number] = [5, 3.5];

export interface HouseFurnitureSpec extends EntitySpec {
  loot?: string;
}

/** The house's furniture: each piece's lowest corner in metres from the lot origin, and which way its front faces. */
const HOUSE_FURNITURE: readonly { type: string; at: Vec3; facing: Facing; loot?: string }[] = [
  // Outside, on the grass beside the path.
  { type: 'crate', at: [-2, 0, 4.5], facing: 'n', loot: 'sample_note_loot' },
  { type: 'sample_sign', at: [SPAWN_OFFSET[0] + 2, 0, SPAWN_OFFSET[2] + 1], facing: 'n' },
  // Kitchen: a fridge in the south-west corner, a cupboard against the south wall.
  { type: 'fridge', at: [1, 0, 5.5], facing: 'n' },
  { type: 'kitchen_cupboard', at: [3, 0, 6], facing: 'n' },
  // Bedroom: a wardrobe against the east wall, clear of the window and the stairs.
  { type: 'wardrobe', at: [9, 0, 1.5], facing: 'w' },
];

/**
 * The house's furniture as entity specs in blocks, for a lot origin in metres. Furniture sizes are
 * in blocks and authored for the hamlet's 0.5 m blocks, and the positions are whole blocks only
 * there, so the caller places furniture at that block size only.
 * @param sizeOf a furniture type's size in blocks, before turning
 */
export const testHouseFurniture = (
  origin: Vec3,
  blockSize: number,
  sizeOf: (type: string) => Vec3,
): HouseFurnitureSpec[] =>
  HOUSE_FURNITURE.map(({ type, at, facing, loot }) => ({
    type,
    pos: [0, 1, 2].map((axis) => Math.round((origin[axis]! + at[axis]!) / blockSize)) as Vec3,
    size: pieceSize(sizeOf(type), facing),
    facing,
    ...(loot ? { loot } : {}),
  }));

/** #231 can provide book item IDs here once content records which recipes each book teaches. */
export type RepairBookHook = (registry: Registry, recipes: readonly RecipeDef[]) => readonly string[];

interface TestHouseRepairCornerOptions {
  inventory: Inventory;
  registry: Registry;
  site: string;
  spawn: Vec3;
  blockSize: number;
  repairBooks?: RepairBookHook;
}

interface RepairCornerStock {
  components: Map<string, number>;
  qualities: Map<string, number>;
}

const repairCornerStock = (registry: Registry, recipes: readonly RecipeDef[]): RepairCornerStock => {
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

const repairCornerPilePositions = (spawn: Vec3, blockSize: number): Vec3[] => {
  const houseOrigin: Vec3 = [spawn[0] - SPAWN_OFFSET[0], spawn[1] - SPAWN_OFFSET[1], spawn[2] - SPAWN_OFFSET[2]];
  return [1, 1 + blockSize, 1 + 2 * blockSize].flatMap((x) =>
    [3, 3 + blockSize, 3 + 2 * blockSize].map(
      (z): Vec3 => [
        Math.round((houseOrigin[0] + x) / blockSize),
        Math.round(houseOrigin[1] / blockSize),
        Math.round((houseOrigin[2] + z) / blockSize),
      ],
    ),
  );
};

const placeRepairCornerItem = ({
  inventory,
  registry,
  pilePositions,
  type,
  count,
  condition,
  pileIndexes,
}: {
  inventory: Inventory;
  registry: Registry;
  pilePositions: readonly Vec3[];
  type: string;
  count: number;
  condition: number;
  pileIndexes: readonly number[];
}): void => {
  const stackSize = registry.items.get(type)?.stack ?? 1;
  let remaining = count;
  while (remaining > 0) {
    const item = inventory.create(type, Math.min(remaining, stackSize), condition);
    const added = pileIndexes.some((index) => inventory.add(item, { kind: 'pile', pos: pilePositions[index]! }));
    if (!added) {
      throw new Error(`No room for ${type} in the test-house repair corner`);
    }
    remaining -= item.count;
  }
};

/** Populate only the debug test-house scenario with content-derived repair stock. */
export const populateTestHouseRepairCorner = ({
  inventory,
  registry,
  site,
  spawn,
  blockSize,
  repairBooks = () => [],
}: TestHouseRepairCornerOptions): void => {
  if (site !== 'testHouse') {
    return;
  }
  const recipes = [...registry.recipes.values()]
    .filter((recipe) => recipe.kind === 'repair')
    .sort((a, b) => a.id.localeCompare(b.id));
  if (recipes.length === 0) {
    return;
  }

  const stock = repairCornerStock(registry, recipes);
  const tools = repairCornerToolTypes(registry, recipes, stock.qualities, repairBooks);
  const pilePositions = repairCornerPilePositions(spawn, blockSize);
  recipes.forEach((recipe, index) => {
    const condition = 0.25 + (0.5 * (index + 1)) / (recipes.length + 1);
    placeRepairCornerItem({
      inventory,
      registry,
      pilePositions,
      type: recipe.result.item,
      count: 1,
      condition,
      pileIndexes: [0, 1],
    });
  });
  for (const type of [...tools].sort()) {
    placeRepairCornerItem({ inventory, registry, pilePositions, type, count: 1, condition: 1, pileIndexes: [0, 1] });
  }
  for (const [type, count] of [...stock.components].sort(([a], [b]) => a.localeCompare(b))) {
    placeRepairCornerItem({
      inventory,
      registry,
      pilePositions,
      type,
      count,
      condition: 1,
      pileIndexes: [2, 3, 4, 5, 6, 7, 8],
    });
  }
};
