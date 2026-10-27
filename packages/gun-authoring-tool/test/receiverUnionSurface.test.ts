import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { Vec3 } from '@skelly/engine/foundation/math.ts';
import type { TriangleMesh } from '@skelly/engine/shapes/shapeTypes.ts';
import { describe, expect, it } from 'vitest';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { METRES_PER_UNIT } from '../src/gun/exportFrame.ts';
import { exportGunGlb } from '../src/gun/exportGlb.ts';
import { expectWatertightMesh, loadFixture } from './helpers.ts';
import { readGlb } from './glbReader.ts';

const ROOT = join(import.meta.dirname, '..');
const cases = [
  { key: 'designs/archetype-ak.json', folder: 'designs', file: 'archetype-ak.json' },
  { key: 'fixtures/ak-standard-handguard.json', folder: 'fixtures', file: 'ak-standard-handguard.json' },
  { key: 'fixtures/broken-ak-gas-block.json', folder: 'fixtures', file: 'broken-ak-gas-block.json' },
  { key: 'fixtures/broken-ak-gas-cylinder.json', folder: 'fixtures', file: 'broken-ak-gas-cylinder.json' },
  { key: 'fixtures/broken-connection-contact.json', folder: 'fixtures', file: 'broken-connection-contact.json' },
] as const;

const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const magnitude = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

const vertices = (positions: readonly number[]): Vec3[] =>
  Array.from(
    { length: positions.length / 3 },
    (_, index) => [positions[index * 3]!, positions[index * 3 + 1]!, positions[index * 3 + 2]!] as Vec3,
  );

const surfaceTriangles = (positions: readonly number[], indices: readonly number[]): [Vec3, Vec3, Vec3][] => {
  const points = vertices(positions);
  return Array.from(
    { length: indices.length / 3 },
    (_, index) => [0, 1, 2].map((corner) => points[indices[index * 3 + corner]!]!) as [Vec3, Vec3, Vec3],
  );
};

const assemblyFor = (key: string, folder: string, file: string) => {
  if (folder !== 'designs') {
    return loadFixture(basename(file, '.json'));
  }
  const loaded = loadGunDesign(readFileSync(join(ROOT, key), 'utf8'));
  if (!loaded.ok) {
    throw new Error(`${key}: ${loaded.error.message}`);
  }
  return loaded.design.assembly;
};

describe('AK receiver export topology', () => {
  it.each(cases)('$key keeps the AK receiver export watertight', ({ key, folder, file }) => {
    const assembly = assemblyFor(key, folder, file);
    const id = basename(file, '.json').replaceAll('-', '_');
    const result = exportGunGlb(assembly, { id, file: `assets/models/${id}.glb` }, {});
    if (!result.ok) {
      throw new Error(`${key}: ${result.error.code}`);
    }
    const glb = readGlb(result.glb);
    const meshIndex = glb.json.nodes.find(({ name }) => name === 'receiver:ak-receiver')?.mesh;
    expect(meshIndex, `${key}: merged receiver mesh`).toBeDefined();
    const primitive = glb.json.meshes[meshIndex!]!.primitives[0]!;
    const currentPositions = glb.values(primitive.attributes.POSITION);
    const currentIndices = glb.values(primitive.indices);

    const mesh: TriangleMesh = {
      positions: Float32Array.from(currentPositions.map((position) => position / METRES_PER_UNIT)),
      normals: new Float32Array(currentPositions.length),
      indices: Uint32Array.from(currentIndices),
      triangleCount: currentIndices.length / 3,
    };
    expectWatertightMesh(mesh, key);
    const triangles = surfaceTriangles(currentPositions, currentIndices);
    const minimumArea = Math.min(...triangles.map(([a, b, c]) => magnitude(cross(subtract(b, a), subtract(c, a))) / 2));
    expect(minimumArea, `${key}: no zero/near-zero-area triangles`).toBeGreaterThan(1e-10);
  });
});
