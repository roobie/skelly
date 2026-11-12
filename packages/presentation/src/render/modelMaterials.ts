import { type MaterialDef, MaterialReferenceSchema, surfaceOf } from '@skelly/thing-core/materials';
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
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  SRGBColorSpace,
} from 'three';
import { parse } from 'valibot';
import { glowingCopy } from './itemEmissive.ts';
import { skyAnchoredCopy } from './skyAnchor.ts';
import { freezeMatrices } from './staticMatrices.ts';

/** Only the physical material draws a sheen, so a sheened definition swaps the loader's standard one for it. */
const sheenable = (material: MeshStandardMaterial): MeshPhysicalMaterial => {
  if (material instanceof MeshPhysicalMaterial) {
    return material;
  }
  const physical = new MeshPhysicalMaterial({
    name: material.name,
    map: material.map,
    side: material.side,
    vertexColors: material.vertexColors,
    flatShading: material.flatShading,
  });
  physical.userData = material.userData;
  return physical;
};

/** Draws a library entry on `loaded`, the one way an authored material and a painted copy both get their surface. */
const surfaced = (
  loaded: MeshStandardMaterial,
  definition: MaterialDef,
  colourMultiplier: readonly [number, number, number],
): MeshStandardMaterial => {
  const { opacity, transparent, depthWrite, sheen } = surfaceOf(definition.finish);
  const material = sheen ? sheenable(loaded) : loaded;
  if (sheen && material instanceof MeshPhysicalMaterial) {
    material.sheen = 1;
    material.sheenColor.setRGB(...sheen.colour, SRGBColorSpace);
    material.sheenRoughness = sheen.roughness;
  }
  material.color.setRGB(
    definition.colour[0] * colourMultiplier[0],
    definition.colour[1] * colourMultiplier[1],
    definition.colour[2] * colourMultiplier[2],
    SRGBColorSpace,
  );
  material.metalness = definition.finish.metallic;
  material.roughness = definition.finish.roughness;
  material.opacity = opacity;
  material.transparent = transparent;
  material.depthWrite = depthWrite;
  return material;
};

/**
 * A copy of `material` wearing a library entry whole. It starts from a plain standard copy, so an authored sheen
 * doesn't outlast a finish that has none.
 */
export const paintedCopy = (material: MeshStandardMaterial, definition: MaterialDef): MeshStandardMaterial =>
  surfaced(new MeshStandardMaterial().copy(material), definition, [1, 1, 1]);

const applyMaterial = (loaded: Material, table: Readonly<Record<string, MaterialDef>>): Material => {
  if (!(Object.hasOwn(loaded.userData, 'materialId') || Object.hasOwn(loaded.userData, 'colourMultiplier'))) {
    return loaded;
  }
  const { materialId, colourMultiplier } = parse(MaterialReferenceSchema, {
    materialId: loaded.userData.materialId,
    colourMultiplier: loaded.userData.colourMultiplier,
  });
  const definition = Object.hasOwn(table, materialId) ? table[materialId] : undefined;
  if (!(definition && loaded instanceof MeshStandardMaterial)) {
    throw new Error(`Unsupported model material ${materialId}`);
  }
  return surfaced(loaded, definition, colourMultiplier);
};

export const applyModelMaterials = (scene: Object3D, table: Readonly<Record<string, MaterialDef>>): void => {
  // Meshes that shared a loaded material keep sharing its prepared one.
  const prepared = new Map<Material, Material>();
  const prepare = (material: Material): Material => {
    let result = prepared.get(material);
    if (result === undefined) {
      result = applyMaterial(material, table);
      prepared.set(material, result);
    }
    return result;
  };
  scene.traverse((object) => {
    if (object instanceof Mesh) {
      object.material = Array.isArray(object.material) ? object.material.map(prepare) : prepare(object.material);
    }
  });
};

/**
 * Hidden meshes holding one material for each shader program variant an exported model's material
 * takes, so the scene's warm-up compiles them before any model has loaded. A model material varies the
 * program only by see-through, double-sidedness, a colour texture and a sheen (colour, finish and texels
 * are uniforms), and a lit item's glow adds its own. `instanced` adds the instanced copies ground piles
 * draw with, and `skyAnchored` the sky-anchored copies vehicles draw with. Content outside these variants compiles on first draw, which
 * `packages/deadvox/test/modelMaterials.test.ts` checks the pack against.
 */
export const modelMaterialWarmUp = ({
  instanced,
  skyAnchored,
}: {
  instanced: boolean;
  skyAnchored: boolean;
}): Group => {
  const texture = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  const variants = [false, true].flatMap((transparent) =>
    [FrontSide, DoubleSide].flatMap((side) => [
      ...[null, texture].map((map) => new MeshStandardMaterial({ transparent, side, map })),
      new MeshPhysicalMaterial({ transparent, side, sheen: 1 }),
    ]),
  );
  // Exported models carry positions and normals, and three.js keys a program on both.
  const geometry = new BufferGeometry()
    .setAttribute('position', new Float32BufferAttribute([], 3))
    .setAttribute('normal', new Float32BufferAttribute([], 3));
  const meshes = variants.flatMap((plain) =>
    [plain, glowingCopy(plain, 0xff_ff_ff, 1)].flatMap((material) =>
      instanced
        ? [new Mesh(geometry, material), new InstancedMesh(geometry, material, 1)]
        : [new Mesh(geometry, material)],
    ),
  );
  if (skyAnchored) {
    meshes.push(...variants.map((plain) => new Mesh(geometry, skyAnchoredCopy(plain))));
  }
  const group = new Group();
  for (const mesh of meshes) {
    mesh.receiveShadow = true;
    mesh.visible = false;
    group.add(mesh);
  }
  freezeMatrices(group);
  return group;
};
