import { expect, it, vi } from 'vitest';
import { generate, realize, recommendedProfileFor, registerBodyPlan } from '../src/core/generate.ts';
import { meshBones } from '../src/core/mesh.ts';
import { registerTemplate, type Template } from '../src/core/template.ts';
import { validate } from '../src/core/validate.ts';
import { voxelize } from '../src/core/voxelize.ts';

const template: Template = {
  name: 'fixture-budget-hooks',
  bodyPlan: 'fixture-non-humanoid',
  description: 'fixture',
  voxelSize: 0.02,
  bodyMassKg: 1,
  params: {},
  supportBones: ['tentacle.tip'],
  materials: { flesh: { color: [0.5, 0.5, 0.5], emissive: 0 }, bone: { color: [1, 1, 1], emissive: 0 } },
  budgets: {
    totalVoxels: { min: 0, max: Number.POSITIVE_INFINITY },
    totalTriangles: { min: 0, max: Number.POSITIVE_INFINITY },
    groups: {},
  },
};
const body = {
  bones: [{ id: 'tentacle.tip', parent: null, head: [0, 0, 0], tail: [0, 0.2, 0] }],
  features: [
    {
      bone: 'tentacle.tip',
      op: 'add',
      material: 'flesh',
      shape: { kind: 'capsule', a: [0, 0, 0], b: [0, 0.2, 0], ra: 0.06, rb: 0.06 },
    },
  ],
  materials: template.materials,
} as const;

it('realization and profile recommendation use plan-owned budgets and non-humanoid limb names', () => {
  const budgets = vi.fn(() => template.budgets);
  registerBodyPlan(template.bodyPlan, {
    sample: () => ({ params: {}, wounds: [] }),
    build: () => body,
    paramOrder: [],
    woundBones: [],
    budgets,
    limbBones: ['tentacle.tip'],
  });
  registerTemplate(template);
  const genome = generate(template, 1);
  realize(genome);
  expect(budgets).toHaveBeenCalledExactlyOnceWith(genome, template);
  expect(recommendedProfileFor(genome)).toBe('full');
  expect(recommendedProfileFor(genome, 1)).toBe('silhouette');
});

it('group fractions and overlapping bone patterns count a matched bone only once', () => {
  const voxels = voxelize(body, template.voxelSize, 1);
  expect(voxels.owner.some(Boolean)).toBe(true);
  const context = {
    body,
    voxels,
    meshes: meshBones(voxels, body.bones.length),
    supportBones: new Set(['tentacle.tip']),
  };
  const check = (minFraction: number, maxFraction: number) =>
    validate({
      ...context,
      budgets: {
        ...template.budgets,
        groups: {
          identity: {
            bones: ['tentacle.*', 'tentacle.tip'],
            min: 0,
            max: Number.POSITIVE_INFINITY,
            minFraction,
            maxFraction,
          },
        },
      },
    }).issues.filter((issue) => issue.rule === 'budget');
  expect(check(1, 1)).toEqual([]);
  expect(check(0, 0.5)).toHaveLength(1);
  const absent = validate({
    ...context,
    budgets: {
      ...template.budgets,
      groups: {
        identity: { bones: ['absent.*'], min: 0, max: Number.POSITIVE_INFINITY, minFraction: 0.5 },
      },
    },
  });
  expect(absent.issues.some((issue) => issue.rule === 'budget')).toBe(true);
});
