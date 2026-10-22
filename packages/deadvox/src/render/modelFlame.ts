// A burning light's flame (`DESIGN.md`, "Light"): a small cone in the light's colour, standing upright
// over its model's `flame` anchor whether the light is held or set down.

import { ConeGeometry, Mesh, MeshBasicMaterial, type Object3D, Quaternion, Vector3 } from 'three';
import type { Registry } from '../core/content.ts';
import { defOf, type Item } from '../core/items.ts';

export class ModelFlames {
  private readonly geometry = new ConeGeometry(1, 1, 6);
  private readonly materials = new Map<string, MeshBasicMaterial>();
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  /** A unit flame in `color`, for the caller to size and place. */
  mesh(color: string): Mesh {
    const material = this.materials.get(color) ?? new MeshBasicMaterial({ color, toneMapped: false });
    this.materials.set(color, material);
    const flame = new Mesh(this.geometry, material);
    flame.name = this.name;
    return flame;
  }

  /**
   * Stands a lit item's flame on its model's `flame` anchor, sized by the light's `flame`. `frameOf` finds
   * the copy's group in the model file's frame, under `root`. Returns the anchor in world metres, or
   * undefined when the item shows no flame.
   */
  onModel(registry: Registry, item: Item, root: Object3D, frameOf: (root: Object3D) => Object3D): Vector3 | undefined {
    const def = defOf(registry, item.type);
    const anchor = def.model === undefined ? undefined : registry.models.get(def.model)?.anchors?.flame;
    const size = def.light?.flame;
    if (!(item.on && def.light?.burning?.ignition === 'firestarter' && anchor && size)) {
      return undefined;
    }
    // The root may be turned by a hold pose or a rest, so the flame is set upright in world space.
    root.updateMatrixWorld(true);
    const base = frameOf(root).localToWorld(new Vector3(...anchor));
    const flame = this.mesh(def.light.color);
    flame.scale.set(size.radiusMetres, size.heightMetres, size.radiusMetres);
    flame.position.copy(root.worldToLocal(base.clone().setY(base.y + size.heightMetres / 2)));
    flame.quaternion.copy(root.getWorldQuaternion(new Quaternion()).invert());
    root.add(flame);
    return base;
  }

  dispose(): void {
    for (const material of this.materials.values()) {
      material.dispose();
    }
    this.materials.clear();
    this.geometry.dispose();
  }
}
