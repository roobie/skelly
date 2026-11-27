import { Material, type Mesh, type Object3D } from 'three';
import { type SceneObjects, sceneObjectsOf } from './sceneObjects.ts';

type CompileHook = Material['onBeforeCompile'];

export interface MaterialPatch {
  install: (material: Material) => void;
}

/**
 * Replaces the first match of a hook in three's shader source and throws when it is absent, so a three upgrade that
 * renames a hooked chunk fails loudly instead of leaving the material quietly unpatched.
 */
export const replaceHook = (source: string, hook: string | RegExp, replacement: string): string => {
  if (typeof hook === 'string' ? !source.includes(hook) : !hook.test(source)) {
    throw new Error(`three no longer has ${String(hook)}; a material patch cannot hook it`);
  }
  return source.replace(hook, replacement);
};

interface Change {
  compile: (...args: [...Parameters<CompileHook>, material: Material]) => void;
  /** Tells the patched program from the unpatched one in three's program cache. */
  key: (material: Material) => string;
  /** Defaults to every material. */
  applies?: (material: Material) => boolean;
}

interface Ordered {
  order: number;
  change: Change;
}

const patched = new WeakMap<Material, Ordered[]>();
let created = 0;

/**
 * A change to how materials compile. It stacks on the material's own compile hook and program cache key and recompiles
 * the material under the new key. Changes apply in the order they were created, whichever installs first, so a
 * material gets one program however its scenes were walked.
 */
export const materialPatch = (change: Change): MaterialPatch => {
  created += 1;
  const order = created;
  return {
    install(material) {
      let changes = patched.get(material);
      if (change.applies?.(material) === false || changes?.some((entry) => entry.change === change)) {
        return;
      }
      if (!changes) {
        const stacked: Ordered[] = [];
        changes = stacked;
        patched.set(material, stacked);
        const compile = material.onBeforeCompile;
        // Three's default key is the hook's source, and the hook is about to become one shared wrapper.
        const key =
          material.customProgramCacheKey === Material.prototype.customProgramCacheKey
            ? () => compile.toString()
            : material.customProgramCacheKey;
        material.onBeforeCompile = (shader, renderer) => {
          compile.call(material, shader, renderer);
          for (const entry of stacked) {
            entry.change.compile(shader, renderer, material);
          }
        };
        material.customProgramCacheKey = () =>
          [key.call(material), ...stacked.map((entry) => entry.change.key(material))].join(':');
      }
      changes.push({ order, change });
      changes.sort((a, b) => a.order - b.order);
      material.needsUpdate = true;
    },
  };
};

type Drawn = Material | readonly Material[];

const sameMaterials = (material: Drawn, seen: Drawn | undefined): boolean =>
  material === seen ||
  (Array.isArray(material) &&
    Array.isArray(seen) &&
    material.length === seen.length &&
    material.every((entry, index) => entry === seen[index]));

/**
 * Patches that apply together, so one walk of a scene installs them all. A watched scene installs them on an
 * object's materials when it joins and whenever it is given other materials, so a frame checks material identity
 * rather than walking the tree and installing. Whether a patch applies is judged at install, so a material's own
 * flags for it must be set before it is drawn.
 */
export class MaterialPatches {
  private readonly patches: MaterialPatch[] = [];
  private readonly watched: SceneObjects[] = [];
  private installed = new WeakMap<Object3D, Drawn>();

  add(patch: MaterialPatch): void {
    this.patches.push(patch);
    this.installed = new WeakMap();
  }

  apply(root: Object3D): void {
    root.traverse((object) => this.install(object));
  }

  watch(root: Object3D): void {
    this.watched.push(sceneObjectsOf(root));
  }

  /** Installs on watched objects that joined or changed materials since the last call; call before each render. */
  refresh(): void {
    for (const { objects } of this.watched) {
      for (const object of objects) {
        const { material } = object as Mesh;
        if (material && !sameMaterials(material, this.installed.get(object))) {
          this.install(object);
        }
      }
    }
  }

  private install(object: Object3D): void {
    const { material } = object as Mesh;
    if (!material) {
      return;
    }
    this.installed.set(object, Array.isArray(material) ? [...material] : material);
    for (const entry of [material].flat()) {
      for (const patch of this.patches) {
        patch.install(entry);
      }
    }
  }
}
