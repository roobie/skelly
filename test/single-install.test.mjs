import assert from 'node:assert/strict';
import { existsSync, globSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** @returns {string[]} the root workspaces' directories, relative to the root */
const rootWorkspaces = () => {
  /** @type {{ workspaces?: string[] }} */
  const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const patterns = (manifest.workspaces ?? []).map((pattern) => `${pattern}/package.json`);
  const workspaces = globSync(patterns, { cwd: ROOT }).map(dirname);
  if (workspaces.length === 0) {
    throw new Error('no root workspace found; run git submodule update --init --recursive first');
  }
  return workspaces;
};

// Node looks a bare import up in every node_modules from the importing file's directory to the root. A package
// directory above a root workspace that the root install does not own can get its own node_modules, whose copies
// then shadow the root's for that workspace and put a second instance of a shared package in the game.
test('every package enclosing a root workspace is a root workspace', () => {
  const workspaces = rootWorkspaces();
  const owned = new Set(workspaces);
  const unowned = new Set();
  for (const workspace of workspaces) {
    for (let directory = dirname(workspace); directory !== '.'; directory = dirname(directory)) {
      if (existsSync(join(ROOT, directory, 'package.json')) && !owned.has(directory)) {
        unowned.add(`${directory} encloses ${workspace}`);
      }
    }
  }
  assert.deepEqual([...unowned], []);
});
