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

export const SIMULATION_ENTRIES = [
  'src/core/sim.ts',
  'src/core/worldgen.ts',
  'src/core/saveState.ts',
  'src/core/saveFormat.ts',
  'src/core/soundPicker.ts',
  'src/game/player.ts',
  'src/game/rest.ts',
  'src/game/survival.ts',
  'src/game/streamer.ts',
  'src/game/play.ts',
] as const;

export const SIMULATION_EXCLUSIONS = [
  'src/render',
  'src/debug',
  'src/core/sky.ts',
  'src/game/damageFeedback.ts',
  'src/ui/audioOptions.ts',
  'src/ui/credits.ts',
  'src/ui/death.ts',
  'src/ui/gameCursor.ts',
  'src/ui/hud.ts',
  'src/ui/hudOptions.ts',
  'src/ui/rest.ts',
  'src/game/debugInterface.ts',
] as const;

const SOURCE_EXTENSIONS = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const MODULE_QUERY_PATTERN = /[?#].*$/;
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

async function runtimeImports(path: string, source: string): Promise<string[]> {
  const transformed = await transformWithOxc(source, path, { target: 'esnext' });
  const [imports] = parse(transformed.code);
  const dependencies = new Set<string>();
  for (const entry of imports) {
    if (entry.type === 'static') {
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
    { root: resolve(projectRoot, 'node_modules'), prefix: 'node_modules/' },
  ];
  for (const { root, prefix } of roots) {
    const name = relative(root, file);
    if (name === '' || name === '..' || name.startsWith(`..${sep}`) || isAbsolute(name)) {
      continue;
    }
    if (!SOURCE_EXTENSIONS.has(extname(name).toLowerCase())) {
      return;
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
  const excludedImportContext: ExcludedImportContext = {
    projectRoot,
    sourceRoot,
    excludedPaths: options.exclude ?? [],
    excludedImports,
  };

  const visit = async (specifier: string, importer?: string): Promise<void> => {
    const resolvedId = await host.resolve(specifier, importer);
    if (!resolvedId) {
      return;
    }
    const file = sourcePath(resolvedId);
    if (!file) {
      return;
    }
    const relativePath = sourceRelativePath(projectRoot, sourceRoot, file);
    if (!relativePath) {
      return;
    }
    if (recordExcludedImport(relativePath, importer, excludedImportContext)) {
      return;
    }
    if (visited.has(file)) {
      return;
    }
    visited.add(file);
    const source = (await host.readFile(file)).replace(LINE_ENDING_PATTERN, '\n');
    sources.set(relativePath, source);
    const dependencies = await runtimeImports(file, source);
    await Promise.all(dependencies.map((dependency) => visit(dependency, file)));
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
