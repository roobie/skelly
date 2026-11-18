import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORKFLOWS = join(ROOT, '.github/workflows');
const WORKFLOW_FILE = /\.ya?ml$/;
const ROOT_CI_COMMAND = /\bnpm\s+run\s+ci(?:\s|$)/;
const CONTENT_CHECK_COMMAND = /\bnpm run content:check\b/;
const TYPECHECK_COMMAND = /\bnpm run typecheck\b/;
const ENGINE_BOUNDARY_INSTALL = /\bnpm ci --prefix \.\.\/\.\.\/tools\/lit-check\b/;
const SHARED_CHECKS_COMMAND = /\bnpm run ci:checks\b/;
const PRE_PUSH_SHARED_CHECKS = /run_check 'npm run ci:checks' run ci:checks/;
const ASSETS_SETUP_COMMAND = /\bassets:setup\b/;
const RELEASE_PIN_HASH = /hashFiles\('tools\/skelly-assets\/release\.json'\)/;
const RELEASE_CACHE_PATHS = ['tools/skelly-assets/archives'];
const PREFIX_INSTALL = /\bnpm\s+ci\s+--prefix(?:=|\s+)([^\s\\]+)/g;
const CACHE_PATH_SEPARATOR = /\s+/;
/** @typedef {{ uses?: string, run?: string, with?: Record<string, unknown> }} WorkflowStep */
/**
 * @typedef {{
 *   on?: Record<string, { paths: string[] }>,
 *   jobs?: Record<string, { steps?: WorkflowStep[] }>,
 * }} Workflow
 */

/** @param {string} path */
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
/**
 * @param {string} path
 * @returns {Workflow}
 */
const readWorkflow = (path) => parse(readFileSync(path, 'utf8'));
const workflowPaths = readdirSync(WORKFLOWS)
  .filter((file) => WORKFLOW_FILE.test(file))
  .map((file) => join(WORKFLOWS, file));
/**
 * @param {unknown} value
 * @param {(key: string, child: unknown) => void} visit
 */
const visitProperties = (value, visit) => {
  if (Array.isArray(value)) {
    for (const child of value) {
      visitProperties(child, visit);
    }
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      visit(key, child);
      visitProperties(child, visit);
    }
  }
};
/** @param {unknown} value */
const commandsIn = (value) => {
  /** @type {string[]} */
  const commands = [];
  visitProperties(value, (key, child) => {
    if (key === 'run' && typeof child === 'string') {
      commands.push(child);
    }
  });
  return commands;
};
/** @param {string[]} commands */
const installPrefixes = (commands) => {
  /** @type {Set<string>} */
  const prefixes = new Set();
  for (const command of commands) {
    for (const [, prefix] of command.matchAll(PREFIX_INSTALL)) {
      if (prefix) {
        prefixes.add(prefix);
      }
    }
  }
  return prefixes;
};
/** @param {Workflow} workflow */
const nodeCacheDependencyPathsIn = (workflow) =>
  Object.values(workflow.jobs ?? {}).flatMap((job) =>
    (job.steps ?? [])
      .filter(
        (step) =>
          typeof step.uses === 'string' &&
          step.uses.startsWith('actions/setup-node@') &&
          step.with?.['cache-dependency-path'] !== undefined,
      )
      .map((step) => {
        const path = step.with?.['cache-dependency-path'];
        return Array.isArray(path) ? path.join('\n') : String(path ?? '');
      }),
  );

const lintCommands = commandsIn(parse(read('.github/workflows/lint.yml')));
const requiredPrefixes = installPrefixes(lintCommands);
const packageScripts = JSON.parse(read('package.json')).scripts;

test('CI keeps the generated-content check while the pre-push hook runs the shared checks', () => {
  assert.match(packageScripts.ci, CONTENT_CHECK_COMMAND);
  assert.match(packageScripts.ci, SHARED_CHECKS_COMMAND);
  assert.match(read('.githooks/pre-push'), PRE_PUSH_SHARED_CHECKS);

  for (const commands of [lintCommands, commandsIn(parse(read('.github/workflows/pages.yml')))]) {
    assert.ok(
      commands.some((command) => ROOT_CI_COMMAND.test(command)),
      'CI workflow runs root CI',
    );
  }
});

