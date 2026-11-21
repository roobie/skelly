import { type BlockBlow, bashBlock } from './blockDamage.ts';
import type { BlockEntity } from './blockEntities.ts';
import type { CanonicalTerrain } from './canonicalTerrain.ts';
import type { createColumnSupply } from './columnSupply.ts';
import type { Registry } from './content.ts';
import { CHUNK, toChunk, type Vec3 } from './coords.ts';
import { commitRuin, type FurnitureMover, hungOnTerrain, planRuin } from './furnitureMove.ts';
import { rubbleBlockIds } from './rubble.ts';
import { createSupport, terrainSupportView } from './structureSupport.ts';

interface TerrainStrike {
  readonly terrain: CanonicalTerrain;
  readonly supply: ReturnType<ReturnType<typeof createColumnSupply>['project']>;
  readonly mover: FurnitureMover;
  readonly obstructed?: FurnitureMover['terrainSolid'];
}

export interface TerrainStrikeResult {
  readonly outcome: 'resisted' | 'damaged' | 'broken' | 'refused';
  /** Why a refusal came before any damage: the trunk carries canopy. A refusal for want of room has none. */
  readonly cause?: 'canopy';
  readonly destroyed: readonly BlockEntity[];
  readonly edited: Vec3[];
}

const FACES: readonly Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * Whether a tree trunk cell carries canopy: a canopy block at or above its row joins it through tree blocks. Felling
 * is a separate system, so until it exists such a trunk is not broken.
 */
const carriesCanopy = (terrain: CanonicalTerrain, registry: Registry, cell: Readonly<Vec3>): boolean => {
  const { scale } = terrain.terrain;
  const maxY = (scale.maxCy + 1) * CHUNK;
  const partAt = (x: number, y: number, z: number) => registry.blocks[terrain.getBlock(x, y, z)]?.tree;
  if (partAt(...(cell as [number, number, number])) !== 'trunk') {
    return false;
  }
  const seen = new Set<string>([cell.join(',')]);
  const open: Vec3[] = [[...cell] as Vec3];
  for (let at = open.pop(); at; at = open.pop()) {
    for (const [dx, dy, dz] of FACES) {
      const next: Vec3 = [at[0] + dx, at[1] + dy, at[2] + dz];
      const key = next.join(',');
      if (next[1] < cell[1] || next[1] >= maxY || seen.has(key)) {
        continue;
      }
      const part = partAt(...next);
      if (part === 'canopy') {
        return true;
      }
      if (part === 'trunk') {
        seen.add(key);
        open.push(next);
      }
    }
  }
  return false;
};

/** Closure expansion invalidates references as well as reservations, so abandon the entire attempt immediately. */
const expanded = Symbol('supply closure expanded');

/** Reads through the supply projection; `cell`, when given, reads as already cleared. */
const provisionalMover = ({ terrain, supply, mover, obstructed }: TerrainStrike, cell?: Vec3): FurnitureMover => ({
  ...mover,
  inventory: supply.inventory,
  minY: terrain.terrain.scale.minCy * CHUNK,
  readBox: (pos, size) => {
    if (supply.read({ x0: pos[0], x1: pos[0] + size[0], z0: pos[2], z1: pos[2] + size[2] })) {
      throw expanded;
    }
  },
  terrainSolid: (x, y, z) => {
    if (y < terrain.terrain.scale.minCy * CHUNK || y >= (terrain.terrain.scale.maxCy + 1) * CHUNK) {
      return false;
    }
    if (supply.readColumn(toChunk(x), toChunk(z))) {
      throw expanded;
    }
    const cleared = cell !== undefined && x === cell[0] && y === cell[1] && z === cell[2];
    return (
      (!cleared && mover.inventory.registry.blocks[terrain.getBlock(x, y, z)]!.solid) || obstructed?.(x, y, z) === true
    );
  },
});

const floorLossRoots = (mover: FurnitureMover, above: Vec3): BlockEntity[] => {
  const { entities } = mover.inventory;
  const piece = entities.filling(...above);
  if (!piece || piece.pos[1] !== above[1]) {
    return [];
  }
  mover.readBox?.(piece.pos, piece.size);
  const [x0, y0, z0] = piece.pos;
  const [width, , depth] = piece.size;
  for (let x = x0; x < x0 + width; x++) {
    for (let z = z0; z < z0 + depth; z++) {
      if (mover.terrainSolid(x, y0 - 1, z) || entities.filling(x, y0 - 1, z)) {
        return [];
      }
    }
  }
  return [piece];
};

/** A piece hung from the broken block, such as a ceiling lamp, has lost what holds it up, so it goes with the block. */
const hostLossRoots = (mover: FurnitureMover, under: Vec3): BlockEntity[] => {
  const { entities } = mover.inventory;
  const piece = entities.filling(...under);
  if (!piece || entities.defOf(piece).mount !== 'ceiling') {
    return [];
  }
  mover.readBox?.(piece.pos, piece.size);
  return hungOnTerrain(mover, piece) ? [] : [piece];
};

