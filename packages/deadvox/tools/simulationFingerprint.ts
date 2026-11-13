// biome-ignore lint/correctness/noNodejsModules: This build-time utility runs in Vite's Node.js process.
import { createHash } from 'node:crypto';
// biome-ignore lint/correctness/noNodejsModules: This build-time utility runs in Vite's Node.js process.
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { canonicalJson } from '@skelly/engine/save';
import { init, parse } from 'es-module-lexer';
import { transformWithOxc } from 'vite';

export interface SimulationModuleGraphHost {
  resolve: (specifier: string, importer?: string) => Promise<string | undefined>;
  readFile: (path: string) => Promise<string>;
  /** Reads a binary dependency's bytes; a graph that discovers one (WASM) fails closed without it. */
  readBinary?: (path: string) => Promise<Uint8Array>;
}

export interface SimulationFingerprintOptions {
  exclude?: readonly string[];
}

interface ExcludedSimulationImport {
  importer: string;
  excluded: string;
}

export interface SimulationSourceGraph {
  sources: ReadonlyMap<string, string>;
  excludedImports: readonly ExcludedSimulationImport[];
}

export type SimulationHotChangeType = 'create' | 'delete' | 'update';

export async function fingerprintAfterHotChange(
  type: SimulationHotChangeType,
  currentHash: string,
  computeFingerprint: () => Promise<string>,
): Promise<string | undefined> {
  if (type !== 'create' && type !== 'delete' && type !== 'update') {
    throw new Error(`Unsupported simulation hot-change type: ${type}`);
  }
  const nextHash = await computeFingerprint();
  return nextHash === currentHash ? undefined : nextHash;
}

// Isolated experiment identity: not game/save identity and never covered by the debug exclusion.
export const FEASIBILITY_ENTRIES = ['src/feasibility/runner.ts', 'src/feasibility/driving.ts'] as const;

export const SIMULATION_ENTRIES = [
  'engine/core/sim.ts',
  // Independently constructed appliance owners also determine saved simulation results.
  'engine/core/batteryChargers.ts',
  'engine/core/worldgen.ts',
  'engine/core/saveState.ts',
  'engine/core/saveFormat.ts',
  // Fingerprint new-game initialization independently of startup caller wiring.
  'engine/core/startState.ts',
  'engine/core/vehicleWork.ts',
  'engine/core/storage.ts',
  'engine/core/soundPicker.ts',
  'engine/game/player.ts',
  'engine/game/rest.ts',
  'engine/game/survival.ts',
  'engine/game/streamer.ts',
  'engine/game/config.ts',
  // Worlds receive admitted content, so startup admission is no longer reachable from world setup. The product's
  // sources and tunables it is given are content, outside this fingerprint.
  'engine/game/browserMods.ts',
  'engine/game/bundledMods.ts',
  'engine/game/commandRouter.ts',
  // Startup wiring that play.ts hands to the session and streamer, fingerprinted independently of that caller.
  'engine/game/layoutVehicles.ts',
  'engine/game/columnArrival.ts',
  'engine/game/quickbar.ts',
  'engine/game/session.ts',
  'engine/game/simulationStepper.ts',
  'engine/game/worldSetup.ts',
  // The Rapier f64 supply decides physics results; its only permitted importer, the supply seam, carries the
  // binaries into simulation identity until a consumer's import reaches them on its own.
  'src/core/rapier.ts',
] as const;

