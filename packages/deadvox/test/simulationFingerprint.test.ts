import { readdir, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import { ADMISSION_ENTRIES } from '../tools/bundleStampPlugin.ts';
import {
  collectSimulationSourceGraph,
  FEASIBILITY_ENTRIES,
  fingerprintAfterHotChange,
  fingerprintSimulationSourceMap,
  fingerprintSimulationSources,
  labelledPath,
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
      let base = isAbsolute(specifier) ? specifier : resolve(dirname(importer ?? root), specifier);
      if (specifier === '@skelly/thing-core/schema') {
        base = resolve(root, '../skelly-assets/tools/packages/thing-core/src/schema.ts');
      }
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

// Core and game files outside simulation identity, each with its reason: test, build or type-only
// files, and presentation, live-input or debug files that only the excluded browser shell reaches.
// Unlike an exclusion, a rule here only records the file: a later runtime import brings it back
// into identity, so a simulation use added later cannot hide behind it.
const NON_RUNTIME_SOURCE_RULES: Record<string, string> = {
  'engine/core/soundEvents.ts': 'Erased sound-id type contracts; selections and validation stay in the runtime graph.',
  'engine/core/actorSense.ts': 'Erased player-sense contracts; perception and motion remain in the runtime graph.',
  'engine/core/bones.ts': 'Erased skeleton type contracts; posing and dismemberment remain in the runtime graph.',
  'engine/core/massProperties.ts':
    'Voxel mass and bounds of built bodies for ragdolls and severed parts; no simulation module imports it.',
  'engine/core/actorClips.ts': 'Baked clip composer that no runtime module imports; its tests read it over a fixture.',
  'engine/core/buildRevision.ts': 'Test/build-only diagnostic helper; no game runtime imports it.',
  'engine/core/reachability.ts': 'CLI/test-only static content acceptance; no game runtime imports it.',
  'engine/core/scenarioCertificate.ts': 'Test-only route proof; no game runtime imports it.',
  'engine/core/scenarioRoute.ts':
    'Test-only route-proof support; cityLots.ts imports only its types, and its value user scenarioCertificate.ts is test-only.',
  'engine/core/pileDisplay.ts': 'Presentation-only pile projection; it does not alter simulation or save identity.',
  'engine/core/firearmAimOffHand.ts':
    'Presentation-only hand-role projection; it does not alter simulation or save identity.',
  'engine/core/firearmAimPose.ts':
    'Presentation-only hand-pose projection; it does not alter simulation or save identity.',
  'engine/core/percentile.ts': 'Timing summary for the debug frame readout and the benchmark, not game runtime.',
  'engine/core/playerState.ts': 'Type-only contract; the imported interface erases from runtime code.',
  'engine/game/debugNoclipStep.ts': 'Type-only contract; the imported interface erases from runtime code.',
  'engine/game/mesherProtocol.ts': 'Type-only mesher messages; the imported types erase from runtime code.',
  'engine/game/storageContract.ts':
    'Type-only save and mod storage contracts; the imported types erase from runtime code.',
  'engine/core/soundOcclusion.ts':
    'Presentation-only filtering, reached only from the WebAudio adapter, which no simulation entry reaches.',
  'engine/game/hearing.ts':
    'Heard-sound record and occlusion, reached only from the WebAudio adapter, which no simulation entry reaches.',
  'engine/game/bindingRegistry.ts':
    'Default keys and rebinding preferences; replay records action ids from the input actions, not from key bindings.',
  'engine/game/actionMenu.ts':
    'Live-input pointing and choice of the radial action menu; replay applies the recorded command, not the gesture.',
  'engine/game/heldActionPress.ts':
    'Live-input tap-or-hold of a held use press; replay applies the recorded hand.action, not the press.',
  'engine/core/forwardReleaseWatch.ts':
    'Live-input forward-button release reading; replay applies the recorded hand.action, not the button events.',
  'engine/game/voiceCaps.ts':
    'Playback voice caps, reached only from the WebAudio adapter, which no simulation entry reaches.',
  'engine/core/schedulerIds.ts':
    'Reached only through the excluded save controller; test/saveSchedulerIds.test.ts keeps it equal to the fingerprinted registrations, so it cannot change without them.',
  'engine/core/temporalFields.ts': 'Authored-field catalogue used by the time linter, not game runtime.',
  'engine/core/interactionAffordance.ts':
    'Presentation projection of the interaction highlight; replay applies recorded payloads, not the highlight.',
  'engine/core/stageMarks.ts':
    'Tutorial and playtest-observer stage values; core/site.ts imports only the type, so nothing simulated reads them.',
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
  const target = labelledPath(projectRoot, path);
  const sourcePath = path;
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
  it('covers both admission paths in the stamp and simulation fingerprints', async () => {
    const host = await actualSimulationHost();
    const proof = await collectSimulationSourceGraph(ADMISSION_ENTRIES, projectRoot, host);
    const simulation = await actualSimulationGraph();
    for (const path of ['engine/core/content.ts', 'engine/core/bundleAdmission.ts', 'engine/core/schema.ts']) {
      expect(proof.sources.has(path)).toBe(true);
      expect(simulation.sources.has(path)).toBe(true);
    }
    const before = fingerprintSimulationSourceMap(proof.sources);
    const changed = new Map(proof.sources);
    const path = 'engine/core/bundleAdmission.ts';
    changed.set(path, `${changed.get(path)!}\n// Fixture admission policy mutation.\n`);
    expect(fingerprintSimulationSourceMap(changed)).not.toBe(before);
    const mutation = await mutateSimulationSource(host, path);
    expect(mutation.included).toBe(true);
    expect(mutation.value).not.toBe(await actualSimulationFingerprint());
  });

  it('keeps excluded runtime edges and presentation libraries out of the actual Vite-resolved graph', async () => {
    const graph = await actualSimulationGraph();
    expect(graph.sources.has('presentation/worker/mesh.worker.ts')).toBe(false);
    expect(graph.sources.has('presentation/presentation/engine.ts')).toBe(false);
    expect(graph.sources.has('presentation/presentation/playtestObserver.ts')).toBe(false);
    const paths = [...graph.sources.keys()];
    expect(paths.some((path) => path.startsWith('presentation/ui/'))).toBe(false);
    expect(paths.some((path) => path.startsWith('presentation/render/'))).toBe(false);
    expect(paths.filter((path) => path.startsWith('presentation/presentation/'))).toEqual([]);
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
    const cap = await mutateSimulationSource(host, 'presentation/presentation/audio.ts');
    expect(cap.value).toBe(original);
    expect(cap.included).toBe(false);
    const picker = await mutateSimulationSource(host, 'engine/core/soundPicker.ts', '`sound:', '`changed:');
    expect(picker.included).toBe(true);
    expect(picker.value).not.toBe(original);
    const admission = await mutateSimulationSource(
      host,
      'engine/game/session.ts',
      'const emittedAsNoise = noiseRadiusMetres !== undefined || (player && definition.noise.enabled);',
      'const emittedAsNoise = false;',
    );
    expect(admission.included).toBe(true);
    expect(admission.value).not.toBe(original);
    const graph = await actualSimulationGraph();
    expect(graph.sources.has('engine/core/saveState.ts')).toBe(true);
    expect(graph.sources.has('engine/core/saveFormat.ts')).toBe(true);
  });

  it('ignores HUD/paper wording but fingerprints the gameplay interaction reach', async () => {
    const host = await actualSimulationHost();
    const original = await actualSimulationFingerprint();
    const hud = await mutateSimulationSource(host, 'presentation/ui/playHud.ts');
    expect(hud.included).toBe(false);
    expect(hud.value).toBe(original);
    const paper = await mutateSimulationSource(host, 'presentation/ui/reading.ts');
    expect(paper.included).toBe(false);
    expect(paper.value).toBe(original);
    const reach = await mutateSimulationSource(host, 'engine/game/commandRouter.ts');
    expect(reach.included).toBe(true);
    expect(reach.value).not.toBe(original);
  });

  it('keeps handling sound selection and placement outside the actual simulation fingerprint', async () => {
    const host = await actualSimulationHost();
    const before = await actualSimulationFingerprint();
    const voice = await mutateSimulationSource(host, 'engine/game/actorAudio.ts');
    expect(voice.included).toBe(false);
    expect(voice.value).toBe(before);
    const changed = await mutateSimulationSource(host, 'engine/game/audioPresentation.ts');
    expect(changed.included).toBe(false);
    expect(changed.value).toBe(before);
  });

  it('excludes presentation copy and pose policy but fingerprints action policy', async () => {
    const host = await actualSimulationHost();
    const graph = await actualSimulationGraph();
    const original = fingerprintSimulationSourceMap(graph.sources);
    expect(graph.sources.has('engine/game/primaryAction.ts')).toBe(true);
    expect(graph.sources.has('src/debug/axisGizmo.ts')).toBe(false);
    expect(graph.sources.has('engine/game/firearmHandling.ts')).toBe(true);
    expect(graph.sources.has('presentation/presentation/debugTargetRay.ts')).toBe(false);
    expect(graph.sources.has('presentation/render/caseEffects.ts')).toBe(false);
    expect(graph.sources.has('presentation/presentation/controls.ts')).toBe(false);
    expect(graph.sources.has('presentation/render/meleePose.ts')).toBe(false);
    expect(graph.sources.has('presentation/ui/primaryActionHint.ts')).toBe(false);

    const debugPresentation = await mutateSimulationSource(host, 'src/debug/axisGizmo.ts');
    expect(debugPresentation.included).toBe(false);
    expect(debugPresentation.value).toBe(original);

    const debugTarget = await mutateSimulationSource(host, 'presentation/presentation/debugTargetRay.ts');
    expect(debugTarget.included).toBe(false);
    expect(debugTarget.value).toBe(original);

    const hint = await mutateSimulationSource(host, 'presentation/ui/primaryActionHint.ts');
    expect(hint.included).toBe(false);
    expect(hint.value).toBe(original);

    const helpCopy = await mutateSimulationSource(host, 'presentation/presentation/controls.ts');
    expect(helpCopy.included).toBe(false);
    expect(helpCopy.value).toBe(original);

    const offHandRenderPolicy = await mutateSimulationSource(host, 'presentation/render/meleePose.ts');
    expect(offHandRenderPolicy.included).toBe(false);
    expect(offHandRenderPolicy.value).toBe(original);

    const casePresentation = await mutateSimulationSource(host, 'presentation/render/caseEffects.ts');
    expect(casePresentation.included).toBe(false);
    expect(casePresentation.value).toBe(original);

    const firearmDrawing = await mutateSimulationSource(host, 'presentation/render/firearmModel.ts');
    expect(firearmDrawing.included).toBe(false);
    expect(firearmDrawing.value).toBe(original);
    const sharedFirearmTiming = await mutateSimulationSource(
      host,
      'engine/core/firearmAction.ts',
      '1 / action.roundsPerSimMinute',
      '2 / action.roundsPerSimMinute',
    );
    expect(sharedFirearmTiming.included).toBe(true);
    expect(sharedFirearmTiming.value).not.toBe(original);
    const firearmHandling = await mutateSimulationSource(host, 'engine/game/firearmHandling.ts');
    expect(firearmHandling.included).toBe(true);
    expect(firearmHandling.value).not.toBe(original);
    const cadence = await mutateSimulationSource(
      host,
      'engine/game/firearmTrigger.ts',
      'const interval = 1 / weapon.roundsPerSimSecond;',
      'const interval = 2 / weapon.roundsPerSimSecond;',
    );
    expect(cadence.included).toBe(true);
    expect(cadence.value).not.toBe(original);

    const handPolicy = await mutateSimulationSource(
      host,
      'engine/game/primaryAction.ts',
      'hand: HandSide = dominantSide(inventory.character)',
      'hand: HandSide = offSide(inventory.character)',
    );
    expect(handPolicy.included).toBe(true);
    expect(handPolicy.value).not.toBe(original);

    const capability = await mutateSimulationSource(
      host,
      'engine/game/primaryAction.ts',
      "{ kind: 'light', supports:",
      "{ kind: 'melee', supports:",
    );
    expect(capability.included).toBe(true);
    expect(capability.value).not.toBe(original);
  });

  it('classifies every core and game source module', async () => {
    const graph = await actualSimulationGraph();
    expect(SIMULATION_EXCLUSIONS).toContain('engine/core/assets.ts');
    expect(NON_RUNTIME_SOURCE_RULES).not.toHaveProperty('engine/core/assets.ts');
    // Engine files are labelled `'engine/'` in the manifest, as SIMULATION_ENTRIES names them.
    const engineSource = relative(projectRoot, dirname(labelledPath(projectRoot, 'engine/core')));
    const engineFiles = [
      ...(await sourceFilesUnder(join(engineSource, 'core'))),
      ...(await sourceFilesUnder(join(engineSource, 'game'))),
    ];
    const modules = engineFiles.map((path) => `engine/${relative(engineSource, path).split(sep).join('/')}`);
    const scopedExclusions = SIMULATION_EXCLUSIONS.filter(
      (rule) => rule.startsWith('engine/core/') || rule.startsWith('engine/game/'),
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
    expect(graph.sources.has('engine/core/authoredTerrain.mjs')).toBe(true);
    expect(graph.sources.has('engine/core/authoredTerrain.d.mts')).toBe(false);
    // A vehicle piece's solid blocks come from its fitted parts, so that geometry decides collision.
    expect(graph.sources.has('engine/vehicles/solid.ts')).toBe(true);
  });

  it('classifies the isolated feasibility graph separately from production and rejects WASM until explicitly owned', async () => {
    const host = await actualSimulationHost();
    const graph = await collectSimulationSourceGraph(FEASIBILITY_ENTRIES, projectRoot, host);
    const modules = await sourceFilesUnder('src/feasibility');
    const erasedContracts = 'src/feasibility/contract.ts';
    expect(modules.filter((path) => !graph.sources.has(path) && path !== erasedContracts)).toEqual([]);
    expect(graph.sources.has('src/feasibility/vehicleFeasibility.json')).toBe(true);
    expect(graph.sources.has('src/feasibility/movingBody.ts')).toBe(true);
    const entry = `${root}/src/core/sim.ts`;
    const wasm = `${root}/src/core/candidate.wasm`;
    await expect(
      collectSimulationSourceGraph(
        entries,
        root,
        hostFor(
          new Map([
            [entry, "import './candidate.wasm';"],
            [wasm, 'fixture bytes'],
          ]),
        ),
      ),
    ).rejects.toThrow(UNSUPPORTED_RUNTIME_DEPENDENCY_ERROR);
  });

  it('ignores ragdoll tuning', async () => {
    const host = await actualSimulationHost();
    const original = await actualSimulationFingerprint();
    const target = resolve(projectRoot, 'src/config/ragdoll.json');
    const content = JSON.parse(await host.readFile(target));
    const changed = JSON.stringify({ ...content, gravity: content.gravity + 1 });
    const graph = await collectSimulationSourceGraph(
      SIMULATION_ENTRIES,
      projectRoot,
      {
        ...host,
        readFile: (file) => (file === target ? Promise.resolve(changed) : host.readFile(file)),
      },
      { exclude: SIMULATION_EXCLUSIONS },
    );
    expect(fingerprintSimulationSourceMap(graph.sources)).toBe(original);
    expect(graph.sources.has('src/config/ragdoll.json')).toBe(false);
  });

  it('fingerprints pure figure modules imported by the simulation', async () => {
    const graph = await actualSimulationGraph();
    expect(graph.sources.has('engine/core/pose.ts')).toBe(true);
    expect(graph.sources.has('engine/core/boneTree.ts')).toBe(true);
    expect(graph.sources.has('engine/core/fusedMassFigure.ts')).toBe(true);
    expect(graph.sources.has('engine/core/fusedMassCarving.ts')).toBe(true);
  });

  it('fingerprints shared model-schema changes imported by the simulation', async () => {
    const entry = `${root}/src/core/sim.ts`;
    const schema = resolve(root, '../skelly-assets/tools/packages/thing-core/src/schema.ts');
    const sources = new Map([
      [entry, "import { validate } from '@skelly/thing-core/schema'; export { validate };"],
      [schema, 'export const validate = () => true;'],
    ]);
    const before = await hash(sources, ...entries);
    sources.set(schema, 'export const validate = () => false;');
    expect(await hash(sources, ...entries)).not.toBe(before);
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

  it.each(['../config/intake.json', '../../../skelly-assets/tools/packages/thing-core/src/materials.json'])(
    'fingerprints declarative JSON dependency %s without parsing it as a module',
    async (specifier) => {
      const entry = resolve(root, entries[0]!);
      const dependency = resolve(entry, '..', specifier);
      const sources = new Map([
        [entry, `import config from '${specifier}'; export const cap = config.cap;`],
        [dependency, '{"cap": 100}'],
      ]);
      const before = await hash(sources, ...entries);
      sources.set(dependency, '{"cap": 200}');
      expect(await hash(sources, ...entries)).not.toBe(before);
    },
  );

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
