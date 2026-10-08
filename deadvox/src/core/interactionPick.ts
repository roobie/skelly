import type { BlockEntity } from './blockEntities.ts';
import type { Vec3 } from './coords.ts';
import { type FurniturePickOptions, pickFurnitureAndObstruction } from './furniturePick.ts';
import type { Inventory, Pile } from './inventory.ts';
import { PILE_GRID } from './inventory.ts';
import type { Item } from './items.ts';
import { footprint } from './items.ts';
import { PILE_BUNDLE_WIDTH, pileBundleHeight, pileLayout } from './pileLayout.ts';
import { pileScatterPlacements } from './scatterPile.ts';
import { PILE_DISPLAY_KIND } from './schema.ts';

export type InteractionTarget =
  | { readonly kind: 'furniture'; readonly entity: BlockEntity; readonly distanceBlocks: number }
  | { readonly kind: 'item'; readonly item: Item; readonly distanceBlocks: number };

interface ItemHit {
  readonly item: Item;
  readonly distanceBlocks: number;
}

interface RayBox {
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly low: Vec3;
  readonly high: Vec3;
  readonly maxDistance: number;
}

interface InteractionPickOptions extends FurniturePickOptions {
  readonly inventory: Pick<Inventory, 'registry' | 'piles'>;
  readonly worldSeed: number;
  readonly hasModel: (id: string) => boolean;
}

const rayBoxDistance = ({ origin, direction, low, high, maxDistance }: RayBox): number | undefined => {
  let near = 0;
  let far = maxDistance;
  for (let axis = 0; axis < 3; axis++) {
    const o = origin[axis]!;
    const d = direction[axis]!;
    if (Math.abs(d) < 1e-12) {
      if (o < low[axis]! || o > high[axis]!) {
        return undefined;
      }
      continue;
    }
    let a = (low[axis]! - o) / d;
    let b = (high[axis]! - o) / d;
    if (a > b) {
      [a, b] = [b, a];
    }
    near = Math.max(near, a);
    far = Math.min(far, b);
    if (near > far) {
      return undefined;
    }
  }
  return far >= 0 && near <= maxDistance ? near : undefined;
};

const nearerItem = (current: ItemHit | undefined, candidate: ItemHit | undefined): ItemHit | undefined => {
  if (!candidate) {
    return current;
  }
  if (
    !current ||
    candidate.distanceBlocks < current.distanceBlocks ||
    (candidate.distanceBlocks === current.distanceBlocks && candidate.item.uid < current.item.uid)
  ) {
    return candidate;
  }
  return current;
};

const modelHit = (options: {
  readonly inventory: Pick<Inventory, 'registry'>;
  readonly pile: Pile;
  readonly placed: Pile['items'][number];
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly maxDistance: number;
}): ItemHit | undefined => {
  const { inventory, pile, placed, origin, direction, maxDistance } = options;
  const def = inventory.registry.items.get(placed.item.type);
  if (!def) {
    return undefined;
  }
  const [w, h] = footprint(def, placed.rotated);
  const heightBlocks = Math.max(0.15, w / PILE_GRID.w, h / PILE_GRID.h);
  const distanceBlocks = rayBoxDistance({
    origin,
    direction,
    low: [pile.pos[0] + placed.x / PILE_GRID.w, pile.pos[1], pile.pos[2] + placed.y / PILE_GRID.h],
    high: [
      pile.pos[0] + (placed.x + w) / PILE_GRID.w,
      pile.pos[1] + heightBlocks,
      pile.pos[2] + (placed.y + h) / PILE_GRID.h,
    ],
    maxDistance,
  });
  return distanceBlocks === undefined ? undefined : { item: placed.item, distanceBlocks };
};