test('every workflow running root CI installs lint workflow prefixes and caches their lockfiles', () => {
  assert.ok(requiredPrefixes.size > 0, 'lint workflow declares prefix installs');
  const runningRootCi = workflowPaths
    .map((path) => ({ path, workflow: readWorkflow(path) }))
    .filter(({ workflow }) => commandsIn(workflow).some((command) => ROOT_CI_COMMAND.test(command)));

  assert.ok(runningRootCi.length > 0, 'at least one workflow runs root CI');
  for (const { path, workflow } of runningRootCi) {
    const installed = installPrefixes(commandsIn(workflow));
    assert.deepEqual(
      [...requiredPrefixes].filter((prefix) => !installed.has(prefix)),
      [],
      `${path} must install all npm prefixes installed by lint.yml`,
    );

    for (const cachePaths of nodeCacheDependencyPathsIn(workflow)) {
      const entries = new Set(cachePaths.split(CACHE_PATH_SEPARATOR).filter(Boolean));
      const missing = [...requiredPrefixes].filter((prefix) => !entries.has(`${prefix}/package-lock.json`));
      assert.deepEqual(missing, [], `${path} cache-dependency-path must include every lint prefix lockfile`);
    }
  }
});

test('engine typecheck installs and tracks the boundary compiler dependency', () => {
  const workflow = readWorkflow(join(WORKFLOWS, 'engine.yml'));
  const steps = workflow.jobs?.check?.steps ?? [];
  const check = steps.findIndex((step) => TYPECHECK_COMMAND.test(step.run ?? ''));
  const install = steps.findIndex((step) => ENGINE_BOUNDARY_INSTALL.test(step.run ?? ''));
  assert.ok(check >= 0, 'engine runs its typecheck');
  assert.ok(install >= 0 && install < check, 'boundary compiler is installed before typecheck');
  for (const trigger of ['push', 'pull_request']) {
    assert.ok(
      workflow.on?.[trigger]?.paths.includes('tools/lit-check/**'),
      `${trigger} tracks the compiler dependency`,
    );
  }
  const caches = nodeCacheDependencyPathsIn(workflow);
  assert.ok(caches.length > 0, 'engine caches its npm dependencies');
  for (const paths of caches) {
    assert.ok(paths.split(CACHE_PATH_SEPARATOR).includes('tools/lit-check/package-lock.json'));
  }
});

test('every pinned skelly-assets install follows a release cache that lets setup skip the download', () => {
  // A release outage must not fail CI; the cache holds the archives whose digests setup verifies against the pin (#1665).
  let installs = 0;
  for (const path of workflowPaths) {
    for (const [jobId, job] of Object.entries(readWorkflow(path).jobs ?? {})) {
      const steps = job.steps ?? [];
      steps.forEach((step, index) => {
        if (typeof step.run !== 'string' || !ASSETS_SETUP_COMMAND.test(step.run)) {
          return;
        }
        installs += 1;
        const cache = steps.slice(0, index).find((earlier) => {
          if (typeof earlier.uses !== 'string' || !earlier.uses.startsWith('actions/cache@')) {
            return false;
          }
          const cached = new Set(String(earlier.with?.path ?? '').split(CACHE_PATH_SEPARATOR));
          return (
            RELEASE_CACHE_PATHS.every((releasePath) => cached.has(releasePath)) &&
            RELEASE_PIN_HASH.test(String(earlier.with?.key ?? ''))
          );
        });
        assert.ok(cache, `${path} ${jobId}: assets:setup needs a preceding cache of the pinned release archives`);
      });
    }
  }
  assert.ok(installs > 0, 'at least one workflow installs the pinned skelly-assets release');
});
