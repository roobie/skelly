import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BIOME = join(ROOT, 'node_modules/@biomejs/biome/bin/biome');
const PLUGIN = 'tools/lint/no-locale-order.grit';

// Lines 1 to 3 each order strings by the runtime's collation; line 4 is the locale-free order; line 5 only
// mentions the name in a string, which is not a call.
const SEEDED = [
  'export const a = ["b", "a"].sort((x, y) => x.localeCompare(y));',
  'export const b = new Intl.Collator("en").compare;',
  'export const c = Intl.Collator().compare;',
  'export const d = ["b", "a"].sort((x, y) => (x < y ? -1 : 1));',
  'export const e = "localeCompare";',
].join('\n');

test('lint fails each call that orders strings by locale, and nothing else', () => {
  const dir = mkdtempSync(join(tmpdir(), 'locale-order-lint-'));
  try {
    copyFileSync(join(ROOT, 'biome.jsonc'), join(dir, 'biome.jsonc'));
    mkdirSync(join(dir, 'tools/lint'), { recursive: true });
    copyFileSync(join(ROOT, PLUGIN), join(dir, PLUGIN));
    writeFileSync(join(dir, 'seeded.ts'), SEEDED);
    const result = spawnSync(
      process.execPath,
      [BIOME, 'lint', '--vcs-enabled=false', `--config-path=${dir}`, '--reporter=json', 'seeded.ts'],
      { cwd: dir, encoding: 'utf8' },
    );
    const { diagnostics } = JSON.parse(result.stdout);
    const lines = diagnostics
      .filter(({ category }) => category === 'plugin')
      .map(({ location }) => location.start.line);
    assert.deepEqual(lines, [1, 2, 3]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
