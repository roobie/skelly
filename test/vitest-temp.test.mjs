import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
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

test('Vitest startup reclaims dead directories but preserves the exact live, denied, unowned, and symlink set', () => {
  const root = mkdtempSync(join(tmpdir(), 'skelly-vitest-temp-test-'));
  try {
    const cache = join(root, 'node_modules/.cache/vitest-tmp');
    const ended = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' });
    assert.equal(ended.status, 0, ended.stderr);
    const stale = join(cache, `${Number(ended.stdout)}-stale`);
    const endedLinkOwner = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' });
    assert.equal(endedLinkOwner.status, 0, endedLinkOwner.stderr);
    const staleLinkName = `${Number(endedLinkOwner.stdout)}-symlink`;
    const staleLink = join(cache, staleLinkName);
    const symlinkTarget = join(root, 'symlink-target');
    const live = `${process.pid}-live`;
    const denied = '1-root-owned';
    const unowned = 'unowned';
    for (const path of [stale, join(cache, live), join(cache, denied), join(cache, unowned), symlinkTarget]) {
      mkdirSync(path, { recursive: true });
    }
    symlinkSync(symlinkTarget, staleLink, 'dir');
    let pidOneError;
    try {
      process.kill(1, 0);
    } catch (error) {
      pidOneError = error.code;
    }
    assert.ok(pidOneError === undefined || pidOneError === 'EPERM', `unexpected PID 1 liveness result: ${pidOneError}`);
    const child = loadPool(root, 'true');
    assert.equal(child.status, 0, child.stderr);
    const info = JSON.parse(child.stdout);
    assert(info.tmp.startsWith(join(cache, `${info.pid}-`)));
    assert.equal(existsSync(stale), false);
    assert.equal(existsSync(staleLink), true);
    assert.equal(existsSync(symlinkTarget), true);
    assert.deepEqual(readdirSync(cache).sort(), [denied, live, staleLinkName, unowned].sort()); // own exit cleanup; no collateral deletion
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
