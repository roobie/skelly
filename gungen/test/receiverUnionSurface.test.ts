import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/math.ts';
import type { TriangleMesh } from '../src/core/mesh.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { exportGunGlb } from '../src/gun/exportGlb.ts';
import { expectWatertightMesh, loadFixture } from './helpers.ts';

const ROOT = join(import.meta.dirname, '..');
// The six current AK exports measured at <=2.7e-6u of drift; enforce the full weld-tolerance contract.
const MAX_SURFACE_DISTANCE_U = 1e-5;
const METRES_PER_UNIT = 0.0115;
const MAX_SURFACE_DISTANCE_M = MAX_SURFACE_DISTANCE_U * METRES_PER_UNIT;
const baseline = JSON.parse(
  readFileSync(join(ROOT, 'test/fixtures/receiver-ak-union-before-polyhedra.json'), 'utf8'),
) as {
  baselineCommit: string;
  positions: number[];
  indices: number[];
  bounds: { min: number[]; max: number[] };
};
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
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const magnitude = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

const pointSegmentDistance = (point: Vec3, a: Vec3, b: Vec3): number => {
  const edge = subtract(b, a);
  const t = Math.max(0, Math.min(1, dot(subtract(point, a), edge) / dot(edge, edge)));
  return magnitude(subtract(point, [a[0] + edge[0] * t, a[1] + edge[1] * t, a[2] + edge[2] * t]));
};

const pointTriangleDistance = (point: Vec3, [a, b, c]: readonly [Vec3, Vec3, Vec3]): number => {
  const ab = subtract(b, a);
  const ac = subtract(c, a);
  const normal = cross(ab, ac);
  const normalLengthSquared = dot(normal, normal);
  const signed = dot(subtract(point, a), normal) / normalLengthSquared;
  const projected: Vec3 = [point[0] - normal[0] * signed, point[1] - normal[1] * signed, point[2] - normal[2] * signed];
  const ap = subtract(projected, a);
  const d00 = dot(ab, ab);
  const d01 = dot(ab, ac);
  const d11 = dot(ac, ac);
  const d20 = dot(ap, ab);
  const d21 = dot(ap, ac);
  const denominator = d00 * d11 - d01 * d01;
  const u = (d11 * d20 - d01 * d21) / denominator;
  const v = (d00 * d21 - d01 * d20) / denominator;
  if (u >= -1e-12 && v >= -1e-12 && u + v <= 1 + 1e-12) {
    return Math.abs(signed) * Math.sqrt(normalLengthSquared);
  }
  return Math.min(
    pointSegmentDistance(point, a, b),
    pointSegmentDistance(point, b, c),
    pointSegmentDistance(point, c, a),
  );
};

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

const maximumVertexSurfaceDistance = (
  sourcePositions: readonly number[],
  targetPositions: readonly number[],
  targetIndices: readonly number[],
): number => {
  const targetTriangles = surfaceTriangles(targetPositions, targetIndices);
  return Math.max(
    ...vertices(sourcePositions).map((point) =>
      Math.min(...targetTriangles.map((triangle) => pointTriangleDistance(point, triangle))),
    ),
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

describe('merged AK receiver surface preservation', () => {
  it('uses the pre-polyhedron export checkpoint as its baseline', () => {
    expect(baseline.baselineCommit).toBe('8610969');
  });

  it.each(cases)('$key remains within the stated surface-preservation contract', ({ key, folder, file }) => {
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
    const beforePositions = baseline.positions;
    const beforeIndices = baseline.indices;
    expect(positionAccessor.min, `${key}: identical lower bounds`).toEqual(baseline.bounds.min);
    expect(positionAccessor.max, `${key}: identical upper bounds`).toEqual(baseline.bounds.max);

    const oldToCurrent = maximumVertexSurfaceDistance(beforePositions, currentPositions, currentIndices);
    const currentToOld = maximumVertexSurfaceDistance(currentPositions, beforePositions, beforeIndices);
    expect(oldToCurrent, `${key}: old vertices to current surface`).toBeLessThanOrEqual(MAX_SURFACE_DISTANCE_M);
    expect(currentToOld, `${key}: current vertices to old surface`).toBeLessThanOrEqual(MAX_SURFACE_DISTANCE_M);

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
