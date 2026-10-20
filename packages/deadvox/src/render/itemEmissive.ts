import { type Material, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import type { ItemDef, ModelDef } from '../core/content.ts';
import type { Item } from '../core/items.ts';

const ownedMaterials = new WeakSet<Material>();

/** Adds the item's authored glow to its named model material without mutating ModelLibrary's shared copy. */
export const applyItemEmissive = (
  root: Object3D,
  item: Item,
  definition: ItemDef,
  model: ModelDef | undefined,
): void => {
  const { light } = definition;
  const color = light?.color;
  const intensity = light?.emissive;
  const name = model?.emissiveMaterial;
  if (!(item.on && color !== undefined && intensity !== undefined && name !== undefined)) {
    return;
  }
  root.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const lit = materials.map((material) => {
      if (material.name !== name || !(material instanceof MeshStandardMaterial)) {
        return material;
      }
      const glowing = material.clone();
      glowing.emissive.set(color);
      glowing.emissiveIntensity = intensity;
      glowing.toneMapped = false;
      ownedMaterials.add(glowing);
      return glowing;
    });
    if (lit.some((material, index) => material !== materials[index])) {
      object.material = Array.isArray(object.material) ? lit : lit[0]!;
    }
  });
};

/** Disposes only the per-item material copies created by applyItemEmissive. */
export const disposeItemEmissiveMaterials = (root: Object3D): void => {
  root.traverse((object) => {
    if (object instanceof Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (ownedMaterials.has(material)) {
          material.dispose();
        }
      }
    }
  });
};
