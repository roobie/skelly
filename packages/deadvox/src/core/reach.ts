// Inventory proximity with a physical line to furniture, not gaze, bed quality or
// debug case collection. Units are explicit: positions are blocks; the admission limit is metres.

import type { ModelBox } from '@skelly/thing-core/schema';
import type { BlockEntity } from './blockEntities.ts';
import { dominantSide } from './character.ts';
import type { ClockSettings } from './clock.ts';
import type { Registry } from './content.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';
import type { Vec3 } from './coords.ts';
import type { Inventory, Location, Pile } from './inventory.ts';
import type { Item } from './items.ts';
import { itemRoots, walkItemTree } from './itemTree.ts';
import type { Body } from './physics.ts';
import { raycast, type SolidAt } from './raycast.ts';
import type { InventoryTuningDef } from './schema.ts';

/** The reach distances, in metres; required core content guarantees the row. */
export const reachTuning = (registry: Registry): InventoryTuningDef => registry.inventory.get(CORE_CONTENT_IDS.player)!;

export interface ReachPlayer {
  readonly inventory: Inventory;
  /** Unrounded physics feet, in blocks. A getter may follow the live body. */
  readonly position: Vec3;
  readonly blockSize: number;
  /** The session's clock; it turns handling seconds into the game seconds a craft plan states. */
  readonly clock: ClockSettings;
  /** Solid cells that stop an arm; absent is open ground. */
  readonly obstacles?: ReachObstacles;
}

interface ReachObstacles {
  /** Cells holding furniture defer to it: only a closed door blocks, so a table never hides the shelf behind it. */
  readonly isSolid: SolidAt;
  /** The same cells without any vehicle's rasterized body, so a car's own parts never hide themselves; absent, `isSolid`. */
  readonly isSolidIgnoringVehicles?: SolidAt;
  /** Changes on every block edit, so a cached snapshot follows broken and built walls. */
  readonly version: number;
}

export interface ReachEntry {
  readonly item: Item;
  readonly location: Location;
  /** Seconds to retrieve into a hand, before any destination handling. */
  readonly handlingTime: number;
}

export interface ReachSnapshot {
  readonly player: ReachPlayer;
  readonly origin: Vec3;
  readonly feet: Vec3;
  readonly entries: readonly ReachEntry[];
  readonly piles: readonly Pile[];
  /** Includes unsearched furniture so callers can offer Search, never its contents. */
  readonly furniture: readonly BlockEntity[];
  /** Furniture workstation components whose nearest box point is within the reach tuning. */
  readonly workstations: readonly {
    entity: BlockEntity;
    id: string;
    qualities: Readonly<Record<string, number>>;
    workFactorBonus: number;
  }[];
}

/** Horizontal pile-block middle, floor Y; distance from unrounded player feet. */
export const pileDistance = (position: Vec3, pile: Vec3, blockSize: number): number =>
  Math.hypot(pile[0] + 0.5 - position[0], pile[1] - position[1], pile[2] + 0.5 - position[2]) * blockSize;

type ReachGeometry = Pick<ReachPlayer, 'inventory' | 'position' | 'blockSize' | 'obstacles'>;

const chestOf = (player: ReachGeometry): Vec3 => [
  player.position[0],
  player.position[1] + reachTuning(player.inventory.registry).chestHeightMetres / player.blockSize,
  player.position[2],
];

/** Chest to nearest point of the whole furniture box, not its anchor/centre. */
export const furnitureDistance = (player: ReachPlayer, entity: BlockEntity): number =>
  player.inventory.entities.distance(entity, chestOf(player)) * player.blockSize;

type Box = readonly [low: Vec3, high: Vec3];
type BodyBox = Pick<Body, 'pos' | 'halfWidth' | 'height'>;

const bodyBox = (body: BodyBox): Box => [
  [body.pos[0] - body.halfWidth, body.pos[1], body.pos[2] - body.halfWidth],
  [body.pos[0] + body.halfWidth, body.pos[1] + body.height, body.pos[2] + body.halfWidth],
];

/** Chest to nearest point of a body's box, as for furniture. */
export const bodyDistance = (player: ReachPlayer, body: BodyBox): number => {
  const chest = chestOf(player);
  const [low, high] = bodyBox(body);
  const gaps = chest.map((value, axis) => value - Math.min(Math.max(value, low[axis]!), high[axis]!));
  return Math.hypot(...gaps) * player.blockSize;
};

