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

/** Resolve and hash the runtime import graph using the caller's Vite resolver. */
export async function fingerprintSimulationSources(
  entries: readonly string[],
  root: string,
  host: SimulationModuleGraphHost,
  options: SimulationFingerprintOptions = {},
): Promise<string> {
  await init;
  const projectRoot = resolve(root);
  const sourceRoot = resolve(projectRoot, 'src');
  const visited = new Set<string>();
  const sources = new Map<string, string>();

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
    if (
      !relativePath ||
      (options.exclude ?? []).some(
        (excluded) => relativePath === excluded || relativePath.startsWith(`${excluded}/`),
      ) ||
      visited.has(file)
    ) {
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
  const manifest = [...sources.entries()]
    .sort(([left], [right]) => comparePaths(left, right))
    .map(([path, source]) => [path, createHash('sha256').update(source, 'utf8').digest('hex')]);
  return createHash('sha256').update(canonicalJson(manifest), 'utf8').digest('hex');
}
