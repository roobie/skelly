// Piles on the ground, drawn as generic bundles until items have models
// (DESIGN.md, "Piles"). One low box per pile, taller the more it holds.

import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { type Inventory, PILE_GRID } from '../core/inventory.ts';
import { defOf } from '../core/items.ts';

export class PileMeshes {
  readonly group = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshLambertMaterial({ color: 0x5a_50_46 });
  private readonly blockSize: number;
  private drawn = -1;

  constructor(blockSize: number) {
    this.blockSize = blockSize;
  }

  /** Rebuilds the meshes when the inventory changed. */
  sync(inventory: Inventory): void {
    if (inventory.version === this.drawn) {
      return;
    }
    this.drawn = inventory.version;
    this.group.clear();
    const s = this.blockSize;
    const capacity = PILE_GRID.w * PILE_GRID.h;
    for (const pile of inventory.piles.values()) {
      const cells = pile.items.reduce((sum, p) => {
        const [w, h] = defOf(inventory.registry, p.item.type).size;
        return sum + w * h;
      }, 0);
      const height = 0.06 + 0.18 * Math.min(1, cells / capacity);
      const mesh = new Mesh(this.geometry, this.material);
      mesh.scale.set(s * 0.7, height, s * 0.7);
      mesh.position.set((pile.pos[0] + 0.5) * s, pile.pos[1] * s + height / 2, (pile.pos[2] + 0.5) * s);
      this.group.add(mesh);
    }
  }
}
