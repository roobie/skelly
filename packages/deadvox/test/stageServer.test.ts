import { fileURLToPath } from 'node:url';
import { type ConfigEnv, type InlineConfig, resolveConfig } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stageServerConfig } from './browser/stageServer.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url));
const internal = '@skelly/engine/internal/core/time.ts';
const importer = fileURLToPath(new URL('../src/main.ts', import.meta.url));

/** Whether a resolved config's page and server resolvers find the engine's test-only subpath. */
async function resolvesInternal(inline: InlineConfig, command: ConfigEnv['command']) {
  const config = await resolveConfig({ ...inline, configFile, root, logLevel: 'silent' }, command);
  const resolveFor = async (ssr: boolean) => {
    try {
      return (await config.createResolver()(internal, importer, false, ssr)) !== undefined;
    } catch {
      return false;
    }
  };
  return { page: await resolveFor(false), server: await resolveFor(true) };
}

describe('stage dev servers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Vitest enables the condition when it loads the config, so the product's view is loaded without its marker. The
  // build loads the same config through the same gate.
  it('keep the test-only subpath out of the product dev server', async () => {
    vi.stubEnv('VITEST', '');
    expect(await resolvesInternal({}, 'serve')).toEqual({ page: false, server: false });
  });

  it('resolve the test-only subpath in a server a stage creates', async () => {
    vi.stubEnv('VITEST', '');
    expect(await resolvesInternal(stageServerConfig({}), 'serve')).toEqual({ page: true, server: true });
  });
});
