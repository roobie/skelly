import { type BlockBlow, bashBlock } from './blockDamage.ts';
import type { BlockEntity } from './blockEntities.ts';
import type { CanonicalTerrain } from './canonicalTerrain.ts';
import type { createColumnSupply } from './columnSupply.ts';
import { CHUNK, toChunk, type Vec3 } from './coords.ts';
import { commitRuin, type FurnitureMover, planRuin } from './furnitureMove.ts';

interface TerrainStrike {
  readonly terrain: CanonicalTerrain;
  readonly supply: ReturnType<ReturnType<typeof createColumnSupply>['project']>;
  readonly mover: FurnitureMover;
  readonly obstructed?: FurnitureMover['terrainSolid'];
}

export interface TerrainStrikeResult {
  readonly outcome: 'resisted' | 'damaged' | 'broken' | 'refused';
  readonly destroyed: readonly BlockEntity[];
  readonly edited: Vec3[];
}

/** Closure expansion invalidates references as well as reservations, so abandon the entire attempt immediately. */
const expanded = Symbol('supply closure expanded');

const provisionalMover = ({ terrain, supply, mover, obstructed }: TerrainStrike, cell: Vec3): FurnitureMover => ({
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
    const cleared = x === cell[0] && y === cell[1] && z === cell[2];
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

export const strikeTerrain = (context: TerrainStrike, cell: Vec3, blow: BlockBlow): TerrainStrikeResult | undefined => {
  const { terrain, supply, mover } = context;
  const { world } = terrain;
  const { registry } = mover.inventory;
  const block = registry.blocks[terrain.getBlock(...cell)];
  if (!block?.solid) {
    return undefined;
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
      const roots = floorLossRoots(projected, above);
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
      return { outcome: 'broken', destroyed, edited };
    } catch (error) {
      if (error !== expanded) {
        throw error;
      }
    }
  }
};
