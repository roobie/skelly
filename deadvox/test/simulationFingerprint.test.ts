import { readdir, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import {
  collectSimulationSourceGraph,
  fingerprintAfterHotChange,
  fingerprintSimulationSourceMap,
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
const DECLARATION_FILE_PATTERN = /\.d\.[cm]?ts$/;

// These files are not runtime roots: buildRevision is a test/build diagnostic helper,
// while debugInterface contains only erased TypeScript contracts.
const NON_RUNTIME_SOURCE_RULES: Record<string, string> = {
  'src/core/buildRevision.ts': 'Test/build-only diagnostic helper; no game runtime imports it.',
  'src/core/reachability.ts': 'CLI/test-only static content acceptance; no game runtime imports it.',
  'src/game/debugInterface.ts': 'Type-only contracts; the imported interfaces erase from runtime code.',
  'src/game/renderMode.ts':
    'Presentation-only development render selection; does not alter simulation or save identity.',
  'src/core/rigidBody.ts': 'Presentation-only debris physics, excluded with the renderer from save identity.',
  'src/core/soundOcclusion.ts': 'Presentation-only filtering, reached only through the excluded WebAudio adapter.',
  'src/core/temporalFields.ts': 'Authored-field catalogue used by the time linter, not game runtime.',
};

async function sourceFilesUnder(directory: string): Promise<string[]> {
  const files = await readdir(resolve(projectRoot, directory), { withFileTypes: true });
  const directories = files.filter((file) => file.isDirectory());
  const nested = await Promise.all(directories.map((file) => sourceFilesUnder(join(directory, file.name))));
  const direct = files
    .filter((file) => file.isFile() && SOURCE_FILE_PATTERN.test(file.name) && !DECLARATION_FILE_PATTERN.test(file.name))
    .map((file) => join(directory, file.name));
  return [...direct, ...nested.flat()].sort();
}

let actualHost: Promise<SimulationModuleGraphHost> | undefined;
const actualSimulationHost = (): Promise<SimulationModuleGraphHost> => {
  actualHost ??= (async () => {
    const config = await resolveConfig({ configFile: false, root: projectRoot, logLevel: 'silent' }, 'build');
    const viteResolve = config.createResolver();
    return {
      resolve(specifier, importer) {
        if (specifier.startsWith('@mobgen/')) {
          return Promise.resolve(resolve(projectRoot, '../mobgen/src', specifier.slice('@mobgen/'.length)));
        }
        return Promise.resolve(viteResolve(specifier, importer));
      },
      readFile(path) {
        return readFile(path, 'utf8');
      },
    };
  })();
  return actualHost;
};

let actualGraph: ReturnType<typeof collectSimulationSourceGraph> | undefined;
function actualSimulationGraph() {
  actualGraph ??= actualSimulationHost().then((host) =>
    collectSimulationSourceGraph(SIMULATION_ENTRIES, projectRoot, host, { exclude: SIMULATION_EXCLUSIONS }),
  );
  return actualGraph;
}

function actualSimulationFingerprint() {
  return actualSimulationGraph().then(({ sources }) => fingerprintSimulationSourceMap(sources));
}

async function mutateSimulationSource(
  host: SimulationModuleGraphHost,
  path: string,
  before = '',
  after = '\n// Test-owned fingerprint mutation.\n',
) {
  const target = resolve(projectRoot, path);
  const sourcePath = relative(projectRoot, target).split(sep).join('/');
  const graph = await actualSimulationGraph();
  const original = graph.sources.get(sourcePath) ?? (await host.readFile(target));
  if (!original.includes(before)) {
    throw new Error(`mutation source ${path} does not contain its anchor`);
  }
  const mutated = original.replace(before, after);
  if (mutated === original) {
    throw new Error(`mutation does not change ${path}`);
  }
  const sources = new Map(graph.sources);
  const included = sources.has(sourcePath);
  if (included) {
    sources.set(sourcePath, mutated);
  }
  return { included, value: fingerprintSimulationSourceMap(sources) };
}

describe('simulation source fingerprint', () => {
  it('keeps excluded runtime edges and presentation libraries out of the actual Vite-resolved graph', async () => {
    const graph = await actualSimulationGraph();
    expect(graph.sources.has('src/worker/mesh.worker.ts')).toBe(false);
    expect(graph.sources.has('src/game/engine.ts')).toBe(false);
    expect(graph.sources.has('src/game/playtestObserver.ts')).toBe(false);
    const paths = [...graph.sources.keys()];
    expect(paths.some((path) => path.startsWith('src/ui/'))).toBe(false);
    expect(paths.some((path) => path.startsWith('src/render/'))).toBe(false);
    expect(paths.some((path) => path.startsWith('node_modules/lit-html/'))).toBe(false);
    expect(paths.some((path) => path.startsWith('node_modules/three/'))).toBe(false);
    expect(graph.sources.size).toBeGreaterThan(0);
    expect(graph.excludedImports.length).toBeGreaterThan(0);
    for (const { importer, excluded } of graph.excludedImports) {
      expect(paths).toContain(importer);
      expect(paths).not.toContain(excluded);
    }
  });

  it('excludes WebAudio implementation but fingerprints sound admission, seeded selection and saves', async () => {
    const host = await actualSimulationHost();
    const original = await actualSimulationFingerprint();
    const cap = await mutateSimulationSource(host, 'src/game/audio.ts');
    expect(cap.value).toBe(original);
    expect(cap.included).toBe(false);
    const picker = await mutateSimulationSource(host, 'src/core/soundPicker.ts', '`sound:', '`changed:');
    expect(picker.included).toBe(true);
    expect(picker.value).not.toBe(original);
    const admission = await mutateSimulationSource(
      host,
      'src/game/session.ts',
      'const emittedAsNoise = noiseRadiusMetres !== undefined || (player && definition.noise.enabled);',
      'const emittedAsNoise = false;',
    );
    expect(admission.included).toBe(true);
    expect(admission.value).not.toBe(original);
    const graph = await actualSimulationGraph();
    expect(graph.sources.has('src/core/saveState.ts')).toBe(true);
    expect(graph.sources.has('src/core/saveFormat.ts')).toBe(true);
  });

  it('ignores HUD/paper wording but fingerprints the gameplay interaction reach', async () => {
    const host = await actualSimulationHost();
    const original = await actualSimulationFingerprint();
    const hud = await mutateSimulationSource(host, 'src/ui/playHud.ts');
    expect(hud.included).toBe(false);
    expect(hud.value).toBe(original);
    const paper = await mutateSimulationSource(host, 'src/ui/reading.ts');
    expect(paper.included).toBe(false);
    expect(paper.value).toBe(original);
    const reach = await mutateSimulationSource(host, 'src/game/play.ts');
    expect(reach.included).toBe(true);
    expect(reach.value).not.toBe(original);
  });

  it('keeps handling sound selection and placement outside the actual simulation fingerprint', async () => {
    const host = await actualSimulationHost();
    const before = await actualSimulationFingerprint();
    const voice = await mutateSimulationSource(host, 'src/game/shamblerAudio.ts');
    expect(voice.included).toBe(false);
    expect(voice.value).toBe(before);
    const changed = await mutateSimulationSource(host, 'src/game/audioPresentation.ts');
    expect(changed.included).toBe(false);
    expect(changed.value).toBe(before);
  });

  it('excludes presentation copy and pose policy but fingerprints action policy', async () => {
    const host = await actualSimulationHost();
    const graph = await actualSimulationGraph();
    const original = fingerprintSimulationSourceMap(graph.sources);
    expect(graph.sources.has('src/game/primaryAction.ts')).toBe(true);
    expect(graph.sources.has('src/debug/axisGizmo.ts')).toBe(false);
    expect(graph.sources.has('src/game/firearmHandling.ts')).toBe(true);
    expect(graph.sources.has('src/game/debugTargetRay.ts')).toBe(false);
    expect(graph.sources.has('src/render/caseEffects.ts')).toBe(false);
    expect(graph.sources.has('src/game/controls.ts')).toBe(false);
    expect(graph.sources.has('src/render/meleePose.ts')).toBe(false);
    expect(graph.sources.has('src/ui/primaryActionHint.ts')).toBe(false);

    const debugPresentation = await mutateSimulationSource(host, 'src/debug/axisGizmo.ts');
    expect(debugPresentation.included).toBe(false);
    expect(debugPresentation.value).toBe(original);

    const debugTarget = await mutateSimulationSource(host, 'src/game/debugTargetRay.ts');
    expect(debugTarget.included).toBe(false);
    expect(debugTarget.value).toBe(original);

    const hint = await mutateSimulationSource(host, 'src/ui/primaryActionHint.ts');
    expect(hint.included).toBe(false);
    expect(hint.value).toBe(original);

    const helpCopy = await mutateSimulationSource(host, 'src/game/controls.ts');
    expect(helpCopy.included).toBe(false);
    expect(helpCopy.value).toBe(original);

    const offHandRenderPolicy = await mutateSimulationSource(host, 'src/render/meleePose.ts');
    expect(offHandRenderPolicy.included).toBe(false);
    expect(offHandRenderPolicy.value).toBe(original);

    const casePresentation = await mutateSimulationSource(host, 'src/render/caseEffects.ts');
    expect(casePresentation.included).toBe(false);
    expect(casePresentation.value).toBe(original);

    const firearmDrawing = await mutateSimulationSource(host, 'src/render/firearmModel.ts');
    expect(firearmDrawing.included).toBe(false);
    expect(firearmDrawing.value).toBe(original);
    const sharedFirearmTiming = await mutateSimulationSource(
      host,
      'src/core/firearmAction.ts',
      '1 / action.roundsPerSimMinute',
      '2 / action.roundsPerSimMinute',
    );
    expect(sharedFirearmTiming.included).toBe(true);
    expect(sharedFirearmTiming.value).not.toBe(original);
    const firearmHandling = await mutateSimulationSource(host, 'src/game/firearmHandling.ts');
    expect(firearmHandling.included).toBe(true);
    expect(firearmHandling.value).not.toBe(original);
    const cadence = await mutateSimulationSource(
      host,
      'src/game/firearmTrigger.ts',
      'const interval = 1 / weapon.roundsPerSimSecond;',
      'const interval = 2 / weapon.roundsPerSimSecond;',
    );
    expect(cadence.included).toBe(true);
    expect(cadence.value).not.toBe(original);

    const handPolicy = await mutateSimulationSource(
      host,
      'src/game/primaryAction.ts',
      'hand: HandSide = dominantSide(inventory.character)',
      'hand: HandSide = offSide(inventory.character)',
    );
    expect(handPolicy.included).toBe(true);
    expect(handPolicy.value).not.toBe(original);

    const capability = await mutateSimulationSource(
      host,
      'src/game/primaryAction.ts',
      "{ kind: 'light', supports:",
      "{ kind: 'melee', supports:",
    );
    expect(capability.included).toBe(true);
    expect(capability.value).not.toBe(original);
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
    expect(graph.sources.has('src/core/authoredTerrain.mjs')).toBe(true);
    expect(graph.sources.has('src/core/authoredTerrain.d.mts')).toBe(false);
  });

  it('fingerprints pure mobgen modules imported by the simulation', async () => {
    const graph = await actualSimulationGraph();
    expect(graph.sources.has('mobgen/mob/shamblerFigure.ts')).toBe(true);
    expect(graph.sources.has('mobgen/core/pose.ts')).toBe(true);
    expect(graph.sources.has('mobgen/mob/attack.ts')).toBe(true);
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
