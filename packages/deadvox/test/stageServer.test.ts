import { fileURLToPath } from 'node:url';
import { type ConfigEnv, type InlineConfig, resolveConfig } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stageServerConfig } from './browser/stageServer.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const configFile = fileURLToPath(new URL('../vite.config.ts', import.meta.url));
// One internal module of each framework package; the one condition opens both test-only subpaths.
const internals = ['@skelly/engine/internal/core/time.ts', '@skelly/presentation/internal/render/sky.ts'];
const importer = fileURLToPath(new URL('../src/main.ts', import.meta.url));

/** Whether a resolved config's page and server resolvers find each framework package's test-only subpath. */
async function resolvesInternal(inline: InlineConfig, command: ConfigEnv['command']) {
  const config = await resolveConfig({ ...inline, configFile, root, logLevel: 'silent' }, command);
  const resolveFor = async (internal: string, ssr: boolean) => {
    try {
      return (await config.createResolver()(internal, importer, false, ssr)) !== undefined;
    } catch {
      return false;
    }
  };
  return Promise.all(
    internals.map(async (internal) => ({
      page: await resolveFor(internal, false),
      server: await resolveFor(internal, true),
    })),
  );
}

describe('stage dev servers', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Vitest enables the condition when it loads the config, so the product's view is loaded without its marker. The
  // build loads the same config through the same gate.
  it('keep the test-only subpath out of the product dev server', async () => {
    vi.stubEnv('VITEST', '');
    expect(await resolvesInternal({}, 'serve')).toEqual(internals.map(() => ({ page: false, server: false })));
  });

  it('resolve the test-only subpaths in a server a stage creates', async () => {
    vi.stubEnv('VITEST', '');
    expect(await resolvesInternal(stageServerConfig({}), 'serve')).toEqual(
      internals.map(() => ({ page: true, server: true })),
    );
  });

  // A page can request the plugin's module id directly, so its load checks the specifier too.
  it('serve page modules for framework package specifiers only', async () => {
    const plugin = (stageServerConfig({}).plugins as { name: string; load: PageModuleLoad }[]).find(
      ({ name }) => name === 'skelly:stage-package-modules',
    );
    const context = { resolve: (specifier: string) => Promise.resolve({ id: `/resolved/${specifier}` }) };
    const specifiers = ['@skelly/engine/sim', '@skelly/presentation/render'];
    await expect(
      Promise.all(specifiers.map((specifier) => plugin?.load.call(context, `\0stage-package:${specifier}`))),
    ).resolves.toEqual(specifiers.map((specifier) => `export * from "/resolved/${specifier}";\n`));
    await expect(plugin?.load.call(context, '\0stage-package:/src/main.ts')).rejects.toThrow(
      'only framework package modules',
    );
  });
});

type PageModuleLoad = (
  this: { resolve: (specifier: string) => Promise<{ id: string }> },
  id: string,
) => Promise<string | undefined>;
