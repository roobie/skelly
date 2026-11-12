import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
const deadvox = readWorkflow('deadvox.yml');

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

test('Pages project checks run in their PR workflows', () => {
  const projects = [{ name: 'Deadvox', pageStep: 'Check and build deadvox', workflow: deadvox, job: ['fast', 'unit'] }];

  for (const { name, pageStep, workflow, job } of projects) {
    const step = pages.jobs.build.steps.find(({ name: stepName }) => stepName === pageStep);
    assert.ok(step, `Pages workflow has a ${name} build step`);
    const pagesCommands = commandLinesIn([step]);
    const prCommands = [job].flat().flatMap((jobName) => commandLinesIn(workflow.jobs[jobName].steps));
    assert.ok(pagesCommands.length > 0, `Pages ${name} step has commands`);

    for (const command of pagesCommands) {
      assert.ok(
        prCommands.some((prCommand) => commandIsCovered(command, prCommand)),
        `${name} PR checks run Pages command: ${command}`,
      );
    }
  }
});

test('Pages assembly puts project builds beside the Round 1 page', () => {
  const assembly = pages.jobs.build.steps.find((step) => step.name === 'Assemble the site');
  assert.ok(assembly?.run, 'Pages workflow has an assembly command');

  const temp = mkdtempSync(join(tmpdir(), 'skelly-pages-assembly-'));
  try {
    cpSync(join(ROOT, 'site'), join(temp, 'site'), { recursive: true });
    const dist = join(temp, 'packages/deadvox/dist');
    mkdirSync(dist, { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<main>packages/deadvox</main>');
    cpSync(join(ROOT, 'tools/pages-analytics'), join(temp, 'tools/pages-analytics'), { recursive: true });

    execFileSync('bash', ['-euo', 'pipefail', '-c', assembly.run], { cwd: temp });

    assert.ok(existsSync(join(temp, '_site', 'deadvox', 'index.html')), 'deadvox index is at its Pages path');
    assert.ok(
      existsSync(join(temp, '_site', 'deadvox', 'playtest', 'round1', 'index.html')),
      'the Round 1 page stays beside the Deadvox game',
    );
    const assembled = (path) => readFileSync(join(temp, '_site', path), 'utf8');
    // The game build injects its own script, so assembly must leave its page untouched.
    assert.equal(assembled('deadvox/index.html'), '<main>packages/deadvox</main>');
    for (const page of ['index.html', 'deadvox/playtest/round1/index.html']) {
      assert.equal(assembled(page).split('simpleanalyticscdn').length - 1, 1, `${page} loads the script once`);
    }
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
