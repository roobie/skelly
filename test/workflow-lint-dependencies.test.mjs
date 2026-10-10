import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORKFLOWS = join(ROOT, '.github/workflows');
const WORKFLOW_FILE = /\.ya?ml$/;
const ROOT_CI_COMMAND = /\bnpm\s+run\s+ci(?:\s|$)/;
const PREFIX_INSTALL = /\bnpm\s+ci\s+--prefix(?:=|\s+)([^\s\\]+)/g;
const CACHE_PATH_SEPARATOR = /\s+/;
const COMMAND_LINE_SEPARATOR = /\r?\n/;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=\S+$/;
const TIMEOUT_VALUE = /^\d+$/;
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
const pagesWorkflow = parse(read('.github/workflows/pages.yml'));
const gungenWorkflow = parse(read('.github/workflows/gungen.yml'));
const deadvoxWorkflow = parse(read('.github/workflows/deadvox.yml'));
const mobgenWorkflow = parse(read('.github/workflows/mobgen.yml'));
const commandLinesIn = (value) =>
  commandsIn(value)
    .flatMap((script) => script.split(COMMAND_LINE_SEPARATOR))
    .map((command) => command.trim())
    .filter((command) => command !== '' && !command.startsWith('#'));
const normalizeCommand = (line) => {
  const tokens = line.trim().split(CACHE_PATH_SEPARATOR);
  while (tokens.length > 0) {
    if (ENV_ASSIGNMENT.test(tokens[0])) {
      tokens.shift();
    } else if (tokens[0] === 'timeout' && TIMEOUT_VALUE.test(tokens[1] ?? '')) {
      tokens.splice(0, 2);
    } else {
      break;
    }
  }
  return tokens.join(' ');
};
const commandIsCovered = (expected, actual) => {
  const expectedCommand = normalizeCommand(expected);
  const actualCommand = normalizeCommand(actual);
  return actualCommand === expectedCommand || actualCommand.startsWith(`${expectedCommand} `);
};
const workflowIncludesPath = (workflow, event, file) => {
  let included = false;
  for (const pattern of workflow.on[event].paths ?? []) {
    const excluded = pattern.startsWith('!');
    if (matchesGlob(file, excluded ? pattern.slice(1) : pattern)) {
      included = !excluded;
    }
  }
  return included;
};

test('Pages project checks run in their PR workflows', () => {
  const projects = [
    { name: 'Gungen', pageStep: 'Check and build gungen', workflow: gungenWorkflow, job: 'check' },
    { name: 'Deadvox', pageStep: 'Check and build deadvox', workflow: deadvoxWorkflow, job: 'fast' },
    { name: 'Mobgen', pageStep: 'Check and build mobgen', workflow: mobgenWorkflow, job: 'check' },
  ];

  for (const { name, pageStep, workflow, job } of projects) {
    const step = pagesWorkflow.jobs.build.steps.find(({ name: stepName }) => stepName === pageStep);
    assert.ok(step, `Pages workflow has a ${name} build step`);
    const pagesCommands = commandLinesIn(step);
    const prCommands = commandLinesIn(workflow.jobs[job]);
    assert.ok(pagesCommands.length > 0, `Pages ${name} step has commands`);

    for (const command of pagesCommands) {
      assert.ok(
        prCommands.some((prCommand) => commandIsCovered(command, prCommand)),
        `${name} PR checks run Pages command: ${command}`,
      );
    }
  }
});

test('Gungen PR filters include representative Deadvox and Mobgen import files', () => {
  const importedFiles = ['deadvox/src/core/amalgamFigure.ts', 'mobgen/src/core/generate.ts'];
  for (const event of ['push', 'pull_request']) {
    for (const file of importedFiles) {
      assert.ok(workflowIncludesPath(gungenWorkflow, event, file), `Gungen ${event} filter includes ${file}`);
    }
  }
});

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
