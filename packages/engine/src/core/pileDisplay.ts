import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { Inventory, Pile } from './inventory.ts';
import type { Item } from './items.ts';
import { type PileLayout, pileBundleHeight, pileLayout } from './pileLayout.ts';
import { type PileScatterPlacement, pileScatterPlacements } from './scatterPile.ts';
import { PILE_DISPLAY_KIND } from './schema.ts';

export interface EffectivePileDisplay {
  readonly visiblePile: Pile;
  readonly layout: PileLayout;
  readonly scatter: readonly PileScatterPlacement[];
  readonly bundlePosition: Vec3 | undefined;
  readonly bundleHeight: number | undefined;
}

export interface EffectivePileDisplayOptions {
  readonly registry: Registry;
  readonly pile: Pile;
  readonly blockSize: number;
  readonly worldSeed: number;
  readonly hasModel?: (id: string) => boolean;
  readonly hiddenItemUids?: ReadonlySet<number>;
}

/** One current, read-only projection for pile meshes and active throw endpoints. */
export const effectivePileDisplay = ({
  registry,
  pile,
  blockSize,
  worldSeed,
  hasModel = () => true,
  hiddenItemUids = new Set(),
}: EffectivePileDisplayOptions): EffectivePileDisplay => {
  const visiblePile = {
    ...pile,
    items: pile.items.filter(({ item }) => !hiddenItemUids.has(item.uid)),
  };
  const regularPile = {
    ...visiblePile,
    items: visiblePile.items.filter(
      ({ item }) => registry.items.get(item.type)?.pileDisplay !== PILE_DISPLAY_KIND.scatter,
    ),
  };
  const layout = pileLayout(registry, regularPile, blockSize, hasModel);
  const scatter = pileScatterPlacements({ registry, pile: visiblePile, worldSeed, blockSize });
  const bundleHeight = layout.bundle.length === 0 ? undefined : pileBundleHeight(registry, layout.bundle);
  const bundlePosition =
    bundleHeight === undefined
      ? undefined
      : ([
          (pile.pos[0] + 0.5) * blockSize,
          pile.pos[1] * blockSize + bundleHeight / 2,
          (pile.pos[2] + 0.5) * blockSize,
        ] as Vec3);
  return { visiblePile, layout, scatter, bundlePosition, bundleHeight };
};

/** Position where the current effective pile projection represents an item UID. */
export const effectivePileItemPosition = (projection: EffectivePileDisplay, item: Item): Vec3 | undefined => {
  const model = projection.layout.models.find(({ placed }) => placed.item.uid === item.uid);
  if (model) {
    return model.at;
  }
  const scatter = projection.scatter.find(({ item: placed }) => placed.uid === item.uid);
  if (scatter) {
    return scatter.position;
  }
  return projection.layout.bundle.some(({ item: placed }) => placed.uid === item.uid)
    ? projection.bundlePosition
    : undefined;
};

export const effectivePileDisplays = (
  inventory: Pick<Inventory, 'registry' | 'piles'>,
  options: Omit<EffectivePileDisplayOptions, 'registry' | 'pile'>,
): Map<string, EffectivePileDisplay> =>
  new Map(
    [...inventory.piles.values()].map((pile) => [
      pile.pos.join(','),
      effectivePileDisplay({ registry: inventory.registry, pile, ...options }),
    ]),
  );
