import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'yaml';
import { compareCodeUnits } from '../packages/engine/src/core/codeUnitOrder.ts';

/** @typedef {{ env: Record<string, string>, command: string }} Stage */
/** @typedef {{ name?: string, if?: string, run?: string, env?: Record<string, string> }} WorkflowStep */
/**
 * @typedef {{
 *   uses: string,
 *   with: { shard: string },
 *   strategy: { 'fail-fast': boolean, matrix: { shard: string[] } },
 * }} BrowserMatrixJob
 */

/**
 * @param {unknown} condition
 * @param {string} [message]
 * @returns {asserts condition}
 */
function requireValue(condition, message = 'Invalid browser CI definition') {
  if (!condition) {
    throw new Error(message);
  }
}
/**
 * @param {unknown} value
 * @param {unknown} expected
 * @param {string} [message]
 */
const requireEqual = (value, expected, message) => requireValue(isDeepStrictEqual(value, expected), message);

export const quarantinedScripts = {
  'test:browser:chromium:opfs-continue': 'Intermittent production reload timeout after pagehide checkpoint; #1721.',
  'test:browser:chromium:full-auto': 'Outruns its one-minute CI step budget; #1781.',
  'test:browser:optic-pixel': 'Intermittent scope-zoom and fixed-sight pixel contract step timeouts; #1812.',
  'test:browser:chromium:navigation': 'Intermittent bfcache navigation stage timeout; #706.',
  'test:browser:firefox:save-storage': 'OPFS capability-probe deadline; #224.',
  'test:browser:firefox:native': 'Intermittent native pointer-lock refusal; #168.',
  'test:browser:firefox:continue': 'Intermittent Continue canvas wait; #170.',
};

const whitespace = /\s+/;
const assignment = /^[A-Z][A-Z0-9_]*=/;
const relativeNode = /^node \.\//;
/** @param {string} body */
const expression = (body) => `\${{ ${body} }}`;

/**
 * @param {string} text
 * @returns {Stage}
 */
export function parseCommand(text) {
  const words = text.trim().split(whitespace);
  /** @type {Record<string, string>} */
  const env = {};
  for (let [word] = words; word !== undefined; [word] = words) {
    if (assignment.test(word)) {
      words.shift();
      const separator = word.indexOf('=');
      env[word.slice(0, separator)] = word.slice(separator + 1);
    } else if (word === 'timeout') {
      words.splice(0, 2);
    } else if (word === 'xvfb-run') {
      words.splice(0, words[1] === '-a' ? 2 : 1);
    } else {
      break;
    }
  }
  return { env, command: words.join(' ').replace(relativeNode, 'node ') };
}

/** @param {Stage} stage */
export const describeStage = ({ env, command }) =>
  [
    ...Object.entries(env)
      .sort(([a], [b]) => compareCodeUnits(a, b))
      .map(([key, value]) => `${key}=${value}`),
    command,
  ].join(' ');
/** @param {string} script */
export const stagesOf = (script) => script.split('&&').map(parseCommand);
/** @param {Stage} stage */
const isBrowser = ({ command }) => command.startsWith('node test/browser/');
/** @param {WorkflowStep} step */
const stepStages = (step) =>
  stagesOf(step.run ?? '')
    .map((stage) => ({ ...stage, env: { ...step.env, ...stage.env } }))
    .filter(isBrowser);
/**
 * @param {Record<string, string>} scripts
 * @returns {Record<string, Stage[]>}
 */
export function browserStagesOfScripts(scripts) {
  /** @type {Record<string, Stage[]>} */
  const declared = {};
  for (const [name, script] of Object.entries(scripts)) {
    const stages = stagesOf(script).filter(isBrowser);
    if (stages.length > 0) {
      declared[name] = stages;
    }
  }
  return declared;
}

const routePattern = /^\$\{\{ inputs\.shard == '([\w-]+)' \}\}$/;
const diagnosticRoutePattern = /^\$\{\{ !cancelled\(\) && \(inputs\.shard == '([\w-]+)'\) \}\}$/;
const reusablePath = './.github/workflows/deadvox-browser.yml';

/** @param {{ browser: BrowserMatrixJob }} jobs */
const matrixShards = (jobs) => {
  requireEqual(jobs.browser.uses, reusablePath, 'matrix must execute the checked reusable workflow');
  requireEqual(jobs.browser.with.shard, expression('matrix.shard'));
  requireValue(!('if' in jobs.browser), 'matrix must not be draft-gated');
  requireEqual(jobs.browser.strategy['fail-fast'], false, 'a failed shard must not cancel its siblings');
  const shards = jobs.browser.strategy.matrix.shard;
  requireValue(Array.isArray(shards) && shards.length > 0, 'empty shard matrix');
  return shards;
};

/**
 * @param {string} reusable
 * @param {string[]} shards
 */
const partitionSteps = (reusable, shards) => {
  /** @type {WorkflowStep[]} */
  const steps = Object.values(parse(reusable).jobs).flatMap((job) => {
    requireValue(
      !('if' in job || 'continue-on-error' in job || 'env' in job),
      'reusable job cannot silently alter coverage',
    );
    return job.steps;
  });
  /** @type {string[]} */
  const full = [];
  /** @type {Record<string, string[]>} */
  const partition = Object.fromEntries(shards.map((name) => [name, []]));
  for (const step of steps) {
    const stages = stepStages(step);
    if (stages.length === 0) {
      continue;
    }
    requireValue(!('continue-on-error' in step), 'browser failures cannot be optional');
    const [, route] = step.if?.match(routePattern) ?? step.if?.match(diagnosticRoutePattern) ?? [];
    const shard = route && Object.hasOwn(partition, route) ? partition[route] : undefined;
    requireValue(shard, `unsupported browser route: ${step.if}`);
    for (const stage of stages) {
      const key = describeStage(stage);
      full.push(key);
      shard.push(key);
    }
  }
  return { full, partition };
};

/**
 * @param {{ caller: string, reusable: string, scripts: Record<string, string> }} sources
 */
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
  requireEqual(full.length, new Set(full).size, 'full workflow runs a case twice');
  const union = shards.flatMap((name) => partition[name] ?? []);
  requireEqual([...union].sort(), [...full].sort(), 'shard union must run every full-suite case exactly once');
  requireValue(
    shards.every((name) => (partition[name]?.length ?? 0) > 0),
    'empty shard',
  );
  return { full, partition };
}

export function repositoryManifest(root = dirname(dirname(fileURLToPath(import.meta.url)))) {
  /** @param {string} path */
  const read = (path) => readFileSync(join(root, path), 'utf8');
  return browserManifest({
    caller: read('.github/workflows/deadvox.yml'),
    reusable: read('.github/workflows/deadvox-browser.yml'),
    scripts: JSON.parse(read('packages/deadvox/package.json')).scripts,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(repositoryManifest(), null, 2)}\n`);
}
