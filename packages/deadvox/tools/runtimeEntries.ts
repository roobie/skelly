// The entry-only check keeps product code on the runtime package's curated entries, off its test-only
// subpath and out of its files, and on the entries of runtime source still in deadvox; the reasons are in `docs/decisions/0009-content-defined-products.md`,
// "Refactor gate".
// biome-ignore lint/correctness/noNodejsModules: This check reads the source tree in Node.js.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
// biome-ignore lint/correctness/noNodejsModules: This check reads the source tree in Node.js.
import { join, posix } from 'node:path';
import { parseSync } from 'vite';

/** How product code may reach the runtime package. Paths are repository-relative. */
export interface EntryPolicy {
  /** The runtime package's directory; its `package.json` `exports` names the entries. */
  readonly runtime: string;
  /** Product files, and directories whose files are product code. */
  readonly product: readonly string[];
  /**
   * Product files that run without an npm install, so they load an entry by its file path rather than by
   * the package name.
   */
  readonly uninstalled: readonly string[];
  /** The Vite project root, where a specifier with a leading slash starts. */
  readonly viteRoot: string;
  /**
   * Runtime source not yet in the runtime package: product files outside `dir` reach it only through the
   * entry modules directly in `entries`.
   */
  readonly inPlace: { readonly dir: string; readonly entries: string };
}

export interface EntryViolation {
  readonly importer: string;
  readonly specifier: string;
  readonly reason: string;
}

export const ENTRY_POLICY: EntryPolicy = {
  runtime: 'packages/engine',
  product: [
    'packages/deadvox/src',
    'packages/deadvox/tools',
    'packages/deadvox/maps/extensions',
    'packages/deadvox/vite.config.ts',
    'test/actors-deadvox-contract.test.mjs',
    'test/gungen-deadvox-contract.test.mjs',
    'test/things-deadvox-contract.test.mjs',
    'test/vehicles-deadvox-contract.test.mjs',
    'test/site-launcher.test.mjs',
  ],
  // Tiled's script runtime has no package resolution, and the site-launcher CI job runs without an install.
  uninstalled: ['packages/deadvox/maps/extensions', 'test/site-launcher.test.mjs'],
  viteRoot: 'packages/deadvox',
  inPlace: { dir: 'packages/deadvox/src/game', entries: 'packages/deadvox/src/game/entries' },
};

interface RuntimePackage {
  readonly name: string;
  /** Each curated entry's subpath (`./sim`), mapped to its file. */
  readonly entries: ReadonlyMap<string, string>;
}

/** The runtime package's name and its curated entries: every export whose target needs no condition. */
function runtimePackage(repoRoot: string, policy: EntryPolicy): RuntimePackage {
  const manifest = JSON.parse(readFileSync(join(repoRoot, policy.runtime, 'package.json'), 'utf8')) as {
    name: string;
    exports: Record<string, unknown>;
  };
  const entries = new Map<string, string>();
  for (const [subpath, target] of Object.entries(manifest.exports)) {
    if (typeof target === 'string') {
      entries.set(subpath, posix.join(policy.runtime, target));
    }
  }
  return { name: manifest.name, entries };
}

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const DECLARATION_FILE = /\.d\.[cm]?ts$/;
const SOURCE_KEYS: ReadonlyMap<string, string> = new Map([
  ['ImportDeclaration', 'source'],
  ['ExportAllDeclaration', 'source'],
  ['ExportNamedDeclaration', 'source'],
  ['TSImportType', 'source'],
  ['ImportExpression', 'source'],
]);

interface AstNode {
  readonly type?: string;
  readonly [key: string]: unknown;
}

const isNode = (value: unknown): value is AstNode => typeof value === 'object' && value !== null;
const within = (path: string, dir: string): boolean => path === dir || path.startsWith(`${dir}/`);

function productFiles(repoRoot: string, policy: EntryPolicy): string[] {
  const files: string[] = [];
  const pending = policy.product.filter((path) => existsSync(join(repoRoot, path)));
  for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
    if (path.split('/').includes('node_modules')) {
      continue;
    }
    if (statSync(join(repoRoot, path)).isDirectory()) {
      pending.push(...readdirSync(join(repoRoot, path)).map((name) => posix.join(path, name)));
    } else if (SOURCE_FILE.test(path) && !DECLARATION_FILE.test(path)) {
      files.push(path);
    }
  }
  return files.sort();
}

