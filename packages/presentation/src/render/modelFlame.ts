// Item flames (`packages/deadvox/DESIGN.md`, "Light") are small cones standing upright over their model's `flame`
// anchor. Terrain fires reuse that geometry for additive hot cores and tapered tongues.

import type { Registry } from '@skelly/engine/content';
import { defOf, type Item } from '@skelly/engine/inventory';
import {
  AdditiveBlending,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three';

export class ModelFlames {
  private readonly geometry = new ConeGeometry(1, 1, 6);
  private readonly materials = new Map<string, MeshBasicMaterial>();
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  private material(color: string, additive?: { readonly opacity: number }): MeshBasicMaterial {
    const key = `${color}:${additive?.opacity}`;
    const known = this.materials.get(key);
    if (known) {
      return known;
    }
    const material = additive
      ? new MeshBasicMaterial({
          color,
          toneMapped: false,
          transparent: true,
          opacity: additive.opacity,
          blending: AdditiveBlending,
          depthWrite: false,
        })
      : new MeshBasicMaterial({ color, toneMapped: false });
    this.materials.set(key, material);
    return material;
  }

  /** A unit flame in `color`, for the caller to size and place. */
  mesh(color: string): Mesh {
    const flame = new Mesh(this.geometry, this.material(color));
    flame.name = this.name;
    return flame;
  }

  /** A unit terrain flame with a hot core and tapered outer tongues. Its base sits at the origin, unlike `mesh()`. */
  terrainMesh(tipColor: string, coreColor: string, opacity: number): Group {
    const flame = new Group();
    flame.name = this.name;
    const additive = { opacity };
    const outer = this.material(tipColor, additive);
    const tongue = (x: number, z: number, scale: number, tilt: number): Mesh => {
      const mesh = new Mesh(this.geometry, outer);
      mesh.position.set(x, (scale / 2) * Math.cos(tilt) + scale * Math.abs(Math.sin(tilt)), z);
      mesh.scale.set(scale, scale, scale);
      mesh.rotation.z = tilt;
      return mesh;
    };
    flame.add(tongue(0, 0, 1, 0), tongue(-0.22, 0.08, 0.55, -0.28), tongue(0.2, -0.1, 0.48, 0.3));
    const core = new Mesh(this.geometry, this.material(coreColor, additive));
    core.position.y = 0.28;
    core.scale.set(0.42, 0.56, 0.42);
    flame.add(core);
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
