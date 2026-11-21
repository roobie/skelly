import type { FurnitureDef } from '@skelly/engine/content';
import type { BlockEntity, Vec3 } from '@skelly/engine/world';
import { BoxGeometry, Group, type Material, Mesh, MeshLambertMaterial, type Object3D } from 'three';

/** The see-through result placement picking holds, from `graphics` tuning. */
export interface PlacementGhostTuning {
  validTint: string;
  refusedTint: string;
  opacity: number;
}

/** What the ghost stands this frame: the result model where the recipe builds one, else boxes where it lands. */
export interface PlacementGhostDraw {
  /** The recipe's entity result, stood at its destination; the same builder the carried piece draws with. */
  entity?: { spec: BlockEntity; def: FurnitureDef };
  /** Where the ghost stands, in view metres: a block result's cell, or a boarding's boards on their leaf. */
  boxes: readonly { center: Vec3; size: Vec3 }[];
  /** Whether the engine admits the destination; the tint says which (`CraftCommands.previewPlacement`). */
  valid: boolean;
}

/**
 * The result a placement recipe would build, held see-through at its aimed spot like the carried piece's ghost
 * (`packages/deadvox/docs/crafting-layout.md`, "Rulings the layout preserves"): its own model where the recipe
 * builds an entity, boxes where it does not, tinted by whether the spot admits it.
 */
export class PlacementGhost {
  readonly group = new Group();
  private readonly build: (spec: BlockEntity, def: FurnitureDef) => Object3D;
  private readonly materials: ReadonlyMap<boolean, MeshLambertMaterial>;
  private readonly boxGeometry = new BoxGeometry(1, 1, 1);
  private drawn = '';

  constructor(build: (spec: BlockEntity, def: FurnitureDef) => Object3D, tuning: PlacementGhostTuning) {
    this.group.name = 'placement-ghost';
    this.group.visible = false;
    this.build = build;
    this.materials = new Map(
      [true, false].map((valid) => [
        valid,
        new MeshLambertMaterial({
          color: valid ? tuning.validTint : tuning.refusedTint,
          transparent: true,
          opacity: tuning.opacity,
          depthWrite: false,
        }),
      ]),
    );
  }

  /** Stands the drawn result, rebuilding only when what it shows changed; nothing hides it. */
  update(draw: PlacementGhostDraw | undefined): void {
    const key = draw
      ? JSON.stringify([
          draw.valid,
          draw.entity?.spec.type,
          draw.entity?.spec.pos,
          draw.entity?.spec.facing,
          draw.entity?.spec.size,
          draw.entity?.spec.tip,
          draw.entity?.spec.boarding,
          draw.boxes,
        ])
      : '';
    if (key === this.drawn) {
      return;
    }
    this.drawn = key;
    this.group.clear();
    this.group.visible = draw !== undefined;
    if (!draw) {
      return;
    }
    const material = this.materials.get(draw.valid)!;
    if (draw.entity) {
      const built = this.build(draw.entity.spec, draw.entity.def);
      this.seeThrough(built, material);
      this.group.add(built);
    }
    for (const { center, size } of draw.boxes) {
      const box = new Mesh(this.boxGeometry, material);
      box.position.set(...center);
      box.scale.set(...size);
      this.group.add(box);
    }
  }

  /** Swaps a built result's borrowed materials for the tint, so the shared pieces never turn see-through. */
  private seeThrough(built: Object3D, material: Material): void {
    built.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.isMesh) {
        mesh.material = material;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
      }
    });
  }

  dispose(): void {
    this.group.clear();
    this.boxGeometry.dispose();
    for (const material of this.materials.values()) {
      material.dispose();
    }
  }
}
