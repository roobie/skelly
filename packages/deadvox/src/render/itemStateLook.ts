import { Color, type Material, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import type { ModelDef, Registry } from '../core/content.ts';
import { glowingCopy } from './itemEmissive.ts';
import type { ItemLook, ItemStateLook } from './itemLook.ts';

const owned = new WeakSet<Material>();
export const fittedStateGroup = (slot: string): string => `item-slot:${slot}`;

const tintFor = (material: Material, model: ModelDef, state: ItemStateLook, registry: Registry) => {
  const presentation = model.itemPresentation;
  if (!presentation) {
    return;
  }
  const index = material.userData.itemMaterialIndex as number;
  const classId = presentation.materials[index];
  const band = state.wear === undefined ? undefined : registry.itemWear.get(presentation.wear)?.bands[state.wear];
  const tint = classId === undefined ? undefined : band?.tints[classId];
  if (!tint) {
    throw new Error(`Missing item material class or wear tint in model ${model.id}`);
  }
  return tint;
};

const copyMaterial = (material: Material, model: ModelDef, state: ItemStateLook, registry: Registry): Material => {
  if (!(material instanceof MeshStandardMaterial)) {
    return material;
  }
  const tint = tintFor(material, model, state, registry);
  const glowing = state.on && state.supply !== 'absent' && material.name === model.emissiveMaterial;
  const glow = glowing ? state.glow : undefined;
  if (!(tint || glow)) {
    return material;
  }
  const copy = glow ? glowingCopy(material, glow.color, glow.intensity) : material.clone();
  if (tint) {
    copy.color.lerp(new Color(tint.color), tint.mix);
  }
  owned.add(copy);
  return copy;
};

const fillPiece = (part: Object3D, name: string): Object3D | undefined => {
  let found = part.getObjectByName(name);
  part.traverse((object) => {
    if (object.userData.itemNodeName === name) {
      found = object;
    }
  });
  return found;
};

const applyPart = (part: Object3D, model: ModelDef, state: ItemStateLook, registry: Registry): void => {
  const visit = (object: Object3D): void => {
    if (object !== part && object.name.startsWith('item-slot:')) {
      return;
    }
    if (object instanceof Mesh) {
      const copy = (material: Material) => copyMaterial(material, model, state, registry);
      object.material = Array.isArray(object.material) ? object.material.map(copy) : copy(object.material);
    }
    for (const child of object.children) {
      visit(child);
    }
  };
  visit(part);
  const supply = model.itemPresentation?.supply;
  if (supply?.kind === 'fill' && typeof state.supply === 'number') {
    const fill = fillPiece(part, supply.piece);
    const band = supply.bands[state.supply];
    if (fill && band) {
      fill.scale[supply.axis] *= band.scale;
      fill.visible = band.scale > 0;
    }
  }
};

/** Each part owns its copies: tinting a fitted light must not tint its parent or the model library. */
export const applyItemStateLook = (root: Object3D, look: ItemLook, registry: Registry): void => {
  const apply = (part: Object3D, modelId: string, state: ItemStateLook | undefined): void => {
    const model = registry.models.get(modelId);
    if (state && model) {
      applyPart(part, model, state, registry);
    }
  };
  apply(root, look.model, look.state);
  for (const slot of look.slots) {
    const part = root.getObjectByName(fittedStateGroup(slot.slot));
    if (part && slot.model) {
      apply(part, slot.model, slot.state);
    }
  }
};

/** Releases only state-owned copies, never shared library or flame materials. */
export const disposeItemStateMaterials = (root: Object3D): void => {
  root.traverse((object) => {
    if (object instanceof Mesh) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (owned.has(material)) {
          owned.delete(material);
          material.dispose();
        }
      }
    }
  });
};
