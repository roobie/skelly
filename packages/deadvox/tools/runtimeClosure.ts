// The runtime closure check catches honest edits that let the runtime reach presentation or product code; the routes
// it accepts or never sees are in `packages/deadvox/docs/runtime-closure-limits.md`, "Not checked".
// biome-ignore lint/correctness/noNodejsModules: This check reads the source tree in Node.js.
import { existsSync, globSync, lstatSync, readdirSync, readFileSync, statSync } from 'node:fs';
// biome-ignore lint/correctness/noNodejsModules: This check reads the source tree in Node.js.
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';
import { parseSync } from 'vite';

/** Where the runtime starts, what it may follow, and what it may never reach. Paths are repository-relative. */
export interface RuntimeClosurePolicy {
  /** The runtime set: every file under these directories. A reached local file outside it fails, except below. */
  readonly start: readonly string[];
  /** Local directories the runtime may reach without following their source files; named here, never implied. */
  readonly leaves: readonly string[];
  /**
   * The runtime package's manifest. The workspaces its `dependencies` name are the libraries the runtime
   * follows: a file of one is allowed when reached by the package name or from inside that library. A runtime
   * file may import only the npm packages it names there.
   */
  readonly manifest: string;
  /** Directories no runtime file, or local file it reaches, may reach, by any import route. */
  readonly forbidden: readonly string[];
  /** npm packages no runtime file, or local file it reaches, may import, with every subpath. */
  readonly forbiddenPackages: readonly string[];
  /** Export conditions only tests enable: a workspace subpath that resolves only under one is not shipped. */
  readonly testConditions: readonly string[];
  /** The Vite project root, where a glob pattern or base with a leading slash starts. */
  readonly viteRoot: string;
  /** The compiler config for the start set; it may set only resolution the check models. */
  readonly tsconfig: string;
}

export interface RuntimeClosureViolation {
  readonly importer: string;
  readonly specifier: string;
  readonly target: string;
  readonly reason: string;
}

// The runtime package (#1532): it reaches no product package and no presentation, by any route, and imports
// neither three nor Lit even through a library.
// The asset release's shared model data (the finish table) is JSON the thing-core library reads; it holds no
// code to walk, so the runtime may reach it.
const ASSET_MODEL_DATA = 'packages/skelly-assets/models';
export const ENGINE_POLICY: RuntimeClosurePolicy = {
  start: ['packages/engine/src'],
  leaves: [ASSET_MODEL_DATA],
  manifest: 'packages/engine/package.json',
  forbidden: ['packages/deadvox', 'packages/presentation'],
  forbiddenPackages: ['three', 'lit', 'lit-html'],
  testConditions: ['skelly-test'],
  viteRoot: 'packages/engine',
  tsconfig: 'packages/engine/tsconfig.json',
};

