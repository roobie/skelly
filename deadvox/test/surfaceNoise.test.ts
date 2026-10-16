import { LinearFilter, RepeatWrapping, type WebGLProgramParametersWithUniforms, type WebGLRenderer } from 'three';
import { expect, it } from 'vitest';
import { ChunkMeshes } from '../src/render/chunks.ts';
import { startupContent } from './baseRegistry.ts';

it('selects cached noise only when enabled and reuses the lattice across shader recompiles', () => {
  const meshes = new ChunkMeshes(0.5, startupContent().registry);
  const { material } = meshes;
  const compile = () => {
    const shader = { uniforms: {}, vertexShader: '', fragmentShader: '' } as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    return shader.uniforms.uSurfaceNoise!;
  };
  const uniform = compile();
  expect(uniform.value).toBeNull();
  expect(material.defines?.DEADVOX_TEXTURE_NOISE).toBeUndefined();
  meshes.setCachedSurfaceNoise(true);
  const texture = uniform.value;
  expect(texture).not.toBeNull();
  expect(material.defines?.DEADVOX_TEXTURE_NOISE).toBe(1);
  expect(compile()).toBe(uniform);
  expect(texture.wrapS).toBe(RepeatWrapping);
  expect(texture.wrapT).toBe(RepeatWrapping);
  expect(texture.minFilter).toBe(LinearFilter);
  expect(texture.magFilter).toBe(LinearFilter);
  const samples = new Set(texture.image.data);
  expect(samples.size).toBeGreaterThan(1);
  const { version } = material;
  meshes.setCachedSurfaceNoise(true);
  expect(material.version).toBe(version);
  meshes.setCachedSurfaceNoise(false);
  expect(material.defines?.DEADVOX_TEXTURE_NOISE).toBeUndefined();
  meshes.setCachedSurfaceNoise(true);
  expect(compile().value).toBe(texture);
});
