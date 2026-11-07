// biome-ignore lint/correctness/noNodejsModules: This check reads the source tree in Node.js.
import { existsSync, globSync, readdirSync, readFileSync, statSync } from 'node:fs';
// biome-ignore lint/correctness/noNodejsModules: This check reads the source tree in Node.js.
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
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
  /** The Vite project root, where a glob pattern or base with a leading slash starts. */
  readonly viteRoot: string;
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
  // Mirrors packages/deadvox/tsconfig.json, compilerOptions.paths, and packages/deadvox/vite.config.ts, resolve.alias.
  aliases: { '@mobgen/': 'packages/mobgen/src/' },
  viteRoot: 'packages/deadvox',
};

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const RESOLVE_SUFFIXES = ['', '.ts', '.tsx', '.mts', '.js', '.mjs', '/index.ts', '/index.js'];
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
  /** An `import.meta.glob` call's `base` option. */
  readonly base?: string;
}

interface AstNode {
  readonly type?: string;
  readonly [key: string]: unknown;
}

const isNode = (value: unknown): value is AstNode => typeof value === 'object' && value !== null;

const isGlobMember = (node: AstNode): boolean => {
  const object = node.object as AstNode | undefined;
  const meta = object?.meta as AstNode | undefined;
  const metaProperty = object?.property as AstNode | undefined;
  const property = node.property as AstNode | undefined;
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    object?.type === 'MetaProperty' &&
    meta?.name === 'import' &&
    metaProperty?.name === 'meta' &&
    property?.name === 'glob'
  );
};

/** A string literal or a template literal without holes. */
const staticString = (node: unknown): string | undefined => {
  if (!isNode(node)) {
    return undefined;
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  const quasis = node.quasis as { value: { cooked?: string } }[] | undefined;
  const expressions = node.expressions as unknown[] | undefined;
  return node.type === 'TemplateLiteral' && expressions?.length === 0 ? quasis?.[0]?.value.cooked : undefined;
};

/** The `base` option of an `import.meta.glob` call; a string when it is absent or literal. */
function globBase(options: unknown): { readonly base?: string } | string {
  if (options === undefined) {
    return {};
  }
  if (!(isNode(options) && options.type === 'ObjectExpression')) {
    return 'an import.meta.glob whose options are not an object literal';
  }
  for (const property of options.properties as AstNode[]) {
    const key = property.key as AstNode | undefined;
    if (property.type !== 'Property' || property.computed) {
      return 'an import.meta.glob option the check cannot read';
    }
    if ((key?.name ?? key?.value) === 'base') {
      const base = staticString(property.value);
      return base === undefined ? 'an import.meta.glob base that is not a literal' : { base };
    }
  }
  return {};
}

/** The patterns of one `import.meta.glob` call, with its base. */
function globCallEdges(call: AstNode): Edge[] | string {
  const [patterns, options, ...rest] = call.arguments as unknown[];
  const list = isNode(patterns) && patterns.type === 'ArrayExpression' ? (patterns.elements as unknown[]) : [patterns];
  const specifiers = list.map(staticString);
  const base = globBase(options);
  if (rest.length > 0 || specifiers.some((specifier) => specifier === undefined)) {
    return 'an import.meta.glob pattern that is not a literal';
  }
  if (typeof base === 'string') {
    return base;
  }
  // Negated patterns only narrow the match, so checking without them over-approximates.
  return (specifiers as string[])
    .filter((specifier) => !specifier.startsWith('!'))
    .map((specifier) => ({ specifier, glob: true, ...base }));
}

/** The glob edges of one syntax node; a call's callee is recorded so it is not read as a bare reference. */
function globNodeEdges(node: AstNode, callees: Set<AstNode>): Edge[] | string {
  if (node.type === 'CallExpression' && isNode(node.callee) && isGlobMember(node.callee)) {
    callees.add(node.callee);
    return globCallEdges(node);
  }
  return isGlobMember(node) && !callees.has(node) ? 'an import.meta.glob form the check cannot read' : [];
}

/** Every `import.meta.glob` call; any other use of `import.meta.glob` fails closed. */
function globEdges(program: unknown): Edge[] | string {
  const edges: Edge[] = [];
  const callees = new Set<AstNode>();
  // A parent is read before its children, so a call records its callee before the walk reaches it.
  const pending: unknown[] = [program];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (Array.isArray(node)) {
      pending.push(...node);
    } else if (isNode(node)) {
      const found = globNodeEdges(node, callees);
      if (typeof found === 'string') {
        return found;
      }
      edges.push(...found);
      pending.push(...Object.values(node));
    }
  }
  return edges;
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
  const globs = globEdges(parsed.program);
  return typeof globs === 'string' ? globs : [...edges, ...globs];
}

/** Type-position `import('…')` and `new URL('…', import.meta.url)`. */
function metaEdges(source: string): Edge[] {
  return [...source.matchAll(IMPORT_CALL), ...source.matchAll(URL_CALL)].map((call) => ({
    specifier: call[2]!,
    glob: false,
  }));
}

function edgesOf(file: string, source: string): Edge[] | string {
  const modules = moduleEdges(file, source);
  return typeof modules === 'string' ? modules : [...modules, ...metaEdges(source)];
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
    for (const { specifier, glob, base } of edges) {
      if (glob) {
        this.resolveGlob(file, specifier, base);
      } else {
        this.resolveEdge(file, specifier);
      }
    }
  }

  /** A glob pattern as a repository-relative pattern, by Vite's `toAbsoluteGlob` rules; undefined if Vite would reject it. */
  private globPattern(importer: string, pattern: string, base: string | undefined): string | undefined {
    const { viteRoot, aliases } = this.policy;
    const importerDir = posix.dirname(importer);
    const dir = base === undefined ? importerDir : posix.join(base.startsWith('/') ? viteRoot : importerDir, base);
    if (pattern.startsWith('/')) {
      return posix.join(viteRoot, pattern.slice(1));
    }
    if (pattern.startsWith('./') || pattern.startsWith('../')) {
      return posix.join(dir, pattern);
    }
    const alias = Object.entries(aliases).find(([prefix]) => pattern.startsWith(prefix));
    return alias ? `${alias[1]}${pattern.slice(alias[0].length)}` : undefined;
  }

  private resolveGlob(importer: string, specifier: string, base: string | undefined): void {
    const pattern = this.globPattern(importer, specifier, base);
    if (pattern === undefined) {
      this.violations.push({ importer, specifier, target: '', reason: 'uses a glob that does not resolve' });
      return;
    }
    for (const match of globSync(pattern, { cwd: this.root })) {
      const target = posix.normalize(match.split(sep).join('/'));
      if (statSync(join(this.root, target)).isFile()) {
        this.reach(importer, specifier, target);
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
