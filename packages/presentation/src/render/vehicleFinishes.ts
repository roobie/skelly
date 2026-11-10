import type { Sky } from '@skelly/engine/sky';
import { type MaterialDef, surfaceOf } from '@skelly/thing-core/materials';
import { type Material, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type Object3D, ShaderChunk } from 'three';
import { physicalCopy } from './modelMaterials.ts';
import type { ReflectionMap } from './skyReflection.ts';

type Coat = NonNullable<ReturnType<typeof surfaceOf>['clearcoat']>;

const DIFFUSE_IBL = 'iblIrradiance += getIBLIrradiance( geometryNormal );';
if (!ShaderChunk.lights_fragment_maps.includes(DIFFUSE_IBL)) {
  throw new Error('three.js changed lights_fragment_maps: vehicle finishes can no longer drop its diffuse term');
}
/** The hemisphere light stays the only ambient on a finish, so a reflection adds gloss without brightening the paint. */
const SPECULAR_ONLY_MAPS = ShaderChunk.lights_fragment_maps.replace(DIFFUSE_IBL, '');

const specularOnly: Material['onBeforeCompile'] = (shader) => {
  shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', SPECULAR_ONLY_MAPS);
};

/** The one recipe for a finished material, so warm-up stand-ins compile the very programs the vehicles draw with. */
const finished = (loaded: MeshStandardMaterial, coat: Coat | undefined, reflection: ReflectionMap) => {
  const material = coat && !(loaded instanceof MeshPhysicalMaterial) ? physicalCopy(loaded) : loaded.clone();
  if (coat && material instanceof MeshPhysicalMaterial) {
    material.clearcoat = coat.amount;
    material.clearcoatRoughness = coat.roughness;
    material.metalness = coat.metallic;
  }
  material.envMap = reflection.texture;
  material.onBeforeCompile = specularOnly;
  material.customProgramCacheKey = () => 'vehicle-finish';
  return material;
};

/** Any coat compiles the same program; its amounts are uniforms. */
const STAND_IN_COAT: Coat = { amount: 1, roughness: 1, metallic: 0 };

/**
 * Swaps a vehicle's materials for finished copies while the graphics option is on. Models share their materials with
 * every other view of them, and off must draw exactly the shared originals, so the originals are never touched.
 */
export class VehicleFinishes {
  private readonly reflection: ReflectionMap;
  private readonly table: Readonly<Record<string, MaterialDef>>;
  private readonly copies = new WeakMap<Material, Material>();
  private on = false;

  constructor(reflection: ReflectionMap, table: Readonly<Record<string, MaterialDef>>) {
    this.reflection = reflection;
    this.table = table;
  }

  get enabled(): boolean {
    return this.on;
  }

  setEnabled(value: boolean): void {
    this.on = value;
  }

  update(sky: Sky): void {
    if (this.on) {
      this.reflection.update(sky);
    }
  }

  dress(model: Object3D): void {
    if (!this.on) {
      return;
    }
    model.traverse((object) => {
      if (object instanceof Mesh) {
        object.material = Array.isArray(object.material)
          ? object.material.map((material) => this.copyOf(material))
          : this.copyOf(object.material);
      }
    });
  }

  /** The finished programs a loaded material of this kind can take, for the scene's warm-up. */
  warmUpVariants = (plain: MeshStandardMaterial): Material[] => [
    finished(plain, undefined, this.reflection),
    ...(plain instanceof MeshPhysicalMaterial ? [] : [finished(plain, STAND_IN_COAT, this.reflection)]),
  ];

  private copyOf(material: Material): Material {
    if (!(material instanceof MeshStandardMaterial)) {
      return material;
    }
    let copy = this.copies.get(material);
    if (copy === undefined) {
      copy = finished(material, this.coatOf(material), this.reflection);
      this.copies.set(material, copy);
    }
    return copy;
  }

  private coatOf(material: Material): Coat | undefined {
    const definition = this.table[material.userData.materialId as string];
    return definition && surfaceOf(definition.finish).clearcoat;
  }
}