export const strikeTerrain = (context: TerrainStrike, cell: Vec3, blow: BlockBlow): TerrainStrikeResult | undefined => {
  const { terrain, supply, mover } = context;
  const { world } = terrain;
  const { registry } = mover.inventory;
  const block = registry.blocks[terrain.getBlock(...cell)];
  if (!block?.solid) {
    return undefined;
  }
  if (carriesCanopy(terrain, registry, cell)) {
    return { outcome: 'refused', cause: 'canopy', destroyed: [], edited: [] };
  }
  const material = registry.blockMaterials.get(block.material)!;
  const bash = bashBlock({ material, damage: world.blockDamage.get(cell)?.damage ?? 0 }, blow);
  if (bash.outcome === 'resisted') {
    return { outcome: 'resisted', destroyed: [], edited: [] };
  }
  const ensure = (cx: number, cz: number): void => terrain.ensureColumn(cx, cz);
  supply.readColumn(toChunk(cell[0]), toChunk(cell[2]));
  if (bash.outcome === 'damaged') {
    supply.publish(supply.revision, ensure, () => {
      world.blockDamage.record(terrain, registry, cell, bash.damage);
    });
    return { outcome: 'damaged', destroyed: [], edited: [] };
  }
  for (;;) {
    const { revision } = supply;
    try {
      const projected = provisionalMover(context, cell);
      const above: Vec3 = [cell[0], cell[1] + 1, cell[2]];
      const roots = [...floorLossRoots(projected, above), ...hostLossRoots(projected, [cell[0], cell[1] - 1, cell[2]])];
      const pile = projected.inventory.pileAt(above);
      const plan = planRuin(projected, roots, pile ? [pile] : [], [{ pos: cell, yields: material.rubble }]);
      if (!plan) {
        world.blockDamage.record(terrain, registry, cell, bash.damage);
        return { outcome: 'refused', destroyed: [], edited: [] };
      }
      let destroyed: BlockEntity[] = [];
      let edited: Vec3[] = [];
      supply.publish(revision, ensure, (live) => {
        terrain.ensureCell(...cell);
        destroyed = commitRuin({ ...mover, inventory: live }, plan);
        edited = world.setBlock(...cell, 0);
      });
      world.support.lost(registry, cell);
      return { outcome: 'broken', destroyed, edited };
    } catch (error) {
      if (error !== expanded) {
        throw error;
      }
    }
  }
};

/**
 * An unheld cell falls into its material's rubble in place. Pieces standing on it or hung under it lose it as they
 * would lose a broken cell, so the loss roots are judged with the cell cleared; their debris lands with the rubble
 * standing, so nothing lands inside it. Debris with no room leaves its piece standing on the rubble, since a fall
 * cannot be refused the way a blow is.
 */
const fallCell = (
  context: TerrainStrike,
  cell: Vec3,
  rubble: number,
): Pick<TerrainStrikeResult, 'destroyed' | 'edited'> => {
  const { terrain, supply, mover } = context;
  const ensure = (cx: number, cz: number): void => terrain.ensureColumn(cx, cz);
  supply.readColumn(toChunk(cell[0]), toChunk(cell[2]));
  for (;;) {
    const { revision } = supply;
    try {
      const clearing = provisionalMover(context, cell);
      const roots = [
        ...floorLossRoots(clearing, [cell[0], cell[1] + 1, cell[2]]),
        ...hostLossRoots(clearing, [cell[0], cell[1] - 1, cell[2]]),
      ];
      const plan = roots.length > 0 ? planRuin(provisionalMover(context), roots, [], []) : undefined;
      let destroyed: BlockEntity[] = [];
      let edited: Vec3[] = [];
      supply.publish(revision, ensure, (live) => {
        terrain.ensureCell(...cell);
        destroyed = plan ? commitRuin({ ...mover, inventory: live }, plan) : [];
        edited = terrain.world.setBlock(...cell, rubble);
      });
      return { destroyed, edited };
    } catch (error) {
      if (error !== expanded) {
        throw error;
      }
    }
  }
};

/**
 * Judges up to `budget` cascade cells in frontier order, and returns what fell. A held cell ends its branch, though one
 * whose floor was lost queues its sideways lines, since it may no longer anchor them; an unheld cell falls, or stays
 * as it is if it is already rubble, and queues what depended on it. Cells past the budget wait for the next call.
 */
export const cascadeSupport = (
  context: Omit<TerrainStrike, 'supply'> & { readonly project: () => TerrainStrike['supply'] },
  budget: number,
): Pick<TerrainStrikeResult, 'destroyed' | 'edited'> => {
  const { terrain, mover } = context;
  const { registry } = mover.inventory;
  const state = terrain.world.support;
  const view = terrainSupportView(terrain);
  // A judgement holds only while the blocks it read stand, so every fall starts a fresh one.
  let support = createSupport(registry, view);
  const rubbleIds = rubbleBlockIds(registry);
  const destroyed: BlockEntity[] = [];
  const edited: Vec3[] = [];
  /** Whether the cell stopped holding; a structure cell that did falls, unless it is already rubble. */
  const judge = (cell: Vec3, lostFloor: boolean): boolean => {
    const inside = cell[1] >= view.minY && cell[1] < view.maxY;
    const block = inside ? registry.blocks[view.block(...cell)] : undefined;
    if (!block?.solid || view.natural(...cell)) {
      return false;
    }
    if (support.holds(cell)) {
      if (lostFloor) {
        state.enqueueSideways(registry, cell);
      }
      return false;
    }
    if (!rubbleIds.has(block.id)) {
      const material = registry.blockMaterials.get(block.material)!;
      // A projection publishes once, so each fall reads the supply afresh.
      const fell = fallCell({ ...context, supply: context.project() }, cell, registry.blockIds.get(material.fallsTo)!);
      destroyed.push(...fell.destroyed);
      edited.push(...fell.edited);
      support = createSupport(registry, view);
    }
    return true;
  };
  for (let judged = 0; judged < budget; judged++) {
    const entry = state.next();
    if (!entry) {
      break;
    }
    const cell: Vec3 = [...entry.cell];
    const lost = judge(cell, entry.lostFloor);
    state.judged();
    if (lost) {
      state.lost(registry, cell);
    }
  }
  return { destroyed, edited };
};
