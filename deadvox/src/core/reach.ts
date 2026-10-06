// Inventory proximity, not gaze/LOS, bed quality or debug case collection.
// Units are explicit: positions are blocks; the admission limit is metres.

import type { BlockEntity } from './blockEntities.ts';
import { dominantSide } from './character.ts';
import type { Vec3 } from './coords.ts';
import type { Inventory, Location, Pile } from './inventory.ts';
import type { Item } from './items.ts';
import { itemRoots, walkItemTree } from './itemTree.ts';

export const INVENTORY_REACH = 2;
export const INVENTORY_CHEST = 1;

export interface ReachPlayer {
  readonly inventory: Inventory;
  /** Unrounded physics feet, in blocks. A getter may follow the live body. */
  readonly position: Vec3;
  readonly blockSize: number;
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
  /** Furniture workstation components whose nearest box point is within INVENTORY_REACH. */
  readonly workstations: readonly {
    entity: BlockEntity;
    id: string;
    qualities: Readonly<Record<string, number>>;
    workTimeBonus: number;
  }[];
}

/** Horizontal pile-block middle, floor Y; distance from unrounded player feet. */
export const pileDistance = (position: Vec3, pile: Vec3, blockSize: number): number =>
  Math.hypot(pile[0] + 0.5 - position[0], pile[1] - position[1], pile[2] + 0.5 - position[2]) * blockSize;

/** Chest to nearest point of the whole furniture box, not its anchor/centre. */
export const furnitureDistance = (player: ReachPlayer, entity: BlockEntity): number =>
  player.inventory.entities.distance(entity, [
    player.position[0],
    player.position[1] + INVENTORY_CHEST / player.blockSize,
    player.position[2],
  ]) * player.blockSize;

const pileInReach = (player: ReachPlayer, position: Vec3): boolean =>
  pileDistance(player.position, position, player.blockSize) <= INVENTORY_REACH;

const furnitureInReach = (player: ReachPlayer, entity: BlockEntity): boolean =>
  furnitureDistance(player, entity) <= INVENTORY_REACH;

/** Generic spatial collection, including the debug 20m case query: not inventory admission. */
export const pilesInRadius = (inventory: Inventory, position: Vec3, radiusBlocks: number): Pile[] => {
  const distance = (pile: Pile) => pileDistance(position, pile.pos, 1);
  return [...inventory.piles.values()]
    .filter((pile) => distance(pile) <= radiusBlocks)
    .sort((a, b) => distance(a) - distance(b));
};

/** Wire the existing move validator to this same live core policy. */
export const bindReach = (player: ReachPlayer): (() => ReachSnapshot) => {
  player.inventory.canReach = (position) => pileInReach(player, position);
  player.inventory.canReachEntity = (entity) => furnitureInReach(player, entity);
  return () => reach(player);
};

interface Cached {
  inventoryVersion: number;
  entityVersion: number;
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
    previous.blockSize === blockSize &&
    previous.snapshot.origin.every((value, axis) => value === position[axis])
  ) {
    return previous.snapshot;
  }
  const piles = pilesInRadius(inventory, position, INVENTORY_REACH / blockSize);
  const furniture = [...inventory.entities.all]
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
    if (location.kind === 'work' || location.kind === 'slot') {
      continue;
    }
    entries.push({
      item,
      location,
      handlingTime: inventory.handlingTime(item, location, { kind: 'hand', side: dominantSide(inventory.character) }),
    });
  }
  const workstations = [...inventory.entities.all]
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
    blockSize,
    snapshot,
  });
  return snapshot;
};
