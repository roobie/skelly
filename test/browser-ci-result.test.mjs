import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertBrowserResult, checkBrowserWorkflow } from '../tools/browser-ci-result.mjs';

const failedJob = /expected success/;
const failedAttempt = /prior attempt 1 is unresolved/;
const missingAttempt = /Cannot observe run attempt/;
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
    await assert.rejects(checkBrowserWorkflow({ env: { LAYOUT: 'sharded' } }), missingAttempt);
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
