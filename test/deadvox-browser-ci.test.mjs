import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// Every browser stage that deadvox's package.json lists must have a step in .github/workflows/deadvox.yml, so
// a stage a PR adds or stops running locally (the tiered test policy runs only the touched ones) cannot silently
// fall out of CI. The one way out is a quarantined script below, with its reason and issue.
const quarantinedScripts = {
  'test:browser:firefox:native':
    'Quarantined (no-flaky rule): Firefox refuses the pointer lock under a real user activation, intermittently. https://github.com/roobie/skelly/issues/168',
  'test:browser:firefox:continue':
    'Quarantined (no-flaky rule): after Continue, the wait for a visible #view canvas intermittently times out. https://github.com/roobie/skelly/issues/170',
};

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const ENV_ASSIGNMENT = /^[A-Z][A-Z0-9_]*=/;
const ENTRY = /^([\w-]+):\s*(.*)$/;
const BLOCK_SCALAR = /^[|>]/;
const QUOTED = /^(['"])(.*)\1$/;
const WHITESPACE = /\s+/;

// `SAVE_AUTOSAVE_ONLY=1 timeout 300 node test/x.mjs chromium` and `xvfb-run -a node test/x.mjs chromium` name the
// same stage as `node test/x.mjs chromium` once the wrappers are stripped; the env assignments still tell
// stages of one script apart.
const parseCommand = (text) => {
  const words = text.trim().split(WHITESPACE);
  const env = {};
  while (words.length > 0) {
    const [word] = words;
    if (ENV_ASSIGNMENT.test(word)) {
      const [name, ...value] = words.shift().split('=');
      env[name] = value.join('=');
    } else if (word === 'timeout') {
      words.splice(0, 2);
    } else if (word === 'xvfb-run') {
      words.splice(0, words[1] === '-a' ? 2 : 1);
    } else {
      break;
    }
  }
  return { env, command: words.join(' ') };
};

const describeStage = ({ env, command }) =>
  [
    ...Object.entries(env)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]) => `${name}=${value}`),
    command,
  ].join(' ');

const stagesOf = (script) => script.split('&&').map(parseCommand);

// Applies one `key: value` line of a step and returns the key whose indented lines follow, if any.
const readEntry = (step, entry) => {
  const [, key, value] = entry.match(ENTRY) ?? [];
  const nested = value === '' || BLOCK_SCALAR.test(value ?? '');
  if (key === 'if' || key === 'continue-on-error') {
    step.coverageExcluded = true;
  }
  if (key === 'run' && !nested) {
    step.run.push(value);
  }
  return nested ? key : undefined;
};

const readNested = (step, key, body) => {
  if (key === 'run') {
    step.run.push(body);
  } else if (key === 'env') {
    const [, name, value] = body.match(ENTRY) ?? [];
    step.env[name] = value.replace(QUOTED, '$2');
  }
};

// Reads one line of a `steps:` list; `depth` is its indent beyond the `steps:` key. Items sit 2 deeper and
// their keys 4 deeper, anything further belongs to the key `state.open` names.
const readStepLine = (state, steps, depth, body) => {
  if (depth === 2 && body.startsWith('- ')) {
    state.step = { env: {}, run: [] };
    steps.push(state.step);
    state.open = readEntry(state.step, body.slice(2));
  } else if (depth === 4) {
    state.open = readEntry(state.step, body);
  } else if (state.open) {
    readNested(state.step, state.open, body);
  }
};

// Just enough of the workflow's YAML to read each step's `run` lines and `env` map. Comments are skipped, so a
// quarantined step that is commented out (its reinstatement recipe) never counts as coverage.
const workflowSteps = (text) => {
  const steps = [];
  const state = {};
  let listIndent = -1; // indent of the `steps:` key whose list we are inside, or -1
  const lines = text
    .split('\n')
    .map((line) => ({ indent: line.length - line.trimStart().length, body: line.trim() }))
    .filter(({ body }) => body !== '' && !body.startsWith('#'));
  for (const { indent, body } of lines) {
    if (body === 'steps:') {
      listIndent = indent;
    } else if (indent <= listIndent) {
      listIndent = -1;
    } else if (listIndent >= 0) {
      readStepLine(state, steps, indent - listIndent, body);
    }
  }
  return steps;
};

const { scripts } = JSON.parse(read('deadvox/package.json'));
const browserStages = Object.fromEntries(
  Object.entries(scripts)
    .map(([name, script]) => [
      name,
      stagesOf(script).filter(
        ({ command }) => command.startsWith('node test/browser/') || command === 'node tools/ui-browser-contract.mjs',
      ),
    ])
    .filter(([, stages]) => stages.length > 0),
);
const covered = new Set(
  workflowSteps(read('.github/workflows/deadvox.yml'))
    .filter((step) => !step.coverageExcluded)
    .flatMap((step) =>
      step.run.flatMap((run) =>
        run.split('&&').map((part) => {
          const stage = parseCommand(part);
          return describeStage({ env: { ...step.env, ...stage.env }, command: stage.command });
        }),
      ),
    ),
);
const browserScripts = Object.keys(browserStages);
const uncovered = (name) => browserStages[name].map(describeStage).filter((stage) => !covered.has(stage));

describe('deadvox CI runs every browser stage package.json lists', () => {
  it('selects stages by browser command content', () => {
    assert.ok(browserScripts.length > 0, 'no deadvox browser stages selected');
  });

  it('has a workflow step for each stage of every browser script that is not quarantined', () => {
    const missing = browserScripts
      .filter((name) => !(name in quarantinedScripts))
      .flatMap((name) => uncovered(name).map((stage) => `${name}: ${stage}`));
    assert.deepEqual(
      missing,
      [],
      'add a step to .github/workflows/deadvox.yml, or quarantine the script with an issue',
    );
  });

  it('quarantines only scripts that still exist and still have no workflow step', () => {
    for (const [name, reason] of Object.entries(quarantinedScripts)) {
      assert.ok(name in scripts, `${name} is gone from deadvox/package.json: drop it from the quarantine (${reason})`);
      assert.equal(
        uncovered(name).length,
        stagesOf(scripts[name]).length,
        `${name} now has a workflow step: drop it from the quarantine`,
      );
    }
  });
});
