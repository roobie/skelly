import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatJson } from './compile.mjs';

test('formatter preserves a generated document larger than the subprocess default output buffer', () => {
  const document = { rows: Array.from({ length: 16_384 }, () => 'fixture'.repeat(16)) };
  const source = JSON.stringify(document);
  const formatted = formatJson(source, 'packages/deadvox/src/content/base/fixture.json');
  assert.deepEqual(JSON.parse(formatted), document);
});
