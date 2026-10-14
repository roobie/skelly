// biome-ignore-all lint/correctness/noNodejsModules: This bounded mutation probe runs only under Node.js.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const path = 'src/core/items.ts';
const original = readFileSync(path, 'utf8');
const needle = 'origin: copyOrigin(item.origin),';
if (original.split(needle).length !== 2) {
  throw new Error('Expected one snapshot origin projection');
}
const run = () => {
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      'test/lootSelector.test.ts',
      '--testNamePattern=retains source attribution',
    ],
    { encoding: 'utf8' },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  if (result.error || result.signal) {
    throw result.error ?? new Error(`Test terminated by ${result.signal}`);
  }
  return { status: result.status, output };
};
if (run().status !== 0) {
  throw new Error('Pristine provenance test failed');
}
try {
  writeFileSync(path, original.replace(needle, "origin: { kind: 'created' },"));
  const mutant = run();
  if (mutant.status === 0 || !mutant.output.includes('created')) {
    throw new Error('Origin-drop mutant was not caught by its provenance assertion');
  }
  process.stdout.write('Caught snapshot origin-drop mutant.\n');
} finally {
  writeFileSync(path, original);
}
if (run().status !== 0 || readFileSync(path, 'utf8') !== original) {
  throw new Error('Restored provenance test or source differs from pristine');
}
process.stdout.write('Restored pristine source and reconfirmed the provenance test.\n');
