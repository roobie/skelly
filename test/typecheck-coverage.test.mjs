import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gitEnvironment } from '../packages/deadvox/tools/publish-playtest.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
/**
 * @param {string} command
 * @param {readonly string[]} args
 */
const run = (command, args) =>
  execFileSync(command, args, { cwd: ROOT, env: gitEnvironment(), encoding: 'utf8', maxBuffer: 1 << 26 });

const TYPESCRIPT = /\.[cm]?ts$/;
const DECLARATION = /\.d\.[cm]?ts$/;
const JAVASCRIPT = /\.[cm]?js$/;
// Declarations are skipped by every project's skipLibCheck, so only sources can hide type errors.
/** @param {string} path */
const isSource = (path) => TYPESCRIPT.test(path) && !DECLARATION.test(path);

// JavaScript no program checks, by path or directory prefix, each with the reason it stays out.
const UNCHECKED_JAVASCRIPT = new Map([
  ['packages/deadvox/vendor/rapier-f64/', 'third-party build output kept as received; its own declarations type it'],
  [
    'test/actors-deadvox-contract.test.mjs',
    'imports skelly-assets kinematics, which does not type-check under the root options; its fix belongs in the submodule',
  ],
]);

/** @typedef {{ workspaces?: string[]; scripts?: Partial<Record<string, string>> }} PackageManifest */

/**
 * @param {string} directory
 * @returns {PackageManifest}
 */
const readPackage = (directory) => JSON.parse(readFileSync(join(ROOT, directory, 'package.json'), 'utf8'));
const tracked = run('git', ['-C', ROOT, 'ls-files', '-z']).split('\0').filter(Boolean);
/** @param {string} output */
const listed = (output) =>
  output
    .split('\n')
    .filter(Boolean)
    .map((path) => relative(ROOT, path));

const workspaceChecked = () => {
  const trackedSet = new Set(tracked);
  // Submodule workspaces have their own checks; their files are not tracked here.
  const workspaces = (readPackage('.').workspaces ?? []).filter(
    (workspace) => trackedSet.has(`${workspace}/package.json`) && readPackage(workspace).scripts?.typecheck,
  );
  if (workspaces.length === 0) {
    throw new Error('no workspace defines a typecheck script');
  }
  return workspaces.flatMap((workspace) =>
    listed(run('npm', ['run', '--silent', '--workspace', workspace, 'typecheck', '--', '--listFilesOnly'])),
  );
};

const WORDS = /\s+/;
// The programs the root typecheck script runs, so a tsconfig no script runs cannot count as coverage.
const rootChecked = () => {
  const typecheck = readPackage('.').scripts?.typecheck;
  if (!typecheck) {
    throw new Error('the root package defines no typecheck script');
  }
  return typecheck.split('&&').flatMap((command) => {
    const [tool, ...options] = command.trim().split(WORDS);
    if (tool !== 'tsc') {
      throw new Error(`the root typecheck runs something other than tsc: ${command}`);
    }
    return listed(run('npx', ['tsc', ...options, '--listFilesOnly']));
  });
};

test('every tracked TypeScript source is in a workspace typecheck program', () => {
  const sources = tracked.filter(isSource);
  assert.ok(sources.length > 0, 'git listed no TypeScript sources');
  const checked = new Set(workspaceChecked());
  assert.deepEqual(
    sources.filter((path) => !checked.has(path)),
    [],
  );
});

test('every tracked JavaScript file is in a typecheck program or unchecked for a stated reason', () => {
  const scripts = tracked.filter((path) => JAVASCRIPT.test(path));
  assert.ok(scripts.length > 0, 'git listed no JavaScript files');
  const checked = new Set([...rootChecked(), ...workspaceChecked()]);
  /** @param {string} path */
  const exclusionOf = (path) => [...UNCHECKED_JAVASCRIPT.keys()].find((entry) => path.startsWith(entry));
  assert.deepEqual(
    scripts.filter((path) => !checked.has(path) && exclusionOf(path) === undefined),
    [],
    'add each file to a typecheck program, or to UNCHECKED_JAVASCRIPT with its reason',
  );
  // A stale exclusion would silently admit a later file under its path.
  for (const entry of UNCHECKED_JAVASCRIPT.keys()) {
    const covered = scripts.filter((path) => exclusionOf(path) === entry);
    assert.ok(covered.length > 0, `${entry} excludes no tracked JavaScript file`);
    assert.deepEqual(
      covered.filter((path) => checked.has(path)),
      [],
      `${entry} excludes files a program checks`,
    );
  }
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
