import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatWarning, isNearLimit, stepLimits, stepShares } from '../tools/browser-ci-step-time.mjs';

const START = '2026-01-01T00:00:00Z';
const warningNamingCreeping = /^::warning [^:]*::creeping\b/;

/**
 * @param {string} name
 * @param {number} seconds
 * @param {string} [conclusion]
 */
const ranFor = (name, seconds, conclusion = 'success') => ({
  name,
  conclusion,
  startedAt: START,
  completedAt: new Date(Date.parse(START) + seconds * 1000).toISOString(),
});

describe('browser step time share', () => {
  it('warns only for a step past three quarters of its limit', () => {
    const limits = new Map([
      ['creeping', 2],
      ['at the line', 2],
      ['healthy', 2],
    ]);
    const shares = stepShares(limits, [ranFor('creeping', 100), ranFor('at the line', 90), ranFor('healthy', 60)]);
    assert.deepEqual(
      shares.filter(isNearLimit).map(({ name }) => name),
      ['creeping'],
    );
    const [creeping] = shares;
    assert.ok(creeping);
    assert.equal(Math.round(creeping.share * 100), 83);
    assert.match(formatWarning(creeping), warningNamingCreeping);
  });

  it('leaves out steps that were skipped, are still running or have no limit', () => {
    const limits = new Map([
      ['skipped', 1],
      ['running', 1],
    ]);
    const running = { ...ranFor('running', 0), completedAt: null };
    const shares = stepShares(limits, [ranFor('skipped', 59, 'skipped'), running, ranFor('unbounded', 59)]);
    assert.deepEqual(shares, []);
  });

  it('takes each named step limit from the workflow definition', () => {
    const workflow = {
      jobs: {
        run: {
          steps: [
            { name: 'bounded stage', 'timeout-minutes': 3, run: 'node stage.mjs' },
            { name: 'unbounded setup', run: 'npm run setup' },
            { 'timeout-minutes': 3, run: 'npm ci' },
          ],
        },
      },
    };
    assert.deepEqual([...stepLimits(workflow)], [['bounded stage', 3]]);
  });
});