/** A string literal's value or a hole-free template's text. */
function textOf(node: AstNode): string | undefined {
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  const quasis = node.quasis as { value: { cooked?: string } }[] | undefined;
  const expressions = node.expressions as unknown[] | undefined;
  return node.type === 'TemplateLiteral' && expressions?.length === 0 ? quasis?.[0]?.value.cooked : undefined;
}

/** The literal specifier an import or re-export node carries, if it carries one. */
function specifierOf(node: AstNode): string | undefined {
  const target = node[SOURCE_KEYS.get(node.type ?? '') ?? ''];
  return isNode(target) ? textOf(target) : undefined;
}

/**
 * The specifiers a file imports by import syntax with a literal target. A target computed at run time, and
 * a module path a browser stage or dev server loads from a string, are not read.
 */
function specifiersOf(file: string, source: string): Set<string> | string {
  const lang = file.endsWith('.ts') || file.endsWith('.mts') ? 'ts' : 'js';
  const parsed = parseSync(file, source, { lang });
  if (parsed.errors.length > 0) {
    return `source the parser rejects: ${parsed.errors[0]!.message}`;
  }
  const specifiers = new Set<string>();
  const pending: unknown[] = [parsed.program];
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (Array.isArray(node)) {
      pending.push(...node);
    } else if (isNode(node)) {
      const literal = specifierOf(node);
      if (literal !== undefined) {
        specifiers.add(literal);
      }
      pending.push(...Object.values(node));
    }
  }
  return specifiers;
}

/** The repository path a relative or Vite-rooted specifier names; a bare package name names none. */
function targetOf(importer: string, specifier: string, viteRoot: string): string | undefined {
  if (specifier.startsWith('.')) {
    return posix.join(posix.dirname(importer), specifier);
  }
  return specifier.startsWith('/') ? posix.join(viteRoot, specifier) : undefined;
}

/** Why a product file may not import this specifier, if it may not. */
function violationOf(
  importer: string,
  specifier: string,
  runtime: RuntimePackage,
  policy: EntryPolicy,
): string | undefined {
  if (specifier === runtime.name || specifier.startsWith(`${runtime.name}/`)) {
    return runtime.entries.has(`.${specifier.slice(runtime.name.length)}`)
      ? undefined
      : 'imports a runtime subpath that is not an entry';
  }
  const target = targetOf(importer, specifier, policy.viteRoot);
  if (target === undefined) {
    return undefined;
  }
  const { dir, entries } = policy.inPlace;
  if (within(target, dir) && !within(importer, dir)) {
    return posix.dirname(target) === entries ? undefined : 'imports an in-place runtime file that is not an entry';
  }
  if (!within(target, policy.runtime)) {
    return undefined;
  }
  const uninstalled = policy.uninstalled.some((path) => within(importer, path));
  if (uninstalled && [...runtime.entries.values()].includes(target)) {
    return undefined;
  }
  return uninstalled
    ? 'imports a runtime file that is not an entry'
    : 'imports a runtime file by path instead of by package name';
}

/**
 * Every import, type-only and dynamic ones included, by which a product file reaches the runtime package
 * other than through an entry by package name; a file that runs uninstalled may name an entry's file instead.
 * Also every import by which a product file outside the in-place runtime source reaches it other than
 * through one of its entries.
 */
export function entryViolations(repoRoot: string, policy: EntryPolicy): EntryViolation[] {
  const runtime = runtimePackage(repoRoot, policy);
  const violations: EntryViolation[] = [];
  for (const importer of productFiles(repoRoot, policy)) {
    const specifiers = specifiersOf(importer, readFileSync(join(repoRoot, importer), 'utf8'));
    if (typeof specifiers === 'string') {
      violations.push({ importer, specifier: '', reason: specifiers });
      continue;
    }
    for (const specifier of specifiers) {
      const reason = violationOf(importer, specifier, runtime, policy);
      if (reason !== undefined) {
        violations.push({ importer, specifier, reason });
      }
    }
  }
  return violations;
}
