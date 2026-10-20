import { type MaterialDef, MaterialReferenceSchema } from '@skelly/thing-core/materials';
import { type Material, Mesh, MeshStandardMaterial, type Object3D, SRGBColorSpace } from 'three';
import { parse } from 'valibot';

const applyMaterial = (material: Material, table: Readonly<Record<string, MaterialDef>>): void => {
  if (!(Object.hasOwn(material.userData, 'materialId') || Object.hasOwn(material.userData, 'colourMultiplier'))) {
    return;
  }
  const { materialId, colourMultiplier } = parse(MaterialReferenceSchema, {
    materialId: material.userData.materialId,
    colourMultiplier: material.userData.colourMultiplier,
  });
  const definition = Object.hasOwn(table, materialId) ? table[materialId] : undefined;
  if (!(definition && material instanceof MeshStandardMaterial)) {
    throw new Error(`Unsupported model material ${materialId}`);
  }
  material.color.setRGB(
    definition.colour[0] * colourMultiplier[0],
    definition.colour[1] * colourMultiplier[1],
    definition.colour[2] * colourMultiplier[2],
    SRGBColorSpace,
  );
  material.metalness = definition.finish.metallic;
  material.roughness = definition.finish.roughness;
};

export const applyModelMaterials = (scene: Object3D, table: Readonly<Record<string, MaterialDef>>): void => {
  scene.traverse((object) => {
    if (object instanceof Mesh) {
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        applyMaterial(material, table);
      }
    }
  });
};