// Stop just short of the face: a line that ends inside the box crosses the cell beside it
// whenever the player stands off the face, refusing a door or a wall-row shelf in plain view.
const FACE_GAP_BLOCKS = 1e-3;

/** The furniture being reached never blocks its own line. */
const clearLine = (
  player: ReachGeometry,
  obstacles: ReachObstacles,
  [low, high]: Box,
  target?: BlockEntity,
): boolean => {
  const { entities } = player.inventory;
  const chest = chestOf(player);
  const blocked = (x: number, y: number, z: number): boolean => {
    const occupant = entities.at(x, y, z);
    if (!occupant) {
      return obstacles.isSolid(x, y, z);
    }
    return occupant.uid !== target?.uid && Boolean(entities.defOf(occupant).door) && entities.blocks(occupant);
  };
  const reaches = (point: Vec3): boolean => {
    const offset = point.map((value, axis) => value - chest[axis]!) as Vec3;
    const length = Math.hypot(...offset);
    if (length === 0) {
      return true;
    }
    const direction = offset.map((value) => value / length) as Vec3;
    return raycast(chest, direction, length, blocked) === undefined;
  };
  // The face nearest the chest on each axis the chest lies outside of.
  const faceTargets = chest.flatMap((value, axis) => {
    if (value >= low[axis]! && value <= high[axis]!) {
      return [];
    }
    const plane = value < low[axis]! ? low[axis]! - FACE_GAP_BLOCKS : high[axis]! + FACE_GAP_BLOCKS;
    const point = chest.map((other, otherAxis) =>
      otherAxis === axis
        ? plane
        : Math.min(Math.max(other, low[otherAxis]! + FACE_GAP_BLOCKS), high[otherAxis]! - FACE_GAP_BLOCKS),
    ) as Vec3;
    return [point];
  });
  return faceTargets.length === 0 || faceTargets.some(reaches);
};

const lineInReach = (player: ReachGeometry, box: Box, target?: BlockEntity): boolean =>
  player.obstacles === undefined || clearLine(player, player.obstacles, box, target);

/**
 * The pieces in the columns within the reach limit of the chest; `furnitureInReach` still decides each. A box's high
 * face lies one past its last cell, so the low end reaches a cell further.
 */
const piecesInReach = (player: ReachPlayer): BlockEntity[] => {
  const chest = chestOf(player);
  const limit = reachTuning(player.inventory.registry).reachMetres / player.blockSize;
  return player.inventory.entities.near(
    chest.map((value) => value - limit - 1) as Vec3,
    chest.map((value) => value + limit) as Vec3,
  );
};

const furnitureInReach = (player: ReachPlayer, entity: BlockEntity): boolean =>
  furnitureDistance(player, entity) <= reachTuning(player.inventory.registry).reachMetres &&
  lineInReach(player, [entity.pos, entity.pos.map((value, axis) => value + entity.size[axis]!) as Vec3], entity);

export const pileInReach = (player: ReachGeometry, position: Vec3): boolean =>
  pileDistance(player.position, position, player.blockSize) <= reachTuning(player.inventory.registry).reachMetres &&
  lineInReach(player, [position, position.map((value) => value + 1) as Vec3]);

/**
 * Chest to the nearest point of a vehicle's occupied part boxes (world metres), as furniture is measured: a car is
 * reached at the part beside the player, never at its origin, so whatever F can pick on it is also in reach.
 * Distance only; `vehicleInReach` adds the line.
 */
export const vehicleDistance = (player: ReachGeometry, boxes: readonly ModelBox[]): number => {
  const chest = chestOf(player).map((value) => value * player.blockSize);
  return Math.min(
    ...boxes.map(({ min, max }) =>
      Math.hypot(...chest.map((value, axis) => value - Math.min(Math.max(value, min[axis]!), max[axis]!))),
    ),
  );
};

/**
 * Within the limit and along a clear line to some part box, as furniture is, so a wall can't be worked through. The
 * line ignores vehicle cells: the car's own rasterized body would hide every part it is reached at.
 */
