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
const pocketLabel = ` pocket ${['$', '{job.target.pocket + 1}'].join('')}`;
const compartmentLabel = ` compartment ${['$', '{job.target.pocket + 1}'].join('')}`;

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
const GUNSHOT_CAP_ENTRY_PATTERN = /\['gunshot', \d+\]/;
const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/;

// These files are not runtime roots: buildRevision is a test/build diagnostic helper,
// while debugInterface contains only erased TypeScript contracts.
const NON_RUNTIME_SOURCE_RULES: Record<string, string> = {
  'src/core/buildRevision.ts': 'Test/build-only diagnostic helper; no game runtime imports it.',
  'src/core/reachability.ts': 'CLI/test-only static content acceptance; no game runtime imports it.',
  'src/game/debugInterface.ts': 'Type-only contracts; the imported interfaces erase from runtime code.',
  'src/core/rigidBody.ts': 'Presentation-only debris physics, excluded with the renderer from save identity.',
  'src/core/soundOcclusion.ts': 'Presentation-only filtering, reached only through the excluded WebAudio adapter.',
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

async function actualSimulationHost(): Promise<SimulationModuleGraphHost> {
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
}

async function actualSimulationGraph() {
  return collectSimulationSourceGraph(SIMULATION_ENTRIES, projectRoot, await actualSimulationHost(), {
    exclude: SIMULATION_EXCLUSIONS,
  });
}

async function mutateSimulationSource(host: SimulationModuleGraphHost, path: string, before: string, after: string) {
  const target = resolve(projectRoot, path);
  const original = await host.readFile(target);
  if (!original.includes(before)) {
    throw new Error(`mutation source ${path} does not contain its anchor`);
  }
  const mutated = original.replace(before, after);
  if (mutated === original) {
    throw new Error(`mutation does not change ${path}`);
  }
  let reads = 0;
  const mutatedHost: SimulationModuleGraphHost = {
    ...host,
    readFile(file) {
      if (file === target) {
        reads += 1;
        return Promise.resolve(mutated);
      }
      return host.readFile(file);
    },
  };
  const value = await fingerprintSimulationSources(SIMULATION_ENTRIES, projectRoot, mutatedHost, {
    exclude: SIMULATION_EXCLUSIONS,
  });
  return { reads, value };
}

describe('simulation source fingerprint', () => {
  it('pins every excluded module reached from the actual Vite-resolved simulation graph', async () => {
    const graph = await actualSimulationGraph();
    expect(graph.sources.has('src/worker/mesh.worker.ts')).toBe(false);
    expect(graph.sources.has('src/game/engine.ts')).toBe(false);
    expect(graph.sources.has('src/game/playtestObserver.ts')).toBe(false);
    expect([...graph.sources.keys()].some((path) => path.startsWith('src/ui/'))).toBe(false);
    expect([...graph.sources.keys()].some((path) => path.startsWith('node_modules/lit-html/'))).toBe(false);
    expect([...graph.sources.keys()].some((path) => path.startsWith('node_modules/three/'))).toBe(false);
    expect(SIMULATION_EXCLUSIONS).toEqual(
      expect.arrayContaining([
        'src/game/audioPresentation.ts',
        'src/game/saveStorage.ts',
        'src/game/saveStorageRecord.ts',
        'src/game/saveStorageProtocol.ts',
        'src/game/controls.ts',
        'src/game/playtestTools.ts',
        'src/game/playtestObserver.ts',
        'src/worker/save.worker.ts',
        'src/ui/saveController.ts',
      ]),
    );
    expect(graph.excludedImports).toEqual([
      { importer: 'src/game/play.ts', excluded: 'src/core/sideButton.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/game/audio.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/game/audioPresentation.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/game/controls.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/game/playtestObserver.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/game/playtestTools.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/render/frameTimes.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/render/meleePose.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/render/playFrames.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/render/playView.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/audioOptions.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/credits.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/death.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/gameCursor.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/hud.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/hudOptions.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/inventoryScreen.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/menuPointer.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/menuState.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/playHud.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/playReadout.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/primaryActionHint.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/reading.ts' },
      { importer: 'src/game/play.ts', excluded: 'src/ui/rest.ts' },
      { importer: 'src/game/streamer.ts', excluded: 'src/core/meshInput.ts' },
      { importer: 'src/game/worldSetup.ts', excluded: 'src/core/meshInput.ts' },
    ]);
  });

  it('ignores WebAudio voice-cap changes but fingerprints sound admission, seeded selection and saves', async () => {
    const host = await actualSimulationHost();
    const original = await fingerprintSimulationSources(SIMULATION_ENTRIES, projectRoot, host, {
      exclude: SIMULATION_EXCLUSIONS,
    });
    const capSource = await host.readFile(resolve(projectRoot, 'src/game/audio.ts'));
    const capEntry = capSource.match(GUNSHOT_CAP_ENTRY_PATTERN)?.[0];
    expect(capEntry).toBeDefined();
    const cap = await mutateSimulationSource(host, 'src/game/audio.ts', capEntry!, "['gunshot', 64]");
    expect(cap.value).toBe(original);
    expect(cap.reads).toBe(0);
    const picker = await mutateSimulationSource(host, 'src/core/soundPicker.ts', '`sound:', '`changed:');
    expect(picker.reads).toBe(1);
    expect(picker.value).not.toBe(original);
    const admission = await mutateSimulationSource(
      host,
      'src/game/session.ts',
      'const emittedAsNoise = player && definition.noise.enabled;',
      'const emittedAsNoise = false;',
    );
    expect(admission.reads).toBe(1);
    expect(admission.value).not.toBe(original);
    const graph = await actualSimulationGraph();
    expect(graph.sources.has('src/core/saveState.ts')).toBe(true);
    expect(graph.sources.has('src/core/saveFormat.ts')).toBe(true);
  });

  it('ignores HUD/paper wording but fingerprints the gameplay interaction reach', async () => {
    const host = await actualSimulationHost();
    const original = await fingerprintSimulationSources(SIMULATION_ENTRIES, projectRoot, host, {
      exclude: SIMULATION_EXCLUSIONS,
    });
    const hud = await mutateSimulationSource(host, 'src/ui/playHud.ts', 'fps   seed', 'FPS / seed');
    expect(hud.reads).toBe(0);
    expect(hud.value).toBe(original);
    const paper = await mutateSimulationSource(host, 'src/ui/reading.ts', 'The world keeps moving', 'Live world');
    expect(paper.reads).toBe(0);
    expect(paper.value).toBe(original);
    const reach = await mutateSimulationSource(
      host,
      'src/game/play.ts',
      'const USE_REACH = 2;',
      'const USE_REACH = 3;',
    );
    expect(reach.reads).toBe(1);
    expect(reach.value).not.toBe(original);
  });

  it('keeps handling sound selection and placement outside the actual simulation fingerprint', async () => {
    const host = await actualSimulationHost();
    const options = { exclude: SIMULATION_EXCLUSIONS };
    const before = await fingerprintSimulationSources(SIMULATION_ENTRIES, projectRoot, host, options);
    const path = resolve(projectRoot, 'src/game/audioPresentation.ts');
    const source = await host.readFile(path);
    const changed = source.replace("event: 'pouch_take'", "event: 'melee_swing'");
    expect(changed).not.toBe(source);
    let reads = 0;
    const after = await fingerprintSimulationSources(
      SIMULATION_ENTRIES,
      projectRoot,
      {
        ...host,
        readFile(file) {
          if (file === path) {
            reads += 1;
            return Promise.resolve(changed);
          }
          return host.readFile(file);
        },
      },
      options,
    );
    expect(reads).toBe(0);
    expect(after).toBe(before);
  });

  it('excludes presentation copy and pose policy but fingerprints action policy', async () => {
    const host = await actualSimulationHost();
    const graph = await actualSimulationGraph();
    const original = await fingerprintSimulationSources(SIMULATION_ENTRIES, projectRoot, host, {
      exclude: SIMULATION_EXCLUSIONS,
    });
    expect(graph.sources.has('src/game/primaryAction.ts')).toBe(true);
    expect(graph.sources.has('src/debug/axisGizmo.ts')).toBe(false);
    expect(graph.sources.has('src/game/firearmHandling.ts')).toBe(true);
    expect(graph.sources.has('src/render/caseEffects.ts')).toBe(false);
    expect(graph.sources.has('src/game/controls.ts')).toBe(false);
    expect(graph.sources.has('src/render/meleePose.ts')).toBe(false);
    expect(graph.sources.has('src/ui/primaryActionHint.ts')).toBe(false);

    const debugPresentation = await mutateSimulationSource(
      host,
      'src/debug/axisGizmo.ts',
      'Yaw zero looks north (-Z); positive yaw turns west, matching aimDirection.',
      'Yaw zero looks north (-Z); positive yaw turns west, matching aimDirection. Debug only.',
    );
    expect(debugPresentation.reads).toBe(0);
    expect(debugPresentation.value).toBe(original);

    const hint = await mutateSimulationSource(
      host,
      'src/ui/primaryActionHint.ts',
      'Nothing to do with ',
      'No action available for ',
    );
    expect(hint.reads).toBe(0);
    expect(hint.value).toBe(original);

    const helpCopy = await mutateSimulationSource(
      host,
      'src/game/controls.ts',
      'Right-hand primary action; right jab if empty',
      'Right-hand item action; right jab if empty',
    );
    expect(helpCopy.reads).toBe(0);
    expect(helpCopy.value).toBe(original);

    const inventoryHelpCopy = await mutateSimulationSource(
      host,
      'src/game/controls.ts',
      'Open / close inventory',
      'Toggle inventory screen',
    );
    expect(inventoryHelpCopy.reads).toBe(0);
    expect(inventoryHelpCopy.value).toBe(original);

    const offHandRenderPolicy = await mutateSimulationSource(
      host,
      'src/render/meleePose.ts',
      'pose[offHand] = { offset: [0, 0, 0], rotation: [0, 0, 0] };',
      'pose[offHand] = { offset: [0, 0.01, 0], rotation: [0, 0, 0] };',
    );
    expect(offHandRenderPolicy.reads).toBe(0);
    expect(offHandRenderPolicy.value).toBe(original);

    const casePresentation = await mutateSimulationSource(
      host,
      'src/render/caseEffects.ts',
      'const MAX_AGE = 6;',
      'const MAX_AGE = 7;',
    );
    expect(casePresentation.reads).toBe(0);
    expect(casePresentation.value).toBe(original);

    const firearmHandling = await mutateSimulationSource(host, 'src/game/firearmHandling.ts', 'rpm: 600', 'rpm: 601');
    expect(firearmHandling.reads).toBe(1);
    expect(firearmHandling.value).not.toBe(original);
    const cadence = await mutateSimulationSource(
      host,
      'src/game/firearmHandling.ts',
      'const interval = 60 / weapon.rpm;',
      'const interval = 61 / weapon.rpm;',
    );
    expect(cadence.reads).toBe(1);
    expect(cadence.value).not.toBe(original);

    const handPolicy = await mutateSimulationSource(
      host,
      'src/game/primaryAction.ts',
      "primaryClick: 'right'",
      "primaryClick: 'left'",
    );
    expect(handPolicy.reads).toBe(1);
    expect(handPolicy.value).not.toBe(original);

    const capability = await mutateSimulationSource(
      host,
      'src/game/primaryAction.ts',
      "{ kind: 'light', supports:",
      "{ kind: 'melee', supports:",
    );
    expect(capability.reads).toBe(1);
    expect(capability.value).not.toBe(original);
  });

  it('keeps metrics-only observer label mutations outside the actual fingerprint', async () => {
    const config = await resolveConfig({ configFile: false, root: projectRoot, logLevel: 'silent' }, 'build');
    const viteResolve = config.createResolver();
    const hashWith = (edited: boolean) =>
      fingerprintSimulationSources(
        SIMULATION_ENTRIES,
        projectRoot,
        {
          resolve(specifier, importer) {
            if (specifier.startsWith('@mobgen/')) {
              return Promise.resolve(resolve(projectRoot, '../mobgen/src', specifier.slice('@mobgen/'.length)));
            }
            return Promise.resolve(viteResolve(specifier, importer));
          },
          async readFile(path) {
            const source = await readFile(path, 'utf8');
            return edited && path.endsWith('/src/game/playtestObserver.ts')
              ? source.replaceAll(pocketLabel, compartmentLabel)
              : source;
          },
        },
        { exclude: SIMULATION_EXCLUSIONS },
      );
    const observerPath = resolve(projectRoot, 'src/game/playtestObserver.ts');
    const observerSource = await readFile(observerPath, 'utf8');
    const relabeled = observerSource.replaceAll(pocketLabel, compartmentLabel);
    expect(relabeled).not.toBe(observerSource);
    expect(await hashWith(true)).toBe(await hashWith(false));
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
