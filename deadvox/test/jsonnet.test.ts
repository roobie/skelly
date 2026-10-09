import { expect, it } from 'vitest';
import { compileJsonnetFile } from '../../tools/jsonnet/index.mjs';
import { buildRegistry } from '../src/core/content.ts';

const validSource = 'deadvox/test/fixtures/jsonnet/pipeline-valid.jsonnet';
const INVALID_SOURCE_PATTERN = /pipeline-invalid\.jsonnet/;

it('compiles a fixed-root Jsonnet import and loads its output through the content registry', () => {
  const output = compileJsonnetFile(validSource);
  expect(compileJsonnetFile(validSource)).toBe(output);
  const data: unknown = JSON.parse(output);
  expect(data).toEqual({
    items: [
      {
        id: 'jsonnet_pipeline_fixture',
        name: 'Pipeline fixture',
        category: 'tool',
        weight: 1,
        size: [1, 1],
      },
    ],
  });
  const { registry, issues } = buildRegistry([{ source: validSource, data }]);

  expect(issues).toEqual([]);
  expect(registry.items.has('jsonnet_pipeline_fixture')).toBe(true);
});

it('names the source when Jsonnet compilation fails', () => {
  expect(() => compileJsonnetFile('deadvox/test/fixtures/jsonnet/pipeline-invalid.jsonnet')).toThrow(
    INVALID_SOURCE_PATTERN,
  );
});
