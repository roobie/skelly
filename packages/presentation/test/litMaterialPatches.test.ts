// biome-ignore-all lint/style/useNamingConvention: three.js shader library keys retain their exact spelling.
import { type SkyFieldOwner, SkyFields } from '@skelly/engine/sky';
import type { LampReachCache } from '@skelly/engine/world';
import {
  type Material,
  Mesh,
  MeshLambertMaterial,
  MeshPhongMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Scene,
  ShaderLib,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { describe, expect, it } from 'vitest';
import { installFixtureReach } from '../src/render/fixtureReach.ts';
import { MaterialPatches } from '../src/render/materialPatches.ts';
import { reflectionOnly } from '../src/render/skyEnvironment.ts';
import { Skylight } from '../src/render/skylight.ts';

const LIT: readonly { material: () => Material; library: 'standard' | 'physical' | 'lambert' | 'phong' }[] = [
  { material: () => new MeshStandardMaterial(), library: 'standard' },
  { material: () => new MeshPhysicalMaterial(), library: 'physical' },
  { material: () => new MeshLambertMaterial(), library: 'lambert' },
  { material: () => new MeshPhongMaterial(), library: 'phong' },
];

/**
 * Runs a real lit material's compile hook on the source three hands it: the shader library entry with its `#include`s
 * still unresolved, so no WebGL context is needed. A patch whose hook three renamed either throws or leaves the source
 * as it was.
 */
const patched = (patches: MaterialPatches, { material, library }: (typeof LIT)[number]) => {
  const lit = material();
  patches.apply(new Scene().add(new Mesh(undefined, lit)));
  const { vertexShader, fragmentShader } = ShaderLib[library];
  const shader = { uniforms: {}, vertexShader, fragmentShader };
  lit.onBeforeCompile(shader as WebGLProgramParametersWithUniforms, undefined as never);
  return {
    vertex: shader.vertexShader !== vertexShader,
    fragment: shader.fragmentShader !== fragmentShader,
  };
};

describe('patches of three lit materials hook the shader source three ships', () => {
  it('the sky reflection rewrites every lit material that takes an environment', () => {
    const patches = new MaterialPatches();
    patches.add(reflectionOnly);
    for (const lit of LIT) {
      expect(patched(patches, lit).fragment, lit.library).toBe(true);
    }
  });

  it('the skylight receiver rewrites both shader stages of every lit material', () => {
    const patches = new MaterialPatches();
    const skylight = new Skylight(
      new SkyFields({} as SkyFieldOwner, { bottom: 0, top: 8 }),
      { itemLights: 1, blockSize: 1, viewRadiusM: 8, unbuiltCap: 1, skyJobsInFlight: 1, buildRadiusM: 8 },
      { submit: () => false, patches },
    );
    for (const lit of LIT) {
      expect(patched(patches, lit), lit.library).toEqual({ vertex: true, fragment: true });
    }
    skylight.dispose();
  });

  it('the fixture reach rewrites the point light loop of every lit material', () => {
    const patches = new MaterialPatches();
    installFixtureReach(patches, {} as LampReachCache, {
      slots: 2,
      itemSlots: 1,
      blockSize: 1,
      tuning: { cellBlocks: 1, rangeMetres: 4 },
    });
    for (const lit of LIT) {
      expect(patched(patches, lit).fragment, lit.library).toBe(true);
    }
  });
});
