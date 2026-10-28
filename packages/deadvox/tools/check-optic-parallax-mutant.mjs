// biome-ignore-all lint/correctness/noNodejsModules: standalone mutation runner edits and restores its isolated checkout
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone runner asserts subprocess outcomes
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const source = new URL('../src/core/adsView.ts', import.meta.url);
const original = await readFile(source, 'utf8');
const selection = "ads.model.gun?.sight?.kind === 'optic' ? NEUTRAL_AIM : (ads.aimFrame ?? NEUTRAL_AIM)";
assert.equal(original.split(selection).length, 2, 'mutate exactly the optic eye tracking decision');
const test = () => {
  const result = spawnSync('npx', ['vitest', 'run', 'test/opticParallax.test.ts'], { cwd, encoding: 'utf8' });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  assert.equal(result.signal, null, 'the test process must complete, not be killed');
  return result.status;
};
assert.equal(test(), 0, 'the unmodified parallax contract must pass');
try {
  await writeFile(source, original.replace(selection, 'ads.aimFrame ?? NEUTRAL_AIM'));
  assert.equal(test(), 1, 'tracking the swayed optic eye must fail the parallax contract');
  process.stdout.write('OPTIC_PARALLAX_MUTANT caught: swayed-eye tracking cancels low-skill misalignment\n');
} finally {
  await writeFile(source, original);
}
