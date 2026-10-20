import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LanguageVariant, SyntaxKind } from 'typescript/unstable/ast';
import { createScanner } from 'typescript/unstable/ast/scanner';
import { describe, expect, it } from 'vitest';

interface Roots {
  readonly repo: string;
  readonly packages: string;
  readonly gungen: string;
  readonly engineSrc: string;
}
interface PackageEdge {
  readonly from: string;
  readonly forbids: (target: string) => boolean;
  readonly problem: string;
}
interface Token {
  readonly kind: SyntaxKind;
  readonly value: string;
}
// `specifier` is undefined when an expression names the module, so the import cannot be checked.
interface ModuleReference {
  readonly specifier: string | undefined;
}

const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.cjs']);
const dependencyDirectories = new Set(['node_modules']);
const forbiddenDomainIdentifiers = new Set(['calibre', 'bore', 'gungen']);
const domainIdentifierAllowlist: ReadonlySet<string> = new Set();
const identifierPartSeparators = /[_$\d\s]+/;
const workspacePackage = /^@skelly\/([^/]+)/;
// A slash after one of these ends a value, so it divides rather than starting a regular expression.
const valueEnders = new Set<SyntaxKind>([
  SyntaxKind.Identifier,
  SyntaxKind.NumericLiteral,
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateTail,
  SyntaxKind.CloseParenToken,
  SyntaxKind.CloseBracketToken,
  SyntaxKind.CloseBraceToken,
  SyntaxKind.ThisKeyword,
]);
// After `import` these mean a property or a key, not an import statement.
const notImportStatement = new Set<SyntaxKind>([
  SyntaxKind.DotToken,
  SyntaxKind.ColonToken,
  SyntaxKind.CommaToken,
  SyntaxKind.CloseBraceToken,
  SyntaxKind.CloseParenToken,
  SyntaxKind.EqualsToken,
]);

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return dependencyDirectories.has(entry.name) ? [] : sourceFiles(path);
    }
    return sourceExtensions.has(extname(path)) ? [path] : [];
  });

const isWithin = (directory: string, path: string): boolean => {
  const relativePath = relative(directory, path);
  return (
    relativePath === '' || (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !isAbsolute(relativePath))
  );
};

const resolveRelativeImport = (from: string, specifier: string): string | undefined => {
  const target = resolve(dirname(from), specifier);
  const candidates = extname(target)
    ? [target]
    : [`${target}.ts`, `${target}.tsx`, `${target}.mts`, `${target}.js`, join(target, 'index.ts')];
  return candidates.find(existsSync);
};

// Each engine folder may import only itself and the folders before it in this list.
const engineLayers = ['foundation', 'shapes', 'assembly', 'export'];

const layerIndex = (engineSrc: string, path: string): number =>
  engineLayers.indexOf(relative(engineSrc, path).split(sep)[0] ?? '');

const rootsUnder = (repo: string): Roots => ({
  repo,
  packages: join(repo, 'packages'),
  gungen: join(repo, 'gungen'),
  engineSrc: join(repo, 'packages', 'engine', 'src'),
});

// The directory an import lands in, or undefined for an external package.
const importTarget = (file: string, specifier: string, roots: Roots): string | undefined => {
  if (specifier.startsWith('.')) {
    return resolve(dirname(file), specifier);
  }
  if (specifier === 'gungen' || specifier.startsWith('gungen/')) {
    return join(roots.repo, specifier);
  }
  const packageName = workspacePackage.exec(specifier)?.[1];
  return packageName === undefined ? undefined : join(roots.packages, packageName);
};

// Each edge rejects an import from the files under `from` into the targets it forbids.
const packageEdges = (roots: Roots): readonly PackageEdge[] => {
  const engine = join(roots.packages, 'engine');
  return [
    { from: roots.packages, forbids: (target) => isWithin(roots.gungen, target), problem: 'imports gungen' },
    {
      from: join(roots.packages, 'thing-core'),
      forbids: (target) => isWithin(roots.packages, target) && !isWithin(engine, target),
      problem: 'thing-core imports a package other than the engine',
    },
    {
      from: join(roots.packages, 'deadvox'),
      forbids: (target) => isWithin(engine, target),
      problem: 'deadvox imports the engine',
    },
    {
      from: roots.engineSrc,
      forbids: (target) => isWithin(join(roots.packages, 'tool-ui'), target),
      problem: 'engine imports a package above the engine',
    },
  ];
};

