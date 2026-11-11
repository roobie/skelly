import type { Material, Mesh, Object3D } from 'three';

type CompileHook = Material['onBeforeCompile'];

export interface MaterialPatch {
  install: (material: Material) => void;
}

/**
 * A change to how materials compile. It wraps a material's own compile hook and program cache key once, so patches from
 * different owners stack, and recompiles the material under the new key.
 */
export const materialPatch = (change: {
  compile: (...args: Parameters<CompileHook>) => void;
  /** Tells the patched program from the unpatched one in three's program cache. */
  key: () => string;
  /** Defaults to every material. */
  applies?: (material: Material) => boolean;
}): MaterialPatch => {
  const installed = new WeakSet<Material>();
  return {
    install(material) {
      if (installed.has(material) || change.applies?.(material) === false) {
        return;
      }
      installed.add(material);
      const compile = material.onBeforeCompile;
      const key = material.customProgramCacheKey;
      material.onBeforeCompile = (shader, renderer) => {
        compile.call(material, shader, renderer);
        change.compile(shader, renderer);
      };
      material.customProgramCacheKey = () => `${key.call(material)}:${change.key()}`;
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
