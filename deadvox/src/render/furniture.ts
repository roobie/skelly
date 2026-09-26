// Block entities as simple shapes: furniture is a box in its colour, filling its
// cells; a door is a thin panel on a hinge at one end, swung inward when open. They
// share the sky's lights with everything else.

import { BoxGeometry, Group, Mesh, MeshLambertMaterial } from 'three';
import type { BlockEntities, BlockEntity } from '../core/blockEntities.ts';

/** Metres. */
const DOOR_THICKNESS = 0.06;
/** Boxes are a touch smaller than their cells so their faces don't fight with walls. */
const INSET = 0.02;

/** Turn about y that swings a door's panel inward, away from the way it faces. */
const OPEN_TURN = { n: -Math.PI / 2, s: Math.PI / 2, e: -Math.PI / 2, w: Math.PI / 2 } as const;

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
    const s = this.blockSize;
    const [x, y, z] = entity.pos;
    const [w, h, d] = entity.size;
    const alongX = entity.facing === 'n' || entity.facing === 's';
    const width = (alongX ? w : d) * s;
    const height = h * s;
    const pivot = new Group();
    const panel = new Mesh(this.geometry, material);
    if (alongX) {
      pivot.position.set(x * s, y * s, (z + d / 2) * s);
      panel.scale.set(width, height, DOOR_THICKNESS);
      panel.position.set(width / 2, height / 2, 0);
    } else {
      pivot.position.set((x + w / 2) * s, y * s, z * s);
      panel.scale.set(DOOR_THICKNESS, height, width);
      panel.position.set(0, height / 2, width / 2);
    }
    pivot.rotation.y = entity.open ? OPEN_TURN[entity.facing] : 0;
    pivot.add(panel);
    return pivot;
  }
}