const importProblem = (
  file: string,
  reference: ModuleReference,
  roots: Roots,
  edges: readonly PackageEdge[],
): string | undefined => {
  const { specifier } = reference;
  const inEngine = isWithin(roots.engineSrc, file);
  if (specifier === undefined) {
    return inEngine ? `${file}: import cannot be resolved statically` : undefined;
  }
  if (inEngine && specifier.startsWith('.') && !isWithin(roots.engineSrc, resolve(dirname(file), specifier))) {
    return `${file}: relative import leaves engine/src (${specifier})`;
  }

  const target = importTarget(file, specifier, roots);
  const edge = edges.find(
    (candidate) => isWithin(candidate.from, file) && target !== undefined && candidate.forbids(target),
  );
  if (edge) {
    return `${file}: ${edge.problem}: ${specifier}`;
  }
  if (!(inEngine && specifier.startsWith('.'))) {
    return undefined;
  }
  if (!resolveRelativeImport(file, specifier)) {
    return `${file}: unresolved relative import ${specifier}`;
  }
  if (layerIndex(roots.engineSrc, resolve(dirname(file), specifier)) > layerIndex(roots.engineSrc, file)) {
    return `${file}: imports upward into a higher layer (${specifier})`;
  }
  return undefined;
};

// The TypeScript scanner reads type annotations and non-null assertions, which a JavaScript lexer rejects.
type Scanner = ReturnType<typeof createScanner>;

// The scanner reads `}` and `/` without context; a `}` that closes a `${` resumes a template, and a `/`
// after no value starts a regular expression.
const contextualKind = (scanner: Scanner, kind: SyntaxKind, previous: Token | undefined, braces: boolean[]) => {
  if (kind === SyntaxKind.OpenBraceToken) {
    braces.push(false);
  } else if (kind === SyntaxKind.TemplateHead) {
    braces.push(true);
  } else if (kind === SyntaxKind.CloseBraceToken && braces.pop()) {
    const template = scanner.reScanTemplateToken(false);
    if (template === SyntaxKind.TemplateMiddle) {
      braces.push(true);
    }
    return template;
  } else if (
    (kind === SyntaxKind.SlashToken || kind === SyntaxKind.SlashEqualsToken) &&
    !valueEnders.has(previous?.kind ?? SyntaxKind.Unknown)
  ) {
    return scanner.reScanSlashToken();
  }
  return kind;
};

const tokenize = (source: string): Token[] => {
  const scanner = createScanner(true, LanguageVariant.Standard, source);
  const tokens: Token[] = [];
  // One entry per open brace: true for a `${` substitution.
  const braces: boolean[] = [];
  for (let scanned = scanner.scan(); scanned !== SyntaxKind.EndOfFile; scanned = scanner.scan()) {
    const kind = contextualKind(scanner, scanned, tokens.at(-1), braces);
    tokens.push({ kind, value: scanner.getTokenValue() });
  }
  return tokens;
};

// The index of the first token of `kind` after `index` in the same statement.
const indexInStatement = (tokens: readonly Token[], index: number, kind: SyntaxKind): number | undefined => {
  for (let next = index + 1; next < tokens.length && tokens[next]?.kind !== SyntaxKind.SemicolonToken; next += 1) {
    if (tokens[next]?.kind === kind) {
      return next;
    }
  }
  return undefined;
};

// `import(` takes its module as the first argument; a non-literal argument cannot be checked.
const dynamicImportReference = (tokens: readonly Token[], index: number): ModuleReference[] => {
  const argument = tokens[index + 2];
  return [{ specifier: argument?.kind === SyntaxKind.StringLiteral ? argument.value : undefined }];
};

const staticImportReference = (tokens: readonly Token[], index: number): ModuleReference[] => {
  const literal = indexInStatement(tokens, index, SyntaxKind.StringLiteral);
  return [{ specifier: literal === undefined ? undefined : tokens[literal]?.value }];
};

const reExportReference = (tokens: readonly Token[], index: number): ModuleReference[] => {
  const from = indexInStatement(tokens, index, SyntaxKind.FromKeyword);
  const literal = from === undefined ? undefined : indexInStatement(tokens, from, SyntaxKind.StringLiteral);
  return literal === undefined ? [] : [{ specifier: tokens[literal]?.value }];
};

