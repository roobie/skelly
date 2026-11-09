import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger, createServer } from 'vite';
import { expect, it } from 'vitest';
import { STAGE_ONE_POLICY } from '../tools/runtimeClosure.ts';

it('dependency-scans the raw product entry without errors before asset-glob transforms', async () => {
  const packageRoot = fileURLToPath(new URL('..', import.meta.url));
  const repoRoot = resolve(packageRoot, '../..');
  const cacheDir = mkdtempSync(join(tmpdir(), 'deadvox-dep-scan-'));
  const errors: string[] = [];
  const logger = createLogger('silent');
  logger.error = (message) => errors.push(message);
  let server: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    server = await createServer({
      configFile: false,
      root: packageRoot,
      cacheDir,
      customLogger: logger,
      resolve: {
        alias: Object.fromEntries(
          Object.entries(STAGE_ONE_POLICY.aliases).map(([key, path]) => [key, `${resolve(repoRoot, path)}/`]),
        ),
      },
      server: { middlewareMode: true, watch: null },
      optimizeDeps: { entries: ['src/main.ts'], force: true },
    });
    const optimizer = server.environments.client.depsOptimizer;
    expect(optimizer).toBeDefined();
    await optimizer!.init();
    const scan = optimizer!.scanProcessing;
    expect(scan).toBeDefined();
    await scan;
    expect(errors).toEqual([]);
    expect(Object.keys(optimizer!.metadata.discovered).length).toBeGreaterThan(0);
  } finally {
    await server?.close();
    rmSync(cacheDir, { recursive: true, force: true });
  }
});
