import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, matchesGlob } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const COMMAND_LINE_SEPARATOR = /\r?\n/;
const WHITESPACE = /\s+/;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=\S+$/;
const TIMEOUT_VALUE = /^\d+$/;
const readWorkflow = (name) => parse(readFileSync(join(ROOT, '.github/workflows', name), 'utf8'));
const pages = readWorkflow('pages.yml');
const gungen = readWorkflow('gungen.yml');
const deadvox = readWorkflow('deadvox.yml');
const mobgen = readWorkflow('mobgen.yml');

const commandLinesIn = (steps) =>
  steps
    .flatMap(({ run }) => (typeof run === 'string' ? run.split(COMMAND_LINE_SEPARATOR) : []))
    .map((command) => command.trim())
    .filter((command) => command !== '' && !command.startsWith('#'));
const normalizeCommand = (line) => {
  const tokens = line.trim().split(WHITESPACE);
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
    { name: 'Gungen', pageStep: 'Check and build gungen', workflow: gungen, job: 'check' },
    { name: 'Deadvox', pageStep: 'Check and build deadvox', workflow: deadvox, job: 'fast' },
    { name: 'Mobgen', pageStep: 'Check and build mobgen', workflow: mobgen, job: 'check' },
    {
      name: 'Thing authoring',
      pageStep: 'Check and build thing-authoring-tool',
      workflow: readWorkflow('thing-authoring-tool.yml'),
      job: 'check',
    },
  ];

  for (const { name, pageStep, workflow, job } of projects) {
    const step = pages.jobs.build.steps.find(({ name: stepName }) => stepName === pageStep);
    assert.ok(step, `Pages workflow has a ${name} build step`);
    const pagesCommands = commandLinesIn([step]);
    const prCommands = commandLinesIn(workflow.jobs[job].steps);
    assert.ok(pagesCommands.length > 0, `Pages ${name} step has commands`);

    for (const command of pagesCommands) {
      assert.ok(
        prCommands.some((prCommand) => commandIsCovered(command, prCommand)),
        `${name} PR checks run Pages command: ${command}`,
      );
    }
  }
});

test('Gungen filters include representative Deadvox and Mobgen import files', () => {
  const importedFiles = ['packages/deadvox/src/core/amalgamFigure.ts', 'packages/mobgen/src/core/generate.ts'];
  for (const event of ['push', 'pull_request']) {
    for (const file of importedFiles) {
      assert.ok(workflowIncludesPath(gungen, event, file), `Gungen ${event} filter includes ${file}`);
    }
  }
});

test('thing-export has its own typecheck and unit job covering its dependency paths', () => {
  const workflow = readWorkflow('thing-export.yml');
  const commands = commandLinesIn(workflow.jobs.check.steps);
  assert.ok(commands.includes('npm run typecheck'));
  assert.ok(commands.includes('npm test'));
  for (const event of ['push', 'pull_request']) {
    for (const file of [
      'packages/thing-export/src/physical.ts',
      'packages/engine/src/shapes/solid.ts',
      'packages/thing-core/src/schema.ts',
      'package-lock.json',
    ]) {
      assert.ok(workflowIncludesPath(workflow, event, file), `${event} includes ${file}`);
    }
  }
});

test('Pages assembly puts project builds beside the Round 1 page', () => {
  const assembly = pages.jobs.build.steps.find((step) => step.name === 'Assemble the site');
  assert.ok(assembly?.run, 'Pages workflow has an assembly command');

  const temp = mkdtempSync(join(tmpdir(), 'skelly-pages-assembly-'));
  try {
    cpSync(join(ROOT, 'site'), join(temp, 'site'), { recursive: true });
    for (const project of ['gungen', 'packages/deadvox', 'packages/mobgen', 'packages/thing-authoring-tool']) {
      const dist = join(temp, project, 'dist');
      mkdirSync(dist, { recursive: true });
      writeFileSync(join(dist, 'index.html'), `<main>${project}</main>`);
    }

    execFileSync('bash', ['-euo', 'pipefail', '-c', assembly.run], { cwd: temp });

    for (const project of ['gungen', 'deadvox', 'mobgen', 'thing-authoring-tool']) {
      assert.ok(existsSync(join(temp, '_site', project, 'index.html')), `${project} index is at its Pages path`);
    }
    assert.ok(
      existsSync(join(temp, '_site', 'deadvox', 'playtest', 'round1', 'index.html')),
      'the Round 1 page stays beside the Deadvox game',
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('Pages automatically builds and deploys main without a playtest gate', () => {
  assert.ok(pages.on.push.branches.includes('main'));
  for (const name of ['build', 'deploy']) {
    assert.equal(pages.jobs[name].if, undefined, `${name} is not gated by a playtest`);
  }
});
