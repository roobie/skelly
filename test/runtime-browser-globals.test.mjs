import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BIOME = join(ROOT, 'node_modules/@biomejs/biome/bin/biome');
const RESTRICTED_GLOBAL = 'lint/style/noRestrictedGlobals';

/**
 * The lines of each fixture file that the repository's Biome config bans as restricted globals. The
 * fixtures sit at repository paths in a temporary copy, so the config's path overrides apply to them.
 * Biome skips any path under node_modules, so this runs where the temp directory lies outside one.
 */
const restrictedGlobalLines = (files) => {
  const dir = mkdtempSync(join(tmpdir(), 'runtime-browser-globals-'));
  try {
    copyFileSync(join(ROOT, 'biome.jsonc'), join(dir, 'biome.jsonc'));
    for (const [path, source] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true });
      writeFileSync(join(dir, path), source);
    }
    const result = spawnSync(
      process.execPath,
      [BIOME, 'lint', '--vcs-enabled=false', `--config-path=${dir}`, '--reporter=json', ...Object.keys(files)],
      { cwd: dir, encoding: 'utf8' },
    );
    const { summary, diagnostics } = JSON.parse(result.stdout);
    // A skipped fixture reports nothing, which would let the ban look absent or scoped.
    if (summary.skipped > 0 || diagnostics.some(({ category }) => category.startsWith('internalError'))) {
      throw new Error(`Biome did not lint every fixture: ${result.stdout}`);
    }
    const lines = Object.fromEntries(Object.keys(files).map((path) => [path, []]));
    for (const { category, location } of diagnostics) {
      if (category === RESTRICTED_GLOBAL) {
        lines[relative(dir, resolve(dir, location.path))].push(location.start.line);
      }
    }
    return lines;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// Node types declare these four, so the runtime's no-DOM typecheck lets them through; only the lint ban
// keeps them out of the runtime set. The last line is a Node-and-browser global the runtime may use.
const SEEDED = [
  'export const agent = navigator.userAgent;',
  'export type Message = MessageEvent;',
  'export const saved = localStorage.length;',
  'export const session = sessionStorage.length;',
  'export const now = performance.now();',
].join('\n');

test('lint fails each Node-declared browser name in a runtime file, and only in the runtime set', () => {
  assert.deepEqual(
    restrictedGlobalLines({
      'packages/deadvox/src/core/probe.ts': SEEDED,
      'packages/deadvox/src/render/probe.ts': SEEDED,
    }),
    {
      'packages/deadvox/src/core/probe.ts': [1, 2, 3, 4],
      'packages/deadvox/src/render/probe.ts': [],
    },
  );
});
