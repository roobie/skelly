import { Mesh, MeshPhysicalMaterial, Scene, ShaderLib, UniformsUtils } from 'three';
import { expect, it } from 'vitest';
import { fabricGrain } from '../src/render/fabricGrain.ts';
import { MaterialPatches } from '../src/render/materialPatches.ts';

const compiled = (material: MeshPhysicalMaterial) => {
  const shader = {
    uniforms: UniformsUtils.clone(ShaderLib.physical.uniforms),
    vertexShader: ShaderLib.physical.vertexShader,
    fragmentShader: ShaderLib.physical.fragmentShader,
  };
  material.onBeforeCompile(shader as never, {} as never);
  return { shader, key: material.customProgramCacheKey() };
};

it('draws the grain an exported material declares in its fabric extras and leaves a material without one alone', () => {
  const fabric = { kind: 'twill', grain: 0.002, relief: 0.5, noise: 0.1, crease: 0.2, fold: 0.07 };
  const cloth = new MeshPhysicalMaterial({ sheen: 1 });
  cloth.userData = { fabric };
  const plastic = new MeshPhysicalMaterial({ sheen: 1 });
  const patches = new MaterialPatches();
  patches.add(fabricGrain);
  patches.apply(new Scene().add(new Mesh(undefined, cloth), new Mesh(undefined, plastic)));

  const woven = compiled(cloth);
  const plain = compiled(plastic);
  expect(woven.key).not.toBe(plain.key);
  expect(woven.shader.uniforms.fabricGrain?.value).toBe(fabric.grain);
  expect(woven.shader.fragmentShader).toContain('#define FABRIC_TWILL');
  expect(woven.shader.vertexShader).toContain('fabricPlane(normal, fabricU, fabricV);');

  expect(plain.key).toBe(new MeshPhysicalMaterial().customProgramCacheKey());
  expect(plain.shader.fragmentShader).toBe(ShaderLib.physical.fragmentShader);
  expect(plain.shader.uniforms).not.toHaveProperty('fabricGrain');
});
