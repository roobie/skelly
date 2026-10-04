import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

const pool = pathToFileURL(resolve(import.meta.dirname, '../testPool.ts')).href;
const loadPool = (cwd, vitest) =>
  spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `await import(${JSON.stringify(pool)}); console.log(JSON.stringify({ tmp: process.env.TMPDIR, pid: process.pid }));`,
    ],
    // biome-ignore lint/style/noProcessEnv: compare native runner environments in an isolated child.
    { cwd, env: { ...process.env, TMPDIR: cwd, VITEST: vitest }, encoding: 'utf8' },
  );

test('ordinary Vite imports leave the caller temp directory and cache untouched', () => {
  const root = mkdtempSync(join(tmpdir(), 'skelly-vite-temp-test-'));
  try {
    const child = loadPool(root, '');
    assert.equal(child.status, 0, child.stderr);
    assert.equal(JSON.parse(child.stdout).tmp, root);
    assert.deepEqual(readdirSync(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Vitest startup reclaims dead-owner data but preserves live and unowned entries', () => {
  const root = mkdtempSync(join(tmpdir(), 'skelly-vitest-temp-test-'));
  try {
    const cache = join(root, 'node_modules/.cache/vitest-tmp');
    const ended = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' });
    assert.equal(ended.status, 0, ended.stderr);
    const stale = join(cache, `${Number(ended.stdout)}-stale`);
    const live = `${process.pid}-live`;
    const unowned = 'unowned';
    for (const path of [stale, join(cache, live), join(cache, unowned)]) {
      mkdirSync(path, { recursive: true });
    }
    const child = loadPool(root, 'true');
    assert.equal(child.status, 0, child.stderr);
    const info = JSON.parse(child.stdout);
    assert(info.tmp.startsWith(join(cache, `${info.pid}-`)));
    assert.equal(existsSync(stale), false);
    assert.deepEqual(readdirSync(cache).sort(), [live, unowned].sort()); // own normal-exit cleanup, no collateral deletion
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
