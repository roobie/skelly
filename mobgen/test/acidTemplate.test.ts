import { expect, it } from 'vitest';
import { consumableTemplate, registerTemplate, type Template } from '../src/core/template.ts';
import { acidContent } from '../src/mob/acidTemplate.ts';

it('acid content readiness refuses a consumer independently of body dimensions', () => {
  const fixture: Template = {
    ...acidContent,
    name: `${acidContent.name}-readiness-fixture`,
    voxelSize: 0.1,
    supportBones: ['fixture'],
    budgets: {
      totalVoxels: { min: 1, max: 100 },
      totalTriangles: { min: 1, max: 100 },
      groups: {},
    },
  };
  registerTemplate(fixture);
  expect(() => consumableTemplate(fixture.name)).toThrow('comparison-only');
});