const bundleHit = (options: {
  readonly inventory: Pick<Inventory, 'registry'>;
  readonly pile: Pile;
  readonly bundle: Pile['items'];
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly maxDistance: number;
  readonly blockSize: number;
}): ItemHit | undefined => {
  const { inventory, pile, bundle, origin, direction, maxDistance, blockSize } = options;
  const heightBlocks = pileBundleHeight(inventory.registry, bundle) / blockSize;
  const halfWidth = PILE_BUNDLE_WIDTH / 2;
  const distanceBlocks = rayBoxDistance({
    origin,
    direction,
    low: [pile.pos[0] + 0.5 - halfWidth, pile.pos[1], pile.pos[2] + 0.5 - halfWidth],
    high: [pile.pos[0] + 0.5 + halfWidth, pile.pos[1] + heightBlocks, pile.pos[2] + 0.5 + halfWidth],
    maxDistance,
  });
  const item = [...bundle].sort((a, b) => a.item.uid - b.item.uid)[0]?.item;
  return distanceBlocks === undefined || !item ? undefined : { item, distanceBlocks };
};

const SCATTER_PICK_HALF_EXTENTS_METRES: Vec3 = [0.025, 0.006, 0.025];

const hitPile = (options: {
  readonly inventory: Pick<Inventory, 'registry'>;
  readonly pile: Pile;
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly maxDistance: number;
  readonly blockSize: number;
  readonly worldSeed: number;
  readonly hasModel: (id: string) => boolean;
}): ItemHit | undefined => {
  const { inventory, pile, origin, direction, maxDistance, blockSize, worldSeed, hasModel } = options;
  const regularPile = {
    ...pile,
    items: pile.items.filter(
      ({ item }) => inventory.registry.items.get(item.type)?.pileDisplay !== PILE_DISPLAY_KIND.scatter,
    ),
  };
  const layout = pileLayout(inventory.registry, regularPile, blockSize, hasModel);
  let nearest: ItemHit | undefined;
  for (const { placed } of layout.models) {
    nearest = nearerItem(nearest, modelHit({ inventory, pile, placed, origin, direction, maxDistance }));
  }
  nearest = nearerItem(
    nearest,
    bundleHit({ inventory, pile, bundle: layout.bundle, origin, direction, maxDistance, blockSize }),
  );
  for (const { item, position } of pileScatterPlacements({
    registry: inventory.registry,
    pile,
    worldSeed,
    blockSize,
  })) {
    const low = position.map(
      (coordinate, axis) => coordinate / blockSize - SCATTER_PICK_HALF_EXTENTS_METRES[axis]! / blockSize,
    ) as Vec3;
    const high = position.map(
      (coordinate, axis) => coordinate / blockSize + SCATTER_PICK_HALF_EXTENTS_METRES[axis]! / blockSize,
    ) as Vec3;
    const distanceBlocks = rayBoxDistance({ origin, direction, low, high, maxDistance });
    nearest = nearerItem(nearest, distanceBlocks === undefined ? undefined : { item, distanceBlocks });
  }
  return nearest;
};

const nearestGroundItem = (options: InteractionPickOptions, direction: Vec3): ItemHit | undefined => {
  let nearest: ItemHit | undefined;
  for (const pile of options.inventory.piles.values()) {
    nearest = nearerItem(
      nearest,
      hitPile({
        inventory: options.inventory,
        pile,
        origin: options.origin,
        direction,
        maxDistance: options.maxDistance,
        blockSize: options.blockSize,
        worldSeed: options.worldSeed,
        hasModel: options.hasModel,
      }),
    );
  }
  return nearest;
};

/** Picks the nearest target for F, using its furniture ray and reach for loose ground items too. */
export const pickInteractionTarget = (options: InteractionPickOptions): InteractionTarget | undefined => {
  const { furniture, obstructionDistanceBlocks } = pickFurnitureAndObstruction(options);
  const magnitude = Math.hypot(...options.direction);
  if (magnitude === 0 || options.maxDistance < 0 || options.blockSize <= 0) {
    return furniture && { kind: 'furniture', ...furniture };
  }
  const direction = options.direction.map((component) => component / magnitude) as Vec3;
  const item = nearestGroundItem(options, direction);
  if (
    item &&
    (obstructionDistanceBlocks === undefined || item.distanceBlocks <= obstructionDistanceBlocks) &&
    (!furniture || item.distanceBlocks < furniture.distanceBlocks)
  ) {
    return { kind: 'item', ...item };
  }
  return furniture && { kind: 'furniture', ...furniture };
};
