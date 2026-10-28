// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone remote verification driver.
// Temporary verification driver: the remote runner executes pushed files, not inline scripts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const inputPath = new URL('../src/game/input.ts', import.meta.url);
const original = readFileSync(inputPath, 'utf8');
const headTurn =
  'this.freeLook.turn(-event.movementX * sensitivity, -event.movementY * sensitivity, this.freeLookInput.tuning);';
assert.equal(original.split(headTurn).length, 2);
const mutant = original.replace(headTurn, 'this.yaw -= event.movementX * sensitivity;');
try {
  writeFileSync(inputPath, mutant);
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('../../../node_modules/vitest/vitest.mjs', import.meta.url)),
      'run',
      'test/input.test.ts',
      '-t',
      'turns only the head',
    ],
    { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit' },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, 'the head/body invariant must kill the former body-turn routing');
  process.stdout.write(
    'Mutation proof: restoring body-turn routing while free look is held is caught by the head/body movement and bore test.\n',
  );
} finally {
  writeFileSync(inputPath, original);
}
