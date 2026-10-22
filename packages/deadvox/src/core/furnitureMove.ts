// Moving furniture (`DESIGN.md`, "Moving furniture"): lifting a piece into both
// hands and standing it down elsewhere. Each move is worked out on a shadow of the
// cells before anything changes, so a refusal leaves the world as it was.

import { type BlockEntities, type BlockEntity, boxIntersectsBody } from './blockEntities.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import type { Vec3 } from './coords.ts';
import { dropSpots, type Inventory, type Pile, type Spot } from './inventory.ts';
import { PILE_GRID } from './inventoryScale.ts';
import { findSpot, fitsAt, type Placed } from './items.ts';
import { ladderOutward } from './ladders.ts';
import { turnPose } from './orientation.ts';
import type { Body } from './physics.ts';
import type { SolidAt } from './raycast.ts';
import { reachTuning } from './reach.ts';
import { cellsOf } from './templates.ts';

/** What a move is checked against. */
export interface FurnitureMover {
  readonly inventory: Inventory;
  /** Terrain only; furniture comes from the inventory's entities. */
  readonly terrainSolid: SolidAt;
  readonly blockSize: number;
  readonly player: Body;
  /** Every other body that a piece could land on or be stood in. */
  readonly others: Iterable<Body>;
  readonly stamina: number;
}

interface PileMove {
  placed: Placed;
  to: Vec3;
  at: Spot;
}

interface Fall {
  entity: BlockEntity;
  y: number;
}

// A chunk that isn't loaded reads as air, so a fall that finds no floor within this
// many cells is a missing floor, not a deep one.
const MAX_FALL = 64;

const key = (cell: Readonly<Vec3>) => cell.join(',');
const below = (cell: Readonly<Vec3>): Vec3 => [cell[0], cell[1] - 1, cell[2]];

const boxCells = (pos: Readonly<Vec3>, size: Readonly<Vec3>): Vec3[] =>
  [...cellsOf(size)].map(([x, y, z]) => [pos[0] + x, pos[1] + y, pos[2] + z]);

/** The bottom layer of a box. */
const footprint = (pos: Readonly<Vec3>, size: Readonly<Vec3>): Vec3[] => boxCells(pos, [size[0], 1, size[2]]);

/** The layer of cells just above a box, where what it holds up lies. */
const topLayer = (pos: Readonly<Vec3>, size: Readonly<Vec3>): Vec3[] =>
  footprint([pos[0], pos[1] + size[1], pos[2]], size);

const messagesOf = (inventory: Inventory) => inventory.registry.ui.get(CORE_CONTENT_IDS.coreUi)!.furnitureMoveMessages;

/**
 * Which cells terrain and standing furniture fill, as a move would leave them: the move's changes over the
 * entities' own cells, so a preview each frame reads only the cells it asks about.
 */
class Shadow {
  /** A cell the move fills or empties; `null` is emptied. */
  private readonly changed = new Map<string, BlockEntity | null>();
  private readonly terrainSolid: SolidAt;
  private readonly entities: BlockEntities;

  constructor(terrainSolid: SolidAt, entities: BlockEntities) {
    this.terrainSolid = terrainSolid;
    this.entities = entities;
  }

  fill(entity: BlockEntity, pos: Readonly<Vec3>, filled: boolean): void {
    for (const cell of boxCells(pos, entity.size)) {
      if (filled) {
        this.changed.set(key(cell), entity);
      } else if (this.occupant(cell) === entity) {
        this.changed.set(key(cell), null);
      }
    }
  }

  occupant(cell: Readonly<Vec3>): BlockEntity | undefined {
    const changed = this.changed.get(key(cell));
    return changed === undefined ? this.entities.filling(cell[0], cell[1], cell[2]) : (changed ?? undefined);
  }

  occupied(cell: Readonly<Vec3>): boolean {
    return this.terrainSolid(cell[0], cell[1], cell[2]) || this.occupant(cell) !== undefined;
  }

