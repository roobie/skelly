// Small hand-built bodies, each breaking exactly one rule, plus one that passes all five.
// Grid layout note: index = i + j*nx + k*nx*ny (see core/voxelize.ts's cellIndex); size 0.1,
// origin [0, 0, 0] unless a case says otherwise.

import { describe, expect, it } from 'vitest';
import type { Body, Material } from '../src/core/body.ts';
import { FAR_LOD_HALF_BLOCK_TRIANGLE_CAP, FAR_LOD_HALF_BLOCK_VOXEL_SIZE } from '../src/core/generate.ts';
import { meshBones } from '../src/core/mesh.ts';
import type { Budgets } from '../src/core/rules.ts';
import { validate } from '../src/core/validate.ts';
import type { Voxels } from '../src/core/voxelize.ts';

const PALETTE: Record<Material, readonly [number, number, number]> = {
  skin: [1, 1, 1],
  bruise: [0, 0, 0],
  shirt: [0, 0, 0],
  pants: [0, 0, 0],
  shoe: [0, 0, 0],
  hair: [0, 0, 0],
  eye: [0, 0, 0],
  mouth: [0, 0, 0],
  gore: [0, 0, 0],
  bone: [0, 0, 0],
};

const GENEROUS: Budgets = { totalVoxels: { min: 1, max: 20 }, totalTriangles: { min: 1, max: 2000 }, groups: {} };

const body = (bones: Body['bones']): Body => ({ bones, features: [], palette: PALETTE });

const voxels = (
  dims: readonly [number, number, number],
  owner: readonly number[],
  origin: readonly [number, number, number] = [0, 0, 0],
): Voxels => ({
  size: 0.1,
  origin,
  dims,
  owner: Uint8Array.from(owner),
  color: new Uint8Array(owner.length),
});

const run = (b: Body, v: Voxels, supportBones: readonly string[], budgets: Budgets) =>
  validate({ body: b, voxels: v, meshes: meshBones(v, b.bones.length), supportBones: new Set(supportBones), budgets });

const runSilhouette = (
  b: Body,
  v: Voxels,
  budgets: Budgets,
  options: {
    readonly reference?: { readonly width: number; readonly height: number };
    readonly referenceVoxelSize?: number;
  } = {},
) =>
  validate({
    profile: 'silhouette',
    referenceSilhouette: options.reference ?? { width: 0.1, height: 0.2 },
    referenceVoxelSize: options.referenceVoxelSize ?? 0.1,
    body: b,
    voxels: v,
    meshes: meshBones(v, b.bones.length),
    supportBones: new Set<string>(),
    budgets,
  });

// Two bones stacked one voxel high: root (foot) at the bottom, child on top.
const healthyBones: Body['bones'] = [
  { id: 'root', parent: null, head: [0, 0, 0], tail: [0, 0.1, 0] },
  { id: 'child', parent: 'root', head: [0, 0.1, 0], tail: [0, 0.2, 0] },
];
const healthyVoxels = voxels([1, 2, 1], [1, 2]);

describe('validate: declared support bones ground a generic body', () => {
  it('reports ok when the declared non-humanoid root support owns ground contact', () => {
    const report = run(body(healthyBones), healthyVoxels, ['root'], GENEROUS);
    expect(report.issues).toEqual([]);
    expect(report.ok).toBe(true);
  });
});

describe('floaters', () => {
  it('fails when a voxel is disconnected from the main body', () => {
    // j=0 row (i=0,1,2): root, empty, an isolated extra cell; j=1 row (i=0,1,2): child, empty, empty.
    const v = voxels([3, 2, 1], [1, 0, 1, 2, 0, 0]);
    const report = run(body(healthyBones), v, ['root'], { ...GENEROUS, totalVoxels: { min: 1, max: 20 } });
    expect(report.issues.map((i) => i.rule)).toEqual(['floaters']);
  });
});

describe('attached', () => {
  it('fails when a bone owns no voxels', () => {
    const bones: Body['bones'] = [...healthyBones, { id: 'orphan', parent: 'root', head: [0, 0, 0], tail: [0, 0, 0] }];
    const report = run(body(bones), healthyVoxels, ['root'], GENEROUS);
    expect(report.issues.map((i) => i.rule)).toEqual(['attached']);
    expect(report.issues[0]?.message).toContain('orphan');
  });

  it("fails when a bone doesn't touch its parent", () => {
    const bones: Body['bones'] = [
      ...healthyBones,
      { id: 'dangling', parent: 'root', head: [0, 0.2, 0], tail: [0, 0.3, 0] },
    ];
    // dangling (j=2) touches child (j=1, connected, so no floater) but never touches root (j=0).
    const v = voxels([1, 3, 1], [1, 2, 3]);
    const report = run(body(bones), v, ['root'], GENEROUS);
    expect(report.issues.map((i) => i.rule)).toEqual(['attached']);
    expect(report.issues[0]?.message).toContain('dangling');
  });
});

