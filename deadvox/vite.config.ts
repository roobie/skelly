import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vitest/config';
import { pagesAnalyticsPlugin } from '../pagesAnalyticsPlugin.ts';
import { TEST_POOL } from '../testPool.ts';
import { buildRevisionFromGit } from './src/core/buildRevision.ts';
import { canonicalJson } from './src/core/canonicalJson.ts';
import {
  fingerprintAfterHotChange,
  fingerprintSimulationSources,
  SIMULATION_ENTRIES,
  SIMULATION_EXCLUSIONS,
} from './tools/simulationFingerprint.ts';

const contentDirectory = fileURLToPath(new URL('./src/content/base/', import.meta.url));
const filesUnder = (directory: string, prefix: string): { name: string; path: string }[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}${entry.name}`;
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return filesUnder(path, `${relative}/`);
    }
    if (entry.isFile()) {
      return [{ name: relative, path }];
    }
    return [];
  });
const contentFiles = filesUnder(contentDirectory, 'base/').sort((left, right) => {
  if (left.name < right.name) {
    return -1;
  }
  if (left.name > right.name) {
    return 1;
  }
  return 0;
});
const baseContentHash = createHash('sha256')
  .update(
    canonicalJson(
      contentFiles.map(({ name, path }) => {
        const bytes = readFileSync(path);
        const content = name.endsWith('.json')
          ? { format: 'json', value: JSON.parse(bytes.toString('utf8')) as unknown }
          : { format: 'bytes-sha256', value: createHash('sha256').update(bytes).digest('hex') };
        return [name, content];
      }),
    ),
  )
  .digest('hex');
let buildRevision: string;
try {
  buildRevision = buildRevisionFromGit((args) =>
    execFileSync('git', [...args], {
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      encoding: 'utf8',
    }),
  );
} catch {
  buildRevision = 'development';
}

// Base-pack identity is snapshotted at config load. Simulation source identity is refreshed on source HMR.
const packageRoot = fileURLToPath(new URL('.', import.meta.url));
const saveFormatPath = resolve(packageRoot, 'src/core/saveFormat.ts');
const buildRevisionDefine = '__DEADVOX_BUILD_REVISION__';
const baseContentHashDefine = '__DEADVOX_BASE_CONTENT_HASH__';
const moduleQueryPattern = /[?#].*$/;
const simulationHashPlaceholder = '__DEADVOX_SIMULATION_HASH__';
const simulationHashPattern = /__DEADVOX_SIMULATION_HASH__(?=,)/g;
const simulationHashValuePattern = /^[0-9a-f]{64}$/;

function simulationFingerprintPlugin() {
  let simulationHash = '';
  let resolveModule: ((specifier: string, importer?: string) => Promise<string | undefined>) | undefined;
  let hmrRefresh: Promise<void> = Promise.resolve();
  const computeFingerprint = () => {
    if (!resolveModule) {
      throw new Error('Vite module resolver has not been initialized');
    }
    return fingerprintSimulationSources(
      SIMULATION_ENTRIES,
      packageRoot,
      {
        resolve: resolveModule,
        readFile(path) {
          return Promise.resolve(readFileSync(path, 'utf8'));
        },
      },
      { exclude: SIMULATION_EXCLUSIONS },
    );
  };

  return {
    name: 'deadvox:simulation-source-fingerprint',
    enforce: 'pre' as const,
    async configResolved(config: import('vite').ResolvedConfig) {
      // Use Vite's own resolver so aliases, extension rules, and package conditions match the build graph.
      const viteResolve = config.createResolver();
      resolveModule = async (specifier, importer) => viteResolve(specifier, importer);
      simulationHash = await computeFingerprint();
    },
    transform(code: string, id: string) {
      if (resolve(id.replace(moduleQueryPattern, '')) !== saveFormatPath) {
        return;
      }
      const occurrences = code.match(simulationHashPattern)?.length ?? 0;
      if (occurrences !== 1) {
        throw new Error(`Expected one simulation hash placeholder in ${id}; found ${occurrences}`);
      }
      return code.replace(simulationHashPattern, JSON.stringify(simulationHash));
    },
    transformIndexHtml(html: string) {
      return html.replace(
        '</head>',
        `  <meta name="deadvox-simulation-source-hash" content="${simulationHash}">\n</head>`,
      );
    },
    closeBundle() {
      const outputFiles = filesUnder(resolve(packageRoot, 'dist'), '').filter(({ name }) => name.endsWith('.js'));
      for (const { path } of outputFiles) {
        const code = readFileSync(path, 'utf8');
        if (code.includes(simulationHashPlaceholder)) {
          writeFileSync(path, code.replaceAll(simulationHashPlaceholder, JSON.stringify(simulationHash)));
        }
      }
      const builtSources = filesUnder(resolve(packageRoot, 'dist'), '')
        .filter(({ name }) => name.endsWith('.html') || name.endsWith('.js'))
        .map(({ path }) => readFileSync(path, 'utf8'));
      if (
        !(
          simulationHashValuePattern.test(simulationHash) &&
          builtSources.some((source) => source.includes(simulationHash))
        )
      ) {
        throw new Error('Production bundle is missing its 64-hex simulation hash');
      }
      if (builtSources.some((source) => source.includes(simulationHashPlaceholder))) {
        throw new Error('Production bundle contains an unreplaced simulation hash placeholder');
      }
    },
    async hotUpdate(
      this: { environment: import('vite').DevEnvironment },
      { type, server }: import('vite').HotUpdateOptions,
    ): Promise<import('vite').EnvironmentModuleNode[] | undefined> {
      let changed = false;
      const refresh = hmrRefresh.then(async () => {
        const nextHash = await fingerprintAfterHotChange(type, simulationHash, computeFingerprint);
        if (nextHash === undefined) {
          return;
        }
        simulationHash = nextHash;
        changed = true;
        const { moduleGraph, hot } = this.environment;
        for (const module of moduleGraph.getModulesByFile(saveFormatPath) ?? []) {
          moduleGraph.invalidateModule(module);
        }
        hot.send({ type: 'full-reload' });
      });
      hmrRefresh = refresh.catch((error: unknown) => {
        server.config.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
      });
      await refresh;
      if (changed) {
        return [];
      }
      return undefined;
    },
  };
}

// mobgen's pure core/mob modules (no three, no DOM — see src/render/mobActors.ts's own header comment)
// live in the sibling project, reused here rather than duplicated. three.js itself always comes from
// *this* project's own node_modules — mobgen/src/viewer (which imports three from mobgen's node_modules)
// must never be reachable through this alias; see test/mobgenBoundary.test.ts.
const mobgenSrc = fileURLToPath(new URL('../mobgen/src/', import.meta.url));

export default defineConfig({
  plugins: [
    // biome-ignore lint/style/noProcessEnv: only the Pages deploy opts into production analytics.
    pagesAnalyticsPlugin(process.env.PAGES_ANALYTICS === '1'),
    simulationFingerprintPlugin(),
    // biome-ignore lint/style/noProcessEnv: HTTPS is an opt-in local development server mode.
    ...(process.env.DEADVOX_HTTPS === '1' ? [basicSsl()] : []),
  ],
  define: {
    [buildRevisionDefine]: JSON.stringify(buildRevision),
    [baseContentHashDefine]: JSON.stringify(baseContentHash),
  },
  base: './', // served from /skelly/deadvox/ on GitHub Pages
  resolve: {
    alias: {
      '@mobgen/': mobgenSrc,
    },
  },
  server: {
    fs: {
      // The alias resolves outside this project's own root; Vite's dev server otherwise refuses to serve
      // files from outside it.
      allow: [fileURLToPath(new URL('.', import.meta.url)), mobgenSrc],
    },
  },
  build: {
    chunkSizeWarningLimit: 1000, // three.js
    rollupOptions: { input: ['index.html', 'sounds.html'] },
  },
  worker: { format: 'es' },
  test: {
    ...TEST_POOL,
    include: ['test/**/*.test.ts'],
  },
});