  free(pos: Readonly<Vec3>, size: Readonly<Vec3>): boolean {
    return boxCells(pos, size).every((cell) => !this.occupied(cell));
  }

  /** Whether anything is under a box, so it stands rather than falls. */
  rests(pos: Readonly<Vec3>, size: Readonly<Vec3>): boolean {
    return footprint(pos, size).some((cell) => this.occupied(below(cell)));
  }

  /** The height a free box comes to rest at when let go. */
  landing(pos: Readonly<Vec3>, size: Readonly<Vec3>): number | undefined {
    const [x, top, z] = pos;
    for (let y = top; y > top - MAX_FALL; y--) {
      if (this.rests([x, y, z], size)) {
        return y;
      }
    }
    return undefined;
  }

  /** Free cells beside a pile's cell that something stands under, nearest first. */
  aside(cell: Readonly<Vec3>): Vec3[] {
    return dropSpots(cell as Vec3)
      .slice(1)
      .filter((spot) => !this.occupied(spot) && this.occupied(below(spot)));
  }
}

/** Why a piece can't be moved at all, whoever tries. */
export const movableRefusal = (inventory: Inventory, entity: BlockEntity, blockSize: number): string | undefined => {
  const messages = messagesOf(inventory);
  const { maxSizeMetres } = reachTuning(inventory.registry).furnitureMove;
  const rolls = inventory.entities.defOf(entity).cover === true;
  if (!rolls && entity.size.some((cells) => cells * blockSize > maxSizeMetres)) {
    return messages.tooBig;
  }
  return fastened(inventory, entity) ? messages.fastened : undefined;
};

/** Fixed where it stands: such a piece neither lifts nor falls. */
const fastened = (inventory: Inventory, entity: BlockEntity): boolean => {
  const def = inventory.entities.defOf(entity);
  return (
    entity.fixed === true ||
    def.mount !== undefined ||
    def.door !== undefined ||
    def.climbable !== undefined ||
    def.vehicle !== undefined ||
    def.scenarioGoal === true
  );
};

const anyBodyIn = (pos: Readonly<Vec3>, size: Readonly<Vec3>, bodies: Iterable<Body>): boolean =>
  [...bodies].some((body) => boxIntersectsBody(pos, size, body));

/**
 * Pieces that lose what held them up fall, lowest first, so a stack comes down in
 * order; only a piece standing on a cell that a moved piece left can fall.
 */
const settle = (mover: FurnitureMover, shadow: Shadow, lifted: BlockEntity): Fall[] | string => {
  const messages = messagesOf(mover.inventory);
  const vacated = new Set(boxCells(lifted.pos, lifted.size).map(key));
  shadow.fill(lifted, lifted.pos, false);
  // Only a piece over a vacated cell can fall, and it shares that cell's column, so candidates come from the columns
  // of what moved. A fall adds its own columns; the pieces that brings in stand above it, so the lowest-first order holds.
  const seen = new Set<BlockEntity>([lifted]);
  const candidates: BlockEntity[] = [];
  const gather = (pos: Readonly<Vec3>, size: Readonly<Vec3>) => {
    const fresh = mover.inventory.entities
      .near(pos, [pos[0] + size[0] - 1, pos[1], pos[2] + size[2] - 1])
      .filter((entity) => !(seen.has(entity) || fastened(mover.inventory, entity)));
    for (const entity of fresh) {
      seen.add(entity);
    }
    candidates.push(...fresh);
    candidates.sort((a, b) => a.pos[1] - b.pos[1] || a.uid - b.uid);
  };
  gather(lifted.pos, lifted.size);
  const falls: Fall[] = [];
  for (let entity = candidates.shift(); entity; entity = candidates.shift()) {
    const onVacated = footprint(entity.pos, entity.size).some((cell) => vacated.has(key(below(cell))));
    if (!onVacated || shadow.rests(entity.pos, entity.size)) {
      continue;
    }
    shadow.fill(entity, entity.pos, false);
    const y = shadow.landing(entity.pos, entity.size);
    if (y === undefined) {
      return messages.nowhereToLand;
    }
    const path: Vec3 = [entity.pos[0], y, entity.pos[2]];
    const pathSize: Vec3 = [entity.size[0], entity.pos[1] + entity.size[1] - y, entity.size[2]];
    if (boxIntersectsBody(path, pathSize, mover.player)) {
      return messages.fallsOnPlayer;
    }
    if (anyBodyIn(path, pathSize, mover.others)) {
      return messages.fallsOnOther;
    }
    shadow.fill(entity, path, true);
    for (const cell of boxCells(entity.pos, entity.size)) {
      vacated.add(key(cell));
    }
    gather(entity.pos, entity.size);
    falls.push({ entity, y });
  }
  return falls;
};

