// biome-ignore lint/correctness/noNodejsModules: This check reads the source tree in Node.js.
import { existsSync, globSync, readdirSync, readFileSync, statSync } from 'node:fs';
// biome-ignore lint/correctness/noNodejsModules: This check reads the source tree in Node.js.
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { parseSync } from 'vite';

/** Where the runtime starts, what it may follow, and what it may never reach. Paths are repository-relative. */
export interface RuntimeClosurePolicy {
  /** Every source file under these directories is runtime. */
  readonly start: readonly string[];
  /** Shared libraries the runtime may use; files they reach are checked by the same rules. */
  readonly followed: readonly string[];
  /** Directories no runtime or followed file may reach, by any import route. */
  readonly forbidden: readonly string[];
  /** npm packages no runtime or followed file may import, with every subpath. */
  readonly forbiddenPackages: readonly string[];
  /** Import-specifier prefixes that resolve to a directory, as the compiler's path mapping does. */
  readonly aliases: Readonly<Record<string, string>>;
}

export interface RuntimeClosureViolation {
  readonly importer: string;
  readonly specifier: string;
  readonly target: string;
  readonly reason: string;
}

// Stage 1: the presentation side leaves deadvox whole (#1532), so the runtime may not reach it.
export const STAGE_ONE_POLICY: RuntimeClosurePolicy = {
  start: ['packages/deadvox/src/core', 'packages/deadvox/src/vehicles', 'packages/deadvox/src/game'],
  followed: ['packages/mobgen', 'packages/thing-core'],
  forbidden: [
    'packages/deadvox/src/render',
    'packages/deadvox/src/ui',
    'packages/deadvox/src/presentation',
    'packages/presentation',
  ],
  forbiddenPackages: ['three', 'lit', 'lit-html'],
  // Mirrors packages/deadvox/tsconfig.json, compilerOptions.paths.
  aliases: { '@mobgen/': 'packages/mobgen/src/' },
};

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '/index.ts', '/index.js'];
const GLOB_REFERENCE = /\bimport\.meta\.glob\b/g;
const GLOB_CALL = /\bimport\.meta\.glob(?:<[^>]*>)?\s*\(\s*(\[[^\]]*\]|(['"`])[^'"`]*\2)/g;
const GLOB_PATTERN = /(['"`])([^'"`]*)\1/g;
const LITERAL = /^(['"`])([^'"`]*)\1$/;
const IMPORT_CALL = /\bimport\s*\(\s*(['"`])([^'"`$]*)\1\s*[,)]/g;
const URL_CALL = /\bnew\s+URL\s*\(\s*(['"`])([^'"`]*)\1\s*,\s*import\.meta\.url\s*\)/g;
const TEMPLATE_HOLE = /\$\{[^}]*\}/g;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const TS_FILE = /\.[cm]?ts$/;

interface Workspace {
  readonly name: string;
  readonly dir: string;
  readonly exports: unknown;
}

const within = (path: string, dir: string): boolean => path === dir || path.startsWith(`${dir}/`);

function workspacesOf(repoRoot: string): Workspace[] {
  const root = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { workspaces?: string[] };
  const dirs = (root.workspaces ?? []).flatMap((entry) =>
    entry.includes('*') ? globSync(entry, { cwd: repoRoot }) : [entry],
  );
  return dirs
    .filter((dir) => existsSync(join(repoRoot, dir, 'package.json')))
    .map((dir) => {
      const manifest = JSON.parse(readFileSync(join(repoRoot, dir, 'package.json'), 'utf8')) as {
        name: string;
        exports?: unknown;
      };
      return { name: manifest.name, dir: dir.split(sep).join('/'), exports: manifest.exports };
    });
}

function exportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object') {
    for (const condition of ['import', 'module', 'default', 'types']) {
      const target = exportTarget((value as Record<string, unknown>)[condition]);
      if (target) {
        return target;
      }
    }
  }
  return undefined;
}

function workspaceFile(workspace: Workspace, subpath: string): string | undefined {
  if (workspace.exports === undefined) {
    return subpath === '' ? undefined : `${workspace.dir}${subpath}`;
  }
  const map =
    typeof workspace.exports === 'string' || !Object.keys(workspace.exports as object).some((k) => k.startsWith('.'))
      ? { '.': workspace.exports }
      : (workspace.exports as Record<string, unknown>);
  const key = `.${subpath}`;
  const direct = exportTarget(map[key]);
  if (direct) {
    return join(workspace.dir, direct).split(sep).join('/');
  }
  for (const [pattern, value] of Object.entries(map)) {
    const star = pattern.indexOf('*');
    if (star < 0 || !key.startsWith(pattern.slice(0, star)) || !key.endsWith(pattern.slice(star + 1))) {
      continue;
    }
    const target = exportTarget(value);
    if (target) {
      const matched = key.slice(star, key.length - (pattern.length - star - 1));
      return join(workspace.dir, target.replace('*', matched)).split(sep).join('/');
    }
  }
  return undefined;
}

function existingFile(repoRoot: string, path: string): string | undefined {
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = `${path}${suffix}`;
    const absolute = join(repoRoot, candidate);
    if (existsSync(absolute) && statSync(absolute).isFile()) {
      return candidate;
    }
  }
  return undefined;
}

function sourceFilesUnder(repoRoot: string, dir: string): string[] {
  const absolute = join(repoRoot, dir);
  if (!existsSync(absolute)) {
    throw new Error(`Runtime start directory does not exist: ${dir}`);
  }
  return readdirSync(absolute, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && SOURCE_FILE.test(entry.name))
    .map((entry) => relative(repoRoot, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

interface Edge {
  readonly specifier: string;
  readonly glob: boolean;
}

const languageOf = (file: string): 'js' | 'jsx' | 'ts' | 'tsx' | 'dts' => {
  if (DECLARATION_FILE.test(file)) {
    return 'dts';
  }
  if (file.endsWith('.tsx') || file.endsWith('.jsx')) {
    return file.endsWith('.tsx') ? 'tsx' : 'jsx';
  }
  return TS_FILE.test(file) ? 'ts' : 'js';
};

/** Static and dynamic imports and `export … from`, type-only ones included. */
function moduleEdges(file: string, source: string): Edge[] | string {
  const parsed = parseSync(file, source, { lang: languageOf(file) });
  if (parsed.errors.length > 0) {
    return `source the parser rejects: ${parsed.errors[0]!.message}`;
  }
  const requests = [
    ...parsed.module.staticImports.map((entry) => entry.moduleRequest),
    ...parsed.module.staticExports.flatMap((statement) => statement.entries.map((entry) => entry.moduleRequest)),
  ];
  const edges: Edge[] = requests.flatMap((request) => (request ? [{ specifier: request.value, glob: false }] : []));
  for (const { moduleRequest } of parsed.module.dynamicImports) {
    const argument = source.slice(moduleRequest.start, moduleRequest.end).trim();
    const literal = LITERAL.exec(argument)?.[2];
    if (literal === undefined) {
      return `a dynamic import whose target is not a literal: ${argument}`;
    }
    const glob = literal.includes('${');
    edges.push({ specifier: glob ? literal.replace(TEMPLATE_HOLE, '*') : literal, glob });
  }
  return edges;
}

/** Type-position `import('…')`, `import.meta.glob` patterns and `new URL('…', import.meta.url)`. */
function metaEdges(source: string): Edge[] | string {
  const globCalls = [...source.matchAll(GLOB_CALL)];
  if (globCalls.length !== [...source.matchAll(GLOB_REFERENCE)].length) {
    return 'an import.meta.glob form the check cannot read';
  }
  const globs = globCalls
    .flatMap((call) => [...call[1]!.matchAll(GLOB_PATTERN)].map((pattern) => pattern[2]!))
    .filter((pattern) => !pattern.startsWith('!'))
    .map((specifier) => ({ specifier, glob: true }));
  const literals = [...source.matchAll(IMPORT_CALL), ...source.matchAll(URL_CALL)].map((call) => ({
    specifier: call[2]!,
    glob: false,
  }));
  return [...globs, ...literals];
}

function edgesOf(file: string, source: string): Edge[] | string {
  const modules = moduleEdges(file, source);
  const metas = metaEdges(source);
  if (typeof modules === 'string' || typeof metas === 'string') {
    return typeof modules === 'string' ? modules : (metas as string);
  }
  return [...modules, ...metas];
}

const packageName = (specifier: string): string => {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
};

type Resolved = { readonly file: string } | { readonly npm: string } | undefined;

class ClosureWalk {
  readonly violations: RuntimeClosureViolation[] = [];
  private readonly visited = new Set<string>();
  private readonly queue: string[];
  private readonly workspaces: readonly Workspace[];
  private readonly root: string;
  private readonly policy: RuntimeClosurePolicy;

  constructor(root: string, policy: RuntimeClosurePolicy) {
    this.root = root;
    this.policy = policy;
    this.workspaces = workspacesOf(root);
    this.queue = policy.start.flatMap((dir) => sourceFilesUnder(root, dir));
  }

  private resolveSpecifier(importer: string, specifier: string): Resolved {
    const found = (path: string | undefined): Resolved => {
      const file = path === undefined ? undefined : existingFile(this.root, path.split(sep).join('/'));
      return file === undefined ? undefined : { file };
    };
    if (specifier.startsWith('node:')) {
      return { npm: specifier };
    }
    if (specifier.startsWith('.') || isAbsolute(specifier)) {
      return found(isAbsolute(specifier) ? relative(this.root, specifier) : join(dirname(importer), specifier));
    }
    const alias = Object.entries(this.policy.aliases).find(([prefix]) => specifier.startsWith(prefix));
    if (alias) {
      return found(`${alias[1]}${specifier.slice(alias[0].length)}`);
    }
    // A workspace is classified by where it lies, whatever route names it; only other names are npm packages.
    const name = packageName(specifier);
    const workspace = this.workspaces.find((candidate) => candidate.name === name);
    return workspace ? found(workspaceFile(workspace, specifier.slice(name.length))) : { npm: name };
  }

  run(): void {
    for (let file = this.queue.shift(); file !== undefined; file = this.queue.shift()) {
      if (!this.visited.has(file)) {
        this.visited.add(file);
        this.visit(file);
      }
    }
  }

  private visit(file: string): void {
    const edges = edgesOf(file, readFileSync(join(this.root, file), 'utf8'));
    if (typeof edges === 'string') {
      this.violations.push({ importer: file, specifier: '', target: '', reason: `uses ${edges}` });
      return;
    }
    for (const { specifier, glob } of edges) {
      if (glob) {
        for (const match of globSync(specifier, { cwd: join(this.root, dirname(file)) })) {
          this.reach(file, specifier, join(dirname(file), match).split(sep).join('/'));
        }
      } else {
        this.resolveEdge(file, specifier);
      }
    }
  }

  private resolveEdge(importer: string, specifier: string): void {
    const target = this.resolveSpecifier(importer, specifier);
    if (target === undefined) {
      this.violations.push({ importer, specifier, target: '', reason: 'does not resolve' });
    } else if ('file' in target) {
      this.reach(importer, specifier, target.file);
    } else if (this.policy.forbiddenPackages.includes(target.npm)) {
      this.violations.push({ importer, specifier, target: target.npm, reason: 'imports a forbidden package' });
    }
  }

  private reach(importer: string, specifier: string, target: string): void {
    const { start, followed, forbidden } = this.policy;
    if (forbidden.some((dir) => within(target, dir))) {
      this.violations.push({ importer, specifier, target, reason: 'reaches a forbidden directory' });
    } else if ([...start, ...followed].some((dir) => within(target, dir)) && SOURCE_FILE.test(target)) {
      this.queue.push(target);
    }
  }
}

/**
 * Walk every import, type-only ones included, from the runtime start set and the followed
 * libraries it reaches, and report each edge into a forbidden directory or package.
 */
export function runtimeClosureViolations(repoRoot: string, policy: RuntimeClosurePolicy): RuntimeClosureViolation[] {
  const walk = new ClosureWalk(resolve(repoRoot), policy);
  walk.run();
  return walk.violations.sort((a, b) =>
    `${a.importer} ${a.specifier}`.localeCompare(`${b.importer} ${b.specifier}`, 'en'),
  );
}
