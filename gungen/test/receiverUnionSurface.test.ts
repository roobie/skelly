import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/math.ts';
import type { TriangleMesh } from '../src/core/mesh.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { exportGunGlb } from '../src/gun/exportGlb.ts';
import { expectWatertightMesh, loadFixture } from './helpers.ts';

const ROOT = join(import.meta.dirname, '..');
const METRES_PER_UNIT = 0.0115;
const baseline = JSON.parse(
  readFileSync(join(ROOT, 'test/fixtures/receiver-ak-union-before-polyhedra.json'), 'utf8'),
) as { bounds: { max: number[] } };
const cases = [
  { key: 'designs/archetype-ak.json', folder: 'designs', file: 'archetype-ak.json' },
  { key: 'fixtures/ak-standard-handguard.json', folder: 'fixtures', file: 'ak-standard-handguard.json' },
  { key: 'fixtures/archetype-ak.json', folder: 'fixtures', file: 'archetype-ak.json' },
  { key: 'fixtures/broken-ak-gas-block.json', folder: 'fixtures', file: 'broken-ak-gas-block.json' },
  { key: 'fixtures/broken-ak-gas-cylinder.json', folder: 'fixtures', file: 'broken-ak-gas-cylinder.json' },
  { key: 'fixtures/broken-connection-contact.json', folder: 'fixtures', file: 'broken-connection-contact.json' },
] as const;

interface GlbJson {
  readonly nodes: readonly { readonly name?: string; readonly mesh?: number }[];
  readonly meshes: readonly {
    readonly primitives: readonly { readonly attributes: { readonly POSITION: number }; readonly indices: number }[];
  }[];
  readonly accessors: readonly {
    readonly bufferView: number;
    readonly byteOffset?: number;
    readonly count: number;
    readonly componentType: number;
    readonly type: string;
    readonly min?: number[];
    readonly max?: number[];
  }[];
  readonly bufferViews: readonly { readonly byteOffset?: number; readonly byteStride?: number }[];
}

const parseGlb = (bytes: Uint8Array): { json: GlbJson; binary: DataView } => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as GlbJson;
  const binStart = 28 + jsonLength;
  return { json, binary: new DataView(bytes.buffer, bytes.byteOffset + binStart, bytes.byteLength - binStart) };
};

const accessorValues = (glb: { json: GlbJson; binary: DataView }, index: number): number[] => {
  const accessor = glb.json.accessors[index]!;
  const view = glb.json.bufferViews[accessor.bufferView]!;
  const components = accessor.type === 'VEC3' ? 3 : 1;
  const componentBytes = accessor.componentType === 5126 || accessor.componentType === 5125 ? 4 : 2;
  const stride = view.byteStride ?? components * componentBytes;
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const readValue = (byteOffset: number): number => {
    if (accessor.componentType === 5126) {
      return glb.binary.getFloat32(byteOffset, true);
    }
    if (accessor.componentType === 5125) {
      return glb.binary.getUint32(byteOffset, true);
    }
    return glb.binary.getUint16(byteOffset, true);
  };
  return Array.from({ length: accessor.count * components }, (_, i) =>
    readValue(offset + i * componentBytes + Math.floor(i / components) * (stride - components * componentBytes)),
  );
};

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
    (_, i) => [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!] as Vec3,
  );

const surfaceTriangles = (positions: readonly number[], indices: readonly number[]): [Vec3, Vec3, Vec3][] => {
  const points = vertices(positions);
  return Array.from(
    { length: indices.length / 3 },
    (_, i) => [0, 1, 2].map((corner) => points[indices[i * 3 + corner]!]!) as [Vec3, Vec3, Vec3],
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
  it.each(cases)('$key keeps the raised receiver roof watertight', ({ key, folder, file }) => {
    const assembly = assemblyFor(key, folder, file);
    const id = basename(file, '.json').replaceAll('-', '_');
    const result = exportGunGlb(assembly, { id, file: `assets/models/${id}.glb` }, {});
    if (!result.ok) {
      throw new Error(`${key}: ${result.error.code}`);
    }
    const glb = parseGlb(result.glb);
    const meshIndex = glb.json.nodes.find(({ name }) => name === 'receiver:ak-receiver')?.mesh;
    expect(meshIndex, `${key}: merged receiver mesh`).toBeDefined();
    const primitive = glb.json.meshes[meshIndex!]!.primitives[0]!;
    const positionAccessor = glb.json.accessors[primitive.attributes.POSITION]!;
    const currentPositions = accessorValues(glb, primitive.attributes.POSITION);
    const currentIndices = accessorValues(glb, primitive.indices);
    expect(positionAccessor.max?.[1], `${key}: receiver roof is raised above the old profile`).toBeGreaterThan(
      baseline.bounds.max[1]!,
    );

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
