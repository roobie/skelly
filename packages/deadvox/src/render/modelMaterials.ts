import { type MaterialDef, MaterialReferenceSchema } from '@skelly/thing-core/materials';
import {
  BufferGeometry,
  DataTexture,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  Group,
  InstancedMesh,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  SRGBColorSpace,
} from 'three';
import { parse } from 'valibot';
import { glowingCopy } from './itemEmissive.ts';

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
  const opacity = definition.finish.opacity ?? 1;
  material.opacity = opacity;
  material.transparent = opacity < 1;
  // A see-through surface must not hide what lies behind it from later draws.
  material.depthWrite = opacity >= 1;
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

/**
 * Hidden meshes holding one material for each shader program variant an exported model's material
 * takes, so the scene's warm-up compiles them before any model has loaded. A model material varies the
 * program only by see-through, double-sidedness and a colour texture (colour, finish and texels are
 * uniforms), and a lit item's glow adds its own. `instanced` adds the instanced copies ground piles draw
 * with. Content outside these variants compiles on first draw, which `test/modelMaterials.test.ts`
 * checks the pack against.
 */
export const modelMaterialWarmUp = (instanced: boolean): Group => {
  const texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const variants = [false, true].flatMap((transparent) =>
    [FrontSide, DoubleSide].flatMap((side) =>
      [null, texture].map((map) => new MeshStandardMaterial({ transparent, side, map })),
    ),
  );
  // Exported models carry positions and normals, and three.js keys a program on both.
  const geometry = new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute([], 3))
    .setAttribute('normal', new Float32BufferAttribute([], 3));
  const group = new Group();
  for (const material of variants.flatMap((plain) => [plain, glowingCopy(plain, 0xff_ff_ff, 1)])) {
    for (const mesh of instanced
      ? [new Mesh(geometry, material), new InstancedMesh(geometry, material, 1)]
      : [new Mesh(geometry, material)]) {
      mesh.receiveShadow = true;
      mesh.visible = false;
      group.add(mesh);
    }
  }
  return group;
};
