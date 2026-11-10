import { buildRegistry, type ModelDef } from '@skelly/engine/content';
import type { ContentFile } from '@skelly/engine/internal/core/schema.ts';
import { expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';

const fixture = JSON.parse(compileJsonnetFile('packages/deadvox/test/fixtures/content/model-admission.libsonnet')) as {
  content: ContentFile;
  missing: ContentFile;
  contexts: ModelDef[][];
};

it('admits named released rows from each model consumer without admitting unnamed catalogue rows', () => {
  expect(fixture.contexts).not.toEqual([]);
  for (const rows of fixture.contexts) {
    expect(rows.some(({ id }) => id === 'fixture_used')).toBe(true);
    expect(rows.some(({ id }) => id === 'fixture_unused')).toBe(false);
  }
  const { registry, issues } = buildRegistry([{ source: 'fixture', data: fixture.content }]);
  expect(issues).toEqual([]);
  expect(registry.models.has('fixture_used')).toBe(true);
  expect(registry.models.has('fixture_unused')).toBe(false);
});

it('keeps a named missing release row as a validation error rather than dropping its consumer', () => {
  expect(fixture.missing.items?.some(({ model }) => model === 'fixture_missing')).toBe(true);
  const { issues } = buildRegistry([{ source: 'fixture', data: fixture.missing }]);
  expect(issues).toEqual([
    expect.objectContaining({ source: 'fixture', path: 'items[0].model', message: 'no model "fixture_missing"' }),
  ]);
});
