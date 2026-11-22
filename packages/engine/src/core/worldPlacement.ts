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
import { createSupport, terrainSupportView } from './structureSupport.ts';
import { type PlacementBox, placementCells, validWorldDestination, type WorldDestination } from './worldDestination.ts';

export interface WorldPlacement {
  refusal: (recipe: RecipeDef, destination: WorldDestination, work?: Item) => string | undefined;
  place: (recipe: RecipeDef, destination: WorldDestination, work: Item) => string | undefined;
}

type SiteDestination = Exclude<WorldDestination, { kind: 'opening' }>;
type OpeningDestination = Extract<WorldDestination, { kind: 'opening' }>;

const boxOf = (inventory: Inventory, recipe: RecipeDef, destination: SiteDestination): PlacementBox => ({
  pos: [...destination.pos],
  size:
    'entity' in recipe.result && destination.kind === 'entity'
      ? rotatedSize(inventory.registry.furniture.get(recipe.result.entity)!.size, rotationOf(destination))
      : [1, 1, 1],
});

/** Other unfinished world work whose destination is taken by `taken`, so two jobs can't claim one site or opening. */
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
    destination.kind !== 'opening' &&
    [...placementCells(boxOf(inventory, recipe, destination))].some((cell) => keys.has(cell.join(',')));
};

/** A cover goes on a standing door or window it fits, within reach, that no other job holds. */
const openingRefusal = (
  inventory: Inventory,
  type: string,
  destination: OpeningDestination,
  work: Item | undefined,
): string | undefined => {
  const { entities, registry } = inventory;
  const opening = entities.byUid(destination.uid);
  if (!(opening && entities.stands(opening))) {
    return coreMessage(registry, 'placementTargetRequired');
  }
  const refusal = entities.boardingRefusal(opening, type);
  if (refusal) {
    return refusal;
  }
  if (![...placementCells(opening)].some((cell) => inventory.canReachCell(cell))) {
    return coreMessage(registry, 'outOfReach');
  }
  const { reserved } = claimed(registry.ui, 'interface')!.furnitureMoveMessages;
  if (entities.useRefusal(opening)) {
    return reserved;
  }
  const same = (other: WorldDestination) => other.kind === 'opening' && other.uid === destination.uid;
  return reservedByWork(inventory, same, work) ? reserved : undefined;
};

/** Boards across a window close it to bodies, so none may stand in its opening; a curtain stops no body. */
const occupiedWindow = (inventory: Inventory, type: string, uid: number, bodies: Iterable<Body>): boolean => {
  const opening = inventory.entities.byUid(uid)!;
  return (
    opening.window !== undefined &&
    !inventory.registry.boardings.get(type)!.curtain &&
    [...bodies].some((body) => inventory.entities.bodyIntersects(opening, body))
  );
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
  /** A block may go only where it would be held; furniture never holds terrain, so pieces don't count. */
  const supported = (cell: Readonly<Vec3>, block: number): boolean =>
    createSupport(inventory.registry, terrainSupportView(terrain, { cell, block })).holds(cell);
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
  /** Room comes first, so a taken cell reads as taken rather than as unsupported. */
  const admit = (recipe: RecipeDef, destination: SiteDestination, work?: Item) => {
    const admission = inspect(recipe, destination, work);
    if (admission.refusal || !('block' in recipe.result)) {
      return admission;
    }
    return supported(destination.pos, inventory.registry.blockIds.get(recipe.result.block)!)
      ? admission
      : { refusal: coreMessage(inventory.registry, 'placementUnsupported') };
  };
  const refusal = (recipe: RecipeDef, destination: WorldDestination, work?: Item): string | undefined => {
    if (!validWorldDestination(destination, recipe)) {
      return coreMessage(inventory.registry, 'placementTargetRequired');
    }
    if (destination.kind === 'opening') {
      if (!('boarding' in recipe.result)) {
        return coreMessage(inventory.registry, 'placementTargetRequired');
      }
      const { boarding } = recipe.result;
      return (
        openingRefusal(inventory, boarding, destination, work) ??
        (occupiedWindow(inventory, boarding, destination.uid, bodies())
          ? coreMessage(inventory.registry, 'windowOccupied')
          : undefined)
      );
    }
    return admit(recipe, destination, work).refusal;
  };
  /** Publishes an admitted block or piece; its cells are already ensured. */
  const build = (recipe: RecipeDef, destination: SiteDestination, box: PlacementBox): void => {
    if ('block' in recipe.result) {
      terrain.world.setBlock(...destination.pos, inventory.registry.blockIds.get(recipe.result.block)!);
      terrain.world.support.markPlaced(destination.pos);
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
  const board = (recipe: RecipeDef, destination: OpeningDestination, work: Item): string | undefined => {
    const reason = refusal(recipe, destination, work);
    if (reason || !('boarding' in recipe.result)) {
      return reason ?? coreMessage(inventory.registry, 'placementTargetRequired');
    }
    const opening = inventory.entities.byUid(destination.uid)!;
    return inventory.entities.board(opening, destination.side, recipe.result.boarding);
  };
  return {
    refusal,
    place: (recipe, destination, work): string | undefined => {
      if (destination.kind === 'opening') {
        return board(recipe, destination, work);
      }
      if (!validWorldDestination(destination, recipe)) {
        return coreMessage(inventory.registry, 'placementTargetRequired');
      }
      const admission = admit(recipe, destination, work);
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
