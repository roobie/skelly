import type { Material, Mesh, Object3D } from 'three';

type CompileHook = Material['onBeforeCompile'];

export interface MaterialPatch {
  install: (material: Material) => void;
}

interface Change {
  compile: (...args: Parameters<CompileHook>) => void;
  /** Tells the patched program from the unpatched one in three's program cache. */
  key: () => string;
  /** Defaults to every material. */
  applies?: (material: Material) => boolean;
}

interface Patched {
  changes: { order: number; change: Change }[];
}

const patched = new WeakMap<Material, Patched>();
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
      let state = patched.get(material);
      if (change.applies?.(material) === false || state?.changes.some((entry) => entry.change === change)) {
        return;
      }
      if (!state) {
        state = { changes: [] };
        patched.set(material, state);
        const { changes } = state;
        const compile = material.onBeforeCompile;
        const key = material.customProgramCacheKey;
        material.onBeforeCompile = (shader, renderer) => {
          compile.call(material, shader, renderer);
          for (const entry of changes) {
            entry.change.compile(shader, renderer);
          }
        };
        material.customProgramCacheKey = () =>
          [key.call(material), ...changes.map((entry) => entry.change.key())].join(':');
      }
      state.changes.push({ order, change });
      state.changes.sort((a, b) => a.order - b.order);
      material.needsUpdate = true;
    },
  };
};

/** Patches that apply together, so one walk of a scene installs them all. */
export class MaterialPatches {
  private readonly patches: MaterialPatch[] = [];

  add(patch: MaterialPatch): void {
    this.patches.push(patch);
  }

  apply(root: Object3D): void {
    root.traverse((object) => {
      const { material } = object as Mesh;
      for (const entry of material ? [material].flat() : []) {
        for (const patch of this.patches) {
          patch.install(entry);
        }
      }
    });
  }
}
