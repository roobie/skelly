import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { makeOwnedTempDirectory } from './testTemp.ts';

// Vitest CLI sets this before loading Vite config and allocating its root tmpDir.
// Ordinary Vite/browser commands must retain their caller's temp directory.
// biome-ignore lint/style/noProcessEnv: Vitest's documented runner marker.
if (process.env.VITEST === 'true') {
  const cache = resolve('node_modules/.cache/vitest-tmp');
  const run = makeOwnedTempDirectory(cache);
  // biome-ignore lint/style/noProcessEnv: keep both Vitest root and project caches off RAM-backed temp storage.
  process.env.TMPDIR = run;
  process.once('exit', () => rmSync(run, { recursive: true, force: true }));
}

// The suites are CPU-bound; leave room for Vite's transforms and the shared host.
// Vitest's native percentage budget gives 7 logical CPUs 3 workers and a
// 2-core CI runner 1, while preserving fresh module/global state per file.
export const TEST_POOL = { maxWorkers: '40%', isolate: true } as const;