// The presentation package (#1532): it reaches no product package by any route, and reaches the engine only
// through its curated entries; see `packages/presentation/PROJECT.md`, "Imports".
export const PRESENTATION_POLICY: RuntimeClosurePolicy = {
  start: ['packages/presentation/src'],
  leaves: [ASSET_MODEL_DATA],
  manifest: 'packages/presentation/package.json',
  forbidden: ['packages/deadvox'],
  forbiddenPackages: [],
  testConditions: ENGINE_POLICY.testConditions,
  viteRoot: 'packages/presentation',
  tsconfig: 'packages/presentation/tsconfig.json',
};

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
// The specifier extensions the runtime uses. Each names exactly the file it spells, except that tsc also
// reads `x.mjs` as `x.mts` or `x.d.mts`; any other extension, or none, is outside what the check models.
const SPECIFIER_EXTENSION = /\.(?:ts|mjs|json)$/;
const MJS_EXTENSION = /\.mjs$/;
// Package keys that cannot change how a specifier resolves; `exports` is resolved, `type` must be `module`.
const PACKAGE_KEYS = new Set([
  'name',
  'version',
  'private',
  'license',
  'description',
  'type',
  'workspaces',
  'scripts',
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'overrides',
  'exports',
]);
// The tsconfig keys and compiler options the check models. Most cannot add files or change resolution;
// the ones that can are constrained in `tsconfigInputs`: moduleResolution, module, paths, types (bare
// package names, each classified like an import), lib (compiler library names) and include (paths inside
// the package). customConditions needs no constraint: the check follows every condition of an `exports` value,
// and fails a subpath that resolves only under a test condition.
const TSCONFIG_KEYS = new Set(['compilerOptions', 'include']);
const BARE_TYPE_PACKAGE = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(?:\/[a-z0-9][\w.-]*)*$/;
const COMPILER_LIBRARY = /^[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*$/;
const TYPES_SCOPE = /^(.+?)__/;
const INCLUDE_PATH = /^[A-Za-z0-9_][\w-]*(?:\.[\w-]+)*(?:\/[A-Za-z0-9_][\w-]*(?:\.[\w-]+)*)*$/;
const COMPILER_OPTIONS = new Set([
  'target',
  'module',
  'moduleResolution',
  'customConditions',
  'lib',
  'types',
  'strict',
  'noUncheckedIndexedAccess',
  'noImplicitOverride',
  'noUnusedLocals',
  'noUnusedParameters',
  'exactOptionalPropertyTypes',
  'verbatimModuleSyntax',
  'erasableSyntaxOnly',
  'allowImportingTsExtensions',
  'resolveJsonModule',
  'noEmit',
  'skipLibCheck',
  'noImplicitReturns',
  'noFallthroughCasesInSwitch',
  'noUncheckedSideEffectImports',
  'allowUnreachableCode',
  'allowUnusedLabels',
  'forceConsistentCasingInFileNames',
]);
// Comment readers: a triple-slash directive and its attributes. In JavaScript any comment naming `import`
// fails closed, since tsc's JSDoc reader finds module references across line breaks and leading asterisks.
const TRIPLE_SLASH = /^\/\s*<reference\b/;
const DIRECTIVE_ATTRIBUTE = /([\w-]+)\s*=\s*(["'])(.*?)\2/g;
const JSDOC_IMPORT = /\bimport\b/;
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

/**
 * Every target string under an `exports` value: each condition (nested too) except the skipped ones, and each
 * array fallback.
 */
function exportTargets(value: unknown, skipped: readonly string[] = []): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => exportTargets(item, skipped));
  }
  return value && typeof value === 'object'
    ? Object.entries(value)
        .filter(([condition]) => !skipped.includes(condition))
        .flatMap(([, target]) => exportTargets(target, skipped))
    : [];
}

/**
 * The shipped workspace paths a subpath can name, outside the test conditions; or why it names none: it
 * resolves only under a test condition, or the check cannot resolve it conservatively.
 */
function workspacePaths(workspace: Workspace, subpath: string, testConditions: readonly string[]): string[] | string {
  const all = workspacePathsUnder(workspace, subpath, []);
  if (typeof all === 'string' || all.length === 0) {
    return all;
  }
  const shipped = workspacePathsUnder(workspace, subpath, testConditions);
  return shipped.length === 0 ? 'imports a subpath that resolves only under a test condition' : shipped;
}

/**
 * The workspace paths a subpath can name: every target of the exact `exports` key, else of every
 * matching pattern, outside the skipped conditions; or why the check cannot resolve it conservatively.
 */
function workspacePathsUnder(workspace: Workspace, subpath: string, skipped: readonly string[]): string[] | string {
  if (workspace.exports === undefined) {
    // Without exports the root resolves through main, module or types fields, which the check does not model.
    return subpath === '' ? `a workspace root without exports: ${workspace.name}` : [`${workspace.dir}${subpath}`];
  }
  const map =
    typeof workspace.exports === 'string' ||
    Array.isArray(workspace.exports) ||
    !Object.keys(workspace.exports as object).some((k) => k.startsWith('.'))
      ? { '.': workspace.exports }
      : (workspace.exports as Record<string, unknown>);
  const key = `.${subpath}`;
  const inDir = (target: string) => join(workspace.dir, target).split(sep).join('/');
  if (Object.hasOwn(map, key)) {
    return exportTargets(map[key], skipped).map(inDir);
  }
  return Object.entries(map).flatMap(([pattern, value]) => {
    const star = pattern.indexOf('*');
    if (star < 0 || !key.startsWith(pattern.slice(0, star)) || !key.endsWith(pattern.slice(star + 1))) {
      return [];
    }
    const matched = key.slice(star, key.length - (pattern.length - star - 1));
    return exportTargets(value, skipped).map((target) => inDir(target.replaceAll('*', matched)));
  });
}

