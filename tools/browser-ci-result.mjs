export function assertBrowserResult({ layout, needs, priorAttempts }) {
  if (!['sharded', 'control'].includes(layout)) {
    throw new Error(`unknown layout: ${layout}`);
  }
  const expected = {
    fast: layout === 'control' ? 'skipped' : 'success',
    browser: layout === 'control' ? 'skipped' : 'success',
    'control-check': layout === 'sharded' ? 'skipped' : 'success',
    'control-stages': layout === 'sharded' ? 'skipped' : 'success',
  };
  for (const [job, result] of Object.entries(expected)) {
    if (needs[job]?.result !== result) {
      throw new Error(`${job}: expected ${result}, observed ${needs[job]?.result}`);
    }
  }
  for (const { conclusion, url, attempt } of priorAttempts) {
    if (conclusion !== 'success') {
      throw new Error(`prior attempt ${attempt} is unresolved (${conclusion}): ${url}`);
    }
  }
}

export async function checkBrowserWorkflow({ lookupAttempt, env }) {
  const attemptCount = Number(env.GITHUB_RUN_ATTEMPT);
  if (!Number.isInteger(attemptCount) || attemptCount < 1) {
    throw new Error('Cannot observe run attempt');
  }
  const priorAttempts = await Promise.all(
    Array.from({ length: attemptCount - 1 }, (_, index) => {
      const attempt = index + 1;
      return lookupAttempt(attempt).then((result) => ({ ...result, attempt }));
    }),
  );
  assertBrowserResult({ layout: env.LAYOUT, needs: JSON.parse(env.NEEDS_JSON), priorAttempts });
}

export function runsToInspect(runs, currentRunId) {
  return runs.filter((run) => String(run.id) !== String(currentRunId) && run.status === 'completed');
}

export function earlierRunReport({ runs, currentRunId, attempts }) {
  const eligibleRunIds = new Set(runsToInspect(runs, currentRunId).map((run) => String(run.id)));
  const failures = attempts
    .filter((attempt) => eligibleRunIds.has(String(attempt.runId)) && attempt.conclusion !== 'success')
    .map((attempt) => ({ ...attempt, conclusion: attempt.conclusion ?? 'unknown' }));
  const summary =
    failures.length > 0
      ? `Earlier same-SHA attempts were unsuccessful:\n${failures
          .map((failure) => `- ${formatEarlierRunWarning(failure)}`)
          .join('\n')}`
      : 'No earlier failures at this head SHA.';
  return { failures, summary };
}

export function formatEarlierRunWarning({ conclusion, runId, attempt, url }) {
  return `Run ${runId}, attempt ${attempt} concluded ${conclusion}: ${url}`;
}

export async function reportEarlierRuns({ currentRunId, listRuns, lookupAttempt, warn, writeNote }) {
  let report;
  try {
    const runs = await listRuns();
    const candidates = runsToInspect(runs, currentRunId);
    const attempts = await Promise.all(
      candidates.flatMap((run) => {
        const count = Number(run.attemptCount);
        if (!Number.isInteger(count) || count < 1) {
          throw new Error(`Cannot observe attempts for run ${run.id}`);
        }
        return Array.from({ length: count }, (_, index) => {
          const attempt = index + 1;
          return Promise.resolve(lookupAttempt(run.id, attempt)).then((result) => ({
            ...result,
            runId: run.id,
            attempt,
          }));
        });
      }),
    );
    report = earlierRunReport({ runs, currentRunId, attempts });
  } catch {
    report = {
      failures: [],
      summary: "Couldn't check earlier runs for this head SHA; the required aggregate result is unchanged.",
    };
  }
  for (const failure of report.failures) {
    warn(formatEarlierRunWarning(failure));
  }
  await writeNote(report.summary);
  return report;
}
