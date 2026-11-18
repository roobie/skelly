import assert from 'node:assert/strict';
import test from 'node:test';
import { addedEntries, oneMonthBefore, tooYoungEntries } from './check.mjs';

test('only entries the head adds or bumps are checked', () => {
  const kept = { name: 'kept', version: '1.0.0' };
  const bumped = { name: 'bumped', version: '1.1.0' };
  const base = new Map([
    ['kept@1.0.0', kept],
    ['bumped@1.0.0', { name: 'bumped', version: '1.0.0' }],
  ]);
  const head = new Map([
    ['kept@1.0.0', kept],
    ['bumped@1.1.0', bumped],
  ]);

  assert.deepEqual(addedEntries(base, head), [bumped]);
});

test('one month before clamps to the end of a shorter month and crosses the year', () => {
  assert.equal(oneMonthBefore(new Date('2026-03-31T12:00:00Z')).toISOString(), '2026-02-28T12:00:00.000Z');
  assert.equal(oneMonthBefore(new Date('2026-01-15T00:00:00Z')).toISOString(), '2025-12-15T00:00:00.000Z');
});

test('an entry passes only when released strictly more than one month before it was added', () => {
  /**
   * @param {string} name
   * @param {string | undefined} released
   */
  const dated = (name, released) => ({
    name,
    version: '1.0.0',
    released: released === undefined ? undefined : new Date(released),
  });
  const entries = [
    dated('old', '2026-05-14T23:59:59.999Z'),
    dated('edge', '2026-05-15T00:00:00.000Z'),
    dated('young', '2026-06-01T00:00:00.000Z'),
    dated('unknown', undefined),
  ];

  assert.deepEqual(
    tooYoungEntries(entries, new Date('2026-06-15T00:00:00Z')).map(({ name }) => name),
    ['edge', 'young', 'unknown'],
  );
});
