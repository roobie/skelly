import assert from 'node:assert/strict';
import test from 'node:test';
import { addedEntries, oneMonthBefore, tooYoungEntries } from './dependency-age.mjs';

const registryEntry = (name, version) => ({
  version,
  resolved: `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`,
});

const lockfile = (packages) => ({ lockfileVersion: 3, packages });

test('only added or bumped registry entries are checked, not workspaces or unchanged entries', () => {
  const base = lockfile({
    'node_modules/kept': registryEntry('kept', '1.0.0'),
    'node_modules/bumped': registryEntry('bumped', '1.0.0'),
  });
  const head = lockfile({
    '': { name: 'root' },
    'packages/engine': { version: '0.0.0' },
    'node_modules/@skelly/engine': { resolved: 'packages/engine', link: true },
    'node_modules/kept': registryEntry('kept', '1.0.0'),
    'node_modules/bumped': registryEntry('bumped', '1.1.0'),
    'node_modules/kept/node_modules/@scope/nested': registryEntry('@scope/nested', '2.0.0'),
    'node_modules/alias': { ...registryEntry('real', '3.0.0'), name: 'real' },
  });

  assert.deepEqual(addedEntries(base, head), [
    { name: 'bumped', version: '1.1.0' },
    { name: '@scope/nested', version: '2.0.0' },
    { name: 'real', version: '3.0.0' },
  ]);
});

test('a lockfile new to the change has every registry entry checked', () => {
  const head = lockfile({ 'node_modules/fresh': registryEntry('fresh', '1.0.0') });
  assert.deepEqual(addedEntries(undefined, head), [{ name: 'fresh', version: '1.0.0' }]);
});

test('one month before clamps to the end of a shorter month and crosses the year', () => {
  assert.equal(oneMonthBefore(new Date('2026-03-31T12:00:00Z')).toISOString(), '2026-02-28T12:00:00.000Z');
  assert.equal(oneMonthBefore(new Date('2026-01-15T00:00:00Z')).toISOString(), '2025-12-15T00:00:00.000Z');
});

test('an entry passes only when released strictly more than one month before it was added', () => {
  const addedAt = new Date('2026-06-15T00:00:00Z');
  const entries = [
    { name: 'old', version: '1.0.0' },
    { name: 'edge', version: '1.0.0' },
    { name: 'young', version: '1.0.0' },
    { name: 'unknown', version: '1.0.0' },
  ];
  const releaseTimes = new Map([
    ['old', { '1.0.0': '2026-05-14T23:59:59.999Z' }],
    ['edge', { '1.0.0': '2026-05-15T00:00:00.000Z' }],
    ['young', { '1.0.0': '2026-06-01T00:00:00.000Z' }],
    ['unknown', { '0.9.0': '2020-01-01T00:00:00.000Z' }],
  ]);

  assert.deepEqual(
    tooYoungEntries(entries, releaseTimes, addedAt).map(({ name }) => name),
    ['edge', 'young', 'unknown'],
  );
});
