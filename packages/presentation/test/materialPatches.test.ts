import { Mesh, MeshStandardMaterial, Scene } from 'three';
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
});
