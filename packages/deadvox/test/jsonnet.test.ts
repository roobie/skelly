import { expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';

const INVALID_SOURCE_PATTERN = /pipeline-invalid\.jsonnet/;

it('names the source when Jsonnet compilation fails', () => {
  expect(() => compileJsonnetFile('packages/deadvox/test/fixtures/jsonnet/pipeline-invalid.jsonnet')).toThrow(
    INVALID_SOURCE_PATTERN,
  );
});