export const SIMULATION_EXCLUSIONS = [
  // Includes playView's owned meshes/camera/draw/disposal.
  'presentation/render',
  'src/debug',
  // Pointer-event quirks of the Mouse 5 side button (input handling); what the button does is in core/lights.ts.
  'engine/core/sideButton.ts',
  // Credits and asset-manifest validation at startup change neither simulation nor save state.
  'engine/core/assets.ts',
  'engine/core/sky.ts',
  'engine/core/mood.ts',
  // The default look is rendered presentation read by the view and debug panel; it changes neither simulation nor saves.
  'engine/core/lookDefaults.ts',
  // Render budgets select presentation work, not simulation or saved state.
  'engine/core/graphicsTuning.ts',
  // Camera field of view and optic lens projection affect rendered presentation, not simulation or saves.
  'engine/core/opticView.ts',
  // Render-only until weather affects the simulation; then remove this entry and save its state (ADR 0002).
  'engine/core/weather.ts',
  'engine/core/mesher.ts',
  'engine/core/wireMesh.ts',
  'engine/core/fencePosts.ts',
  // What the mesher reads from the world (block arrays copied out of chunks) and its helpers: presentation only.
  'engine/core/meshInput.ts',
  'engine/core/occlusion.ts',
  // What a mesher builds from a mesh request: presentation only.
  'engine/game/meshRequest.ts',
  // Which chunk blocks each mesher keeps between mesh requests: presentation only.
  'engine/game/sentChunks.ts',
  // Which columns are drawn yet: presentation only.
  'engine/core/columnReveal.ts',
  // Diffuse sky visibility only; does not change movement, sight, hearing or saved world state.
  'engine/core/skylight.ts',
  'engine/core/skySnapshot.ts',
  'engine/core/skyTransport.ts',
  'engine/core/shell.ts',
  'engine/core/pileLayout.ts',
  // Its public-cartography types describe printable features, not simulation or saved state.
  'engine/core/publicCartography.ts',
  'engine/game/audioPresentation.ts',
  'engine/game/actorAudio.ts',
  // Debug ragdoll staging and its tuning are presentation; corpse physics must not invalidate saves.
  'engine/game/ragdollConfig.ts',
  'engine/game/saveStorageErrors.ts',
  'engine/game/saveStorageRecord.ts',
  'engine/game/saveStorageProtocol.ts',
  'presentation/worker/save.worker.ts',
  'presentation/ui/audioOptions.ts',
  'presentation/ui/graphicsOptions.ts',
  'presentation/ui/credits.ts',
  'presentation/ui/death.ts',
  'presentation/ui/win.ts',
  // Blocking player-facing error presentation; its state and exports do not affect simulation or saves.
  'presentation/ui/errorReport.ts',
  'presentation/ui/gameCursor.ts',
  'presentation/ui/hud.ts',
  'presentation/ui/hudOptions.ts',
  'presentation/ui/keyCap.ts',
  // Page-leave warning timing is lifecycle presentation, not simulation or saved state.
  'presentation/ui/leaveConfirmation.ts',
  // Read-only HUD/status/prompt projection; target selection and recorded commands stay fingerprinted.
  'presentation/ui/playHud.ts',
  'presentation/ui/guidedSteps.ts',
  // Read-only debug readout formatting and byte-count estimates.
  'presentation/ui/playReadout.ts',
  'presentation/ui/inventoryScreen.ts',
  // Read-only appliance projection; command admission and effects stay in session and core.
  'presentation/ui/chargerPanel.ts',
  // Read-only vehicle service projection; work admission and transfer stay in core/vehicleWork and session.
  'presentation/ui/vehicleInspection.ts',
  // Craft views/readouts and UI preference/event forwarding only. Native intents/admission
  // remain fingerprinted through session -> core/craftCommands and core/longAction.
  'presentation/ui/craftController.ts',
  'presentation/ui/craftReadout.ts',
  'presentation/ui/crafting.ts',
  'presentation/ui/menuPointer.ts',
  'presentation/ui/menuState.ts',
  // Unsupported-item hint copy is presentation only; capability policy stays in packages/engine/src/game/primaryAction.ts.
  'presentation/ui/primaryActionHint.ts',
  // Paper text/focus/scroll/dismissal is presentation; readable admission/effects stay in core/game.
  'presentation/ui/reading.ts',
  'presentation/ui/rest.ts',
  'presentation/ui/saveController.ts',
  // Loading-mask drawing and browser errors are startup presentation, not simulation state.
  'presentation/ui/worldLoading.ts',
] as const;

