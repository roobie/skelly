import { describe, expect, it } from 'vitest';
import { templateSpatialIssues } from '../src/core/templateSpatial.ts';
import { compileTemplate } from '../src/core/templates.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();

describe('stairs', () => {
  it('admits every authored stair template through the spatial validator', () => {
    const templates = [...registry.templates.values()].filter((template) => template.access?.stairs.length);
    expect(templates.length).toBeGreaterThan(0);
    for (const template of templates) {
      expect(templateSpatialIssues(registry, compileTemplate(registry, template))).toEqual([]);
    }
  });
});
