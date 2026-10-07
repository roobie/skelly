// One traversal/location contract for live inventory and saved item trees.
// References stay UIDs resolved by Inventory, never a second authoritative index.
import type { Vec3 } from './coords.ts';
import type { HandSide, InventoryState } from './inventory.ts';
import type { ItemFields, ItemState, PlacedItem } from './items.ts';
import type { WearSlot } from './schema.ts';

interface NodeShape<Node> extends ItemFields<Node> {
  readonly uid: number;
  readonly type: string;
}
interface PileShape<Node> {
  readonly pos: Vec3;
  readonly items: PlacedItem<Node>[];
}
interface EntityShape<Node> {
  readonly pockets?: PlacedItem<Node>[][];
}
export type TreeLocation<Node, Pile, Entity> =
  | { kind: 'hand'; side: HandSide }
  | { kind: 'worn'; slot: WearSlot }
  | { kind: 'work'; owner: Node }
  | { kind: 'slot'; owner: Node; slot: string }
  | { kind: 'pocket'; owner: Node; pocket: number; placed: PlacedItem<Node> }
  | { kind: 'pile'; pile: Pile; placed: PlacedItem<Node> }
  | { kind: 'furniture'; entity: Entity; pocket: number; placed: PlacedItem<Node> };

export interface TreeEntry<Node, Pile, Entity> {
  readonly item: Node;
  readonly location: TreeLocation<Node, Pile, Entity>;
  readonly path: string;
}

/** Lazy roots: lookup of a held light need not collect the world first. */
export function* itemRoots<Node, Pile extends PileShape<Node>, Entity extends EntityShape<Node>>(
  forest: {
    readonly hands: Partial<Record<HandSide, Node>>;
    readonly worn: Partial<Record<WearSlot, Node>>;
    readonly piles: Iterable<Pile>;
    readonly entities: Iterable<Entity>;
  },
  prefix = 'inventory',
): Generator<TreeEntry<Node, Pile, Entity>> {
  for (const [side, item] of Object.entries(forest.hands) as [HandSide, Node][]) {
    if (item) {
      yield { item, location: { kind: 'hand', side }, path: `${prefix}.hands.${side}` };
    }
  }
  for (const [slot, item] of Object.entries(forest.worn).filter(([, value]) => value !== undefined) as [
    WearSlot,
    Node,
  ][]) {
    yield { item, location: { kind: 'worn', slot }, path: `${prefix}.worn.${slot}` };
  }
  let pileIndex = 0;
  for (const pile of forest.piles) {
    for (const [index, placed] of pile.items.entries()) {
      yield {
        item: placed.item,
        location: { kind: 'pile', pile, placed },
        path: `${prefix}.piles[${pileIndex}].items[${index}].item`,
      };
    }
    pileIndex += 1;
  }
  let entityIndex = 0;
  for (const entity of forest.entities) {
    for (const [pocket, grid] of (entity.pockets ?? []).entries()) {
      for (const [index, placed] of grid.entries()) {
        yield {
          item: placed.item,
          location: { kind: 'furniture', entity, pocket, placed },
          path: `${prefix}.entities[${entityIndex}].pockets[${pocket}][${index}].item`,
        };
      }
    }
    entityIndex += 1;
  }
}

const slotChildren = <Node extends NodeShape<Node>, Pile, Entity>(
  root: TreeEntry<Node, Pile, Entity>,
): TreeEntry<Node, Pile, Entity>[] =>
  Object.entries(root.item.slots ?? {}).flatMap(([slot, item]) =>
    item ? [{ item, location: { kind: 'slot', owner: root.item, slot }, path: `${root.path}.slots.${slot}` }] : [],
  );

const workChildren = <Node extends NodeShape<Node>, Pile, Entity>(
  root: TreeEntry<Node, Pile, Entity>,
): TreeEntry<Node, Pile, Entity>[] =>
  (root.item.work?.components ?? []).map((item, index) => ({
    item,
    location: { kind: 'work', owner: root.item },
    path: `${root.path}.work.components[${index}]`,
  }));

const pocketChildren = <Node extends NodeShape<Node>, Pile, Entity>(
  root: TreeEntry<Node, Pile, Entity>,
): TreeEntry<Node, Pile, Entity>[] =>
  (root.item.pockets ?? []).flatMap((grid, pocket) =>
    grid.map((placed, index) => ({
      item: placed.item,
      location: { kind: 'pocket', owner: root.item, pocket, placed },
      path: `${root.path}.pockets[${pocket}][${index}].item`,
    })),
  );

/** Preorder, so validation sees a duplicate/cycle before following its children. */
export function* walkItemTree<Node extends NodeShape<Node>, Pile, Entity>(
  roots: Iterable<TreeEntry<Node, Pile, Entity>>,
): Generator<TreeEntry<Node, Pile, Entity>> {
  for (const root of roots) {
    yield root;
    yield* walkItemTree<Node, Pile, Entity>([...slotChildren(root), ...workChildren(root), ...pocketChildren(root)]);
  }
}

export const savedItemTree = (state: InventoryState, prefix = 'character.inventory') =>
  walkItemTree(
    itemRoots<ItemState, InventoryState['piles'][number], InventoryState['entities']['entities'][number]>(
      {
        hands: state.hands,
        worn: state.worn,
        piles: state.piles,
        entities: state.entities.entities,
      },
      prefix,
    ),
  );

/** Transient validation set, not a live UID registry. */
export const itemIds = (entries: Iterable<{ item: { uid: number }; path: string }>, nextUid: number): Set<number> => {
  const ids = new Set<number>();
  let maximum = 0;
  for (const { item, path } of entries) {
    if (!Number.isSafeInteger(item.uid) || item.uid < 1) {
      throw new Error(`Invalid item id ${item.uid} at ${path}`);
    }
    if (ids.has(item.uid)) {
      throw new Error(`Duplicate item id ${item.uid} at ${path}`);
    }
    ids.add(item.uid);
    maximum = Math.max(maximum, item.uid);
  }
  if (!Number.isSafeInteger(nextUid) || nextUid <= maximum) {
    throw new Error('Next item id does not exceed saved item ids');
  }
  return ids;
};