const isFile = (absolute: string): boolean => existsSync(absolute) && statSync(absolute).isFile();

/**
 * Every existing file tsc or Vite could take a path to mean, for the extensions the check supports; or
 * why the path is outside them. A declaration name (`x.d.ts`) is outside: tsc also reads it as `x.ts`.
 */
function existingFiles(repoRoot: string, path: string): string[] | string {
  if (DECLARATION_FILE.test(path) || !SPECIFIER_EXTENSION.test(path)) {
    return `a specifier extension outside .ts, .mjs and .json: ${path}`;
  }
  const candidates = MJS_EXTENSION.test(path)
    ? [path, path.replace(MJS_EXTENSION, '.mts'), path.replace(MJS_EXTENSION, '.d.mts')]
    : [path];
  return candidates.filter((candidate) => isFile(join(repoRoot, candidate)));
}

/** A JSON-with-comments document's value, read as a literal expression; undefined if it holds anything else. */
function literalValue(node: unknown): unknown {
  if (!isNode(node)) {
    return undefined;
  }
  if (node.type === 'Literal') {
    return node.value;
  }
  if (node.type === 'ArrayExpression') {
    return (node.elements as unknown[]).map(literalValue);
  }
  if (node.type !== 'ObjectExpression') {
    return undefined;
  }
  const entries = (node.properties as AstNode[]).map((property) => {
    const key = property.key as AstNode | undefined;
    return [key?.name ?? key?.value, literalValue(property.value)];
  });
  return Object.fromEntries(entries);
}

const stringList = (value: unknown, item: RegExp): string[] | undefined =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string' && item.test(entry))
    ? (value as string[])
    : undefined;

/**
 * Why a tsconfig sets values the check does not model, or the bare type packages it adds, which are
 * then classified like imports. Values that add files or dependencies are constrained one by one.
 */
function tsconfigInputs(text: string): { readonly reason: string } | { readonly types: readonly string[] } {
  const reason = unsupportedTsconfig(text);
  if (reason !== undefined) {
    return { reason };
  }
  const { compilerOptions: options = {}, include } = tsconfigValue(text) as {
    compilerOptions?: Record<string, unknown>;
    include?: unknown;
  };
  const types = options.types === undefined ? [] : stringList(options.types, BARE_TYPE_PACKAGE);
  const lib = options.lib === undefined ? [] : stringList(options.lib, COMPILER_LIBRARY);
  const included = include === undefined ? [] : stringList(include, INCLUDE_PATH);
  if (types === undefined) {
    return { reason: 'tsconfig types other than bare package names' };
  }
  if (lib === undefined || included === undefined || options.module !== 'ESNext') {
    return { reason: 'tsconfig lib, include or module values the check does not model' };
  }
  return { types };
}

/** A tsconfig's literal value, or undefined when it holds anything but literals. */
function tsconfigValue(text: string): unknown {
  const parsed = parseSync('tsconfig.js', `(${text})`, { lang: 'js' });
  const body = parsed.program.body[0] as AstNode | undefined;
  const wrapped = body?.expression as AstNode | undefined;
  const expression = wrapped?.type === 'ParenthesizedExpression' ? wrapped.expression : wrapped;
  return parsed.errors.length === 0 ? literalValue(expression) : undefined;
}

