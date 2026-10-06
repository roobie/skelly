import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const DEADVOX = fileURLToPath(new URL('../deadvox/', import.meta.url));

test('one-shambler CPU benchmark runs through its npm script under plain Node', () => {
  const output = execFileSync('npm', ['run', '--silent', 'bench:shamblers', '--', '1'], {
    cwd: DEADVOX,
    encoding: 'utf8',
  });
  assert.notEqual(output.trim(), '');
});
