// biome-ignore-all lint/correctness/noNodejsModules: this temporary proof runs only in Node
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone bounded mutation proof
// biome-ignore-all lint/suspicious/noConsole: proof output is its evidence
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../deadvox/src/game/bundledContent.ts', import.meta.url);
const original = readFileSync(path, 'utf8');
const marker = 'buildRegistry([...sources, ...mods]);';
assert(original.includes(marker));
const run = () =>
  spawnSync('npx', ['vitest', 'run', 'test/browserMods.test.ts'], {
    cwd: new URL('../deadvox', import.meta.url),
    encoding: 'utf8',
  });
const green = run();
console.log(green.stdout, green.stderr);
assert.equal(green.status, 0, 'patched startup admission is green');
try {
  writeFileSync(path, original.replace(marker, 'buildRegistry(sources);'));
  const red = run();
  console.log(red.stdout, red.stderr);
  assert.notEqual(red.status, 0, 'base-only startup must fail');
  assert.match(red.stdout + red.stderr, /passes the added item and winning zombie speed into the startup world/);
  assert.match(red.stdout + red.stderr, /expected false to be true/);
} finally {
  writeFileSync(path, original);
}
console.log('Caught base-only startup mutant; restored the source.');
