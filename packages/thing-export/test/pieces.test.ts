import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Domain } from '@skelly/engine/assembly/schema.ts';
import type { Solid } from '@skelly/engine/shapes/solid.ts';
import { expect, it } from 'vitest';
import { exportGlb } from '../src/glb.ts';

interface GlbJson {
  readonly meshes: readonly { readonly primitives: readonly { readonly extras?: { readonly piece?: string } }[] }[];
}

const glbJson = (bytes: Uint8Array): GlbJson => {
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
};

it.each([
  ['smooth', undefined],
  ['voxel', 0.1],
])('keeps each piece its own primitive inside one same-finish merge group (%s export)', (_mode, voxelGrain) => {
  const solids: Solid[] = ['fixed', 'detachable'].map((piece, i) => ({
    id: piece,
    kind: 'box',
    box: { center: [i, 0, 0], half: [0.5, 0.5, 0.5] },
    display: { mergeGroup: 'shared', piece },
  }));
  const domain: Domain = {
    name: 'fixture',
    units: { metresPerUnit: 1, grid: 1, bevel: 0 },
    axisRules: [],
    families: {
      shape: {
        name: 'shape',
        params: {},
        build: () => ({ family: 'shape', solids, ports: [], keepOuts: [], axes: [] }),
      },
    },
  };
  const resolved = resolve(
    { name: 'fixture', root: 'body', parts: { body: { family: 'shape' } }, connections: [] },
    domain,
  );
  const result = exportGlb({
    resolved,
    ...(voxelGrain === undefined ? {} : { voxelGrain }),
    asset: { id: 'fixture', file: 'assets/models/fixture.glb' },
    palette: {
      familyColors: {},
      specialColors: {},
      fallbackColor: [0.5, 0.5, 0.5],
      fallbackFinish: { metallic: 0, roughness: 0.5 },
    },
  });
  if (!result.ok) {
    throw new Error(JSON.stringify(result.error));
  }
  const pieces = glbJson(result.glb).meshes.flatMap((mesh) => mesh.primitives.map((p) => p.extras?.piece));
  expect(pieces.toSorted()).toEqual(['detachable', 'fixed']);
});
