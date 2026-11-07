// biome-ignore lint/correctness/noNodejsModules: This check reads the source tree in Node.js.
import { existsSync, globSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
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
// Comment readers: a triple-slash directive and its attributes, and a JSDoc type import in JavaScript.
const TRIPLE_SLASH = /^\/\s*<reference\b/;
const DIRECTIVE_ATTRIBUTE = /([\w-]+)\s*=\s*(["'])(.*?)\2/g;
const JSDOC_IMPORT = /\bimport\s*\(|@import\b/;
// The glob subset the check matches exactly as the bundler does: literal name characters and `*` within a
// segment, `**` as a whole segment. Brackets, groups, braces, `?`, escapes and queries fall outside it.
const GLOB_SEGMENT = /^[A-Za-z0-9._*-]+$/;
const QUERY_OR_HASH = /[?#]/;
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

/** `import.meta.<name>`, read non-computed. */
const isImportMetaMember = (node: unknown, name: string): boolean => {
  if (!isNode(node)) {
    return false;
  }
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
    property?.name === name
  );
};

const isGlobMember = (node: AstNode): boolean => isImportMetaMember(node, 'glob');

/** A specifier that must be a string literal; the parser has already decoded its escapes. */
const literalEdge = (node: unknown): Edge[] | string =>
  isNode(node) && node.type === 'Literal' && typeof node.value === 'string'
    ? [{ specifier: node.value, glob: false }]
    : 'a module specifier that is not a string literal';

/** A glob pattern's text as Vite reads it: a string literal's value, or a hole-free template's raw text. */
const globText = (node: unknown): string | undefined => {
  if (!isNode(node)) {
    return undefined;
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  const quasis = node.quasis as { value: { raw: string } }[] | undefined;
  const expressions = node.expressions as unknown[] | undefined;
  return node.type === 'TemplateLiteral' && expressions?.length === 0 ? quasis?.[0]?.value.raw : undefined;
};

/** An identifier, or a non-computed member chain of identifiers (`a.b.c`, `this.a`). */
const plainName = (node: unknown): boolean => {
  if (!isNode(node)) {
    return false;
  }
  if (node.type === 'Identifier' || node.type === 'ThisExpression') {
    return true;
  }
  const property = node.property as AstNode | undefined;
  return (
    node.type === 'MemberExpression' &&
    !node.computed &&
    !node.optional &&
    property?.type === 'Identifier' &&
    plainName(node.object)
  );
};

/**
 * A dynamic import's target: a literal specifier, or a template as a glob with one `*` per hole. Vite
 * turns an identifier or member hole into one `*`, which stays within one path segment; literals, calls,
 * concatenation and nested templates inside a hole keep their text, so they could add directories.
 */
function dynamicImportEdges(source: unknown): Edge[] | string {
  if (isNode(source) && source.type === 'Literal' && typeof source.value === 'string') {
    return [{ specifier: source.value, glob: false }];
  }
  if (!(isNode(source) && source.type === 'TemplateLiteral')) {
    return 'a dynamic import or module URL whose target is not a literal or template';
  }
  if (!(source.expressions as unknown[]).every(plainName)) {
    return 'a dynamic import template hole that is not a plain name';
  }
  const quasis = (source.quasis as { value: { raw: string } }[]).map((quasi) => quasi.value.raw);
  const holes = (source.expressions as unknown[]).length;
  // Raw text keeps any escape, which the glob allowlist then rejects.
  return [{ specifier: quasis.join('*'), glob: holes > 0 }];
}

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

// Vite's own glob option names; it rejects any other. `as`, `eager`, `import` and `query` change only
// how matched files load. `caseSensitive` and `exhaustive` widen the match beyond what Node's globSync
// finds (other-case names; dotfiles), so only their literal defaults pass. `base` is read separately.
const GLOB_OPTIONS = new Map<string, boolean | undefined>([
  ['as', undefined],
  ['eager', undefined],
  ['import', undefined],
  ['query', undefined],
  ['base', undefined],
  ['caseSensitive', true],
  ['exhaustive', false],
]);

const optionReadable = (name: unknown, value: unknown): boolean => {
  if (typeof name !== 'string' || !GLOB_OPTIONS.has(name)) {
    return false;
  }
  const required = GLOB_OPTIONS.get(name);
  return required === undefined || (isNode(value) && value.type === 'Literal' && value.value === required);
};

/**
 * The `base` option of an `import.meta.glob` call, or why the options cannot be read. Every property
 * is checked, whatever its position: a spread or computed key could set `base` where the check cannot see it.
 */
function globBase(options: unknown): { readonly base?: string } | string {
  if (options === undefined) {
    return {};
  }
  if (!(isNode(options) && options.type === 'ObjectExpression')) {
    return 'an import.meta.glob whose options are not an object literal';
  }
  let base: string | undefined;
  for (const property of options.properties as AstNode[]) {
    const key = property.key as AstNode | undefined;
    const name = key?.name ?? key?.value;
    if (property.type !== 'Property' || property.computed || !optionReadable(name, property.value)) {
      return 'an import.meta.glob option the check cannot read';
    }
    if (name === 'base') {
      // Vite evaluates the object literal, so a repeated base takes its last value.
      base = staticString(property.value);
      if (base === undefined) {
        return 'an import.meta.glob base that is not a literal';
      }
    }
  }
  return base === undefined ? {} : { base };
}

/** The patterns of one `import.meta.glob` call, with its base. */
function globCallEdges(call: AstNode): Edge[] | string {
  const [patterns, options, ...rest] = call.arguments as unknown[];
  const list = isNode(patterns) && patterns.type === 'ArrayExpression' ? (patterns.elements as unknown[]) : [patterns];
  const specifiers = list.map(globText);
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

/** `new URL(target, import.meta.url)`, which the bundler resolves and emits like an import. */
const isModuleUrl = (node: AstNode): boolean => {
  const callee = node.callee as AstNode | undefined;
  const args = node.arguments as unknown[];
  return (
    callee?.type === 'Identifier' && callee.name === 'URL' && args.length === 2 && isImportMetaMember(args[1], 'url')
  );
};

/** The specifier-bearing node kinds that carry a single string-literal specifier, and where it sits. */
const LITERAL_SPECIFIERS: ReadonlyMap<string, string> = new Map([
  ['ImportDeclaration', 'source'],
  ['ExportAllDeclaration', 'source'],
  ['ExportNamedDeclaration', 'source'],
  ['TSImportType', 'source'],
  ['TSExternalModuleReference', 'expression'],
]);

function callEdges(node: AstNode, callees: Set<AstNode>): Edge[] | string {
  const callee = node.callee as AstNode | undefined;
  if (callee?.type === 'Identifier' && callee.name === 'require') {
    return 'a CommonJS require call';
  }
  if (isNode(callee) && isImportMetaMember(callee, 'resolve')) {
    return literalEdge((node.arguments as unknown[])[0]);
  }
  if (isNode(callee) && isGlobMember(callee)) {
    callees.add(callee);
    return globCallEdges(node);
  }
  return [];
}

/**
 * The edges one syntax node carries. Every module-specifier form is read here from the parsed tree, so
 * literals arrive decoded and comments or trailing commas cannot hide an edge. A glob call's callee is
 * recorded so it is not read as a bare reference.
 */
function syntaxNodeEdges(node: AstNode, callees: Set<AstNode>): Edge[] | string {
  const specifierKey = LITERAL_SPECIFIERS.get(node.type ?? '');
  if (specifierKey !== undefined) {
    // An `export { … }` without `from` has no source.
    return node[specifierKey] === null && node.type === 'ExportNamedDeclaration' ? [] : literalEdge(node[specifierKey]);
  }
  switch (node.type) {
    case 'TSModuleDeclaration':
      // `declare module 'x'` names a module, as an ambient declaration or an augmentation of it.
      return isNode(node.id) && node.id.type === 'Literal' ? literalEdge(node.id) : [];
    case 'ImportExpression':
      return dynamicImportEdges(node.source);
    case 'NewExpression':
      return isModuleUrl(node) ? dynamicImportEdges((node.arguments as unknown[])[0]) : [];
    case 'CallExpression':
      return callEdges(node, callees);
    default:
      return isGlobMember(node) && !callees.has(node) ? 'an import.meta.glob form the check cannot read' : [];
  }
}

/** Every module specifier in the syntax tree; any use of `import.meta.glob` other than a call fails closed. */
function syntaxEdges(program: unknown): Edge[] | string {
  const edges: Edge[] = [];
  const callees = new Set<AstNode>();
  // A parent is read before its children, so a call records its callee before the walk reaches it.
  const pending: unknown[] = [program];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (Array.isArray(node)) {
      pending.push(...node);
    } else if (isNode(node)) {
      const found = syntaxNodeEdges(node, callees);
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

/**
 * Triple-slash directives are comments the compiler reads: `types` names a package and `path` a file.
 * In JavaScript files a JSDoc `import(…)` or `@import` brings a type dependency the tree does not carry,
 * so it fails closed.
 */
function commentEdges(language: string, comments: readonly { type: string; value: string }[]): Edge[] | string {
  const edges: Edge[] = [];
  for (const { type, value } of comments) {
    if (type === 'Line' && TRIPLE_SLASH.test(value)) {
      const directive = directiveEdges(value);
      if (typeof directive === 'string') {
        return directive;
      }
      edges.push(...directive);
    } else if ((language === 'js' || language === 'jsx') && JSDOC_IMPORT.test(value)) {
      return 'a JSDoc type import the check cannot read';
    }
  }
  return edges;
}

/** One triple-slash directive's edges; `lib` names a compiler library, not a module. */
function directiveEdges(value: string): Edge[] | string {
  const attributes = [...value.matchAll(DIRECTIVE_ATTRIBUTE)];
  const unreadable = `a triple-slash directive the check cannot read: ${value}`;
  if (attributes.length === 0) {
    return unreadable;
  }
  const edges: Edge[] = [];
  for (const [, name, , target = ''] of attributes) {
    if (name === 'types') {
      edges.push({ specifier: target, glob: false });
    } else if (name === 'path') {
      edges.push({ specifier: target.startsWith('.') ? target : `./${target}`, glob: false });
    } else if (name !== 'lib' && name !== 'no-default-lib') {
      return unreadable;
    }
  }
  return edges;
}

/** Every module specifier of a file, all read from its parse. */
function edgesOf(file: string, source: string): Edge[] | string {
  const language = languageOf(file);
  const parsed = parseSync(file, source, { lang: language });
  if (parsed.errors.length > 0) {
    return `source the parser rejects: ${parsed.errors[0]!.message}`;
  }
  const syntax = syntaxEdges(parsed.program);
  const comments = commentEdges(language, parsed.comments);
  if (typeof syntax === 'string' || typeof comments === 'string') {
    return typeof syntax === 'string' ? syntax : (comments as string);
  }
  return [...syntax, ...comments];
}

const packageName = (specifier: string): string => {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
};

/** Whether a repository-relative glob stays inside the repository and inside the allowlisted subset. */
const allowlisted = (pattern: string): boolean =>
  !pattern.startsWith('../') &&
  pattern.split('/').every((segment) => segment === '**' || (GLOB_SEGMENT.test(segment) && !segment.includes('**')));

function findSymlinkedDirectory(dir: string, depth: number): string | undefined {
  if (depth <= 0 || !(existsSync(dir) && statSync(dir).isDirectory())) {
    return undefined;
  }
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink() && existsSync(path) && statSync(path).isDirectory()) {
      return path;
    }
    const found = entry.isDirectory() ? findSymlinkedDirectory(path, depth - 1) : undefined;
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

/**
 * A symlinked directory a wildcard segment of this repo-relative glob could pass through. Node's globSync
 * does not enumerate under one, so files Vite would import there are never seen as matches.
 */
function symlinkedDirectoryUnder(
  repoRoot: string,
  literalBase: string,
  wildcard: readonly string[],
): string | undefined {
  if (wildcard.length === 0) {
    return undefined;
  }
  // The match descends one directory per segment before the last, or through every level under `**`.
  const depth = wildcard.includes('**') ? Number.POSITIVE_INFINITY : wildcard.length - 1;
  const found = findSymlinkedDirectory(join(repoRoot, literalBase), depth);
  return found === undefined ? undefined : relative(repoRoot, found).split(sep).join('/');
}

type Resolved = { readonly file: string } | { readonly npm: string } | undefined;

class ClosureWalk {
  readonly violations: RuntimeClosureViolation[] = [];
  private readonly visited = new Set<string>();
  private readonly symlinks = new Map<string, boolean>();
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
    return alias ? posix.normalize(`${alias[1]}${pattern.slice(alias[0].length)}`) : undefined;
  }

  private resolveGlob(importer: string, specifier: string, base: string | undefined): void {
    const pattern = this.globPattern(importer, specifier, base);
    if (pattern === undefined) {
      this.violations.push({ importer, specifier, target: '', reason: 'uses a glob that does not resolve' });
      return;
    }
    const unmatched = this.unmatchedGlob(pattern);
    if (unmatched !== undefined) {
      this.violations.push({ importer, specifier, target: '', reason: unmatched });
      return;
    }
    for (const match of globSync(pattern, { cwd: this.root })) {
      const target = posix.normalize(match.split(sep).join('/'));
      if (statSync(join(this.root, target)).isFile()) {
        this.reach(importer, specifier, target);
      }
    }
  }

  /** Why Node's globSync could match this glob differently from the bundler, if it could. */
  private unmatchedGlob(pattern: string): string | undefined {
    if (!allowlisted(pattern)) {
      return `uses a glob outside the checked subset: ${pattern}`;
    }
    const segments = pattern.split('/');
    const firstWildcard = segments.findIndex((segment) => segment.includes('*'));
    const literal = firstWildcard < 0 ? segments.slice(0, -1) : segments.slice(0, firstWildcard);
    const linkOnBase = this.symlinkOnPath(literal.join('/'));
    const linkUnder = symlinkedDirectoryUnder(
      this.root,
      literal.join('/'),
      firstWildcard < 0 ? [] : segments.slice(firstWildcard),
    );
    const link = linkOnBase ?? linkUnder;
    return link === undefined ? undefined : `globs through a symlink, which the bundler follows: ${link}`;
  }

  /** The first symlink on a repository-relative path, checking each component. */
  private symlinkOnPath(path: string): string | undefined {
    const parts = path === '' ? [] : path.split('/');
    for (let end = 1; end <= parts.length; end++) {
      const prefix = parts.slice(0, end).join('/');
      let linked = this.symlinks.get(prefix);
      if (linked === undefined) {
        linked = lstatSync(join(this.root, prefix), { throwIfNoEntry: false })?.isSymbolicLink() ?? false;
        this.symlinks.set(prefix, linked);
      }
      if (linked) {
        return prefix;
      }
    }
    return undefined;
  }

  private resolveEdge(importer: string, specifier: string): void {
    // A query or hash would otherwise become part of a package name, so `three?raw` passes as a leaf.
    if (QUERY_OR_HASH.test(specifier)) {
      this.violations.push({ importer, specifier, target: '', reason: 'uses a query or hash suffix' });
      return;
    }
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
    // Classification is by path, so a symlink could hide the owner the bundler resolves it to.
    const link = this.symlinkOnPath(target);
    if (link !== undefined) {
      this.violations.push({ importer, specifier, target, reason: `reaches through a symlink: ${link}` });
    } else if (forbidden.some((dir) => within(target, dir))) {
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
