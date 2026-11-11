import type { Sky } from '@skelly/engine/sky';
import { type MaterialDef, surfaceOf } from '@skelly/thing-core/materials';
import { type Material, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type Object3D, ShaderChunk } from 'three';
import { physicalCopy } from './modelMaterials.ts';
import type { ReflectionMap } from './skyReflection.ts';

type Coat = NonNullable<ReturnType<typeof surfaceOf>['clearcoat']>;

const without = (chunk: string, term: string, replacement = ''): string => {
  if (!chunk.includes(term)) {
    throw new Error(`three.js changed a shader chunk: vehicle finishes can no longer find ${term}`);
  }
  return chunk.replace(term, replacement);
};

/**
 * Only the coat samples the reflection. The hemisphere light stays the only ambient on a finish, and the layer under
 * the coat keeps to direct light, because its broad rough lobe spreads the map over the panel as a pale film.
 */
const COAT_ONLY_MAPS = without(
  without(ShaderChunk.lights_fragment_maps, 'iblIrradiance += getIBLIrradiance( geometryNormal );'),
  'radiance += iblRadiance;',
);

/** A flat panel has no shape to break up what it mirrors, so at a grazing angle a full Fresnel swaps the paint for the sky. */
const coatGrazing = (limit: number): string =>
  without(
    ShaderChunk.lights_physical_fragment,
    'material.clearcoatF90 = 1.0;',
    `material.clearcoatF90 = ${limit.toFixed(4)};`,
  );

/** The one recipe for a finished material, so warm-up stand-ins compile the very programs the vehicles draw with. */
const finished = (loaded: MeshStandardMaterial, coat: Coat, reflection: ReflectionMap, grazingLimit: number) => {
  const material = loaded instanceof MeshPhysicalMaterial ? loaded.clone() : physicalCopy(loaded);
  material.clearcoat = coat.amount;
  material.clearcoatRoughness = coat.roughness;
  material.metalness = coat.metallic;
  material.envMap = reflection.texture;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_fragment_maps>', COAT_ONLY_MAPS)
      .replace('#include <lights_physical_fragment>', coatGrazing(grazingLimit));
  };
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
  private readonly grazingLimit: number;
  private readonly copies = new WeakMap<Material, Material>();
  private on = false;

  constructor(reflection: ReflectionMap, table: Readonly<Record<string, MaterialDef>>, grazingLimit: number) {
    this.reflection = reflection;
    this.table = table;
    this.grazingLimit = grazingLimit;
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
    finished(plain, STAND_IN_COAT, this.reflection, this.grazingLimit),
  ];

  private copyOf(material: Material): Material {
    const coat = this.coatOf(material);
    if (!(coat && material instanceof MeshStandardMaterial)) {
      return material;
    }
    let copy = this.copies.get(material);
    if (copy === undefined) {
      copy = finished(material, coat, this.reflection, this.grazingLimit);
      this.copies.set(material, copy);
    }
    return copy;
  }

  private coatOf(material: Material): Coat | undefined {
    const definition = this.table[material.userData.materialId as string];
    return definition && surfaceOf(definition.finish).clearcoat;
  }
}
