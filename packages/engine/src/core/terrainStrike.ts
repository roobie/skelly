import { type BlockBlow, bashBlock } from './blockDamage.ts';
import type { BlockEntity } from './blockEntities.ts';
import type { CanonicalTerrain } from './canonicalTerrain.ts';
import { claimed } from './capabilities.ts';
import type { createColumnSupply } from './columnSupply.ts';
import type { Registry } from './content.ts';
import { CHUNK, toChunk, type Vec3 } from './coords.ts';
import { commitRuin, type FurnitureMover, fallingBoxRefusal, hungOnTerrain, planRuin } from './furnitureMove.ts';
import { blockBreakYields, blockFallResult, rubbleBlockIds } from './rubble.ts';
import type { BlockMaterialDef } from './schema.ts';
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
 * is a separate system, so until it exists such a trunk is not broken. The search reads at most the content budget of
 * cells; one that runs out has not cleared the trunk, so it counts as carrying canopy.
 */
const carriesCanopy = (
  terrain: CanonicalTerrain,
  registry: Registry,
  cell: Readonly<Vec3>,
  breakable: boolean,
): boolean => {
  const partAt = (at: Readonly<Vec3>) => registry.blocks[terrain.getBlock(...at)]?.tree;
  // An unbreakable material resists every blow, so it needs no search, and a stack with no breakable material may omit support tuning.
  if (!breakable || partAt(cell) !== 'trunk') {
    return false;
  }
  const tuning = claimed(registry.supportTuning, 'support');
  if (!tuning) {
    throw new Error('A trunk strike needs support tuning');
  }
  const maxY = (terrain.terrain.scale.maxCy + 1) * CHUNK;
  const seen = new Set<string>([cell.join(',')]);
  const open: Vec3[] = [[...cell] as Vec3];
  let reads = 1; // the trunk cell itself
  for (let at = open.pop(); at; at = open.pop()) {
    const fresh = FACES.map(([dx, dy, dz]): Vec3 => [at[0] + dx, at[1] + dy, at[2] + dz]).filter(
      (next) => next[1] >= cell[1] && next[1] < maxY && !seen.has(next.join(',')),
    );
    for (const next of fresh) {
      reads += 1;
      if (reads > tuning.trunkSearchCells) {
        return true;
      }
      const part = partAt(next);
      if (part === 'canopy') {
        return true;
      }
      if (part === 'trunk') {
        seen.add(next.join(','));
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

const preStrikeRefusal = (
  terrain: CanonicalTerrain,
  registry: Registry,
  cell: Vec3,
  breakable: boolean,
): TerrainStrikeResult | undefined => {
  if (rubbleBlockIds(registry).has(registry.blocks[terrain.getBlock(...cell)]!.id)) {
    return { outcome: 'refused', destroyed: [], edited: [] };
  }
  if (carriesCanopy(terrain, registry, cell, breakable)) {
    return { outcome: 'refused', cause: 'canopy', destroyed: [], edited: [] };
  }
  return undefined;
};

export const strikeTerrain = (context: TerrainStrike, cell: Vec3, blow: BlockBlow): TerrainStrikeResult | undefined => {
  const { terrain, supply, mover } = context;
  const { world } = terrain;
  const { registry } = mover.inventory;
  const block = registry.blocks[terrain.getBlock(...cell)];
  if (!block?.solid) {
    return undefined;
  }
  const material = registry.blockMaterials.get(block.material)!;
  const refusal = preStrikeRefusal(terrain, registry, cell, material.breakable);
  if (refusal) {
    return refusal;
  }
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
  return breakCell(context, cell, blockBreakYields(registry, block), bash.damage);
};

const breakCell = (
  context: TerrainStrike,
  cell: Vec3,
  yields?: BlockMaterialDef['rubble'],
  damage?: number,
): TerrainStrikeResult => {
  const { terrain, supply, mover } = context;
  const { world } = terrain;
  const { registry } = mover.inventory;
  const loose = yields ?? blockBreakYields(registry, registry.blocks[terrain.getBlock(...cell)]!);
  const ensure = (cx: number, cz: number): void => terrain.ensureColumn(cx, cz);
  supply.readColumn(toChunk(cell[0]), toChunk(cell[2]));
  for (;;) {
    const { revision } = supply;
    try {
      const projected = provisionalMover(context, cell);
      const above: Vec3 = [cell[0], cell[1] + 1, cell[2]];
      const roots = [...floorLossRoots(projected, above), ...hostLossRoots(projected, [cell[0], cell[1] - 1, cell[2]])];
      const pile = projected.inventory.pileAt(above);
      const plan = planRuin(projected, roots, pile ? [pile] : [], [{ pos: cell, yields: loose }]);
      if (!plan) {
        if (damage !== undefined) {
          world.blockDamage.record(terrain, registry, cell, damage);
        }
        return { outcome: 'refused', destroyed: [], edited: [] };
      }
      let destroyed: BlockEntity[] = [];
      let edited: Vec3[] = [];
      supply.publish(revision, ensure, (live) => {
        terrain.ensureCell(...cell);
        destroyed = commitRuin({ ...mover, inventory: live }, plan);
        edited = world.setBlock(...cell, 0);
      });
      world.support.lost(registry, cell, terrain.terrain.scale.blockSize);
      return { outcome: 'broken', destroyed, edited };
    } catch (error) {
      if (error !== expanded) {
        throw error;
      }
    }
  }
};

type TerrainFallContext = Omit<TerrainStrike, 'supply'> & { readonly project: () => TerrainStrike['supply'] };

interface TerrainLanding {
  cell: Vec3;
  destroyed: BlockEntity[];
  edited: Vec3[];
  blocked: boolean;
}

const landingCell = (context: TerrainFallContext, cell: Vec3): TerrainLanding => {
  const { terrain, mover } = context;
  const { registry } = mover.inventory;
  const landing: TerrainLanding = { cell: [...cell], destroyed: [], edited: [], blocked: false };
  const minY = terrain.terrain.scale.minCy * CHUNK;
  while (landing.cell[1] > minY) {
    const under: Vec3 = [landing.cell[0], landing.cell[1] - 1, landing.cell[2]];
    if (context.obstructed?.(...under) === true) {
      break;
    }
    const block = registry.blocks[terrain.getBlock(...under)]!;
    if (block.solid) {
      if (!registry.blockMaterials.get(block.material)!.crumblesUnderLoad) {
        break;
      }
      const broken = breakCell({ ...context, supply: context.project() }, under);
      if (broken.outcome !== 'broken') {
        landing.blocked = true;
        break;
      }
      landing.destroyed.push(...broken.destroyed);
      landing.edited.push(...broken.edited);
    }
    landing.cell[1] -= 1;
  }
  return landing;
};

const followBurial = (mover: FurnitureMover, cell: Vec3, landing: Vec3): void => {
  // Follow the debris so clearing its source cannot free a victim still trapped at the landing.
  for (const body of [mover.player, ...mover.others]) {
    if (body.buried?.some((at) => at.every((value, axis) => value === cell[axis]))) {
      body.pos[1] = Math.min(body.pos[1], landing[1]);
      body.buried = body.buried.map((at) => (at.every((value, axis) => value === cell[axis]) ? [...landing] : at));
    }
  }
};

/** Both outcomes use the same failure owner; yields reuse the break planner, not a second pile writer. */
const fallCell = (
  context: TerrainFallContext,
  cell: Vec3,
  result: BlockMaterialDef['fallsTo'],
): Pick<TerrainStrikeResult, 'destroyed' | 'edited'> & { fell: boolean } => {
  if ('block' in result) {
    return fallBlock(context, cell, result.block);
  }
  const broken = breakCell({ ...context, supply: context.project() }, cell, result.yields);
  return { destroyed: broken.destroyed, edited: broken.edited, fell: broken.outcome === 'broken' };
};

const fallBlock = (
  context: TerrainFallContext,
  cell: Vec3,
  rubble: string,
): Pick<TerrainStrikeResult, 'destroyed' | 'edited'> & { fell: boolean } => {
  const { terrain, mover } = context;
  const rubbleId = mover.inventory.registry.blockIds.get(rubble)!;
  const impact = landingCell(context, cell);
  const stopped = { destroyed: impact.destroyed, edited: impact.edited, fell: false };
  if (impact.blocked) {
    return stopped;
  }
  // A landing can publish breaks, so the drop must project the resulting supply rather than reuse a spent projection.
  const supply = context.project();
  const strike = { ...context, supply };
  const landing = impact.cell;
  const ensure = (cx: number, cz: number): void => terrain.ensureColumn(cx, cz);
  supply.readColumn(toChunk(cell[0]), toChunk(cell[2]));
  for (;;) {
    const { revision } = supply;
    try {
      const clearing = provisionalMover(strike, cell);
      if (fallingBoxRefusal(clearing, landing, [1, cell[1] - landing[1] + 1, 1])) {
        return stopped;
      }
      const roots = [
        clearing.inventory.entities.filling(...landing),
        ...floorLossRoots(clearing, [cell[0], cell[1] + 1, cell[2]]),
        ...hostLossRoots(clearing, [cell[0], cell[1] - 1, cell[2]]),
      ].filter((root): root is BlockEntity => root !== undefined);
      const landed = provisionalMover(
        {
          ...strike,
          obstructed: (x, y, z) =>
            (x === landing[0] && y === landing[1] && z === landing[2]) || context.obstructed?.(x, y, z) === true,
        },
        cell,
      );
      const plan = roots.length > 0 ? planRuin(landed, roots, [], []) : undefined;
      if (roots.length > 0 && !plan) {
        return stopped;
      }
      let destroyed: BlockEntity[] = [];
      let edited: Vec3[] = [];
      supply.publish(revision, ensure, (live) => {
        terrain.ensureCell(...cell);
        destroyed = plan ? commitRuin({ ...mover, inventory: live }, plan) : [];
        mover.crush?.(landing, [1, cell[1] - landing[1] + 1, 1], landing, [1, 1, 1]);
        followBurial(mover, cell, landing);
        const block = terrain.world.getBlock(...cell);
        const carried = terrain.world.rubble.release(cell);
        const buried = live.buryPile(landing);
        edited = terrain.world.setBlock(...cell, 0);
        edited.push(...terrain.world.setBlock(...landing, rubbleId));
        terrain.world.rubble.bury(landing, [...carried, ...buried]);
        terrain.world.falls.emit({ kind: 'terrain', block, from: [...cell], to: [...landing] });
      });
      return { destroyed: [...impact.destroyed, ...destroyed], edited: [...impact.edited, ...edited], fell: true };
    } catch (error) {
      if (error !== expanded) {
        throw error;
      }
    }
  }
};

/**
 * Judges up to `budget` cascade cells in frontier order, and returns what fell. A held cell ends its branch, though one
 * whose floor was lost queues its sideways dependants, since it may no longer anchor them; an unheld cell falls and
 * queues what depended on it. Cells past the budget wait for the next call.
 */
export const cascadeSupport = (
  context: TerrainFallContext,
  budget: number,
): Pick<TerrainStrikeResult, 'destroyed' | 'edited'> => {
  const { terrain, mover } = context;
  const { registry } = mover.inventory;
  const state = terrain.world.support;
  const view = { ...terrainSupportView(terrain), externalSupport: context.obstructed };
  // A judgement holds only while the blocks it read stand, so every fall starts a fresh one.
  let support = createSupport(registry, view);
  const destroyed: BlockEntity[] = [];
  const edited: Vec3[] = [];
  /** Whether the cell stopped holding. */
  const judge = (cell: Vec3, lostFloor: boolean): boolean => {
    const inside = cell[1] >= view.minY && cell[1] < view.maxY;
    const block = inside ? registry.blocks[view.block(...cell)] : undefined;
    if (!block?.solid || view.natural(...cell)) {
      return false;
    }
    if (support.supported(cell)) {
      if (lostFloor) {
        state.enqueueSideways(registry, cell, terrain.terrain.scale.blockSize);
      }
      return false;
    }
    const fall = fallCell(context, cell, blockFallResult(registry, block));
    destroyed.push(...fall.destroyed);
    edited.push(...fall.edited);
    if (fall.edited.length > 0) {
      support = createSupport(registry, view);
    }
    return fall.fell;
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
      state.lost(registry, cell, terrain.terrain.scale.blockSize);
    }
  }
  return { destroyed, edited };
};
