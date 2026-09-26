// Piles on the ground (DESIGN.md, "Piles"). An item with a model lies at its place in
// the pile's grid (core/pileLayout.ts); everything else is one low bundle per pile,
// taller the more it holds.

import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { type Inventory, PILE_GRID } from '../core/inventory.ts';
import { defOf } from '../core/items.ts';
import { pileLayout } from '../core/pileLayout.ts';
import type { ModelLibrary } from './models.ts';

export class PileMeshes {
  readonly group = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly material = new MeshLambertMaterial({ color: 0x5a_50_46 });
  private readonly blockSize: number;
  private readonly models: ModelLibrary | undefined;
  private drawn = '';

  constructor(blockSize: number, models?: ModelLibrary) {
    this.blockSize = blockSize;
    this.models = models;
  }

  /** Rebuilds the meshes when the inventory changed or a model loaded. */
  sync(inventory: Inventory): void {
    const version = `${inventory.version}:${this.models?.version ?? 0}`;
    if (version === this.drawn) {
      return;
    }
    this.drawn = version;
    this.group.clear();
    const { blockSize: s, models } = this;
    const capacity = PILE_GRID.w * PILE_GRID.h;
    for (const pile of inventory.piles.values()) {
      const layout = pileLayout(inventory.registry, pile, s, (id) => models?.has(id) ?? false);
      for (const piled of layout.models) {
        const model = models?.ground(piled.model);
        if (model) {
          model.position.set(...piled.at);
          model.rotation.y = piled.yaw;
          this.group.add(model);
        }
      }
      if (layout.bundle.length === 0) {
        continue;
      }
      const cells = layout.bundle.reduce((sum, p) => {
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