/** Why a tsconfig sets resolution the check does not model, if it does. */
function unsupportedTsconfig(text: string): string | undefined {
  const config = tsconfigValue(text);
  if (!(config && typeof config === 'object')) {
    return 'a tsconfig the check cannot read';
  }
  const options = ((config as Record<string, unknown>).compilerOptions ?? {}) as Record<string, unknown>;
  const unknownKeys = [
    ...Object.keys(config).filter((key) => !TSCONFIG_KEYS.has(key)),
    ...Object.keys(options).filter((key) => !COMPILER_OPTIONS.has(key)),
  ];
  if (unknownKeys.length > 0) {
    return `tsconfig options the check does not model: ${unknownKeys.join(', ')}`;
  }
  if (options.moduleResolution !== 'Bundler') {
    return 'tsconfig resolution other than Bundler';
  }
  return undefined;
}

/** Why a package.json could change resolution in ways the check does not model, if it could. */
function unsupportedManifest(text: string): string | undefined {
  const manifest = JSON.parse(text) as Record<string, unknown>;
  const unknownKeys = Object.keys(manifest).filter((key) => !PACKAGE_KEYS.has(key));
  if (unknownKeys.length > 0) {
    return `package keys the check does not model: ${unknownKeys.join(', ')}`;
  }
  return manifest.type === 'module' ? undefined : 'a package whose type is not module';
}

/**
 * The source files under a runtime root, and every symlink met there. The compiler includes a linked
 * file or directory under its link path, so a link would hide its real owner from path classification.
 */
function sourceFilesUnder(repoRoot: string, dir: string): { files: string[]; links: string[] } {
  const absolute = join(repoRoot, dir);
  if (!existsSync(absolute)) {
    throw new Error(`Runtime start directory does not exist: ${dir}`);
  }
  if (lstatSync(absolute).isSymbolicLink()) {
    return { files: [], links: [dir] };
  }
  const files: string[] = [];
  const links: string[] = [];
  const pending = [dir];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    for (const entry of readdirSync(join(repoRoot, current), { withFileTypes: true })) {
      const path = posix.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        links.push(path);
      } else if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile() && SOURCE_FILE.test(entry.name)) {
        files.push(path);
      }
    }
  }
  return { files: files.sort(), links: links.sort() };
}

