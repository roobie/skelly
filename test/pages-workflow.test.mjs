import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, matchesGlob } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DISPATCH_CONDITION = /github\.event_name\s*==\s*['"]workflow_dispatch['"]/;
const DISPATCH_REFS = /&&|github\.ref/;
const FREEZE_ENABLED = /vars\.PAGES_FREEZE\s*!=\s*['"]true['"]/;
const MAIN_REF = /\bmain\b/;
const REF_GUARD = /github\.ref|refs\/heads/;
const EXPRESSION_START = /^\s*\$\{\{\s*/;
const EXPRESSION_END = /\s*\}\}\s*$/;
const DISJUNCTION = /\s*\|\|\s*/;
const OUTER_PARENS = /^\(+|\)+$/g;
const COMMAND_LINE_SEPARATOR = /\r?\n/;
const WHITESPACE = /\s+/;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=\S+$/;
const TIMEOUT_VALUE = /^\d+$/;
const readWorkflow = (name) => parse(readFileSync(join(ROOT, '.github/workflows', name), 'utf8'));
const pages = readWorkflow('pages.yml');
const gungen = readWorkflow('gungen.yml');
const deadvox = readWorkflow('deadvox.yml');
const mobgen = readWorkflow('mobgen.yml');

const disjuncts = (condition) =>
  condition
    .replace(EXPRESSION_START, '')
    .replace(EXPRESSION_END, '')
    .split(DISJUNCTION)
    .map((part) => part.replace(OUTER_PARENS, '').trim());
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
  const importedFiles = ['deadvox/src/core/amalgamFigure.ts', 'mobgen/src/core/generate.ts'];
  for (const event of ['push', 'pull_request']) {
    for (const file of importedFiles) {
      assert.ok(workflowIncludesPath(gungen, event, file), `Gungen ${event} filter includes ${file}`);
    }
  }
});

test('Pages freeze gate lets workflow dispatch deploy from a hotfix ref', () => {
  assert.ok(Object.hasOwn(pages.on, 'workflow_dispatch'), 'the Pages workflow supports manual dispatch');

  for (const name of ['build', 'deploy']) {
    const job = pages.jobs[name];
    assert.doesNotMatch(String(job.if), REF_GUARD, `${name} gate does not restrict the ref`);
    for (const [index, step] of job.steps.entries()) {
      assert.doesNotMatch(String(step.if ?? ''), REF_GUARD, `${name} step ${index} does not restrict the ref`);
    }
    const clauses = disjuncts(job.if);
    const freeze = clauses.find((clause) => clause.includes('vars.PAGES_FREEZE'));
    assert.ok(freeze, `${name} checks the freeze variable`);
    assert.match(freeze, FREEZE_ENABLED, `${name} skips when the freeze is true`);
    const dispatch = clauses.find((clause) => DISPATCH_CONDITION.test(clause));
    assert.ok(dispatch, `${name} exempts workflow dispatch from the freeze gate`);
    assert.doesNotMatch(dispatch, DISPATCH_REFS, `${name} does not condition dispatch on the ref`);
  }

  const checkout = pages.jobs.build.steps.find((step) => step.uses?.startsWith('actions/checkout@'));
  assert.ok(checkout, 'the build checks out its source');
  assert.doesNotMatch(String(checkout.with?.ref ?? ''), MAIN_REF, 'checkout does not pin the build to main');
});
