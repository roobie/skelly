import { Group, Mesh, MeshStandardMaterial, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { MaterialPatches, materialPatch } from '../src/render/materialPatches.ts';

const keyed = (name: string) => materialPatch({ compile: () => undefined, key: () => name });

describe('material patches', () => {
  it('give a material one program key whichever patch installs first, so no program is built twice', () => {
    const first = keyed('first');
    const second = keyed('second');
    const key = (order: MaterialPatches) => {
      const material = new MeshStandardMaterial();
      const scene = new Scene().add(new Mesh(undefined, material));
      order.apply(scene);
      return material.customProgramCacheKey();
    };
    const forwards = new MaterialPatches();
    forwards.add(first);
    forwards.add(second);
    const backwards = new MaterialPatches();
    backwards.add(second);
    backwards.add(first);
    expect(key(backwards)).toBe(key(forwards));
  });

  it('keep materials with different own compile hooks and no own key on different programs', () => {
    const patches = new MaterialPatches();
    patches.add(keyed('patch'));
    const keyOf = (hook: () => void) => {
      const material = new MeshStandardMaterial();
      material.onBeforeCompile = hook;
      patches.apply(new Scene().add(new Mesh(undefined, material)));
      return material.customProgramCacheKey();
    };
    expect(keyOf(() => undefined)).not.toBe(keyOf(() => 'other'));
  });

  it('install once however many walks reach a material', () => {
    let compiles = 0;
    const counted = materialPatch({
      compile: () => {
        compiles += 1;
      },
      key: () => 'counted',
    });
    const patches = new MaterialPatches();
    patches.add(counted);
    const material = new MeshStandardMaterial();
    const scene = new Scene().add(new Mesh(undefined, material));
    patches.apply(scene);
    patches.apply(scene);
    material.onBeforeCompile({} as never, {} as never);
    expect(compiles).toBe(1);
  });

  it('reach what joins a watched scene, swapped materials and later patches, but not what left it', () => {
    const patches = new MaterialPatches();
    patches.add(keyed('first'));
    const scene = new Scene();
    patches.watch(scene);
    const keys = (material: MeshStandardMaterial) => material.customProgramCacheKey().split(':').slice(1);
    const nested = new Mesh(undefined, new MeshStandardMaterial());
    scene.add(new Group().add(new Group().add(nested)));
    patches.refresh();
    expect(keys(nested.material)).toEqual(['first']);
    const swapped = new MeshStandardMaterial();
    nested.material = swapped;
    patches.add(keyed('second'));
    patches.refresh();
    expect(keys(swapped)).toEqual(['first', 'second']);
    nested.removeFromParent();
    const after = new MeshStandardMaterial();
    nested.material = after;
    patches.refresh();
    expect(keys(after)).toEqual([]);
  });
});