/**
 * Where the items of piles that lost their floor, or whose cell a piece now fills,
 * go: down their column, then aside, keeping each item's spot where it still fits.
 */
const resettlePiles = (mover: FurnitureMover, shadow: Shadow, piles: readonly Pile[]): PileMove[] | undefined => {
  const { inventory } = mover;
  const moving = piles.filter((pile) => shadow.occupied(pile.pos) || !shadow.occupied(below(pile.pos)));
  const leaving = new Set(moving.flatMap((pile) => pile.items));
  const grids = new Map<string, Placed[]>();
  const gridAt = (cell: Vec3) => {
    let placed = grids.get(key(cell));
    if (!placed) {
      placed = (inventory.pileAt(cell)?.items ?? []).filter((p) => !leaving.has(p));
      grids.set(key(cell), placed);
    }
    return placed;
  };
  const moves: PileMove[] = [];
  for (const pile of moving) {
    const targets = shadow.occupied(pile.pos) ? shadow.aside(pile.pos) : columnTargets(shadow, pile.pos);
    for (const placed of pile.items) {
      const move = fitPlaced(mover, targets, gridAt, placed);
      if (!move) {
        return undefined;
      }
      gridAt(move.to).push({ ...move.at, item: placed.item });
      moves.push(move);
    }
  }
  return moves;
};

/** Where a pile that lost its floor falls to, then the cells beside that. */
const columnTargets = (shadow: Shadow, from: Readonly<Vec3>): Vec3[] => {
  let cell: Vec3 = [...from];
  for (let fall = 0; fall < MAX_FALL && !shadow.occupied(below(cell)); fall++) {
    cell = below(cell);
  }
  return shadow.occupied(below(cell)) ? [cell, ...shadow.aside(cell)] : [];
};

const fitPlaced = (
  mover: FurnitureMover,
  targets: readonly Vec3[],
  gridAt: (cell: Vec3) => Placed[],
  placed: Placed,
): PileMove | undefined => {
  const { registry } = mover.inventory;
  const kept: Spot = { x: placed.x, y: placed.y, rotated: placed.rotated };
  for (const to of targets) {
    const grid = { size: PILE_GRID, placed: gridAt(to) };
    const at = fitsAt(registry, grid, placed.item, kept) ? kept : findSpot(registry, grid, placed.item);
    if (at) {
      return { placed, to, at };
    }
  }
  return undefined;
};

/** Piles lying on top of boxes, or inside them. */
const pilesOver = (inventory: Inventory, boxes: readonly { pos: Vec3; size: Vec3 }[]): Pile[] => {
  const found = new Set<Pile>();
  for (const { pos, size } of boxes) {
    for (const cell of [...topLayer(pos, size), ...boxCells(pos, size)]) {
      const pile = inventory.pileAt(cell);
      if (pile) {
        found.add(pile);
      }
    }
  }
  return [...found];
};

/**
 * Why a piece must stay for what is on it: a body standing on it always holds it, and with `settles` false, so does
 * a piece or pile resting on it. Lifting lets those settle; removal refuses them, so it never floats or strands
 * anything (`DESIGN.md`, "Edits persist").
 */
