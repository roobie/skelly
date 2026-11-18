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

/** @typedef {{ files: string[]; checksJavaScript: boolean }} Program */

/**
 * A program reads JavaScript for its types under allowJs alone, so its JavaScript counts as checked only
 * under checkJs.
 * @param {readonly string[]} options the compiler options that select the program
 * @param {string} listing the program's file list
 * @returns {Program}
 */
const program = (options, listing) => ({
  files: listed(listing),
  checksJavaScript: JSON.parse(run('npx', ['tsc', ...options, '--showConfig'])).compilerOptions?.checkJs === true,
});

// Submodule workspaces are typechecked by the submodule's own CI, and a pin bump is the only way their
// code changes here; their files are not tracked here.
/** @returns {string[]} */
const typecheckWorkspaces = () => {
  const trackedSet = new Set(tracked);
  const workspaces = (readPackage('.').workspaces ?? []).filter(
    (workspace) => trackedSet.has(`${workspace}/package.json`) && readPackage(workspace).scripts?.typecheck,
  );
  if (workspaces.length === 0) {
    throw new Error('no workspace defines a typecheck script');
  }
  return workspaces;
};

/**
 * @param {string} workspace
 * @returns {Program}
 */
const workspaceProgram = (workspace) =>
  program(
    ['-p', workspace],
    run('npm', ['run', '--silent', '--workspace', workspace, 'typecheck', '--', '--listFilesOnly']),
  );

/** @typedef {{ tscOptions: string[][]; workspaces: string[] }} RootTypecheck */

const WORDS = /\s+/;
const WORKSPACE_TYPECHECK = ['npm', 'run', 'typecheck'];
/**
 * What the root typecheck script runs: its own tsc programs and the workspaces whose typecheck it runs.
 * @returns {RootTypecheck}
 */
const rootTypecheck = () => {
  const typecheck = readPackage('.').scripts?.typecheck;
  if (!typecheck) {
    throw new Error('the root package defines no typecheck script');
  }
  /** @type {RootTypecheck} */
  const root = { tscOptions: [], workspaces: [] };
  for (const command of typecheck.split('&&')) {
    const words = command.trim().split(WORDS);
    if (words[0] === 'tsc') {
      root.tscOptions.push(words.slice(1));
    } else if (WORKSPACE_TYPECHECK.every((word, index) => words[index] === word)) {
      const flags = words.slice(WORKSPACE_TYPECHECK.length);
      for (let index = 0; index < flags.length; index += 2) {
        const [flag, workspace] = flags.slice(index, index + 2);
        if (flag !== '--workspace' || workspace === undefined) {
          throw new Error(`the root typecheck passes npm something other than --workspace: ${command}`);
        }
        root.workspaces.push(workspace);
      }
    } else {
      throw new Error(`the root typecheck runs something other than tsc or a workspace typecheck: ${command}`);
    }
  }
  return root;
};

// Only the programs the root typecheck script runs count as coverage, because the root script is the gate
// the pre-push hook runs.
/** @returns {Program[]} */
const rootPrograms = () => {
  const { tscOptions, workspaces } = rootTypecheck();
  return [
    ...tscOptions.map((options) => program(options, run('npx', ['tsc', ...options, '--listFilesOnly']))),
    ...workspaces.map(workspaceProgram),
  ];
};

/** @type {Program[] | undefined} */
let typecheckPrograms;
// Every program the root typecheck runs, listed once for all the tests that read them.
const allPrograms = () => {
  typecheckPrograms ??= rootPrograms();
  return typecheckPrograms;
};

// A workspace typechecked only by its own path-filtered CI job let a type error in a presentation test pass the
// pre-push hook.
test('the root typecheck runs every tracked workspace typecheck', () => {
  assert.deepEqual(
    rootTypecheck().workspaces.toSorted(),
    typecheckWorkspaces().toSorted(),
    'add each workspace with a typecheck script to the root typecheck script',
  );
});

test('every tracked TypeScript source is in a typecheck program', () => {
  const sources = tracked.filter(isSource);
  assert.ok(sources.length > 0, 'git listed no TypeScript sources');
  const checked = new Set(allPrograms().flatMap(({ files }) => files));
  assert.deepEqual(
    sources.filter((path) => !checked.has(path)),
    [],
  );
});

test('every tracked JavaScript file is in a typecheck program or unchecked for a stated reason', () => {
  const scripts = tracked.filter((path) => JAVASCRIPT.test(path));
  assert.ok(scripts.length > 0, 'git listed no JavaScript files');
  const checked = new Set(
    allPrograms()
      .filter(({ checksJavaScript }) => checksJavaScript)
      .flatMap(({ files }) => files),
  );
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
    .concat(`${stages}/stageGlobals.ts`);
  assert.ok(expected.length > 1, 'git listed no stage scripts');
  assert.deepEqual(
    expected.filter((path) => !checked.has(path)),
    [],
  );
});

// A type imported from the globals module once pulled it into deadvox's program, declaring stage page globals
// for code that never runs in a stage page.
test('only the browser stage program declares the stage page globals', () => {
  const globals = 'packages/deadvox/test/browser/stageGlobals.ts';
  const declaring = allPrograms().filter(({ files }) => files.includes(globals));
  assert.equal(declaring.length, 1);
});
