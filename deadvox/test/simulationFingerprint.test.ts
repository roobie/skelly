import { readdir, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import {
  collectSimulationSourceGraph,
  fingerprintAfterHotChange,
  fingerprintSimulationSources,
  SIMULATION_ENTRIES,
  SIMULATION_EXCLUSIONS,
  type SimulationModuleGraphHost,
} from '../tools/simulationFingerprint.ts';

const root = '/fixture/deadvox';
const projectRoot = fileURLToPath(new URL('..', import.meta.url));

type Sources = Map<string, string>;

function hostFor(sources: Sources): SimulationModuleGraphHost {
  return {
    resolve(specifier, importer) {
      const base = isAbsolute(specifier) ? specifier : resolve(dirname(importer ?? root), specifier);
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`]) {
        if (sources.has(candidate)) {
          return Promise.resolve(candidate);
        }
      }
      return Promise.resolve(undefined);
    },
    readFile(path) {
      const source = sources.get(path);
      if (source === undefined) {
        return Promise.reject(new Error(`missing fixture source: ${path}`));
      }
      return Promise.resolve(source);
    },
  };
}

const hash = (sources: Sources, ...entryPaths: string[]) =>
  fingerprintSimulationSources(entryPaths, root, hostFor(sources), { exclude: ['src/ui'] });

const entries = ['src/core/sim.ts'];
const UNRESOLVED_DEPENDENCY_ERROR = /Cannot resolve runtime dependency/;
const UNSUPPORTED_ID_ERROR = /Unsupported virtual runtime dependency|resolves outside src\//;
const UNSUPPORTED_DISCOVERY_ERROR = /Unsupported|Unclassified/;
const UNSUPPORTED_RUNTIME_DEPENDENCY_ERROR = /Unsupported runtime dependency/;
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/;

// These files are not runtime roots: buildRevision is a test/build diagnostic helper,
// while debugInterface contains only erased TypeScript contracts.
const NON_RUNTIME_SOURCE_RULES: Record<string, string> = {
  'src/core/buildRevision.ts': 'Test/build-only diagnostic helper; no game runtime imports it.',
  'src/game/debugInterface.ts': 'Type-only contracts; the imported interfaces erase from runtime code.',
};

async function sourceFilesUnder(directory: string): Promise<string[]> {
  const files = await readdir(resolve(projectRoot, directory), { withFileTypes: true });
  const directories = files.filter((file) => file.isDirectory());
  const nested = await Promise.all(directories.map((file) => sourceFilesUnder(join(directory, file.name))));
  const direct = files
    .filter((file) => file.isFile() && SOURCE_FILE_PATTERN.test(file.name) && !file.name.endsWith('.d.ts'))
    .map((file) => join(directory, file.name));
  return [...direct, ...nested.flat()].sort();
}

async function actualSimulationGraph() {
  const config = await resolveConfig({ configFile: false, root: projectRoot, logLevel: 'silent' }, 'build');
  const viteResolve = config.createResolver();
  return collectSimulationSourceGraph(
    SIMULATION_ENTRIES,
    projectRoot,
    {
      resolve(specifier, importer) {
        return Promise.resolve(viteResolve(specifier, importer));
      },
      readFile(path) {
        return readFile(path, 'utf8');
      },
    },
    { exclude: SIMULATION_EXCLUSIONS },
  );
}

describe('simulation source fingerprint', () => {
  it('pins every excluded module reached from the actual Vite-resolved simulation graph', async () => {
    const graph = await actualSimulationGraph();
    expect(graph.sources.has('src/worker/mesh.worker.ts')).toBe(false);
    expect(graph.sources.has('src/game/engine.ts')).toBe(false);
    expect([...graph.sources.keys()].some((path) => path.startsWith('node_modules/three/'))).toBe(false);
    expect(SIMULATION_EXCLUSIONS).toEqual(
      expect.arrayContaining([
        'src/game/saveStorage.ts',
        'src/game/saveStorageRecord.ts',
        'src/game/saveStorageProtocol.ts',
        'src/worker/save.worker.ts',
        'src/ui/saveController.ts',
      ]),
    );
    expect(graph.excludedImports).toEqual([
      { importer: 'src/game/play.ts', excluded: 'src/core/sky.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/game/damageFeedback.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/render/flashlight.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/render/furniture.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/render/hands.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/render/mobActors.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/render/models.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/render/piles.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/render/playerFigure.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/render/sky.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/render/stepOffset.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/render/zombies.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/audioOptions.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/credits.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/death.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/gameCursor.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/hud.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/hudOptions.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/menuPointer.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/menuState.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/rest.ts' },
    ]);
  });

  it('classifies every core and game source module', async () => {
    const graph = await actualSimulationGraph();
    const modules = [...(await sourceFilesUnder('src/core')), ...(await sourceFilesUnder('src/game'))];
    const scopedExclusions = SIMULATION_EXCLUSIONS.filter(
      (rule) => rule.startsWith('src/core/') || rule.startsWith('src/game/'),
    );
    // Core/game rules must name individual files; a directory-wide exception would mask newly added modules.
    expect(scopedExclusions.every((rule) => rule.endsWith('.ts'))).toBe(true);
    expect(
      Object.entries(NON_RUNTIME_SOURCE_RULES).every(([path, reason]) => path.endsWith('.ts') && reason.trim()),
    ).toBe(true);
    const excluded = (path: string) => SIMULATION_EXCLUSIONS.some((rule) => path === rule);
    const unclassified = modules.filter(
      (path) => !(graph.sources.has(path) || excluded(path) || Object.hasOwn(NON_RUNTIME_SOURCE_RULES, path)),
    );
    expect(unclassified, `Unclassified runtime source modules: ${unclassified.join(', ')}`).toEqual([]);
  });

  it('includes runtime-resolved source files, not unrelated UI files or type-only imports', async () => {
    const base: Sources = new Map([
      [
        `${root}/src/core/sim.ts`,
        "import { step } from './step.ts';\nimport type { Shape } from './contract.ts';\nexport { run } from './step.ts';\n",
      ],
      [`${root}/src/core/step.ts`, "import '../ui/hud.ts';\nexport const step = () => 1;\n"],
      [`${root}/src/core/contract.ts`, 'export interface Shape { value: number }\n'],
      [`${root}/src/ui/hud.ts`, 'export const label = "alive";\n'],
    ]);
    const original = await hash(base, ...entries);

    const outsideChanged = new Map(base);
    outsideChanged.set(`${root}/src/ui/hud.ts`, 'export const label = "changed";\n');
    expect(await hash(outsideChanged, ...entries)).toBe(original);

    const typeOnlyChanged = new Map(base);
    typeOnlyChanged.set(`${root}/src/core/contract.ts`, 'export interface Shape { value: string }\n');
    expect(await hash(typeOnlyChanged, ...entries)).toBe(original);

    const runtimeChanged = new Map(base);
    runtimeChanged.set(`${root}/src/core/step.ts`, `import '../ui/hud.ts';\nexport const step = () => 2;\n`);
    expect(await hash(runtimeChanged, ...entries)).not.toBe(original);
  });

  it('recomputes the identity for create, update, and delete hot changes', async () => {
    const results = await Promise.all(
      (['create', 'update', 'delete'] as const).map(async (type) => {
        let calls = 0;
        const next = await fingerprintAfterHotChange(type, 'before', () => {
          calls += 1;
          return Promise.resolve('after');
        });
        return { calls, next };
      }),
    );
    expect(results).toEqual([
      { calls: 1, next: 'after' },
      { calls: 1, next: 'after' },
      { calls: 1, next: 'after' },
    ]);
  });

  it('follows a runtime star re-export to its dependency', async () => {
    const sources: Sources = new Map([
      [`${root}/src/core/sim.ts`, "export * from './barrel.ts';\n"],
      [`${root}/src/core/barrel.ts`, "export * from './leaf.ts';\n"],
      [`${root}/src/core/leaf.ts`, 'export const rule = 1;\n'],
    ]);
    const graph = await collectSimulationSourceGraph(entries, root, hostFor(sources));
    expect([...graph.sources.keys()]).toContain('src/core/leaf.ts');
  });

  it('includes newly imported, untracked source without consulting Git', async () => {
    const before: Sources = new Map([[`${root}/src/core/sim.ts`, 'export const tick = () => 1;\n']]);
    const beforeHash = await hash(before, ...entries);
    const after: Sources = new Map([
      [`${root}/src/core/sim.ts`, "import { rule } from './untracked-rule.ts';\nexport const tick = () => rule();\n"],
      [`${root}/src/core/untracked-rule.ts`, 'export const rule = () => 2;\n'],
    ]);
    expect(await hash(after, ...entries)).not.toBe(beforeHash);
  });

  it('fails closed when a runtime import cannot be resolved', async () => {
    const sources: Sources = new Map([[`${root}/src/core/sim.ts`, "import './missing.ts';\n"]]);
    await expect(collectSimulationSourceGraph(entries, root, hostFor(sources))).rejects.toThrow(
      UNRESOLVED_DEPENDENCY_ERROR,
    );
  });

  it('rejects virtual and out-of-project runtime IDs', async () => {
    const sources: Sources = new Map([[`${root}/src/core/sim.ts`, "import './dependency.ts';\n"]]);
    await Promise.all(
      ['\u0000virtual:dependency', '/fixture/outside/dependency.ts'].map(async (resolvedId) => {
        const host: SimulationModuleGraphHost = {
          resolve() {
            return Promise.resolve(resolvedId);
          },
          readFile(path) {
            const source = sources.get(path);
            return source === undefined
              ? Promise.reject(new Error(`missing fixture source: ${path}`))
              : Promise.resolve(source);
          },
        };
        await expect(collectSimulationSourceGraph(entries, root, host)).rejects.toThrow(UNSUPPORTED_ID_ERROR);
      }),
    );
  });

  it('rejects unsupported glob, CommonJS, and worker-URL dependency discovery', async () => {
    await Promise.all(
      [
        "import.meta.glob('./dynamic/*.ts');\n",
        "const module = require('./dynamic.ts');\n",
        "new Worker(new URL('./unclassified.worker.ts', import.meta.url));\n",
      ].map((source) => {
        const sources: Sources = new Map([[`${root}/src/core/sim.ts`, source]]);
        return expect(collectSimulationSourceGraph(entries, root, hostFor(sources))).rejects.toThrow(
          UNSUPPORTED_DISCOVERY_ERROR,
        );
      }),
    );
  });

  it('fails closed when a runtime dependency is not a classified source, content file, or presentation asset', async () => {
    await Promise.all(
      ['.wasm', '.ogg'].map((extension) => {
        const path = `${root}/src/core/opaque${extension}`;
        const sources: Sources = new Map([[`${root}/src/core/sim.ts`, `import './opaque${extension}';\n`]]);
        const host: SimulationModuleGraphHost = {
          resolve() {
            return Promise.resolve(path);
          },
          readFile(file) {
            const source = sources.get(file);
            return source === undefined
              ? Promise.reject(new Error(`missing fixture source: ${file}`))
              : Promise.resolve(source);
          },
        };
        return expect(collectSimulationSourceGraph(entries, root, host)).rejects.toThrow(
          UNSUPPORTED_RUNTIME_DEPENDENCY_ERROR,
        );
      }),
    );
  });

  it('is stable across traversal order and LF/CRLF line endings', async () => {
    const lf: Sources = new Map([
      [`${root}/src/core/sim.ts`, "import './b.ts';\nimport './a.ts';\n"],
      [`${root}/src/core/a.ts`, 'export const a = 1;\n'],
      [`${root}/src/core/b.ts`, 'export const b = 2;\n'],
    ]);
    const crlfAndReordered: Sources = new Map([
      [`${root}/src/core/sim.ts`, "import './b.ts';\r\nimport './a.ts';\r\n"],
      [`${root}/src/core/a.ts`, 'export const a = 1;\r\n'],
      [`${root}/src/core/b.ts`, 'export const b = 2;\r\n'],
    ]);
    expect(await hash(crlfAndReordered, 'src/core/b.ts', 'src/core/sim.ts')).toBe(
      await hash(lf, 'src/core/sim.ts', 'src/core/b.ts'),
    );
  });
});
