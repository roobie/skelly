import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';

const requireValue = (condition, message = 'Invalid browser CI definition') => {
  if (!condition) {
    throw new Error(message);
  }
};
const requireEqual = (value, expected, message) => requireValue(isDeepStrictEqual(value, expected), message);

export const quarantinedScripts = {
  'test:browser:melee-build-click': 'Positive-control/first-load failures; #224.',
  'test:browser:firefox:save-storage': 'OPFS capability-probe deadline; #224.',
  'test:browser:firefox:native': 'Intermittent native pointer-lock refusal; #168.',
  'test:browser:firefox:continue': 'Intermittent Continue canvas wait; #170.',
};

const whitespace = /\s+/;
const assignment = /^[A-Z][A-Z0-9_]*=/;
const relativeNode = /^node \.\//;
const expression = (body) => `\${{ ${body} }}`;

export function parseCommand(text) {
  const words = text.trim().split(whitespace);
  const env = {};
  while (words.length > 0) {
    if (assignment.test(words[0])) {
      const [name, ...value] = words.shift().split('=');
      env[name] = value.join('=');
    } else if (words[0] === 'timeout') {
      words.splice(0, 2);
    } else if (words[0] === 'xvfb-run') {
      words.splice(0, words[1] === '-a' ? 2 : 1);
    } else {
      break;
    }
  }
  return { env, command: words.join(' ').replace(relativeNode, 'node ') };
}

export const describeStage = ({ env, command }) =>
  [
    ...Object.entries(env)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`),
    command,
  ].join(' ');
export const stagesOf = (script) => script.split('&&').map(parseCommand);
const isBrowser = ({ command }) =>
  command.startsWith('node test/browser/') || command === 'node tools/ui-browser-contract.mjs';
const stepStages = (step) =>
  stagesOf(step.run ?? '')
    .map((stage) => ({ ...stage, env: { ...step.env, ...stage.env } }))
    .filter(isBrowser);
export const browserStagesOfScripts = (scripts) =>
  Object.fromEntries(
    Object.entries(scripts)
      .map(([name, script]) => [name, stagesOf(script).filter(isBrowser)])
      .filter(([, stages]) => stages.length),
  );

export function coveredStagesIn(workflow) {
  const jobs = parse(workflow).jobs ?? {};
  return new Set(
    Object.values(jobs)
      .filter((job) => !('if' in job || 'continue-on-error' in job))
      .flatMap((job) =>
        (job.steps ?? [])
          .filter((step) => !('if' in step || 'continue-on-error' in step))
          .flatMap(stepStages)
          .map(describeStage),
      ),
  );
}

const routePattern = /^\$\{\{ inputs\.shard == 'all' \|\| inputs\.shard == '([\w-]+)' \}\}$/;
const reusablePath = './.github/workflows/deadvox-browser.yml';

const matrixShards = (jobs) => {
  requireEqual(jobs.browser.uses, reusablePath, 'matrix must execute the checked reusable workflow');
  requireEqual(jobs.serial.uses, reusablePath, 'serial must execute the same reusable workflow');
  requireEqual(jobs.browser.with.shard, expression('matrix.shard'));
  requireEqual(jobs.serial.with.shard, 'all');
  requireEqual(jobs.browser.if, expression("github.event.inputs.layout != 'serial'"), 'matrix must not be draft-gated');
  requireEqual(
    jobs.serial.if,
    expression(
      "github.event_name == 'workflow_dispatch' && (github.event.inputs.layout == 'serial' || github.event.inputs.layout == 'pilot')",
    ),
    'control layout selection drifted',
  );
  requireEqual(jobs.browser.strategy['fail-fast'], false, 'a failed shard must not cancel its siblings');
  const shards = jobs.browser.strategy.matrix.shard;
  requireValue(Array.isArray(shards) && shards.length > 0, 'empty shard matrix');
  return shards;
};

const partitionSteps = (reusable, shards) => {
  const steps = Object.values(parse(reusable).jobs).flatMap((job) => {
    requireValue(
      !('if' in job || 'continue-on-error' in job || 'env' in job),
      'reusable job cannot silently alter coverage',
    );
    return job.steps;
  });
  const full = [];
  const partition = Object.fromEntries(shards.map((name) => [name, []]));
  for (const step of steps) {
    const stages = stepStages(step);
    if (stages.length === 0) {
      continue;
    }
    requireValue(!('continue-on-error' in step), 'browser failures cannot be optional');
    const route = step.if?.match(routePattern)?.[1];
    requireValue(route && Object.hasOwn(partition, route), `unsupported browser route: ${step.if}`);
    for (const stage of stages) {
      const key = describeStage(stage);
      full.push(key);
      partition[route].push(key);
    }
  }
  return { full, partition };
};

export function browserManifest({ caller, reusable, scripts }) {
  const shards = matrixShards(parse(caller).jobs);
  const { full, partition } = partitionSteps(reusable, shards);
  const declared = browserStagesOfScripts(scripts);
  const expected = new Set(
    Object.entries(declared)
      .filter(([name]) => !Object.hasOwn(quarantinedScripts, name))
      .flatMap(([, stages]) => stages.map(describeStage)),
  );
  requireValue(expected.size > 0 && full.length > 0, 'no browser cases observed');
  requireEqual(
    [...new Set(full)].sort(),
    [...expected].sort(),
    'full workflow differs from enabled package-script cases',
  );
  requireEqual(full.length, new Set(full).size, 'serial workflow runs a case twice');
  const union = shards.flatMap((name) => partition[name]);
  requireEqual([...union].sort(), [...full].sort(), 'shard union must run every full-suite case exactly once');
  requireValue(
    shards.every((name) => partition[name].length > 0),
    'empty shard',
  );
  return { full, partition };
}

export function repositoryManifest(root = dirname(dirname(fileURLToPath(import.meta.url)))) {
  const read = (path) => readFileSync(join(root, path), 'utf8');
  return browserManifest({
    caller: read('.github/workflows/deadvox.yml'),
    reusable: read('.github/workflows/deadvox-browser.yml'),
    scripts: JSON.parse(read('deadvox/package.json')).scripts,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(repositoryManifest(), null, 2)}\n`);
}
