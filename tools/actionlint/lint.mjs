import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { ensureWorkflowLinters } from './setup.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

try {
  const { actionlint, shellcheck } = await ensureWorkflowLinters();
  // actionlint skips inline shell silently when it finds no shellcheck, so the pinned one is named explicitly.
  const result = spawnSync(actionlint, ['-shellcheck', shellcheck, ...process.argv.slice(2)], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
