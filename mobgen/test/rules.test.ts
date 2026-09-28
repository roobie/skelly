// Small hand-built bodies, each breaking exactly one rule, plus one that passes all five.
// Grid layout note: index = i + j*nx + k*nx*ny (see core/voxelize.ts's cellIndex); size 0.1,
// origin [0, 0, 0] unless a case says otherwise.

import { describe, expect, it } from 'vitest';
import type { Body, Material } from '../src/core/body.ts';
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

const run = (b: Body, v: Voxels, feet: readonly string[], budgets: Budgets) =>
  validate({ body: b, voxels: v, meshes: meshBones(v, b.bones.length), feet: new Set(feet), budgets });

// Two bones stacked one voxel high: root (foot) at the bottom, child on top.
const healthyBones: Body['bones'] = [
  { id: 'root', parent: null, head: [0, 0, 0], tail: [0, 0.1, 0] },
  { id: 'child', parent: 'root', head: [0, 0.1, 0], tail: [0, 0.2, 0] },
];
const healthyVoxels = voxels([1, 2, 1], [1, 2]);

describe('validate: a healthy body passes every rule', () => {
  it('reports ok with no issues', () => {
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

  it("fails when the ground layer isn't a foot bone", () => {
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
