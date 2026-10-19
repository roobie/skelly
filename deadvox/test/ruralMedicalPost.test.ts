import { templateSpatialIssues } from '../src/core/templateSpatial.ts';
import { compileTemplate } from '../src/core/templates.ts';
import { buildBundledContent } from '../src/game/bundledContent.ts';
import { expect, test } from 'vitest';

test('keeps the rural medical post accessible through its authored entrance', () => {
  const content = buildBundledContent();
  const template = content.registry.templates.get('rural_medical_post');
  expect(template).toBeDefined();
  expect(templateSpatialIssues(content.registry, compileTemplate(content.registry, template!))).toEqual([]);
});
