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
const PREFIX_INSTALL = /\bnpm\s+ci\s+--prefix(?:=|\s+)([^\s\\]+)/g;
const CACHE_PATH_SEPARATOR = /\s+/;
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const workflowPaths = readdirSync(WORKFLOWS)
  .filter((file) => WORKFLOW_FILE.test(file))
  .map((file) => join(WORKFLOWS, file));
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
const commandsIn = (value) => {
  const commands = [];
  visitProperties(value, (key, child) => {
    if (key === 'run' && typeof child === 'string') {
      commands.push(child);
    }
  });
  return commands;
};
const installPrefixes = (commands) => {
  const prefixes = new Set();
  for (const command of commands) {
    for (const match of command.matchAll(PREFIX_INSTALL)) {
      prefixes.add(match[1]);
    }
  }
  return prefixes;
};
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
test('every workflow running root CI installs lint workflow prefixes and caches their lockfiles', () => {
  assert.ok(requiredPrefixes.size > 0, 'lint workflow declares prefix installs');
  const runningRootCi = workflowPaths
    .map((path) => ({ path, workflow: parse(readFileSync(path, 'utf8')) }))
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