const supportRefusal = (mover: FurnitureMover, entity: BlockEntity, settles: boolean): string | undefined => {
  const { inventory } = mover;
  const messages = messagesOf(inventory);
  const top = topLayer(entity.pos, entity.size);
  const topSize: Vec3 = [entity.size[0], 1, entity.size[2]];
  if (boxIntersectsBody(top[0]!, topSize, mover.player)) {
    return messages.standingOn;
  }
  if (anyBodyIn(top[0]!, topSize, mover.others)) {
    return messages.someoneOnIt;
  }
  if (settles) {
    return undefined;
  }
  const pieceOn = top.some((cell) => {
    const piece = inventory.entities.filling(cell[0], cell[1], cell[2]);
    return piece !== undefined && piece !== entity;
  });
  return pieceOn || pilesOver(inventory, [entity]).length > 0 ? messages.holdsUp : undefined;
};

/** Why a standing piece can't be taken out of the world now: what is on it, in it or in its doorway. */
export const removalRefusal = (mover: FurnitureMover, entity: BlockEntity): string | undefined =>
  supportRefusal(mover, entity, false) ?? mover.inventory.entities.removalRefusal(entity);

/**
 * Takes a standing piece out of the world; returns why not, leaving everything as it was. The caller cancels the
 * work that names it first.
 */
export const removeFurniture = (mover: FurnitureMover, entity: BlockEntity): string | undefined => {
  const refusal = removalRefusal(mover, entity);
  if (refusal) {
    return refusal;
  }
  mover.inventory.entities.remove(entity);
  return undefined;
};

/**
 * Lifts a piece into both hands, letting what stood on it settle; returns why not,
 * leaving everything as it was. The caller charges the stamina.
 */
export const liftFurniture = (mover: FurnitureMover, entity: BlockEntity): string | undefined => {
  const { inventory } = mover;
  const messages = messagesOf(inventory);
  const refusal = inventory.entities.useRefusal(entity) ?? movableRefusal(inventory, entity, mover.blockSize);
  if (refusal) {
    return refusal;
  }
  if (!inventory.canReachEntity(entity)) {
    return messages.outOfReach;
  }
  const handsRefusal = inventory.liftRefusal();
  if (handsRefusal) {
    return handsRefusal;
  }
  if (mover.stamina < reachTuning(inventory.registry).furnitureMove.liftStamina) {
    return messages.tired;
  }
  const supported = supportRefusal(mover, entity, true);
  if (supported) {
    return supported;
  }
  const shadow = new Shadow(mover.terrainSolid, inventory.entities);
  const falls = settle(mover, shadow, entity);
  if (typeof falls === 'string') {
    return falls;
  }
  const left = [entity, ...falls.map((fall) => fall.entity)].map(({ pos, size }) => ({ pos, size }));
  const landed = falls.map(({ entity: fallen, y }) => ({
    pos: [fallen.pos[0], y, fallen.pos[2]] as Vec3,
    size: fallen.size,
  }));
  const moves = resettlePiles(mover, shadow, pilesOver(inventory, [...left, ...landed]));
  if (!moves) {
    return messages.nowhereToLand;
  }
  inventory.entities.lift(entity);
  for (const { entity: fallen, y } of falls) {
    inventory.entities.drop(fallen, y);
  }
  inventory.shiftPiles(moves);
  return undefined;
};

/** The lowest corner a carried piece would stand at when put down at an aimed cell, before it settles. */
const placementBase = (entity: BlockEntity, aimed: Readonly<Vec3>): Vec3 => [
  aimed[0] - Math.floor(entity.size[0] / 2),
  aimed[1],
  aimed[2] - Math.floor(entity.size[2] / 2),
];

