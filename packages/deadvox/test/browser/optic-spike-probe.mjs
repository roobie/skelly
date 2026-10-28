// biome-ignore-all lint/correctness/noNodejsModules: temporary manual cross-revision diagnostic
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const snapshot = mkdtempSync(join(tmpdir(), 'optic-spike-'));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
try {
  const archive = execFileSync('git', ['-C', root, 'archive', '5836ac87be41293aea9e07a3f3a67d02c51aac05'], {
    env,
    maxBuffer: 256 * 1024 * 1024,
  });
  execFileSync('tar', ['-xf', '-', '-C', snapshot], { input: archive, env });
  symlinkSync(resolve(root, 'node_modules'), join(snapshot, 'node_modules'), 'dir');
  const project = join(snapshot, 'packages/deadvox');
  const artifacts = resolve(root, 'packages/deadvox/test-results/spike-comparison');
  mkdirSync(artifacts, { recursive: true });
  symlinkSync(artifacts, join(project, 'test-results'), 'dir');
  execFileSync(process.execPath, [fileURLToPath(new URL('./primary-action-pixel.mjs', import.meta.url)), 'optic'], {
    cwd: project,
    env: { ...env, PRIMARY_ACTION_ROOT: project },
    stdio: 'inherit',
  });
} finally {
  rmSync(snapshot, { recursive: true, force: true });
}
