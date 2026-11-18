import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gitEnvironment } from '../packages/deadvox/tools/publish-playtest.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const run = (command, args) =>
  execFileSync(command, args, { cwd: ROOT, env: gitEnvironment(), encoding: 'utf8', maxBuffer: 1 << 26 });

const TYPESCRIPT = /\.[cm]?ts$/;
const DECLARATION = /\.d\.[cm]?ts$/;
// Declarations are skipped by every project's skipLibCheck, so only sources can hide type errors.
const isSource = (path) => TYPESCRIPT.test(path) && !DECLARATION.test(path);

test('every tracked TypeScript source is in a workspace typecheck program', () => {
  const tracked = run('git', ['-C', ROOT, 'ls-files', '-z']).split('\0').filter(Boolean);
  const trackedSet = new Set(tracked);
  const sources = tracked.filter(isSource);
  assert.ok(sources.length > 0, 'git listed no TypeScript sources');

  // Submodule workspaces have their own checks; their files are not tracked here.
  const workspaces = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).workspaces.filter(
    (workspace) =>
      trackedSet.has(`${workspace}/package.json`) &&
      JSON.parse(readFileSync(join(ROOT, workspace, 'package.json'), 'utf8')).scripts?.typecheck,
  );
  assert.ok(workspaces.length > 0, 'no workspace defines a typecheck script');

  const checked = new Set(
    workspaces.flatMap((workspace) =>
      run('npm', ['run', '--silent', '--workspace', workspace, 'typecheck', '--', '--listFilesOnly'])
        .split('\n')
        .filter(Boolean)
        .map((path) => relative(ROOT, path)),
    ),
  );
  assert.deepEqual(
    sources.filter((path) => !checked.has(path)),
    [],
  );
});

// An inherited exclude once dropped the globals declaration, leaving every stage page global a silent any.
test('the browser stage program checks every stage script against its page globals', () => {
  const stages = 'packages/deadvox/test/browser';
  const checked = new Set(
    run('npx', ['tsc', '-p', stages, '--listFilesOnly'])
      .split('\n')
      .filter(Boolean)
      .map((path) => relative(ROOT, path)),
  );
  const expected = run('git', ['-C', ROOT, 'ls-files', '-z', `${stages}/*.mjs`])
    .split('\0')
    .filter(Boolean)
    .concat(`${stages}/stageGlobals.d.ts`);
  assert.ok(expected.length > 1, 'git listed no stage scripts');
  assert.deepEqual(
    expected.filter((path) => !checked.has(path)),
    [],
  );
});
