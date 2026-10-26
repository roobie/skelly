// Each move is worked out on a shadow of the cells before anything changes,
// so a refusal leaves the world as it was (`DESIGN.md`, "Moving furniture").

import { type BlockEntities, type BlockEntity, boxIntersectsBody } from './blockEntities.ts';
import type { FurnitureDef } from './content.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import type { Vec3 } from './coords.ts';
import { dropSpots, type Inventory, type Pile, type Spot } from './inventory.ts';
import { PILE_GRID } from './inventoryScale.ts';
import { couldFit, findSpot, fitsAt, type Placed } from './items.ts';
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
  readonly beforeRelocate?: (entity: BlockEntity) => void;
}

/** Old appliance service, then old food environment, are settled before a piece moves, falls or is destroyed. */
const beforeRelocating = (mover: FurnitureMover, pieces: readonly BlockEntity[]): void => {
  for (const piece of pieces) {
    mover.beforeRelocate?.(piece);
    mover.inventory.settleFurnitureFood(piece);
  }
};

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

export type FurnitureMoveEffort = 'lift' | 'drag' | 'carry';

/** The content curve for one furniture move: `base + perKg * massKg`. */
export const furnitureMoveStamina = (
  inventory: Inventory,
  entity: BlockEntity,
  effort: FurnitureMoveEffort,
): number => {
  const furniture = inventory.entities.defOf(entity);
  const massKg = inventory.entities.massKg(entity);
  if (massKg === undefined) {
    throw new Error(`Liftable furniture "${furniture.id}" has no mass`);
  }
  const { fatigue } = reachTuning(inventory.registry).furnitureMove;
  if (effort === 'carry') {
    return fatigue.carry.basePerSimSecond + fatigue.carry.perKgPerSimSecond * massKg;
  }
  return fatigue[effort].base + fatigue[effort].perKg * massKg;
};

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

/** Whether a furniture definition can lift or drag when its placement is not fixed. */
export const liftableFurniture = (furniture: FurnitureDef): boolean =>
  furniture.mount === undefined &&
  furniture.door === undefined &&
  furniture.climbable === undefined &&
  furniture.vehicle === undefined &&
  furniture.scenarioGoal !== true;

/** Fixed where it stands: such a piece neither lifts nor falls. */
const fastened = (inventory: Inventory, entity: BlockEntity): boolean =>
  entity.fixed === true || fastenedKind(inventory, entity);

const fastenedKind = (inventory: Inventory, entity: BlockEntity): boolean =>
  !liftableFurniture(inventory.entities.defOf(entity));

const anyBodyIn = (pos: Readonly<Vec3>, size: Readonly<Vec3>, bodies: Iterable<Body>): boolean =>
  [...bodies].some((body) => boxIntersectsBody(pos, size, body));

interface Settled {
  falls: Fall[];
  /** Pieces that could not come down clear, destroyed in turn; only a ruin has any. */
  ruined: BlockEntity[];
}

/**
 * Pieces that lose what held them up fall, lowest first, so a stack comes down in
 * order; only a piece standing on a cell that a moved piece left can fall. A fall with
 * nowhere to land or onto someone refuses a move; under a ruin, which can't be refused,
 * that piece is destroyed in turn instead, so nothing floats.
 */
const settle = (
  mover: FurnitureMover,
  shadow: Shadow,
  lifted: BlockEntity,
  { ruin = false, movedTo }: { ruin?: boolean; movedTo?: Vec3 } = {},
): Settled | string => {
  const messages = messagesOf(mover.inventory);
  const vacated = new Set(boxCells(lifted.pos, lifted.size).map(key));
  shadow.fill(lifted, lifted.pos, false);
  if (movedTo) {
    shadow.fill(lifted, movedTo, true);
  }
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
  const ruined: BlockEntity[] = [];
  for (let entity = candidates.shift(); entity; entity = candidates.shift()) {
    const onVacated = footprint(entity.pos, entity.size).some((cell) => vacated.has(key(below(cell))));
    if (!onVacated || shadow.rests(entity.pos, entity.size)) {
      continue;
    }
    shadow.fill(entity, entity.pos, false);
    const y = shadow.landing(entity.pos, entity.size);
    const refusal = y === undefined ? messages.nowhereToLand : fallRefusal(mover, entity, y);
    if (refusal && !ruin) {
      return refusal;
    }
    if (y !== undefined && !refusal) {
      shadow.fill(entity, [entity.pos[0], y, entity.pos[2]], true);
      falls.push({ entity, y });
    } else {
      ruined.push(entity);
    }
    for (const cell of boxCells(entity.pos, entity.size)) {
      vacated.add(key(cell));
    }
    gather(entity.pos, entity.size);
  }
  return { falls, ruined };
};

