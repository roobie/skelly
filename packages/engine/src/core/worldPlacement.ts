import { boxIntersectsBody } from './blockEntities.ts';
import type { CanonicalTerrain } from './canonicalTerrain.ts';
import { claimed } from './capabilities.ts';
import type { createColumnSupply } from './columnSupply.ts';
import type { RecipeDef } from './content.ts';
import { CHUNK, type Vec3 } from './coords.ts';
import { coreMessage } from './coreText.ts';
import type { Inventory } from './inventory.ts';
import type { Item } from './items.ts';
import { rotatedSize, rotationOf } from './orientation.ts';
import type { Body } from './physics.ts';
import type { ColumnSource } from './site.ts';
import { type PlacementBox, placementCells, validWorldDestination, type WorldDestination } from './worldDestination.ts';

export interface WorldPlacement {
  refusal: (recipe: RecipeDef, destination: WorldDestination, work?: Item) => string | undefined;
  place: (recipe: RecipeDef, destination: WorldDestination, work: Item) => string | undefined;
}

const boxOf = (inventory: Inventory, recipe: RecipeDef, destination: WorldDestination): PlacementBox => ({
  pos: [...destination.pos],
  size:
    'entity' in recipe.result && destination.kind === 'entity'
      ? rotatedSize(inventory.registry.furniture.get(recipe.result.entity)!.size, rotationOf(destination))
      : [1, 1, 1],
});

const reservedByWork = (inventory: Inventory, cells: readonly Vec3[], work?: Item): boolean => {
  const keys = new Set(cells.map((cell) => cell.join(',')));
  for (const { item } of inventory.items()) {
    if (item.uid === work?.uid || item.work?.kind !== 'craft' || !item.work.destination) {
      continue;
    }
    const recipe = inventory.registry.recipes.get(item.work.recipe)!;
    const other = boxOf(inventory, recipe, item.work.destination);
    if ([...placementCells(other)].some((cell) => keys.has(cell.join(',')))) {
      return true;
    }
  }
  return false;
};

export const createWorldPlacement = ({
  inventory,
  terrain,
  bodies,
  supply,
  occupied,
}: {
  inventory: Inventory;
  terrain: CanonicalTerrain;
  bodies: () => Iterable<Body>;
  occupied?: (cell: Vec3) => boolean;
  supply?: { owner: ReturnType<typeof createColumnSupply>; source: ColumnSource };
}): WorldPlacement => {
  const noRoom = () => claimed(inventory.registry.ui, 'interface')!.furnitureMoveMessages.noRoom;
  const inspect = (recipe: RecipeDef, destination: WorldDestination, work?: Item) => {
    if (!validWorldDestination(destination, recipe)) {
      return { refusal: coreMessage(inventory.registry, 'placementTargetRequired') };
    }
    const box = boxOf(inventory, recipe, destination);
    if (box.pos.some((value, axis) => !Number.isSafeInteger(Math.ceil(value + box.size[axis]!)))) {
      return { refusal: noRoom() };
    }
    const cells = [...placementCells(box)];
    if (!cells.every((cell) => inventory.canReachCell(cell))) {
      return { refusal: coreMessage(inventory.registry, 'outOfReach') };
    }
    const min = terrain.terrain.scale.minCy * CHUNK;
    const max = (terrain.terrain.scale.maxCy + 1) * CHUNK;
    if (cells.some(([, y]) => y < min || y >= max)) {
      return { refusal: noRoom() };
    }
    // A query sees unarrived authored stock without allocating live owners or pinning columns.
    const projection = supply?.owner.project(supply.source);
    projection?.read({
      x0: Math.floor(box.pos[0]),
      x1: Math.ceil(box.pos[0] + box.size[0]),
      z0: Math.floor(box.pos[2]),
      z1: Math.ceil(box.pos[2] + box.size[2]),
    });
    const view = projection?.inventory ?? inventory;
    if (
      cells.some(
        ([x, y, z]) =>
          terrain.getBlock(x, y, z) !== 0 ||
          occupied?.([x, y, z]) ||
          view.entities.at(x, y, z) !== undefined ||
          (view.pileAt([x, y, z])?.items.length ?? 0) > 0,
      )
    ) {
      return { refusal: noRoom() };
    }
    if (reservedByWork(inventory, cells, work)) {
      return { refusal: noRoom() };
    }
    if ([...bodies()].some((body) => cells.some((cell) => boxIntersectsBody(cell, [1, 1, 1], body)))) {
      return { refusal: noRoom() };
    }
    return { box, cells, projection };
  };
  return {
    refusal: (recipe, destination, work) => inspect(recipe, destination, work).refusal,
    place: (recipe, destination, work): string | undefined => {
      const admission = inspect(recipe, destination, work);
      if (admission.refusal || !admission.box) {
        return admission.refusal;
      }
      admission.projection?.publish(admission.projection.revision, (cx, cz) => terrain.ensureColumn(cx, cz));
      for (const cell of admission.cells) {
        terrain.ensureCell(...cell);
      }
      if ('block' in recipe.result) {
        terrain.world.setBlock(...destination.pos, inventory.registry.blockIds.get(recipe.result.block)!);
      } else if ('entity' in recipe.result && destination.kind === 'entity') {
        const entity = inventory.entities.add({
          type: recipe.result.entity,
          pos: [...destination.pos],
          size: admission.box.size,
          facing: destination.facing,
        });
        if (!entity) {
          throw new Error('Admitted placement failed to acquire its origin');
        }
        entity.searched = true;
      }
      return undefined;
    },
  };
};