const referencesAt = (tokens: readonly Token[], index: number, token: Token): ModuleReference[] => {
  const next = tokens[index + 1]?.kind;
  if (tokens[index - 1]?.kind === SyntaxKind.DotToken) {
    return [];
  }
  if (token.kind === SyntaxKind.ImportKeyword) {
    if (next === SyntaxKind.OpenParenToken) {
      return dynamicImportReference(tokens, index);
    }
    return next === undefined || notImportStatement.has(next) ? [] : staticImportReference(tokens, index);
  }
  const reExports = next === SyntaxKind.AsteriskToken || next === SyntaxKind.OpenBraceToken;
  return token.kind === SyntaxKind.ExportKeyword && reExports ? reExportReference(tokens, index) : [];
};

const moduleReferences = (source: string): ModuleReference[] => {
  const tokens = tokenize(source);
  return tokens.flatMap((token, index) => referencesAt(tokens, index, token));
};

const identifierParts = (identifier: string): string[] =>
  identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .split(identifierPartSeparators)
    .filter(Boolean)
    .map((part) => part.toLowerCase());

const findDomainIdentifierViolations = (files: readonly string[]): string[] =>
  files.flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return [...source.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)].flatMap(([identifier]) =>
      identifierParts(identifier)
        .filter((part) => forbiddenDomainIdentifiers.has(part) && !domainIdentifierAllowlist.has(part))
        .map((part) => `${file}: forbidden domain identifier ${part}`),
    );
  });

const findBoundaryViolations = (files: readonly string[], roots: Roots): string[] => {
  const edges = packageEdges(roots);
  return files.flatMap((file) =>
    moduleReferences(readFileSync(file, 'utf8')).flatMap((reference) => {
      const problem = importProblem(file, reference, roots, edges);
      return problem ? [problem] : [];
    }),
  );
};

