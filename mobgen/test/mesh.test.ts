import { describe, expect, it } from 'vitest';
import { meshBones } from '../src/core/mesh.ts';
import type { Voxels } from '../src/core/voxelize.ts';

const grid = (dims: readonly [number, number, number], owner: readonly number[], color: readonly number[]): Voxels => ({
  size: 0.1,
  origin: [0, 0, 0],
  dims,
  owner: Uint8Array.from(owner),
  color: Uint8Array.from(color),
});

describe('meshBones', () => {
  it('a single voxel gives 12 triangles (6 faces)', () => {
    const voxels = grid([1, 1, 1], [1], [0]);
    const meshes = meshBones(voxels, 1);
    expect(meshes.get(0)?.triangles).toBe(12);
  });

  it('two adjacent same-colour voxels merge into 12 triangles', () => {
    const voxels = grid([2, 1, 1], [1, 1], [5, 5]);
    const meshes = meshBones(voxels, 1);
    expect(meshes.get(0)?.triangles).toBe(12);
  });

  it('two adjacent different-colour voxels do not merge: 20 triangles', () => {
    const voxels = grid([2, 1, 1], [1, 1], [5, 7]);
    const meshes = meshBones(voxels, 1);
    expect(meshes.get(0)?.triangles).toBe(20);
  });

  it('faces between voxels of different bones are emitted on both sides', () => {
    const voxels = grid([2, 1, 1], [1, 2], [5, 5]);
    const meshes = meshBones(voxels, 2);
    expect(meshes.get(0)?.triangles).toBe(12);
    expect(meshes.get(1)?.triangles).toBe(12);
  });

  it('leaves out bones that own no voxels', () => {
    const voxels = grid([1, 1, 1], [1], [0]);
    const meshes = meshBones(voxels, 3);
    expect([...meshes.keys()]).toEqual([0]);
  });

  it('every quad is two triangles with a consistent winding (6 indices per quad, CCW from outside)', () => {
    const voxels = grid([1, 1, 1], [1], [0]);
    const mesh = meshBones(voxels, 1).get(0)!;
    expect(mesh.indices.length).toBe(mesh.triangles * 3);
    expect(mesh.positions.length).toBe((mesh.indices.length / 6) * 4 * 3); // 4 verts per quad, unmerged single voxel
  });

  it('reports the neighbour bone on a joint face, and none (-1) on outer faces (2-bone toy body)', () => {
    const voxels = grid([2, 1, 1], [1, 2], [5, 5]);
    const meshes = meshBones(voxels, 2);
    const bone0 = meshes.get(0)!; // cell (0,0,0)
    const bone1 = meshes.get(1)!; // cell (1,0,0)
    expect(bone0.neighbourBone.length).toBe(bone0.positions.length / 3); // one entry per vertex
    // bone0's +X face touches bone1 (a single quad, 4 vertices); its other 5 faces are exposed to empty
    // space (-1). bone1 is the mirror image, reporting bone0 on its own joint face.
    expect([...bone0.neighbourBone].filter((n) => n === 1)).toHaveLength(4);
    expect([...bone0.neighbourBone].filter((n) => n === -1)).toHaveLength(20);
    expect([...bone1.neighbourBone].filter((n) => n === 0)).toHaveLength(4);
    expect([...bone1.neighbourBone].filter((n) => n === -1)).toHaveLength(20);
  });

  it('does not merge same-colour faces whose neighbour bone differs (would otherwise be one quad)', () => {
    // bone0 (index 0) occupies (1,0,0) and (1,0,1), same colour; bone1 (index 1) occupies (0,0,1);
    // (0,0,0) stays empty. bone0's -X face is exposed on both its cells, but one neighbours empty and the
    // other neighbours bone1 — without the neighbour bone in the merge key these would wrongly merge into
    // a single quad (2 triangles) instead of two (4 triangles).
    const voxels = grid([2, 1, 2], [0, 1, 2, 1], [0, 5, 0, 5]);
    const meshes = meshBones(voxels, 2);
    const bone0 = meshes.get(0)!;
    // The -X face touching bone1 stays its own quad (exactly 4 vertices at neighbourBone 1) — if colour
    // alone drove merging, it would instead fold into a bigger quad together with the empty-neighboured
    // -X face right next to it (same colour, adjacent cells).
    expect([...bone0.neighbourBone].filter((n) => n === 1)).toHaveLength(4);
    expect([...bone0.neighbourBone].filter((n) => n === -1).length).toBeGreaterThan(0);
  });
});