const SOURCE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const BINARY_EXTENSIONS = new Set(['.wasm']);
const PRESENTATION_ASSET_EXTENSIONS = new Set([
  '.avif',
  '.css',
  '.gif',
  '.glb',
  '.gltf',
  '.ico',
  '.jpeg',
  '.jpg',
  '.less',
  '.otf',
  '.png',
  '.sass',
  '.scss',
  '.styl',
  '.svg',
  '.ttf',
  '.webm',
  '.webp',
  '.woff',
  '.woff2',
]);
const MODULE_QUERY_PATTERN = /[?#].*$/;
const GLOB_REFERENCE = /\bimport\.meta\.glob\b/;
const REQUIRE_CALL = /\brequire\s*\(/;
const IMPORT_META_URL_REFERENCE = /\bimport\.meta\.url\b/g;
const WORKER_URL_CALL = /\bnew\s+Worker\s*\(\s*new\s+URL\s*\(\s*(['"])(.*?)\1\s*,\s*import\.meta\.url\s*\)/g;
// The bundler's binary-asset dependency: `new URL('<file>.wasm', import.meta.url)` resolves to an emitted asset,
// so the fingerprint follows it and hashes the referenced bytes.
const WASM_ASSET_URL_CALL = /\bnew\s+URL\s*\(\s*(['"])([^'"\n]+\.wasm)\1\s*,\s*import\.meta\.url\s*\)/g;
const LINE_ENDING_PATTERN = /\r\n?/g;

/** The vendored Rapier supply's relative-path prefix and its provenance manifest. */
const RAPIER_SUPPLY_PREFIX = 'vendor/rapier-f64/';
const RAPIER_PROVENANCE_RELATIVE_PATH = 'vendor/rapier-f64/provenance.json';
/** The supply seam: the only module outside the vendored supply whose imports may reach it. */
const RAPIER_SEAM_RELATIVE_PATH = 'src/core/rapier.ts';

function comparePaths(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function assertSupportedDependencyDiscovery(path: string, source: string): string[] {
  // The product globs its mod roots and passes the maps in, so a simulation source never globs.
  if (GLOB_REFERENCE.test(source)) {
    throw new Error(`Unclassified import.meta.glob dependency in simulation source ${path}`);
  }
  if (REQUIRE_CALL.test(source)) {
    throw new Error(`Unsupported require() dependency in simulation source ${path}`);
  }
  const workerUrls = [...source.matchAll(WORKER_URL_CALL)];
  const wasmAssetUrls = [...source.matchAll(WASM_ASSET_URL_CALL)];
  const classified = [...workerUrls, ...wasmAssetUrls].map(
    (match) => [match.index ?? 0, (match.index ?? 0) + match[0].length] as const,
  );
  const unclassified = [...source.matchAll(IMPORT_META_URL_REFERENCE)].some(
    (match) => !classified.some(([start, end]) => (match.index ?? 0) >= start && (match.index ?? 0) < end),
  );
  if (unclassified) {
    throw new Error(`Unclassified import.meta.url dependency in simulation source ${path}`);
  }
  // The streamer takes its mesher port from presentation, so no simulation source starts a worker.
  if (workerUrls.length > 0) {
    throw new Error(`Unclassified worker URL dependency in simulation source ${path}`);
  }
  return wasmAssetUrls.map((match) => match[2]!);
}

function importsFromTransformedSource(path: string, code: string): string[] {
  const [imports] = parse(code);
  const dependencies = new Set<string>();
  for (const entry of imports) {
    if (entry.type === 'static' || entry.type === 'reexport-star') {
      if (!entry.typeOnly) {
        dependencies.add(entry.specifier);
      }
    } else if (entry.type === 'dynamic' && !entry.probablyTypeOnly) {
      if (!entry.specifier || entry.glob) {
        throw new Error(`Non-literal dynamic import in simulation source ${path}`);
      }
      dependencies.add(entry.specifier);
    }
  }
  return [...dependencies].sort();
}

interface RuntimeDependencies {
  imports: string[];
  /** Binary files the source references through the bundler's asset-URL pattern. */
  wasmAssets: string[];
}

async function runtimeDependencies(path: string, source: string): Promise<RuntimeDependencies> {
  const wasmAssets = assertSupportedDependencyDiscovery(path, source);
  const transformed = await transformWithOxc(source, path, { target: 'esnext' });
  return { imports: importsFromTransformedSource(path, transformed.code), wasmAssets };
}

function sourcePath(id: string): string | undefined {
  if (id.startsWith('\0')) {
    return;
  }
  const clean = id.replace(MODULE_QUERY_PATTERN, '');
  if (!isAbsolute(clean)) {
    return;
  }
  return resolve(clean);
}

// The runtime and presentation packages' source, named `'engine/'` and `'presentation/'` in the fingerprint
// manifest and in entries and exclusions.
const ENGINE_PREFIX = 'engine/';
const PRESENTATION_PREFIX = 'presentation/';
const engineSourceRoot = (projectRoot: string): string => resolve(projectRoot, '../engine/src');
const presentationSourceRoot = (projectRoot: string): string => resolve(projectRoot, '../presentation/src');

/**
 * The file an entry or exclusion names: `'engine/'` and `'presentation/'` paths are in those packages, others in
 * this project.
 */
export function labelledPath(projectRoot: string, label: string): string {
  if (label.startsWith(ENGINE_PREFIX)) {
    return resolve(engineSourceRoot(projectRoot), label.slice(ENGINE_PREFIX.length));
  }
  return label.startsWith(PRESENTATION_PREFIX)
    ? resolve(presentationSourceRoot(projectRoot), label.slice(PRESENTATION_PREFIX.length))
    : resolve(projectRoot, label);
}

function sourceRelativePath(projectRoot: string, sourceRoot: string, file: string): string | undefined {
  const roots = [
    { root: sourceRoot, prefix: 'src/' },
    { root: engineSourceRoot(projectRoot), prefix: ENGINE_PREFIX },
    { root: presentationSourceRoot(projectRoot), prefix: PRESENTATION_PREFIX },
    { root: resolve(projectRoot, 'mods'), prefix: 'mods/' },
    { root: resolve(projectRoot, '../mods'), prefix: 'shared-mods/' },
    { root: resolve(projectRoot, '../skelly-assets/tools/packages/thing-core/src'), prefix: 'thing-core/' },
    { root: resolve(projectRoot, '../skelly-assets/models'), prefix: 'asset-models/' },
    { root: resolve(projectRoot, 'vendor/rapier-f64'), prefix: RAPIER_SUPPLY_PREFIX },
    { root: resolve(projectRoot, '../../node_modules'), prefix: 'node_modules/' },
  ];
  for (const { root, prefix } of roots) {
    const name = relative(root, file);
    if (name === '' || name === '..' || name.startsWith(`..${sep}`) || isAbsolute(name)) {
      continue;
    }
    return `${prefix}${name.split(sep).join('/')}`;
  }
  return undefined;
}

interface ExcludedImportContext {
  projectRoot: string;
  sourceRoot: string;
  excludedPaths: readonly string[];
  excludedImports: Map<string, ExcludedSimulationImport>;
}

function recordExcludedImport(
  relativePath: string,
  importer: string | undefined,
  context: ExcludedImportContext,
): boolean {
  const excludedPath = context.excludedPaths.find(
    (path) => relativePath === path || relativePath.startsWith(`${path}/`),
  );
  if (!excludedPath) {
    return false;
  }
  if (importer) {
    const importerPath = sourceRelativePath(context.projectRoot, context.sourceRoot, importer);
    if (importerPath) {
      context.excludedImports.set(`${importerPath} -> ${relativePath}`, {
        importer: importerPath,
        excluded: relativePath,
      });
    }
  }
  return true;
}

interface GraphWalkContext {
  host: SimulationModuleGraphHost;
  projectRoot: string;
  sourceRoot: string;
  excludedImportContext: ExcludedImportContext;
  visited: Set<string>;
  sources: Map<string, string>;
  /** The Rapier supply's provenance manifest, included once the graph enters the supply. */
  rapierProvenance: Promise<void> | undefined;
}

const binaryDigestMarker = (bytes: Uint8Array): string =>
  `binary-sha256:${createHash('sha256').update(bytes).digest('hex')}`;

async function includeRapierProvenance(context: GraphWalkContext): Promise<void> {
  context.rapierProvenance ??= (async () => {
    const file = labelledPath(context.projectRoot, RAPIER_PROVENANCE_RELATIVE_PATH);
    const source = (await context.host.readFile(file)).replace(LINE_ENDING_PATTERN, '\n');
    JSON.parse(source);
    context.sources.set(RAPIER_PROVENANCE_RELATIVE_PATH, source);
  })();
  await context.rapierProvenance;
}

interface TrackableModule {
  file: string;
  relativePath: string;
  /** A binary dependency hashed by bytes rather than walked as a module. */
  binary: boolean;
}

async function resolveTrackableModule(
  specifier: string,
  importer: string | undefined,
  context: GraphWalkContext,
): Promise<TrackableModule | undefined> {
  const resolvedId = await context.host.resolve(specifier, importer);
  if (!resolvedId) {
    throw new Error(`Cannot resolve runtime dependency ${specifier} from ${importer ?? 'simulation entry'}`);
  }
  const file = sourcePath(resolvedId);
  if (!file) {
    throw new Error(`Unsupported virtual runtime dependency ${specifier} resolved as ${resolvedId}`);
  }
  return trackableModuleFor(file, importer, context);
}

function trackableModuleFor(
  file: string,
  importer: string | undefined,
  context: Pick<GraphWalkContext, 'projectRoot' | 'sourceRoot' | 'excludedImportContext'>,
): TrackableModule | undefined {
  const relativePath = sourceRelativePath(context.projectRoot, context.sourceRoot, file);
  if (!relativePath) {
    throw new Error(
      `Runtime dependency resolves outside src/, the engine's and presentation's src/, the submodule's thing-core and models sources, the vendored Rapier supply and node_modules: ${file}`,
    );
  }
  assertRapierSupplyReachedThroughSeam(relativePath, importer, context);
  if (recordExcludedImport(relativePath, importer, context.excludedImportContext)) {
    return;
  }
  if (relativePath.startsWith('mods/') || relativePath.startsWith('shared-mods/')) {
    return;
  }
  const extension = extname(relativePath).toLowerCase();
  if (PRESENTATION_ASSET_EXTENSIONS.has(extension)) {
    return;
  }
  if (BINARY_EXTENSIONS.has(extension)) {
    return { file, relativePath, binary: true };
  }
  if (
    extension === '.json' &&
    ['src/config/', 'src/feasibility/', 'thing-core/', 'asset-models/', RAPIER_SUPPLY_PREFIX].some((prefix) =>
      relativePath.startsWith(prefix),
    )
  ) {
    return { file, relativePath, binary: false };
  }
  if (!SOURCE_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported runtime dependency: ${relativePath}`);
  }
  return { file, relativePath, binary: false };
}

/**
 * The vendored supply enters an identity graph only through its seam: the seam imports the bindings, and the
 * supply's own generated files reach each other and the WASM. Any other importer — a graph entry included —
 * bypasses the shared initialization and binary identity, so it fails the check rather than fingerprinting.
 */
function assertRapierSupplyReachedThroughSeam(
  dependency: string,
  importer: string | undefined,
  context: Pick<GraphWalkContext, 'projectRoot' | 'sourceRoot'>,
): void {
  if (!dependency.startsWith(RAPIER_SUPPLY_PREFIX)) {
    return;
  }
  const importerPath =
    importer === undefined ? undefined : sourceRelativePath(context.projectRoot, context.sourceRoot, importer);
  if (importerPath !== RAPIER_SEAM_RELATIVE_PATH && importerPath?.startsWith(RAPIER_SUPPLY_PREFIX) !== true) {
    throw new Error(
      `Runtime dependency ${dependency} is the vendored Rapier supply; only ${RAPIER_SEAM_RELATIVE_PATH} and the supply's own modules may import it, not ${
        importerPath ?? 'a graph entry'
      }`,
    );
  }
}

/** Resolve the runtime import graph using the caller's Vite resolver. */
export async function collectSimulationSourceGraph(
  entries: readonly string[],
  root: string,
  host: SimulationModuleGraphHost,
  options: SimulationFingerprintOptions = {},
): Promise<SimulationSourceGraph> {
  await init;
  const projectRoot = resolve(root);
  const sourceRoot = resolve(projectRoot, 'src');
  const visited = new Set<string>();
  const sources = new Map<string, string>();
  const excludedImports = new Map<string, ExcludedSimulationImport>();
  const context: GraphWalkContext = {
    host,
    projectRoot,
    sourceRoot,
    excludedImportContext: {
      projectRoot,
      sourceRoot,
      excludedPaths: options.exclude ?? [],
      excludedImports,
    },
    visited,
    sources,
    rapierProvenance: undefined,
  };

  const visitModule = async (module: TrackableModule): Promise<void> => {
    if (context.visited.has(module.file)) {
      return;
    }
    context.visited.add(module.file);
    if (module.binary) {
      if (!context.host.readBinary) {
        throw new Error(`Binary dependency ${module.relativePath} requires a byte-reading host`);
      }
      context.sources.set(module.relativePath, binaryDigestMarker(await context.host.readBinary(module.file)));
      return;
    }
    const source = (await context.host.readFile(module.file)).replace(LINE_ENDING_PATTERN, '\n');
    context.sources.set(module.relativePath, source);
    if (module.relativePath.startsWith(RAPIER_SUPPLY_PREFIX)) {
      // The provenance manifest pins the supply's regeneration inputs and every supply file's digest, which
      // the shipped bytes and bindings alone do not carry.
      await includeRapierProvenance(context);
    }
    // Declarative configuration and generated-body content have no module dependencies.
    if (extname(module.file) === '.json') {
      JSON.parse(source);
      return;
    }
    const { imports, wasmAssets } = await runtimeDependencies(module.file, source);
    const binaryModules = wasmAssets.map((reference) =>
      trackableModuleFor(resolve(dirname(module.file), reference), module.file, context),
    );
    await Promise.all([
      ...imports.map((dependency) => visit(dependency, module.file)),
      ...binaryModules.map(async (binary) => {
        if (binary) {
          await visitModule(binary);
        }
      }),
    ]);
  };

  const visit = async (specifier: string, importer?: string): Promise<void> => {
    const module = await resolveTrackableModule(specifier, importer, context);
    if (module) {
      await visitModule(module);
    }
  };

  const sortedEntries = [...entries].sort();
  await Promise.all(sortedEntries.map((entry) => visit(labelledPath(projectRoot, entry))));
  const sortedExcludedImports = [...excludedImports.values()].sort((left, right) =>
    comparePaths(`${left.importer} -> ${left.excluded}`, `${right.importer} -> ${right.excluded}`),
  );
  return { sources, excludedImports: sortedExcludedImports };
}

/** Hash a canonical manifest of source paths and their normalized contents. */
export function fingerprintSimulationSourceMap(sources: ReadonlyMap<string, string>): string {
  const manifest = [...sources.entries()]
    .sort(([left], [right]) => comparePaths(left, right))
    .map(([path, source]) => [path, createHash('sha256').update(source, 'utf8').digest('hex')]);
  return createHash('sha256').update(canonicalJson(manifest), 'utf8').digest('hex');
}

export async function fingerprintSimulationSources(
  entries: readonly string[],
  root: string,
  host: SimulationModuleGraphHost,
  options: SimulationFingerprintOptions = {},
): Promise<string> {
  const { sources } = await collectSimulationSourceGraph(entries, root, host, options);
  return fingerprintSimulationSourceMap(sources);
}