describe('engine import boundary', () => {
  const repo = fileURLToPath(new URL('../../../', import.meta.url));
  const roots = rootsUnder(repo);

  it('keeps engine source imports and identifiers domain-neutral', () => {
    const files = sourceFiles(roots.engineSrc);
    expect(findBoundaryViolations(files, roots)).toEqual([]);
    expect(findDomainIdentifierViolations(files)).toEqual([]);
  });

  it('keeps every package within its import edges', () => {
    const files = sourceFiles(roots.packages);
    expect(files.length).toBeGreaterThan(0);
    expect(findBoundaryViolations(files, roots)).toEqual([]);
  });

  it('reads static, re-export and dynamic module references and skips import.meta and property names', () => {
    const references = moduleReferences(
      [
        "import type { A } from './a.ts';",
        "export * from './b.ts';",
        "export { c } from './c.ts';",
        "export const d = 1; const e = { import: 'not-a-module' };",
        "const f = import('./f.ts'); const g = import.meta.url;",
      ].join('\n'),
    );
    expect(references.map(({ specifier }) => specifier)).toEqual(['./a.ts', './b.ts', './c.ts', './f.ts']);
  });

  it('flags relative imports outside engine/src and bare gungen imports', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'engine-import-boundary-'));
    const fixtureRoots = rootsUnder(fixtureRoot);
    const coreRoot = join(fixtureRoots.engineSrc, 'core');
    const viewerRoot = join(fixtureRoots.engineSrc, 'viewer');
    const ammoRoot = join(fixtureRoots.gungen, 'src', 'ammo');
    mkdirSync(coreRoot, { recursive: true });
    mkdirSync(viewerRoot, { recursive: true });
    mkdirSync(ammoRoot, { recursive: true });

    try {
      const target = join(ammoRoot, 'calibreSlug.ts');
      const relativeCanary = join(coreRoot, 'math.ts');
      const packageCanary = join(viewerRoot, 'scene.ts');
      const globCanary = join(viewerRoot, 'glob.ts');
      const identifierCanary = join(coreRoot, 'domainNames.ts');
      writeFileSync(target, 'export const fixture = true;\n');
      writeFileSync(relativeCanary, "import '../../../../gungen/src/ammo/calibreSlug.ts';\n");
      writeFileSync(packageCanary, "import 'gungen/src/gun/palette.ts';\n");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: this fixture writes dynamic import source.
      writeFileSync(globCanary, 'const modules = import(`./parts/${name}.ts`);\n');
      writeFileSync(
        identifierCanary,
        'export const calibre = 5; export const bore = 1; export const gungen = true; export const calibreParams = []; export const byCalibre = {}; export const boreAxis = []; export const gungenId = "";\n',
      );

      const violations = findBoundaryViolations([relativeCanary, packageCanary, globCanary], fixtureRoots);
      expect(violations).toHaveLength(3);
      expect(violations[0]).toContain('relative import leaves engine/src');
      expect(violations[1]).toContain('imports gungen: gungen/src/gun/palette.ts');
      expect(violations[2]).toContain('import cannot be resolved statically');
      expect(findDomainIdentifierViolations([identifierCanary])).toHaveLength(7);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('flags an import from a lower layer into a higher one but allows the reverse', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'engine-layer-boundary-'));
    const fixtureRoots = rootsUnder(fixtureRoot);
    const foundationRoot = join(fixtureRoots.engineSrc, 'foundation');
    const shapesRoot = join(fixtureRoots.engineSrc, 'shapes');
    mkdirSync(foundationRoot, { recursive: true });
    mkdirSync(shapesRoot, { recursive: true });

    try {
      const upward = join(foundationRoot, 'math.ts');
      const downward = join(shapesRoot, 'solid.ts');
      writeFileSync(upward, "import '../shapes/solid.ts';\n");
      writeFileSync(downward, "import '../foundation/math.ts';\n");
      const aboveEngine = join(shapesRoot, 'scene.ts');
      writeFileSync(aboveEngine, "import '@skelly/tool-ui/scene';\n");

      expect(findBoundaryViolations([downward], fixtureRoots)).toEqual([]);
      expect(findBoundaryViolations([aboveEngine], fixtureRoots)).toHaveLength(1);
      const violations = findBoundaryViolations([upward], fixtureRoots);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('imports upward into a higher layer');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('flags a package that imports gungen, by relative path or by name', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'package-gungen-boundary-'));
    const fixtureRoots = rootsUnder(fixtureRoot);
    const deadvoxSrc = join(fixtureRoots.packages, 'deadvox', 'src');
    mkdirSync(deadvoxSrc, { recursive: true });

    try {
      const relativeImport = join(deadvoxSrc, 'relative.ts');
      const namedImport = join(deadvoxSrc, 'named.ts');
      writeFileSync(relativeImport, "import '../../../gungen/src/ammo/calibreSlug.ts';\n");
      writeFileSync(namedImport, "import 'gungen/src/gun/palette.ts';\n");

      const violations = findBoundaryViolations([relativeImport, namedImport], fixtureRoots);
      expect(violations).toHaveLength(2);
      expect(violations[0]).toContain('imports gungen');
      expect(violations[1]).toContain('imports gungen: gungen/src/gun/palette.ts');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('keeps thing-core to the engine among packages, and allows the engine', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'thing-core-boundary-'));
    const fixtureRoots = rootsUnder(fixtureRoot);
    const coreSrc = join(fixtureRoots.packages, 'thing-core', 'src');
    mkdirSync(coreSrc, { recursive: true });

    try {
      const toolImport = join(coreSrc, 'tool.ts');
      const engineImport = join(coreSrc, 'engine.ts');
      writeFileSync(toolImport, "import '@skelly/tool-ui/scene';\n");
      writeFileSync(engineImport, "import '@skelly/engine/foundation/math.ts';\n");

      expect(findBoundaryViolations([engineImport], fixtureRoots)).toEqual([]);
      const violations = findBoundaryViolations([toolImport], fixtureRoots);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('thing-core imports a package other than the engine');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('flags deadvox importing the engine, by name or by relative path', () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'deadvox-engine-boundary-'));
    const fixtureRoots = rootsUnder(fixtureRoot);
    const deadvoxSrc = join(fixtureRoots.packages, 'deadvox', 'src');
    mkdirSync(deadvoxSrc, { recursive: true });

    try {
      const namedImport = join(deadvoxSrc, 'named.ts');
      const relativeImport = join(deadvoxSrc, 'relative.ts');
      writeFileSync(namedImport, "import '@skelly/engine/shapes/solid.ts';\n");
      writeFileSync(relativeImport, "import '../../engine/src/shapes/solid.ts';\n");

      const violations = findBoundaryViolations([namedImport, relativeImport], fixtureRoots);
      expect(violations).toHaveLength(2);
      expect(violations[0]).toContain('deadvox imports the engine');
      expect(violations[1]).toContain('deadvox imports the engine');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
