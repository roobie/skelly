// The entry-only check keeps product code on the runtime's curated entries, so the runtime package can
// export those entries alone; the reasons are in `docs/decisions/0009-content-defined-products.md`,
// "Refactor gate".
// biome-ignore lint/correctness/noNodejsModules: This check reads the source tree in Node.js.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
// biome-ignore lint/correctness/noNodejsModules: This check reads the source tree in Node.js.
import { join, posix } from 'node:path';
import { parseSync } from 'vite';
import { RUNTIME_POLICY } from './runtimeClosure.ts';

/** Which runtime paths product code may import. Paths are repository-relative. */
export interface EntryPolicy {
  /** Runtime directories whose modules product code reaches only through an entry in `src/engine`. */
  readonly internal: readonly string[];
  /** Product files, and directories whose files are product code. */
  readonly product: readonly string[];
  /** Directories under a product directory that belong to the runtime and are skipped. */
  readonly runtime: readonly string[];
  /** The Vite project root, where a specifier with a leading slash starts. */
  readonly viteRoot: string;
}

export interface EntryViolation {
  readonly importer: string;
  readonly specifier: string;
  readonly reason: string;
}

export const ENTRY_POLICY: EntryPolicy = {
  internal: ['packages/deadvox/src/core', 'packages/deadvox/src/vehicles'],
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
  runtime: RUNTIME_POLICY.start,
  viteRoot: RUNTIME_POLICY.viteRoot,
};

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
    if (policy.runtime.some((dir) => within(path, dir)) || path.split('/').includes('node_modules')) {
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

/** Every import, type-only and dynamic ones included, by which a product file reaches a runtime module other than an entry. */
export function entryViolations(repoRoot: string, policy: EntryPolicy): EntryViolation[] {
  const violations: EntryViolation[] = [];
  for (const importer of productFiles(repoRoot, policy)) {
    const specifiers = specifiersOf(importer, readFileSync(join(repoRoot, importer), 'utf8'));
    if (typeof specifiers === 'string') {
      violations.push({ importer, specifier: '', reason: specifiers });
      continue;
    }
    for (const specifier of specifiers) {
      const target = targetOf(importer, specifier, policy.viteRoot);
      if (target !== undefined && policy.internal.some((dir) => within(target, dir))) {
        violations.push({ importer, specifier, reason: 'imports a runtime module that is not an entry' });
      }
    }
  }
  return violations;
}
