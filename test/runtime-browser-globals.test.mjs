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
 * Biome reports nothing for a file it excludes, so a fixture proves it was linted by a diagnostic of its own.
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
    const { diagnostics } = JSON.parse(result.stdout);
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

// Node types declare the first four, so the runtime's no-DOM typecheck lets them through; only the lint
// ban keeps them out of the runtime set. Line 5 is a Node-and-browser global the runtime may use. Line 6
// uses `event`, which the rule bans in every file, so its diagnostic shows the file was linted.
const SEEDED = [
  'export const agent = navigator.userAgent;',
  'export type Message = MessageEvent;',
  'export const saved = localStorage.length;',
  'export const session = sessionStorage.length;',
  'export const now = performance.now();',
  'export const current = event;',
].join('\n');

test('lint fails each Node-declared browser name in a runtime file, and only in the runtime set', () => {
  assert.deepEqual(
    restrictedGlobalLines({
      'packages/engine/src/core/probe.ts': SEEDED,
      'packages/deadvox/src/render/probe.ts': SEEDED,
    }),
    {
      'packages/engine/src/core/probe.ts': [1, 2, 3, 4, 6],
      'packages/deadvox/src/render/probe.ts': [6],
    },
  );
});

// The no-DOM typecheck never reads a JavaScript runtime file, so its DOM names rest on the lint ban alone.
const SEEDED_JAVASCRIPT = [
  'export const title = document.title;',
  'export const view = window;',
  'export const frame = requestAnimationFrame;',
  'export const current = event;',
].join('\n');

test('lint fails DOM names in a JavaScript runtime file, which the typecheck does not read', () => {
  assert.deepEqual(
    restrictedGlobalLines({
      'packages/engine/src/core/probe.mjs': SEEDED_JAVASCRIPT,
      'packages/deadvox/src/render/probe.mjs': SEEDED_JAVASCRIPT,
    }),
    {
      'packages/engine/src/core/probe.mjs': [1, 2, 3, 4],
      'packages/deadvox/src/render/probe.mjs': [4],
    },
  );
});
