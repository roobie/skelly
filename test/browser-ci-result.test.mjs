import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertBrowserResult, checkBrowserWorkflow, reportEarlierRuns } from '../tools/browser-ci-result.mjs';

const failedJob = /expected success/;
const failedAttempt = /prior attempt 1 is unresolved/;
const missingAttempt = /Cannot observe run attempt/;
const earlierAttemptsUnsuccessful = /Earlier same-SHA attempts were unsuccessful/;
const earlierRun101Failed = /Run 101, attempt 1 concluded failure/;
const earlierRun102Cancelled = /Run 102, attempt 1 concluded cancelled/;
const success = (layout) => ({
  fast: { result: layout === 'control' ? 'skipped' : 'success' },
  browser: { result: layout === 'control' ? 'skipped' : 'success' },
  'control-check': { result: layout === 'sharded' ? 'skipped' : 'success' },
  'control-stages': { result: layout === 'sharded' ? 'skipped' : 'success' },
});

describe('browser aggregate', () => {
  it('requires selected jobs to succeed and only deliberately disabled layouts to skip', () => {
    for (const layout of ['sharded', 'control']) {
      assertBrowserResult({ layout, needs: success(layout), priorAttempts: [] });
      const selected = Object.keys(success(layout)).filter((job) => success(layout)[job].result === 'success');
      for (const job of selected) {
        for (const result of ['failure', 'cancelled', 'skipped']) {
          const needs = success(layout);
          needs[job].result = result;
          assert.throws(() => assertBrowserResult({ layout, needs, priorAttempts: [] }), failedJob);
        }
      }
    }
  });

  it('fails closed when run attempt is missing', async () => {
    const env = { LAYOUT: 'sharded', NEEDS_JSON: JSON.stringify(success('sharded')) };
    await assert.rejects(checkBrowserWorkflow({ env }), missingAttempt);
  });

  it('queries previous attempts before permitting rerun green', async () => {
    const requested = [];
    const lookupAttempt = (attempt) => {
      requested.push(attempt);
      return Promise.resolve({ conclusion: 'failure', url: 'https://example.org/first-attempt' });
    };
    const env = { GITHUB_RUN_ATTEMPT: '1', LAYOUT: 'sharded', NEEDS_JSON: JSON.stringify(success('sharded')) };
    await checkBrowserWorkflow({ lookupAttempt, env });
    assert.deepEqual(requested, []);
    env.GITHUB_RUN_ATTEMPT = '2';
    await assert.rejects(checkBrowserWorkflow({ lookupAttempt, env }), failedAttempt);
    assert.deepEqual(requested, [1]);
  });
});

describe('earlier same-SHA runs', () => {
  it('reports every unsuccessful completed attempt except the current and in-progress runs', async () => {
    const requested = [];
    const warnings = [];
    const notes = [];
    const runs = [
      { id: 101, status: 'completed', attemptCount: 2 },
      { id: 102, status: 'completed', attemptCount: 1 },
      { id: 103, status: 'completed', attemptCount: 2 },
      { id: 104, status: 'in_progress', attemptCount: 1 },
    ];
    const report = await reportEarlierRuns({
      currentRunId: 103,
      listRuns: () => runs,
      lookupAttempt: (runId, attempt) => {
        requested.push([runId, attempt]);
        if (runId === 101 && attempt === 1) {
          return { conclusion: 'failure', url: 'https://example.org/101/1' };
        }
        if (runId === 101 && attempt === 2) {
          return { conclusion: 'success', url: 'https://example.org/101/2' };
        }
        return { conclusion: 'cancelled', url: 'https://example.org/102/1' };
      },
      warn: (message) => warnings.push(message),
      writeNote: (message) => notes.push(message),
    });

    assert.deepEqual(requested, [
      [101, 1],
      [101, 2],
      [102, 1],
    ]);
    assert.deepEqual(
      report.failures.map(({ runId, attempt, conclusion }) => [runId, attempt, conclusion]),
      [
        [101, 1, 'failure'],
        [102, 1, 'cancelled'],
      ],
    );
    assert.deepEqual(warnings, [
      'Run 101, attempt 1 concluded failure: https://example.org/101/1',
      'Run 102, attempt 1 concluded cancelled: https://example.org/102/1',
    ]);
    assert.equal(notes.length, 1);
    assert.match(notes[0], earlierAttemptsUnsuccessful);
    assert.match(notes[0], earlierRun101Failed);
    assert.match(notes[0], earlierRun102Cancelled);
  });

  it("writes one couldn't-check note and carries on when the API fails", async () => {
    const warnings = [];
    const notes = [];
    const report = await reportEarlierRuns({
      currentRunId: 201,
      listRuns: () => {
        throw new Error('API unavailable');
      },
      lookupAttempt: () => assert.fail('no run attempts should be queried'),
      warn: (message) => warnings.push(message),
      writeNote: (message) => notes.push(message),
    });

    assert.deepEqual(warnings, []);
    assert.deepEqual(notes, [
      "Couldn't check earlier runs for this head SHA; the required aggregate result is unchanged.",
    ]);
    assert.equal(report.failures.length, 0);
  });
});
