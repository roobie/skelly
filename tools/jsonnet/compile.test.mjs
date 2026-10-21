import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { compileJsonnetSources, formatJson } from './compile.mjs';
import { REPOSITORY_ROOT } from './index.mjs';

test('a partial compile stays inside its directories and leaves the full-set manifest alone', () => {
  const manifest = resolve(REPOSITORY_ROOT, 'tools/jsonnet/outputs.json');
  const before = readFileSync(manifest, 'utf8');
  const outputs = compileJsonnetSources({ within: ['packages/thing-authoring-tool'] });
  assert.ok(outputs.length > 0);
  const directory = resolve(REPOSITORY_ROOT, 'packages/thing-authoring-tool');
  assert.ok(outputs.every((output) => output.startsWith(`${directory}/`)));
  assert.equal(readFileSync(manifest, 'utf8'), before);
  assert.throws(() => compileJsonnetSources({ within: ['packages/thing-authoring-tool'], check: true }));
});

test('formatter preserves a generated document larger than the subprocess default output buffer', () => {
  const document = { rows: Array.from({ length: 16_384 }, () => 'fixture'.repeat(16)) };
  const source = JSON.stringify(document);
  const formatted = formatJson(source, 'packages/deadvox/src/content/base/fixture.json');
  assert.deepEqual(JSON.parse(formatted), document);
});
