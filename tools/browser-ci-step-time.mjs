import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

/** @typedef {{ jobs: Record<string, { steps?: { name?: string, 'timeout-minutes'?: unknown }[] }> }} Workflow */
/** @typedef {{ name: string, conclusion: string | null, startedAt: string | null, completedAt: string | null }} JobStep */
/** @typedef {{ name: string, seconds: number, limitMinutes: number, share: number }} StepShare */

const WARNING_SHARE = 0.75;
const JOBS_PAGE_SIZE = 100;

/**
 * @param {Workflow} workflow
 * @returns {Map<string, number>}
 */
export function stepLimits(workflow) {
  /** @type {Map<string, number>} */
  const limits = new Map();
  for (const { steps = [] } of Object.values(workflow.jobs)) {
    for (const { name, 'timeout-minutes': minutes } of steps) {
      if (name !== undefined && typeof minutes === 'number') {
        limits.set(name, minutes);
      }
    }
  }
  return limits;
}

/**
 * @param {Map<string, number>} limits
 * @param {JobStep[]} steps
 * @returns {StepShare[]}
 */
export function stepShares(limits, steps) {
  return steps.flatMap(({ name, conclusion, startedAt, completedAt }) => {
    const limitMinutes = limits.get(name);
    if (limitMinutes === undefined || conclusion === 'skipped' || !startedAt || !completedAt) {
      return [];
    }
    const seconds = (Date.parse(completedAt) - Date.parse(startedAt)) / 1000;
    return [{ name, seconds, limitMinutes, share: seconds / (limitMinutes * 60) }];
  });
}

/** @param {StepShare} share */
export const isNearLimit = ({ share }) => share > WARNING_SHARE;

/** @param {StepShare} share */
const formatShare = ({ name, seconds, limitMinutes, share }) =>
  `${name} used ${Math.round(share * 100)}% of its ${limitMinutes}-minute limit (${seconds} s)`;

/** @param {string} text */
const escapeCommand = (text) => text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

/** @param {StepShare} share */
export const formatWarning = (share) =>
  `::warning title=Browser step near its time limit::${escapeCommand(formatShare(share))}`;

/**
 * A step cannot read its own job id, so the job is found by its runner, which serves one job at a time.
 * @param {NodeJS.ProcessEnv} env
 * @returns {Promise<JobStep[]>}
 */
async function currentJobSteps(env) {
  const { GITHUB_API_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, GH_TOKEN, RUNNER_NAME } = env;
  const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${GH_TOKEN}` };
  const jobsUrl = `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/attempts/${GITHUB_RUN_ATTEMPT}/jobs`;
  for (let page = 1; ; page += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: each page is fetched only when the previous one lacked the job.
    const response = await fetch(`${jobsUrl}?per_page=${JOBS_PAGE_SIZE}&page=${page}`, { headers });
    if (!response.ok) {
      throw new Error(`Listing this run's jobs failed: ${response.status}`);
    }
    /** @type {{ jobs: { runner_name: string | null, status: string, steps?: Record<string, string | null>[] }[] }} */
    const { jobs } = await response.json();
    const job = jobs.find((candidate) => candidate.runner_name === RUNNER_NAME && candidate.status === 'in_progress');
    if (job) {
      return (job.steps ?? []).map((step) => ({
        name: step.name ?? '',
        conclusion: step.conclusion ?? null,
        startedAt: step.started_at ?? null,
        completedAt: step.completed_at ?? null,
      }));
    }
    if (jobs.length < JOBS_PAGE_SIZE) {
      throw new Error(`No running job on runner ${RUNNER_NAME}`);
    }
  }
}

/** @param {string} workflowPath */
async function reportStepTimes(workflowPath) {
  const limits = stepLimits(parse(readFileSync(workflowPath, 'utf8')));
  // biome-ignore lint/style/noProcessEnv: the runner hands over the run, runner and token this way.
  const steps = await currentJobSteps(process.env);
  for (const share of stepShares(limits, steps)) {
    process.stdout.write(`${formatShare(share)}\n`);
    if (isNearLimit(share)) {
      process.stdout.write(`${formatWarning(share)}\n`);
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const [workflowPath] = process.argv.slice(2);
  if (!workflowPath) {
    throw new Error('Usage: node tools/browser-ci-step-time.mjs <workflow.yml>');
  }
  await reportStepTimes(workflowPath);
}