export const vehicleInReach = (player: ReachGeometry, boxes: readonly ModelBox[]): boolean => {
  if (boxes.length === 0 || vehicleDistance(player, boxes) > reachTuning(player.inventory.registry).reachMetres) {
    return false;
  }
  const { obstacles } = player;
  if (obstacles === undefined) {
    return true;
  }
  const blind = { ...obstacles, isSolid: obstacles.isSolidIgnoringVehicles ?? obstacles.isSolid };
  return boxes.some(({ min, max }) =>
    clearLine(
      player,
      blind,
      [min.map((value) => value / player.blockSize) as Vec3, max.map((value) => value / player.blockSize) as Vec3],
    ),
  );
};

/** A downed body is reached as furniture is: within the limit, along a clear line to its box. */
export const bodyInReach = (player: ReachPlayer, body: BodyBox): boolean =>
  bodyDistance(player, body) <= reachTuning(player.inventory.registry).reachMetres &&
  lineInReach(player, bodyBox(body));

/** Wire the existing move validator to this same live core policy. */
export const bindReach = (
  player: ReachPlayer,
  vehicleParts?: { readonly boxesOf: (vehicleId: number) => readonly ModelBox[] },
): (() => ReachSnapshot) => {
  player.inventory.canReach = (position) => pileInReach(player, position);
  player.inventory.canReachEntity = (entity) => furnitureInReach(player, entity);
  if (vehicleParts) {
    player.inventory.canReachVehicle = (vehicleId) => vehicleInReach(player, vehicleParts.boxesOf(vehicleId));
  }
  player.inventory.actorPosition = () => player.position;
  return () => reach(player);
};

interface Cached {
  inventoryVersion: number;
  entityVersion: number;
  obstacleVersion: number | undefined;
  blockSize: number;
  snapshot: ReachSnapshot;
}
const snapshots = new WeakMap<ReachPlayer, Cached>();

/**
 * Derived accessible item tree. Cache keys cover origin, scale, topology/search
 * and scalar state (Inventory.version). Options are derived afresh from it;
 * commands must revalidate against the live policy, not authorize from this view.
 */
export const reach = (player: ReachPlayer): ReachSnapshot => {
  const { inventory, position, blockSize } = player;
  const previous = snapshots.get(player);
  if (
    previous &&
    previous.inventoryVersion === inventory.version &&
    previous.entityVersion === inventory.entities.version &&
    previous.obstacleVersion === player.obstacles?.version &&
    previous.blockSize === blockSize &&
    previous.snapshot.origin.every((value, axis) => value === position[axis])
  ) {
    return previous.snapshot;
  }
  const pileDistanceOf = (pile: Pile) => pileDistance(position, pile.pos, blockSize);
  const piles = [...inventory.piles.values()]
    .filter((pile) => pileInReach(player, pile.pos))
    .sort((a, b) => pileDistanceOf(a) - pileDistanceOf(b));
  const nearby = piecesInReach(player);
  const furniture = nearby
    .filter((entity) => entity.pockets !== undefined && furnitureInReach(player, entity))
    .sort((a, b) => furnitureDistance(player, a) - furnitureDistance(player, b));
  const entries: ReachEntry[] = [];
  const roots = itemRoots<Item, Pile, BlockEntity>({
    hands: inventory.hands,
    worn: inventory.worn,
    piles,
    entities: furniture.filter((entity) => entity.searched),
  });
  for (const { item, location } of walkItemTree(roots)) {
    if (
      location.kind === 'work' ||
      location.kind === 'slot' ||
      (location.kind === 'furniture' && location.entity.charging?.batteryUid === item.uid)
    ) {
      continue;
    }
    entries.push({
      item,
      location,
      handlingTime: inventory.handlingTime(item, location, { kind: 'hand', side: dominantSide(inventory.character) }),
    });
  }
  const workstations = nearby
    .filter((entity) => furnitureInReach(player, entity))
    .flatMap((entity) => {
      const station = inventory.entities.defOf(entity).workstation;
      return station ? [{ entity, ...station }] : [];
    })
    .sort(
      (a, b) =>
        furnitureDistance(player, a.entity) - furnitureDistance(player, b.entity) || a.entity.uid - b.entity.uid,
    );
  const snapshot: ReachSnapshot = {
    player,
    origin: [position[0], position[1], position[2]],
    feet: [Math.floor(position[0]), Math.floor(position[1] + 0.01), Math.floor(position[2])],
    entries,
    piles,
    furniture,
    workstations,
  };
  snapshots.set(player, {
    inventoryVersion: inventory.version,
    entityVersion: inventory.entities.version,
    obstacleVersion: player.obstacles?.version,
    blockSize,
    snapshot,
  });
  return snapshot;
};
