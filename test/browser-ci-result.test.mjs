import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertBrowserResult, checkBrowserWorkflow } from '../tools/browser-ci-result.mjs';

const failedJob = /expected success/;
const failedAttempt = /prior attempt 1 is unresolved/;
const success = (layout) => ({
  fast: { result: 'success' },
  browser: { result: layout === 'serial' ? 'skipped' : 'success' },
  serial: { result: layout === 'sharded' ? 'skipped' : 'success' },
});

describe('browser aggregate', () => {
  it('requires selected jobs to succeed and only deliberately disabled layouts to skip', () => {
    for (const layout of ['sharded', 'serial', 'pilot']) {
      assertBrowserResult({ layout, needs: success(layout), priorAttempts: [] });
    }
    for (const job of ['fast', 'browser', 'serial']) {
      for (const result of ['failure', 'cancelled', 'skipped']) {
        const needs = success('pilot');
        needs[job].result = result;
        assert.throws(() => assertBrowserResult({ layout: 'pilot', needs, priorAttempts: [] }), failedJob);
      }
    }
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