interface Edge {
  readonly specifier: string;
  readonly glob: boolean;
  /** An `import.meta.glob` call's `base` option. */
  readonly base?: string;
  /** A `new URL(…, import.meta.url)` target: a URL path relative to the importer, not a module specifier. */
  readonly url?: boolean;
  /** A triple-slash `path` target: the compiler reads exactly that file, a declaration file included. */
  readonly reference?: boolean;
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
function dynamicImportEdges(source: unknown, url: boolean): Edge[] | string {
  const kind = url ? { url } : {};
  if (isNode(source) && source.type === 'Literal' && typeof source.value === 'string') {
    return [{ specifier: source.value, glob: false, ...kind }];
  }
  if (!(isNode(source) && source.type === 'TemplateLiteral')) {
    return 'a dynamic import or module URL whose target is not a literal or template';
  }
  if (!(source.expressions as unknown[]).every(plainName)) {
    return 'a dynamic import template hole that is not a plain name';
  }
  const quasis = (source.quasis as { value: { raw: string } }[]).map((quasi) => quasi.value.raw);
  const holes = (source.expressions as unknown[]).length;
  // tsc reads a template's cooked text and Vite its raw text; with an escape they name different targets.
  if (holes === 0 && quasis[0]!.includes('\\')) {
    return 'a template specifier with an escape, which the compiler and bundler read differently';
  }
  // With holes, raw text keeps any escape, which the glob allowlist then rejects.
  return [{ specifier: quasis.join('*'), glob: holes > 0, ...kind }];
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
      return dynamicImportEdges(node.source, false);
    case 'NewExpression':
      return isModuleUrl(node) ? dynamicImportEdges((node.arguments as unknown[])[0], true) : [];
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
      edges.push({ specifier: target.startsWith('.') ? target : `./${target}`, glob: false, reference: true });
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

/** `library` is the workspace directory a bare package name resolved into. */
type Resolved =
  | { readonly files: readonly string[]; readonly library?: string }
  | { readonly npm: string }
  | { readonly unresolved: string };

// A module URL the check reads: a path relative to the importer, without escapes or percent-encoding that
// URL parsing would rewrite.
const MODULE_URL = /^\.\.?\//;
const URL_REWRITTEN = /[%\\]/;

class ClosureWalk {
  readonly violations: RuntimeClosureViolation[] = [];
  private readonly visited = new Set<string>();
  private readonly symlinks = new Map<string, boolean>();
  /** Each directory's nearest package.json, and the manifests already judged. */
  private readonly nearestManifest = new Map<string, string | undefined>();
  private readonly judgedManifests = new Set<string>();
  private readonly queue: string[];
  private readonly workspaces: readonly Workspace[];
  /** The directories of the workspace libraries the runtime package depends on. */
  private readonly libraries: readonly string[];
  /** The packages the runtime package's manifest names in `dependencies`. */
  private readonly dependencies: readonly string[];
  /** The runtime package's own name, which its files never import; see `packages/engine/PROJECT.md`, "Entry points". */
  private readonly ownName: string | undefined;
  private readonly root: string;
  private readonly policy: RuntimeClosurePolicy;

  constructor(root: string, policy: RuntimeClosurePolicy) {
    this.root = root;
    this.policy = policy;
    this.workspaces = workspacesOf(root);
    const manifest = JSON.parse(readFileSync(join(root, policy.manifest), 'utf8')) as {
      name?: string;
      dependencies?: Record<string, string>;
    };
    const dependencies = Object.keys(manifest.dependencies ?? {});
    this.dependencies = dependencies;
    this.ownName = manifest.name;
    this.libraries = this.workspaces.filter(({ name }) => dependencies.includes(name)).map(({ dir }) => dir);
    const roots = policy.start.map((dir) => sourceFilesUnder(root, dir));
    this.queue = roots.flatMap(({ files }) => files);
    for (const link of roots.flatMap(({ links }) => links)) {
      this.violations.push({ importer: link, specifier: '', target: '', reason: 'a symlink in a runtime root' });
    }
  }

  /** Every existing file any of these paths can mean, or why one of them cannot be resolved. */
  private found(paths: readonly string[] | string): Resolved {
    if (typeof paths === 'string') {
      return { unresolved: paths };
    }
    const files = new Set<string>();
    for (const path of paths) {
      const existing = existingFiles(this.root, posix.normalize(path.split(sep).join('/')));
      if (typeof existing === 'string') {
        return { unresolved: existing };
      }
      for (const file of existing) {
        files.add(file);
      }
    }
    return files.size === 0 ? { unresolved: 'does not resolve' } : { files: [...files] };
  }

  private resolveSpecifier(importer: string, specifier: string): Resolved {
    if (specifier.startsWith('node:')) {
      return { npm: specifier };
    }
    if (specifier.startsWith('.')) {
      return this.found([join(dirname(importer), specifier)]);
    }
    if (isAbsolute(specifier)) {
      // tsc reads a filesystem path and Vite a path from its root; follow both.
      return this.found([relative(this.root, specifier), posix.join(this.policy.viteRoot, specifier)]);
    }
    // A workspace is classified by where it lies, whatever route names it; only other names are npm packages.
    const name = packageName(specifier);
    const workspace = this.workspaces.find((candidate) => candidate.name === name);
    if (workspace === undefined) {
      return { npm: name };
    }
    // The workspace manifest steers this resolution (exports, typesVersions), whatever manifest the target has.
    this.judgeManifestFile(importer, specifier, posix.join(workspace.dir, 'package.json'));
    const resolved = this.found(workspacePaths(workspace, specifier.slice(name.length), this.policy.testConditions));
    return 'files' in resolved ? { files: resolved.files, library: workspace.dir } : resolved;
  }

  /** The nearest package.json above a repository-relative directory, inside the repository. */
  private manifestFor(dir: string): string | undefined {
    if (!this.nearestManifest.has(dir)) {
      const here = posix.join(dir, 'package.json');
      const parent = posix.dirname(dir);
      let found: string | undefined;
      if (isFile(join(this.root, here))) {
        found = here;
      } else if (dir !== '.' && dir !== '' && !dir.startsWith('..')) {
        found = this.manifestFor(parent);
      }
      this.nearestManifest.set(dir, found);
    }
    return this.nearestManifest.get(dir);
  }

  /** Reports, once per manifest, a package.json that could change how this file resolves or loads. */
  private judgeManifest(importer: string, specifier: string, file: string): void {
    const manifest = this.manifestFor(posix.dirname(file));
    if (manifest !== undefined) {
      this.judgeManifestFile(importer, specifier, manifest);
    }
  }

  /** Reports, once, a package.json used as a resolution input that holds keys the check does not model. */
  private judgeManifestFile(importer: string, specifier: string, manifest: string): void {
    if (this.judgedManifests.has(manifest)) {
      return;
    }
    this.judgedManifests.add(manifest);
    const reason = unsupportedManifest(readFileSync(join(this.root, manifest), 'utf8'));
    if (reason !== undefined) {
      this.violations.push({ importer, specifier, target: manifest, reason });
    }
  }

  private judgeTsconfig(): void {
    const { tsconfig } = this.policy;
    const text = isFile(join(this.root, tsconfig)) ? readFileSync(join(this.root, tsconfig), 'utf8') : undefined;
    const inputs = text === undefined ? { reason: 'a missing tsconfig' } : tsconfigInputs(text);
    if ('reason' in inputs) {
      this.violations.push({ importer: tsconfig, specifier: '', target: '', reason: inputs.reason });
      return;
    }
    // Each listed type package is a dependency of every compiled file, so it is classified like an import.
    for (const name of inputs.types) {
      // `@types/x` and `@types/scope__x` are the declarations of `x` and `@scope/x`. Type packages are
      // development dependencies, so the dependencies rule does not apply to them.
      const declared = name.startsWith('@types/') ? name.slice('@types/'.length).replace(TYPES_SCOPE, '@$1/') : name;
      this.resolveEdge(tsconfig, declared, false);
    }
  }

  run(): void {
    // The root manifest lists the workspaces that bare names resolve to.
    this.judgeManifestFile('package.json', '', 'package.json');
    this.judgeTsconfig();
    for (let file = this.queue.shift(); file !== undefined; file = this.queue.shift()) {
      if (!this.visited.has(file)) {
        this.visited.add(file);
        this.visit(file);
      }
    }
  }

  private visit(file: string): void {
    this.judgeManifest(file, '', file);
    const edges = edgesOf(file, readFileSync(join(this.root, file), 'utf8'));
    if (typeof edges === 'string') {
      this.violations.push({ importer: file, specifier: '', target: '', reason: `uses ${edges}` });
      return;
    }
    for (const { specifier, glob, base, url, reference } of edges) {
      const referenced = posix.normalize(posix.join(posix.dirname(file), specifier));
      if (reference && DECLARATION_FILE.test(specifier) && isFile(join(this.root, referenced))) {
        this.reach(file, specifier, referenced);
      } else if (url && !(MODULE_URL.test(specifier) && !URL_REWRITTEN.test(specifier))) {
        // A module URL resolves against the importer's URL, never as a package name or from a root.
        this.violations.push({
          importer: file,
          specifier,
          target: '',
          reason: 'uses a module URL that is not a plain ./ or ../ path',
        });
      } else if (glob) {
        this.resolveGlob(file, specifier, base);
      } else {
        this.resolveEdge(file, specifier);
      }
    }
  }

  /** A glob pattern as a repository-relative pattern, by Vite's `toAbsoluteGlob` rules; undefined if Vite would reject it. */
  private globPattern(importer: string, pattern: string, base: string | undefined): string | undefined {
    const { viteRoot } = this.policy;
    const importerDir = posix.dirname(importer);
    const dir = base === undefined ? importerDir : posix.join(base.startsWith('/') ? viteRoot : importerDir, base);
    if (pattern.startsWith('/')) {
      return posix.join(viteRoot, pattern.slice(1));
    }
    return pattern.startsWith('./') || pattern.startsWith('../') ? posix.join(dir, pattern) : undefined;
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

  private resolveEdge(importer: string, specifier: string, shipped = true): void {
    // A query or hash would otherwise become part of a package name, so `three?raw` passes as a leaf.
    if (QUERY_OR_HASH.test(specifier)) {
      this.violations.push({ importer, specifier, target: '', reason: 'uses a query or hash suffix' });
      return;
    }
    const bare = !(specifier.startsWith('.') || isAbsolute(specifier) || specifier.startsWith('node:'));
    if (bare && packageName(specifier) === this.ownName) {
      this.violations.push({ importer, specifier, target: '', reason: 'imports its own package by name' });
      return;
    }
    const target = this.resolveSpecifier(importer, specifier);
    if ('unresolved' in target) {
      this.violations.push({ importer, specifier, target: '', reason: target.unresolved });
    } else if ('files' in target) {
      for (const file of target.files) {
        this.reach(importer, specifier, file, target.library);
      }
    } else if (this.policy.forbiddenPackages.includes(target.npm)) {
      this.violations.push({ importer, specifier, target: target.npm, reason: 'imports a forbidden package' });
    } else if (shipped && !target.npm.startsWith('node:') && !this.declares(importer, target.npm)) {
      this.violations.push({
        importer,
        specifier,
        target: target.npm,
        reason: 'imports a package its manifest does not name in dependencies',
      });
    }
  }

  /** Whether the package that owns a file, the runtime package or a followed library, names an npm package in `dependencies`. */
  private declares(importer: string, npm: string): boolean {
    const library = this.libraries.find((dir) => within(importer, dir));
    if (library === undefined) {
      return this.dependencies.includes(npm);
    }
    const manifest = JSON.parse(readFileSync(join(this.root, library, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    return Object.hasOwn(manifest.dependencies ?? {}, npm);
  }

  private reach(importer: string, specifier: string, target: string, library?: string): void {
    const { leaves, forbidden } = this.policy;
    this.judgeManifest(importer, specifier, target);
    // Classification is by path, so a symlink could hide the owner the bundler resolves it to.
    const link = this.symlinkOnPath(target);
    if (link !== undefined) {
      this.violations.push({ importer, specifier, target, reason: `reaches through a symlink: ${link}` });
    } else if (forbidden.some((dir) => within(target, dir))) {
      this.violations.push({ importer, specifier, target, reason: 'reaches a forbidden directory' });
    } else if (!this.inRuntimeSet(importer, target, library)) {
      this.violations.push({ importer, specifier, target, reason: 'reaches outside the runtime set' });
    } else if (SOURCE_FILE.test(target) && !leaves.some((dir) => within(target, dir))) {
      this.queue.push(target);
    }
  }

  /**
   * Whether a reached file belongs to the runtime: under a start or leaf directory, or in a library the
   * runtime package depends on, reached by its package name or from inside it. A library entered by a
   * relative path would bypass the package's exports.
   */
  private inRuntimeSet(importer: string, target: string, library: string | undefined): boolean {
    const { start, leaves } = this.policy;
    if ([...start, ...leaves].some((dir) => within(target, dir))) {
      return true;
    }
    return this.libraries.some((dir) => within(target, dir) && (library === dir || within(importer, dir)));
  }
}

/**
 * Walk every import, type-only ones included, from the runtime start set and every runtime source
 * file it reaches, and report each edge into a forbidden directory or package or outside the runtime set.
 */
export function runtimeClosureViolations(repoRoot: string, policy: RuntimeClosurePolicy): RuntimeClosureViolation[] {
  const walk = new ClosureWalk(resolve(repoRoot), policy);
  walk.run();
  return walk.violations.sort((a, b) =>
    `${a.importer} ${a.specifier}`.localeCompare(`${b.importer} ${b.specifier}`, 'en'),
  );
}
