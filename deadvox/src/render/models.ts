// Item models (DESIGN.md, "Item models"): glTF binaries in the base pack, loaded once
// with three.js's GLTFLoader. Each is prepared twice: lying on the ground, centred
// over the origin, for piles; and held at its grip, pointing forward, for the hands.
// Until a model has loaded, or if it can't, its items show as if they had none.

import { Box3, Group, MathUtils, type Object3D, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ModelDef, Registry } from '../core/content.ts';

/** The base pack's model files, by their path within the pack. */
const PACK_FILES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>('../content/base/assets/**/*.glb', { eager: true, query: '?url', import: 'default' }),
  ).map(([path, url]) => [path.replace('../content/base/', ''), url]),
);

interface Prepared {
  ground: Object3D;
  held: Object3D;
}

/** Wraps a copy of the model so the wrapper's origin is at `origin` in the model's metres. */
const around = (scene: Object3D, origin: Vector3): Group => {
  const copy = scene.clone();
  const offset = new Group();
  offset.position.copy(origin).negate();
  offset.add(copy);
  return new Group().add(offset);
};

/** Both forms of a loaded model. */
export const prepareModel = (def: ModelDef, scene: Object3D): Prepared => {
  const box = new Box3().setFromObject(scene);
  const centre = box.getCenter(new Vector3());
  // Lying: centred on x and z over the origin, resting on y = 0.
  const ground = around(scene, new Vector3(centre.x, box.min.y, centre.z));
  // Held: the grip at the origin, turned as the entry says, then the model's +x forward (−z).
  const turned = around(scene, def.grip ? new Vector3(...def.grip.at) : centre);
  const [tx, ty, tz] = def.grip?.turn ?? [0, 0, 0];
  turned.rotation.set(MathUtils.degToRad(tx), MathUtils.degToRad(ty), MathUtils.degToRad(tz), 'XYZ');
  const held = new Group().add(turned);
  held.rotation.y = Math.PI / 2;
  return { ground, held };
};

export class ModelLibrary {
  /** Goes up each time a model loads, so what's drawn can catch up. */
  version = 0;
  private readonly ready = new Map<string, Prepared>();

  /** `report` hears about models that can't be drawn; it's never called during construction. */
  constructor(
    registry: Registry,
    report: (message: string) => void,
    files: Readonly<Record<string, string>> = PACK_FILES,
  ) {
    const loader = new GLTFLoader();
    for (const def of registry.models.values()) {
      const url = files[def.file];
      if (url === undefined) {
        queueMicrotask(() => report(`model "${def.id}": no file "${def.file}" in the pack`));
        continue;
      }
      loader.load(
        url,
        (gltf) => {
          this.ready.set(def.id, prepareModel(def, gltf.scene));
          this.version += 1;
        },
        undefined,
        (error) => report(`model "${def.id}" didn't load: ${error instanceof Error ? error.message : String(error)}`),
      );
    }
  }

  has(id: string): boolean {
    return this.ready.has(id);
  }

  /** A copy lying on the ground: centred over its origin, resting on y = 0, its long side along x. */
  ground(id: string): Object3D | undefined {
    return this.ready.get(id)?.ground.clone();
  }

  /** A copy held at its grip: the grip at its origin, pointing along −z. */
  held(id: string): Object3D | undefined {
    return this.ready.get(id)?.held.clone();
  }
}