describe('grounded', () => {
  it("fails when the lowest layer isn't at y = 0", () => {
    const v = voxels([1, 2, 1], [1, 2], [0, 1, 0]);
    const report = run(body(healthyBones), v, ['root'], GENEROUS);
    expect(report.issues.map((i) => i.rule)).toEqual(['grounded']);
  });

  it('fails when the ground layer belongs to a non-support bone', () => {
    const report = run(body(healthyBones), healthyVoxels, ['child'], GENEROUS);
    expect(report.issues.map((i) => i.rule)).toEqual(['grounded']);
  });
});

describe('balance', () => {
  it('fails when the centre of mass is far from the ground footprint', () => {
    const bones: Body['bones'] = [
      healthyBones[0]!,
      { id: 'child', parent: 'root', head: [0, 0.1, 0], tail: [0.5, 0.1, 0] },
    ];
    // Ground layer (j=0) is just the root voxel at i=0; a long connected beam of "child" at j=1
    // (i=0..5) drags the centre of mass far to the right of that footprint.
    const owner = [1, 0, 0, 0, 0, 0, 2, 2, 2, 2, 2, 2];
    const v = voxels([6, 2, 1], owner);
    const report = run(body(bones), v, ['root'], { ...GENEROUS, totalVoxels: { min: 1, max: 20 } });
    expect(report.issues.map((i) => i.rule)).toEqual(['balance']);
  });
});

describe('silhouette profile', () => {
  it('rejects disconnected voxels without requiring bone ownership', () => {
    const disconnected = voxels([3, 2, 1], [1, 0, 1, 2, 0, 0]);
    const report = runSilhouette(body(healthyBones), disconnected, GENEROUS);
    expect(report.issues.map((issue) => issue.rule)).toContain('floaters');
  });

  it('rejects a connected silhouette floating above the ground', () => {
    const raised = voxels([1, 2, 1], [1, 2], [0, 1, 0]);
    const report = runSilhouette(body(healthyBones), raised, GENEROUS);
    expect(report.issues.map((issue) => issue.rule)).toContain('grounded');
  });

  it('does not enforce total-voxel or group-voxel budgets', () => {
    const tightVoxelBudgets: Budgets = {
      totalVoxels: { min: 1, max: 1 },
      totalTriangles: { min: 1, max: 2000 },
      groups: { child: { bones: ['child'], min: 5, max: 10 } },
    };
    const report = runSilhouette(body(healthyBones), healthyVoxels, tightVoxelBudgets);
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('rejects a synthetic 1/2-block silhouette over the absolute 400-triangle cap', () => {
    const coarse = { ...healthyVoxels, size: FAR_LOD_HALF_BLOCK_VOXEL_SIZE };
    const generatedMeshes = meshBones(coarse, healthyBones.length);
    const mesh = generatedMeshes.get(0)!;
    const report = validate({
      profile: 'silhouette',
      referenceSilhouette: { width: 0, height: FAR_LOD_HALF_BLOCK_VOXEL_SIZE },
      referenceVoxelSize: 0.1,
      body: body(healthyBones),
      voxels: coarse,
      meshes: new Map([[0, { ...mesh, triangles: FAR_LOD_HALF_BLOCK_TRIANGLE_CAP + 1 }]]),
      supportBones: new Set<string>(),
      budgets: { totalTriangles: { min: 1, max: FAR_LOD_HALF_BLOCK_TRIANGLE_CAP } },
    });
    expect(report.issues).toEqual([{ rule: 'budget', message: 'Total triangles 401 is outside [1, 400].' }]);
  });

  it('rejects a width or height change beyond the coarse and reference-cell quantization allowance', () => {
    const small = voxels([1, 2, 1], [1, 2]);
    const report = runSilhouette(body(healthyBones), small, GENEROUS, { reference: { width: 1, height: 0.2 } });
    expect(report.issues.map((issue) => issue.rule)).toContain('silhouette');
  });
});

describe('budget', () => {
  it('fails when total voxels exceed the template budget', () => {
    const tight: Budgets = { ...GENEROUS, totalVoxels: { min: 1, max: 1 } };
    const report = run(body(healthyBones), healthyVoxels, ['root'], tight);
    expect(report.issues.map((i) => i.rule)).toEqual(['budget']);
  });

  it('fails when a named group is outside its range', () => {
    const tight: Budgets = { ...GENEROUS, groups: { child: { bones: ['child'], min: 5, max: 10 } } };
    const report = run(body(healthyBones), healthyVoxels, ['root'], tight);
    expect(report.issues.map((i) => i.rule)).toEqual(['budget']);
  });
});
