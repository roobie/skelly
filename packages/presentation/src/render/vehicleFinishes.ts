import type { Sky } from '@skelly/engine/sky';
import { type Material, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type Object3D, ShaderChunk } from 'three';
import { type MaterialPatches, materialPatch } from './materialPatches.ts';
import { type Coat, coatOf, physicalCopy } from './modelMaterials.ts';
import type { ReflectionMap } from './skyReflection.ts';

const LIGHT_MAPS_CHUNK = '#include <lights_fragment_maps>';
const PHYSICAL_CHUNK = '#include <lights_physical_fragment>';
const FULL_COAT_GRAZING = 'material.clearcoatF90 = 1.0;';

/** Marks a finished copy in its user data, which survives the clone the sky anchoring makes of every vehicle material. */
const FINISHED = 'vehicleFinish';

const ensured = (source: string, term: string): string => {
  if (!source.includes(term)) {
    throw new Error(`three.js changed a shader chunk: vehicle finishes can no longer find ${term}`);
  }
  return source;
};

/** A flat panel has no shape to break up what it mirrors, so at a grazing angle a full Fresnel swaps the paint for the sky. */
const coatGrazing = (limit: number): string =>
  ensured(ShaderChunk.lights_physical_fragment, FULL_COAT_GRAZING).replace(
    FULL_COAT_GRAZING,
    `material.clearcoatF90 = ${limit.toFixed(4)};`,
  );

/**
 * Only the coat samples the reflection. The hemisphere light stays the only ambient on a finish, and the layer under
 * the coat keeps to direct light, because its broad rough lobe spreads the map over the panel as a pale film. The
 * light maps chunk stays in place for the other patches that read it, and what it added under the coat is dropped
 * after it.
 */
const coatOnly = (grazingLimit: number) =>
  materialPatch({
    applies: (material) => material.userData[FINISHED] === true,
    compile: (shader) => {
      shader.fragmentShader = ensured(ensured(shader.fragmentShader, LIGHT_MAPS_CHUNK), PHYSICAL_CHUNK)
        .replace(LIGHT_MAPS_CHUNK, `${LIGHT_MAPS_CHUNK}\niblIrradiance = vec3( 0.0 );\nradiance = vec3( 0.0 );`)
        .replace(PHYSICAL_CHUNK, coatGrazing(grazingLimit));
    },
    key: () => 'vehicle-finish',
  });

/** The one recipe for a finished material, so warm-up stand-ins compile the very programs the vehicles draw with. */
const finished = (loaded: MeshStandardMaterial, coat: Coat, reflection: ReflectionMap) => {
  const material = loaded instanceof MeshPhysicalMaterial ? loaded.clone() : physicalCopy(loaded);
  material.userData = { ...loaded.userData, [FINISHED]: true };
  material.clearcoat = coat.amount;
  material.clearcoatRoughness = coat.roughness;
  material.metalness = coat.metallic;
  material.envMap = reflection.texture;
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
  private readonly copies = new WeakMap<Material, Material>();
  private on = false;

  constructor(reflection: ReflectionMap, grazingLimit: number, patches: MaterialPatches) {
    this.reflection = reflection;
    patches.add(coatOnly(grazingLimit));
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
  warmUpVariants = (plain: MeshStandardMaterial): Material[] => [finished(plain, STAND_IN_COAT, this.reflection)];

  private copyOf(material: Material): Material {
    const coat = coatOf(material);
    if (!(coat && material instanceof MeshStandardMaterial)) {
      return material;
    }
    let copy = this.copies.get(material);
    if (copy === undefined) {
      copy = finished(material, coat, this.reflection);
      this.copies.set(material, copy);
    }
    return copy;
  }
}