/** Why a piece can't fall to a height: someone is in its path. */
const fallRefusal = (mover: FurnitureMover, entity: BlockEntity, y: number): string | undefined => {
  const messages = messagesOf(mover.inventory);
  const path: Vec3 = [entity.pos[0], y, entity.pos[2]];
  const pathSize: Vec3 = [entity.size[0], entity.pos[1] + entity.size[1] - y, entity.size[2]];
  if (boxIntersectsBody(path, pathSize, mover.player)) {
    return messages.fallsOnPlayer;
  }
  return anyBodyIn(path, pathSize, mover.others) ? messages.fallsOnOther : undefined;
};

/** Items that lie in no pile, such as a ruined piece's contents and debris, and where they may land, nearest first. */
interface Loose {
  items: readonly Placed[];
  targets: Iterable<Vec3>;
}

/**
 * Where the items of piles that lost their floor, or whose cell a piece now fills,
 * go: down their column, then aside, keeping each item's spot where it still fits.
 * Loose items go to their own targets.
 */
const resettlePiles = (
  mover: FurnitureMover,
  shadow: Shadow,
  piles: readonly Pile[],
  loose: readonly Loose[] = [],
): PileMove[] | undefined => {
  const { inventory } = mover;
  const moving: Loose[] = piles
    .filter((pile) => shadow.occupied(pile.pos) || !shadow.occupied(below(pile.pos)))
    .map((pile) => ({
      items: pile.items,
      targets: shadow.occupied(pile.pos) ? shadow.aside(pile.pos) : columnTargets(shadow, pile.pos),
    }));
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
  for (const { items, targets } of [...moving, ...loose]) {
    for (const placed of items) {
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

/**
 * Floor cells for a ruined piece's drops: where its footprint's columns come down, then outward over the floor one
 * neighbour at a time, nearest first. It grows only as far as the drops need, so they find room while the floor
 * around has any.
 */
const spreadFrom = (shadow: Shadow, cells: readonly Vec3[]): Iterable<Vec3> => {
  const found: Vec3[] = [];
  const seen = new Set<string>();
  const add = (candidates: readonly Vec3[]) => {
    for (const cell of candidates) {
      if (!seen.has(key(cell))) {
        seen.add(key(cell));
        found.push(cell);
      }
    }
  };
  for (const cell of cells) {
    // A piece that fell into the footprint fills its cell, so the drops go beside it.
    add(shadow.occupied(cell) ? shadow.aside(cell) : columnTargets(shadow, cell));
  }
  let grown = 0;
  return {
    *[Symbol.iterator]() {
      for (let at = 0; ; at++) {
        for (; at >= found.length && grown < found.length; grown++) {
          add(shadow.aside(found[grown]!));
        }
        if (at >= found.length) {
          return;
        }
        yield found[at]!;
      }
    },
  };
};

const fitPlaced = (
  mover: FurnitureMover,
  targets: Iterable<Vec3>,
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
  beforeRelocating(mover, [entity]);
  mover.inventory.entities.remove(entity);
  return undefined;
};

/**
 * A ruined piece's debris, in stacks no larger than each item stacks. These are stand-ins that only size the drop;
 * `ruinFurniture` makes the real items once everything is known to fit, so a refused ruin creates none.
 */
const debrisOf = (inventory: Inventory, entity: BlockEntity): Placed[] =>
  (inventory.entities.defOf(entity).ruin?.debris ?? []).flatMap(({ item, count }) => {
    const stack = inventory.registry.items.get(item)?.stack ?? 1;
    return Array.from({ length: Math.ceil(count / stack) }, (_, at) => ({
      item: { uid: 0, type: item, count: Math.min(stack, count - at * stack), condition: 1 },
      x: 0,
      y: 0,
      rotated: false,
    }));
  });

/**
 * Destroys a piece a blow ruined (`BlockEntities.bash`): what it held and the debris its content names fall as piles
 * at its cells, piles on it resettle, and pieces resting on it fall or, where they can't come down clear, are
 * destroyed in turn with the same drops. A blow can't be refused, so nothing here refuses, and nothing is lost or
 * left floating (`DESIGN.md`, "Edits persist"). Returns the destroyed pieces, the struck one first, so the caller
 * cancels the work that names them. Where the drops have no room it changes nothing and returns undefined: the piece
 * stands until a blow finds room, because destruction loses nothing (`DESIGN.md`, "Ruined furniture").
 */
export const ruinFurniture = (mover: FurnitureMover, entity: BlockEntity): BlockEntity[] | undefined => {
  const { inventory } = mover;
  const shadow = new Shadow(mover.terrainSolid, inventory.entities);
  const { falls, ruined } = settle(mover, shadow, entity, { ruin: true }) as Settled;
  const destroyed = [entity, ...ruined];
  const standIns = new Set<Placed>();
  const loose = destroyed.map((piece) => {
    const debris = debrisOf(inventory, piece);
    for (const placed of debris) {
      standIns.add(placed);
    }
    return {
      items: [...(piece.pockets?.flat() ?? []), ...debris],
      targets: spreadFrom(shadow, footprint(piece.pos, piece.size)),
    };
  });
  const dropped = new Set(loose.flatMap(({ items }) => items));
  if ([...dropped].some(({ item }) => !couldFit(inventory.registry, PILE_GRID, item))) {
    return undefined;
  }
  const left = [...destroyed, ...falls.map((fall) => fall.entity)].map(({ pos, size }) => ({ pos, size }));
  const landed = falls.map(({ entity: fallen, y }) => ({
    pos: [fallen.pos[0], y, fallen.pos[2]] as Vec3,
    size: fallen.size,
  }));
  const moves = resettlePiles(mover, shadow, pilesOver(inventory, [...left, ...landed]), loose);
  if (!moves) {
    return undefined;
  }
  for (const placed of standIns) {
    placed.item = inventory.create(placed.item.type, placed.item.count);
  }
  beforeRelocating(mover, [...destroyed, ...falls.map((fall) => fall.entity)]);
  for (const piece of destroyed) {
    inventory.entities.destroy(piece);
  }
  for (const { entity: fallen, y } of falls) {
    inventory.entities.drop(fallen, y);
  }
  inventory.shiftPiles(moves.filter(({ placed }) => !dropped.has(placed)));
  inventory.landLoose(moves.filter(({ placed }) => dropped.has(placed)));
  return destroyed;
};

/**
 * Lifts a piece into both hands, letting what stood on it settle; returns why not,
 * leaving everything as it was. The caller charges the stamina.
 */
export const liftFurniture = (mover: FurnitureMover, entity: BlockEntity, floorLocked = false): string | undefined => {
  const { inventory } = mover;
  const messages = messagesOf(inventory);
  const refusal = floorLocked
    ? slideRefusal(mover, entity)
    : (inventory.entities.useRefusal(entity) ?? movableRefusal(inventory, entity, mover.blockSize));
  if (refusal) {
    return refusal;
  }
  if (!inventory.canReachEntity(entity)) {
    return messages.outOfReach;
  }
  if (floorLocked && !footprint(entity.pos, entity.size).every(([x, y, z]) => mover.terrainSolid(x, y - 1, z))) {
    return messages.floorOnly;
  }
  const handsRefusal = inventory.liftRefusal();
  if (handsRefusal) {
    return handsRefusal;
  }
  if (mover.stamina < furnitureMoveStamina(inventory, entity, floorLocked ? 'drag' : 'lift')) {
    return messages.tired;
  }
  const supported = supportRefusal(mover, entity, true);
  if (supported) {
    return supported;
  }
  const shadow = new Shadow(mover.terrainSolid, inventory.entities);
  const settled = settle(mover, shadow, entity);
  if (typeof settled === 'string') {
    return settled;
  }
  const { falls } = settled;
  const left = [entity, ...falls.map((fall) => fall.entity)].map(({ pos, size }) => ({ pos, size }));
  const landed = falls.map(({ entity: fallen, y }) => ({
    pos: [fallen.pos[0], y, fallen.pos[2]] as Vec3,
    size: fallen.size,
  }));
  const moves = resettlePiles(mover, shadow, pilesOver(inventory, [...left, ...landed]));
  if (!moves) {
    return messages.nowhereToLand;
  }
  beforeRelocating(mover, [entity, ...falls.map((fall) => fall.entity)]);
  inventory.entities.lift(entity, floorLocked);
  for (const { entity: fallen, y } of falls) {
    inventory.entities.drop(fallen, y);
  }
  inventory.shiftPiles(moves);
  return undefined;
};

export type FurnitureSlideWay = 'push';

export const slidableFurniture = (inventory: Inventory, entity: BlockEntity, blockSize: number): boolean =>
  !fastenedKind(inventory, entity) && oversizedFurniture(inventory, entity, blockSize);

const oversizedFurniture = (inventory: Inventory, entity: BlockEntity, blockSize: number): boolean =>
  inventory.entities.defOf(entity).cover !== true &&
  entity.size.some((cells) => cells * blockSize > reachTuning(inventory.registry).furnitureMove.maxSizeMetres);

const slideRefusal = (mover: FurnitureMover, entity: BlockEntity): string | undefined => {
  const { inventory } = mover;
  const messages = messagesOf(inventory);
  const refusal = inventory.entities.useRefusal(entity);
  if (refusal) {
    return refusal;
  }
  if (fastened(inventory, entity)) {
    return messages.fastened;
  }
  if (!oversizedFurniture(inventory, entity, mover.blockSize)) {
    return messages.carryInstead;
  }
  if (entity.carried || !inventory.canReachEntity(entity)) {
    return messages.outOfReach;
  }
  if (mover.stamina < furnitureMoveStamina(inventory, entity, 'drag')) {
    return messages.slideTired;
  }
  return supportRefusal(mover, entity, true);
};

/** Plans before committing, so a refused floor step never disturbs the stack or its loose items. */
export const slideFurniture = (
  mover: FurnitureMover,
  entity: BlockEntity,
  way: FurnitureSlideWay,
  { commit = true, destination }: { commit?: boolean; destination?: Readonly<Vec3> } = {},
): string | undefined => {
  const { inventory } = mover;
  const messages = messagesOf(inventory);
  const refusal = slideRefusal(mover, entity);
  if (refusal) {
    return refusal;
  }
  if (way !== 'push') {
    throw new Error('Invalid furniture slide');
  }
  const pos = slideDestination(mover.player, entity);
  if (destination && pos.some((value, axis) => value !== destination[axis])) {
    return messages.outOfReach;
  }
  const shadow = new Shadow(mover.terrainSolid, inventory.entities);
  shadow.fill(entity, entity.pos, false);
  if (!shadow.free(pos, entity.size)) {
    return messages.noRoom;
  }
  if (
    ![...footprint(entity.pos, entity.size), ...footprint(pos, entity.size)].every(([x, y, z]) =>
      mover.terrainSolid(x, y - 1, z),
    )
  ) {
    return messages.floorOnly;
  }
  const standing = standRefusal(mover, shadow, pos, entity);
  if (standing) {
    return standing;
  }
  const settled = settle(mover, shadow, entity, { movedTo: pos });
  if (typeof settled === 'string') {
    return settled;
  }
  const { falls } = settled;
  const boxes = [
    entity,
    { pos, size: entity.size },
    ...falls.flatMap(({ entity: fallen, y }) => [
      fallen,
      { pos: [fallen.pos[0], y, fallen.pos[2]] as Vec3, size: fallen.size },
    ]),
  ];
  const moves = resettlePiles(mover, shadow, pilesOver(inventory, boxes));
  if (!moves) {
    return messages.nowhereToLand;
  }
  if (commit) {
    beforeRelocating(mover, [entity, ...falls.map((fall) => fall.entity)]);
    inventory.entities.slide(entity, pos);
    for (const { entity: fallen, y } of falls) {
      inventory.entities.drop(fallen, y);
    }
    inventory.shiftPiles(moves);
  }
  return undefined;
};

export const slideDestination = (player: Body, entity: BlockEntity): Vec3 => {
  const dx = entity.pos[0] + entity.size[0] / 2 - player.pos[0];
  const dz = entity.pos[2] + entity.size[2] / 2 - player.pos[2];
  return [
    entity.pos[0] + (Math.abs(dx) >= Math.abs(dz) ? Math.sign(dx) : 0),
    entity.pos[1],
    entity.pos[2] + (Math.abs(dx) < Math.abs(dz) ? Math.sign(dz) : 0),
  ];
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
  const target: Vec3 = [aimed[0], entity.floorLocked ? entity.pos[1] : aimed[1], aimed[2]];
  if (!inventory.canReach(target)) {
    return { refusal: messages.outOfReach };
  }
  const shadow = new Shadow(mover.terrainSolid, inventory.entities);
  const base = placementBase(entity, target);
  if (entity.floorLocked && !footprint(base, entity.size).every(([x, y, z]) => mover.terrainSolid(x, y - 1, z))) {
    return { refusal: messages.floorOnly };
  }
  if (!shadow.free(base, entity.size)) {
    return { refusal: messages.noRoom };
  }
  const landingY = entity.floorLocked ? entity.pos[1] : shadow.landing(base, entity.size);
  if (landingY === undefined) {
    return { refusal: messages.noRoom };
  }
  const pos: Vec3 = [base[0], landingY, base[2]];
  const refusal = standRefusal(mover, shadow, pos, entity);
  return refusal ? { refusal } : { pos };
};

type Placement = ReturnType<typeof placement>;
const positioned = (result: Placement | undefined): result is { pos: Vec3 } => result !== undefined && 'pos' in result;

/** The next floor cell a drag may enter; diagonal corners need both adjoining cells clear. */
export const advanceFloorLockedPlacement = (mover: FurnitureMover, aimed: Readonly<Vec3>): Placement => {
  const entity = mover.inventory.entities.carrying();
  if (!entity?.floorLocked) {
    return placement(mover, aimed);
  }
  const target = placementBase(entity, [aimed[0], entity.pos[1], aimed[2]]);
  const dx = Math.sign(target[0] - entity.pos[0]);
  const dz = Math.sign(target[2] - entity.pos[2]);
  const candidate = (x: number, z: number) =>
    placement(mover, [x + Math.floor(entity.size[0] / 2), entity.pos[1], z + Math.floor(entity.size[2] / 2)]);
  const xStep = dx === 0 ? undefined : candidate(entity.pos[0] + dx, entity.pos[2]);
  const zStep = dz === 0 ? undefined : candidate(entity.pos[0], entity.pos[2] + dz);
  if (xStep && zStep) {
    const diagonal = candidate(entity.pos[0] + dx, entity.pos[2] + dz);
    if (positioned(xStep) && positioned(zStep) && positioned(diagonal)) {
      return diagonal;
    }
  }
  if (positioned(xStep)) {
    return xStep;
  }
  if (positioned(zStep)) {
    return zStep;
  }
  return { pos: [...entity.pos] };
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
  const carried = inventory.entities.carrying()!;
  const result = carried.floorLocked
    ? placement(mover, [
        carried.pos[0] + Math.floor(carried.size[0] / 2),
        carried.pos[1],
        carried.pos[2] + Math.floor(carried.size[2] / 2),
      ])
    : placement(mover, aimed);
  if ('refusal' in result) {
    return result.refusal;
  }
  const entity = carried;
  const shadow = new Shadow(mover.terrainSolid, inventory.entities);
  shadow.fill(entity, result.pos, true);
  const moves = resettlePiles(mover, shadow, pilesOver(inventory, [{ pos: result.pos, size: [...entity.size] }]));
  if (!moves) {
    return messagesOf(inventory).noRoom;
  }
  inventory.settleFurnitureFood(entity);
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
