// biome-ignore lint/correctness/noNodejsModules: This build-time utility runs in Vite's Node.js process.
import { createHash } from 'node:crypto';
// biome-ignore lint/correctness/noNodejsModules: This build-time utility runs in Vite's Node.js process.
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { init, parse } from 'es-module-lexer';
import { transformWithOxc } from 'vite';
import { canonicalJson } from '../src/core/canonicalJson.ts';

export interface SimulationModuleGraphHost {
  resolve: (specifier: string, importer?: string) => Promise<string | undefined>;
  readFile: (path: string) => Promise<string>;
}

export interface SimulationFingerprintOptions {
  exclude?: readonly string[];
}

export interface ExcludedSimulationImport {
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

export const SIMULATION_ENTRIES = [
  'src/core/sim.ts',
  'src/core/worldgen.ts',
  'src/core/saveState.ts',
  'src/core/saveFormat.ts',
  'src/core/storage.ts',
  'src/core/soundPicker.ts',
  'src/game/player.ts',
  'src/game/rest.ts',
  'src/game/survival.ts',
  'src/game/streamer.ts',
  'src/game/config.ts',
  'src/game/play.ts',
  'src/game/quickbar.ts',
  'src/game/session.ts',
  'src/game/worldSetup.ts',
] as const;

export const SIMULATION_EXCLUSIONS = [
  'src/render',
  'src/debug',
  'src/core/sky.ts',
  'src/core/mesher.ts',
  'src/core/pileLayout.ts',
  'src/game/damageFeedback.ts',
  'src/game/engine.ts',
  'src/game/saveStorage.ts',
  'src/game/saveStorageRecord.ts',
  'src/game/saveStorageProtocol.ts',
  'src/worker/save.worker.ts',
  'src/ui/audioOptions.ts',
  'src/ui/credits.ts',
  'src/ui/death.ts',
  'src/ui/gameCursor.ts',
  'src/ui/hud.ts',
  'src/ui/hudOptions.ts',
  'src/ui/inventoryScreen.ts',
  'src/ui/menuPointer.ts',
  'src/ui/menuState.ts',
  'src/ui/rest.ts',
] as const;

const SOURCE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
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
const GLOB_REFERENCE = /\bimport\.meta\.glob\b/g;
const GLOB_CALL = /\bimport\.meta\.glob(?:<[^>]*>)?\s*\(\s*(['"])(.*?)\1/g;
const CONTENT_GLOB_PATTERNS = new Set(['../content/base/*.json', '../content/base/assets/audio/**/*.ogg']);
const REQUIRE_CALL = /\brequire\s*\(/;
const IMPORT_META_URL_REFERENCE = /\bimport\.meta\.url\b/g;
const WORKER_URL_CALL = /\bnew\s+Worker\s*\(\s*new\s+URL\s*\(\s*(['"])(.*?)\1\s*,\s*import\.meta\.url\s*\)/g;
const LINE_ENDING_PATTERN = /\r\n?/g;

function comparePaths(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function assertSupportedDependencyDiscovery(path: string, source: string): void {
  const globReferences = [...source.matchAll(GLOB_REFERENCE)];
  const globCalls = [...source.matchAll(GLOB_CALL)];
  if (globReferences.length !== globCalls.length) {
    throw new Error(`Unsupported import.meta.glob form in simulation source ${path}`);
  }
  if (globCalls.some((call) => !(call[2] && CONTENT_GLOB_PATTERNS.has(call[2])))) {
    throw new Error(`Unclassified import.meta.glob dependency in simulation source ${path}`);
  }
  if (REQUIRE_CALL.test(source)) {
    throw new Error(`Unsupported require() dependency in simulation source ${path}`);
  }
  const importMetaUrlReferences = [...source.matchAll(IMPORT_META_URL_REFERENCE)];
  const workerUrls = [...source.matchAll(WORKER_URL_CALL)];
  if (importMetaUrlReferences.length !== workerUrls.length) {
    throw new Error(`Unclassified import.meta.url dependency in simulation source ${path}`);
  }
  const normalizedPath = path.replaceAll('\\', '/');
  if (
    workerUrls.some(
      (call) => normalizedPath.endsWith('/src/game/streamer.ts') && call[2] !== '../worker/mesh.worker.ts',
    )
  ) {
    throw new Error(`Unclassified worker URL dependency in simulation source ${path}`);
  }
  if (workerUrls.length > 0 && !normalizedPath.endsWith('/src/game/streamer.ts')) {
    throw new Error(`Unclassified worker URL dependency in simulation source ${path}`);
  }
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

async function runtimeImports(path: string, source: string): Promise<string[]> {
  assertSupportedDependencyDiscovery(path, source);
  const transformed = await transformWithOxc(source, path, { target: 'esnext' });
  return importsFromTransformedSource(path, transformed.code);
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

function sourceRelativePath(projectRoot: string, sourceRoot: string, file: string): string | undefined {
  const roots = [
    { root: sourceRoot, prefix: 'src/' },
    { root: resolve(projectRoot, '../mobgen/src'), prefix: 'mobgen/' },
    { root: resolve(projectRoot, 'node_modules'), prefix: 'node_modules/' },
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
}

interface TrackableModule {
  file: string;
  relativePath: string;
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
  const relativePath = sourceRelativePath(context.projectRoot, context.sourceRoot, file);
  if (!relativePath) {
    throw new Error(
      `Runtime dependency ${specifier} resolves outside src/, sibling mobgen/src/, and node_modules: ${resolvedId}`,
    );
  }
  if (recordExcludedImport(relativePath, importer, context.excludedImportContext)) {
    return;
  }
  if (relativePath.startsWith('src/content/base/')) {
    return;
  }
  const extension = extname(relativePath).toLowerCase();
  if (PRESENTATION_ASSET_EXTENSIONS.has(extension)) {
    return;
  }
  if (!SOURCE_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported runtime dependency ${specifier}: ${relativePath}`);
  }
  return { file, relativePath };
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
  };

  const visit = async (specifier: string, importer?: string): Promise<void> => {
    const module = await resolveTrackableModule(specifier, importer, context);
    if (!module || context.visited.has(module.file)) {
      return;
    }
    context.visited.add(module.file);
    const source = (await context.host.readFile(module.file)).replace(LINE_ENDING_PATTERN, '\n');
    context.sources.set(module.relativePath, source);
    const dependencies = await runtimeImports(module.file, source);
    await Promise.all(dependencies.map((dependency) => visit(dependency, module.file)));
  };

  const sortedEntries = [...entries].sort();
  await Promise.all(sortedEntries.map((entry) => visit(resolve(projectRoot, entry))));
  const sortedExcludedImports = [...excludedImports.values()].sort((left, right) =>
    comparePaths(`${left.importer} -> ${left.excluded}`, `${right.importer} -> ${right.excluded}`),
  );
  return { sources, excludedImports: sortedExcludedImports };
}

/** Hash a canonical manifest of source paths and their normalized contents. */
export async function fingerprintSimulationSources(
  entries: readonly string[],
  root: string,
  host: SimulationModuleGraphHost,
  options: SimulationFingerprintOptions = {},
): Promise<string> {
  const { sources } = await collectSimulationSourceGraph(entries, root, host, options);
  const manifest = [...sources.entries()]
    .sort(([left], [right]) => comparePaths(left, right))
    .map(([path, source]) => [path, createHash('sha256').update(source, 'utf8').digest('hex')]);
  return createHash('sha256').update(canonicalJson(manifest), 'utf8').digest('hex');
}
