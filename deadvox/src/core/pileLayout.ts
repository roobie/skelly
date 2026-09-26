// Where the items in a pile lie (DESIGN.md, "Item models"). An item with a model lies
// at its place in the pile's grid, turned the way it is there; the rest make up the
// generic bundle. Pure, so the render only has to put models where this says.

import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { PILE_GRID, type Pile } from './inventory.ts';
import { defOf, footprint, type Placed } from './items.ts';

export interface PiledModel {
  placed: Placed;
  model: string;
  /** The middle of the item's cells on the floor, in metres. */
  at: Vec3;
  /** Radians about y: 0 lays the model's long side (its x) along the world's x, π/2 along z. */
  yaw: number;
}

export interface PileLayout {
  models: PiledModel[];
  /** Items without a model, or whose model isn't loaded. */
  bundle: Placed[];
}

/**
 * Lays out a pile on its block of floor. The grid's x runs along the world's x and
 * its y along the world's z. `hasModel` says whether a model can be drawn yet.
 */
export const pileLayout = (
  registry: Registry,
  pile: Pile,
  blockSize: number,
  hasModel: (id: string) => boolean = () => true,
): PileLayout => {
  const layout: PileLayout = { models: [], bundle: [] };
  const [bx, by, bz] = pile.pos;
  for (const placed of pile.items) {
    const def = defOf(registry, placed.item.type);
    if (def.model === undefined || !hasModel(def.model)) {
      layout.bundle.push(placed);
      continue;
    }
    const [w, h] = footprint(def, placed.rotated);
    // A model's long side is its x; the item's long side is its size's longer one.
    const alongX = def.size[0] >= def.size[1] !== placed.rotated;
    layout.models.push({
      placed,
      model: def.model,
      at: [
        (bx + (placed.x + w / 2) / PILE_GRID.w) * blockSize,
        by * blockSize,
        (bz + (placed.y + h / 2) / PILE_GRID.h) * blockSize,
      ],
      yaw: alongX ? 0 : Math.PI / 2,
    });
  }
  return layout;
};
