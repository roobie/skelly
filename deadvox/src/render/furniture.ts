// Block entities as simple shapes: furniture is a box in its colour, filling its
// cells; a door is a thin panel on a hinge at one end, swung inward when open. They
// share the sky's lights with everything else.

import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import { type BlockEntities, type BlockEntity, doorPanel } from '../core/blockEntities.ts';

/** Boxes are a touch smaller than their cells so their faces don't fight with walls. */
const INSET = 0.02;

export class FurnitureMeshes {
  readonly group = new Group();
  private readonly geometry = new BoxGeometry(1, 1, 1);
  private readonly materials = new Map<string, MeshLambertMaterial>();
  private readonly blockSize: number;
  private drawn = -1;

  constructor(blockSize: number) {
    this.blockSize = blockSize;
  }

  /** Rebuilds the meshes when furniture was added, opened or closed. */
  sync(entities: BlockEntities): void {
    if (entities.version === this.drawn) {
      return;
    }
    this.drawn = entities.version;
    this.group.clear();
    for (const entity of entities.all) {
      const def = entities.defOf(entity);
      const material = this.material(def.color);
      this.group.add(def.door ? this.door(entity, material) : this.box(entity, material));
    }
  }

  private material(color: string): MeshLambertMaterial {
    let material = this.materials.get(color);
    if (!material) {
      material = new MeshLambertMaterial({ color });
      this.materials.set(color, material);
    }
    return material;
  }

  private box(entity: BlockEntity, material: MeshLambertMaterial): Mesh {
    const s = this.blockSize;
    const [x, y, z] = entity.pos;
    const [w, h, d] = entity.size;
    const mesh = new Mesh(this.geometry, material);
    mesh.scale.set(w * s - INSET, h * s - INSET / 2, d * s - INSET);
    mesh.position.set((x + w / 2) * s, (y + h / 2) * s, (z + d / 2) * s);
    return mesh;
  }

  /** A panel across the doorway, hinged at its low end along the wall. */
  private door(entity: BlockEntity, material: MeshLambertMaterial): Group {
    const box = doorPanel(entity, this.blockSize);
    const pivot = new Group();
    const panel = new Mesh(this.geometry, material);
    pivot.position.set(...box.pivot);
    pivot.rotation.y = box.rotationY;
    panel.scale.set(...box.size);
    panel.position.set(...box.center);
    pivot.add(panel);
    return pivot;
  }
}
