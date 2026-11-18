import assert from 'node:assert/strict';
import test from 'node:test';
import { registryEntries } from './npm.mjs';

/**
 * @param {string} name
 * @param {string} version
 */
const registryEntry = (name, version) => ({
  version,
  resolved: `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`,
});

test('a lockfile names its registry installs by package name, not workspaces or links', () => {
  const lockfile = {
    lockfileVersion: 3,
    packages: {
      '': { name: 'root' },
      'packages/engine': { version: '0.0.0' },
      'node_modules/@skelly/engine': { resolved: 'packages/engine', link: true },
      'node_modules/kept': registryEntry('kept', '1.0.0'),
      'node_modules/kept/node_modules/@scope/nested': registryEntry('@scope/nested', '2.0.0'),
      'node_modules/alias': { ...registryEntry('real', '3.0.0'), name: 'real' },
    },
  };

  assert.deepEqual(
    [...registryEntries(lockfile).values()],
    [
      { name: 'kept', version: '1.0.0' },
      { name: '@scope/nested', version: '2.0.0' },
      { name: 'real', version: '3.0.0' },
    ],
  );
});
