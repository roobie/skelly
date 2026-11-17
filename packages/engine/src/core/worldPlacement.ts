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

type SiteDestination = Exclude<WorldDestination, { kind: 'door' }>;
type DoorDestination = Extract<WorldDestination, { kind: 'door' }>;

const boxOf = (inventory: Inventory, recipe: RecipeDef, destination: SiteDestination): PlacementBox => ({
  pos: [...destination.pos],
  size:
    'entity' in recipe.result && destination.kind === 'entity'
      ? rotatedSize(inventory.registry.furniture.get(recipe.result.entity)!.size, rotationOf(destination))
      : [1, 1, 1],
});

/** Other unfinished world work whose destination is taken by `taken`, so two jobs can't claim one site or door. */
const reservedByWork = (
  inventory: Inventory,
  taken: (destination: WorldDestination, recipe: RecipeDef) => boolean,
  work?: Item,
): boolean => {
  for (const { item } of inventory.items()) {
    const other = item.work;
    if (
      item.uid !== work?.uid &&
      other?.kind === 'craft' &&
      other.destination &&
      taken(other.destination, inventory.registry.recipes.get(other.recipe)!)
    ) {
      return true;
    }
  }
  return false;
};

const cellsTaken = (inventory: Inventory, cells: readonly Vec3[]) => {
  const keys = new Set(cells.map((cell) => cell.join(',')));
  return (destination: WorldDestination, recipe: RecipeDef): boolean =>
    destination.kind !== 'door' &&
    [...placementCells(boxOf(inventory, recipe, destination))].some((cell) => keys.has(cell.join(',')));
};

/** Boards go on a standing upright door within reach that no other job holds. */
const doorRefusal = (
  inventory: Inventory,
  destination: DoorDestination,
  work: Item | undefined,
): string | undefined => {
  const { entities, registry } = inventory;
  const door = entities.byUid(destination.uid);
  if (!(door && entities.stands(door))) {
    return coreMessage(registry, 'placementTargetRequired');
  }
  const refusal = entities.boardingRefusal(door);
  if (refusal) {
    return refusal;
  }
  if (![...placementCells(door)].some((cell) => inventory.canReachCell(cell))) {
    return coreMessage(registry, 'outOfReach');
  }
  const { reserved } = claimed(registry.ui, 'interface')!.furnitureMoveMessages;
  if (entities.useRefusal(door)) {
    return reserved;
  }
  const sameDoor = (other: WorldDestination) => other.kind === 'door' && other.uid === destination.uid;
  return reservedByWork(inventory, sameDoor, work) ? reserved : undefined;
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
  const inspect = (recipe: RecipeDef, destination: SiteDestination, work?: Item) => {
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
    if (reservedByWork(inventory, cellsTaken(inventory, cells), work)) {
      return { refusal: noRoom() };
    }
    if ([...bodies()].some((body) => cells.some((cell) => boxIntersectsBody(cell, [1, 1, 1], body)))) {
      return { refusal: noRoom() };
    }
    return { box, cells, projection };
  };
  const refusal = (recipe: RecipeDef, destination: WorldDestination, work?: Item): string | undefined => {
    if (!validWorldDestination(destination, recipe)) {
      return coreMessage(inventory.registry, 'placementTargetRequired');
    }
    return destination.kind === 'door'
      ? doorRefusal(inventory, destination, work)
      : inspect(recipe, destination, work).refusal;
  };
  /** Publishes an admitted block or piece; its cells are already ensured. */
  const build = (recipe: RecipeDef, destination: SiteDestination, box: PlacementBox): void => {
    if ('block' in recipe.result) {
      terrain.world.setBlock(...destination.pos, inventory.registry.blockIds.get(recipe.result.block)!);
    } else if ('entity' in recipe.result && destination.kind === 'entity') {
      const entity = inventory.entities.add({
        type: recipe.result.entity,
        pos: [...destination.pos],
        size: box.size,
        facing: destination.facing,
      });
      if (!entity) {
        throw new Error('Admitted placement failed to acquire its origin');
      }
      entity.searched = true;
    }
  };
  const board = (recipe: RecipeDef, destination: DoorDestination, work: Item): string | undefined => {
    const reason = refusal(recipe, destination, work);
    if (reason || !('doorBoarding' in recipe.result)) {
      return reason ?? coreMessage(inventory.registry, 'placementTargetRequired');
    }
    const door = inventory.entities.byUid(destination.uid)!;
    return inventory.entities.board(door, destination.side, recipe.result.doorBoarding);
  };
  return {
    refusal,
    place: (recipe, destination, work): string | undefined => {
      if (destination.kind === 'door') {
        return board(recipe, destination, work);
      }
      if (!validWorldDestination(destination, recipe)) {
        return coreMessage(inventory.registry, 'placementTargetRequired');
      }
      const admission = inspect(recipe, destination, work);
      if (admission.refusal || !admission.box) {
        return admission.refusal;
      }
      admission.projection?.publish(admission.projection.revision, (cx, cz) => terrain.ensureColumn(cx, cz));
      for (const cell of admission.cells) {
        terrain.ensureCell(...cell);
      }
      build(recipe, destination, admission.box);
      return undefined;
    },
  };
};