/** Where the carried piece would stand if put down at an aimed cell, or why it can't be. */
export const placement = (mover: FurnitureMover, aimed: Readonly<Vec3>): { pos: Vec3 } | { refusal: string } => {
  const { inventory } = mover;
  const messages = messagesOf(inventory);
  const entity = inventory.entities.carrying();
  if (!entity) {
    throw new Error('Not carrying a block entity');
  }
  if (!inventory.canReach(aimed as Vec3)) {
    return { refusal: messages.outOfReach };
  }
  const shadow = new Shadow(mover.terrainSolid, inventory.entities);
  const base = placementBase(entity, aimed);
  const y = shadow.free(base, entity.size) ? shadow.landing(base, entity.size) : undefined;
  if (y === undefined) {
    return { refusal: messages.noRoom };
  }
  const pos: Vec3 = [base[0], y, base[2]];
  const refusal = standRefusal(mover, shadow, pos, entity);
  return refusal ? { refusal } : { pos };
};

const standRefusal = (mover: FurnitureMover, shadow: Shadow, pos: Vec3, piece: BlockEntity): string | undefined => {
  const { size } = piece;
  const { entities } = mover.inventory;
  const messages = messagesOf(mover.inventory);
  if (boxIntersectsBody(pos, size, mover.player)) {
    return messages.playerInWay;
  }
  if (anyBodyIn(pos, size, mover.others)) {
    return messages.otherInWay;
  }
  const under = footprint(pos, size).map((cell) => shadow.occupant(below(cell)));
  const cover = entities.defOf(piece).cover === true;
  if (under.some((entity) => entity && entities.defOf(entity).door?.hatch && (!cover || entity.open))) {
    return messages.coversHatch;
  }
  const cells = new Set(boxCells(pos, size).map(key));
  const onLadder = under.some((entity) => entity && entities.defOf(entity).climbable);
  // A ladder's approach is the cell beside it, so a ladder it could block stands within a cell of the box.
  const ladders = entities.near([pos[0] - 1, pos[1], pos[2] - 1], [pos[0] + size[0], pos[1], pos[2] + size[2]]);
  return onLadder || ladders.some((entity) => blocksApproach(mover.inventory, entity, cells))
    ? messages.blocksLadder
    : undefined;
};

/** Whether cells fill the side of a ladder its climber stands on. */
const blocksApproach = (inventory: Inventory, entity: BlockEntity, cells: ReadonlySet<string>): boolean => {
  if (!inventory.entities.defOf(entity).climbable) {
    return false;
  }
  const [dx, dz] = ladderOutward(entity.facing);
  return boxCells(entity.pos, entity.size).some(([x, y, z]) => cells.has(key([x + dx, y, z + dz])));
};

/**
 * Stands the carried piece down at an aimed cell, shoving any pile there aside;
 * returns why not, leaving everything as it was.
 */
export const placeFurniture = (mover: FurnitureMover, aimed: Readonly<Vec3>): string | undefined => {
  const { inventory } = mover;
  const result = placement(mover, aimed);
  if ('refusal' in result) {
    return result.refusal;
  }
  const entity = inventory.entities.carrying()!;
  const shadow = new Shadow(mover.terrainSolid, inventory.entities);
  shadow.fill(entity, result.pos, true);
  const moves = resettlePiles(mover, shadow, pilesOver(inventory, [{ pos: result.pos, size: [...entity.size] }]));
  if (!moves) {
    return messagesOf(inventory).noRoom;
  }
  inventory.entities.place(entity, result.pos);
  inventory.shiftPiles(moves);
  return undefined;
};

/** Turns the carried piece a quarter about the world vertical, clockwise seen from above; returns why not. */
export const turnCarried = (inventory: Inventory): string | undefined => {
  const entity = inventory.entities.carrying();
  if (!entity) {
    return messagesOf(inventory).emptyHands;
  }
  inventory.entities.orient(entity, turnPose(entity, 'y'));
  return undefined;
};

/** Tips the carried piece a quarter about the world x axis; returns why not. */
export const tipCarried = (inventory: Inventory): string | undefined => {
  const messages = messagesOf(inventory);
  const { entities } = inventory;
  const entity = entities.carrying();
  if (!entity) {
    return messages.emptyHands;
  }
  if (entities.defOf(entity).upright) {
    return messages.staysUpright;
  }
  entities.orient(entity, turnPose(entity, 'x'));
  return undefined;
};
