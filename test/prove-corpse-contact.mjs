import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../packages/mobgen/', import.meta.url));
const source = new URL('../packages/mobgen/src/mob/reactions.ts', import.meta.url);
const original = readFileSync(source, 'utf8');
const contact =
  '  fitSkullContact(actor, rotations, [0, groundOffset(actor.bones, actor.bodyExtents, rotations), 0], headRolls);';
if (original.split(contact).length !== 2) {
  throw new Error('Expected exactly one resting-pose contact call');
}
try {
  writeFileSync(source, original.replace(contact, ''));
  const result = spawnSync('npx', ['vitest', 'run', 'test/reactions.test.ts', '-t', 'settled skull'], {
    cwd: root,
    encoding: 'utf8',
  });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status !== 1 || !output.includes('cells must not overlap chest cells')) {
    throw new Error(`Contact-removal mutant was not caught by the overlap property (exit ${result.status})`);
  }
  process.stdout.write('Contact-removal mutant caught by occupied-volume regression.\n');
} finally {
  writeFileSync(source, original);
}
