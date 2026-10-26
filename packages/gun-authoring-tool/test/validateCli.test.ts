import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('finds default fixtures and trace records when invoked outside the package directory', () => {
  const script = fileURLToPath(new URL('../src/cli/validate.ts', import.meta.url));
  const output = execFileSync(process.execPath, [script], { cwd: tmpdir(), encoding: 'utf8' });
  expect(output).toContain('PASS  ');
  expect(output).not.toContain('INVALID TRACE');
});
