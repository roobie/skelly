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
