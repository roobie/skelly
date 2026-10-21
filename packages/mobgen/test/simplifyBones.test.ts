import { describe, expect, it } from 'vitest';
import type { Body } from '../src/core/body.ts';
import { lodCompatibilityIssues } from '../src/core/lodCompatibility.ts';
import { type BoneMesh, meshBones } from '../src/core/mesh.ts';
import { simplifyBoneMeshes } from '../src/core/simplifyBones.ts';
import { voxelize } from '../src/core/voxelize.ts';

const fixture = () => {
  const body: Body = {
    bones: [
      { id: 'root', parent: null, head: [0, 0, 0], tail: [0, 1, 0] },
      { id: 'child', parent: 'root', head: [0, 1, 0], tail: [0, 2, 0] },
    ],
    features: [
      {
        bone: 'root',
        op: 'add',
        material: 'skin',
        shape: { kind: 'box', center: [0, 0.5, 0], half: [0.3, 0.5, 0.3], round: 0 },
      },
      {
        bone: 'child',
        op: 'add',
        material: 'skin',
        shape: { kind: 'box', center: [0, 1.5, 0], half: [0.3, 0.5, 0.3], round: 0 },
      },
    ],
    materials: { skin: { color: [1, 0, 0], emissive: 0 }, bone: { color: [1, 1, 1], emissive: 0 } },
  };
  const voxels = voxelize(body, 0.125, 1);
  return { body, meshes: meshBones(voxels, body.bones.length) };
};
const jointFaces = (mesh: BoneMesh, neighbour: number): Set<string> => {
  const faces = new Set<string>();
  for (let index = 0; index < mesh.indices.length; index += 3) {
    if (mesh.neighbourBone[mesh.indices[index]!] !== neighbour) {
      continue;
    }
    faces.add(
      [0, 1, 2]
        .map((offset) => {
          const vertex = mesh.indices[index + offset]!;
          return [...mesh.positions.slice(vertex * 3, vertex * 3 + 3)].join(',');
        })
        .sort()
        .join('|'),
    );
  }
  return faces;
};

describe('bone-local simplification', () => {
  it('keeps a coincident original joint face on both independently owned parts', () => {
    const source = fixture();
    const before = structuredClone(source);
    const meshes = simplifyBoneMeshes(source, 1);
    const original = jointFaces(source.meshes.get(0)!, 1);
    expect(original.size).toBeGreaterThan(0);
    const root = jointFaces(meshes.get(0)!, 1);
    const child = jointFaces(meshes.get(1)!, 0);
    expect([...original].some((face) => root.has(face) && child.has(face))).toBe(true);
    expect(lodCompatibilityIssues(source, { body: source.body, meshes })).toEqual([]);
    expect(source).toEqual(before);
    expect([...meshes.values()].reduce((sum, mesh) => sum + mesh.triangles, 0)).toBeLessThan(
      [...source.meshes.values()].reduce((sum, mesh) => sum + mesh.triangles, 0),
    );
    for (const mesh of meshes.values()) {
      expect([...mesh.normals].every(Number.isFinite)).toBe(true);
    }
  });

  it('rejects non-finite or non-positive edge lengths instead of silently changing quality', () => {
    for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => simplifyBoneMeshes(fixture(), invalid)).toThrow();
    }
  });
});
