import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { init, parse } from 'es-module-lexer';
import { describe, expect, it } from 'vitest';

type ParsedImport = ReturnType<typeof parse>[0][number];
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.cjs']);
const forbiddenDomainIdentifiers = new Set(['calibre', 'bore', 'gungen']);
const domainIdentifierAllowlist: ReadonlySet<string> = new Set();
const identifierPartSeparators = /[_$\d\s]+/;

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
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

const importProblem = (file: string, imported: ParsedImport, engineSrc: string): string | undefined => {
  if (imported.type === 'import-meta') {
    return undefined;
  }
  const { specifier } = imported;
  if (specifier === undefined || (imported.type === 'dynamic' && imported.glob)) {
    return `${file}: import cannot be resolved statically`;
  }
  if (specifier === 'gungen' || specifier.startsWith('gungen/')) {
    return `${file}: imports ${specifier}`;
  }
  if (specifier.startsWith('@skelly/tool-ui/')) {
    return `${file}: imports ${specifier}, a package above the engine`;
  }
  if (!specifier.startsWith('.')) {
    return undefined;
  }

  const target = resolve(dirname(file), specifier);
  if (!isWithin(engineSrc, target)) {
    return `${file}: relative import leaves engine/src (${specifier})`;
  }
  if (!resolveRelativeImport(file, specifier)) {
    return `${file}: unresolved relative import ${specifier}`;
  }
  if (layerIndex(engineSrc, target) > layerIndex(engineSrc, file)) {
    return `${file}: imports upward into a higher layer (${specifier})`;
  }
  return undefined;
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

const findBoundaryViolations = async (files: readonly string[], engineSrc: string): Promise<string[]> => {
  await init();
  const violations: string[] = [];
  for (const file of files) {
    const [imports] = parse(readFileSync(file, 'utf8'), file);
    for (const imported of imports) {
      const problem = importProblem(file, imported, engineSrc);
      if (problem) {
        violations.push(problem);
      }
    }
  }
  return violations;
};

describe('engine import boundary', () => {
  const engineSrc = fileURLToPath(new URL('../../packages/engine/src/', import.meta.url));

  it('keeps engine source imports and identifiers domain-neutral', async () => {
    const files = sourceFiles(engineSrc);
    expect(await findBoundaryViolations(files, engineSrc)).toEqual([]);
    expect(findDomainIdentifierViolations(files)).toEqual([]);
  });

  it('flags relative imports outside engine/src and bare gungen imports', async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'engine-import-boundary-'));
    const fixtureEngineSrc = join(fixtureRoot, 'engine', 'src');
    const coreRoot = join(fixtureEngineSrc, 'core');
    const viewerRoot = join(fixtureEngineSrc, 'viewer');
    const ammoRoot = join(fixtureRoot, 'gungen', 'src', 'ammo');
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
      writeFileSync(relativeCanary, "import '../../../gungen/src/ammo/calibreSlug.ts';\n");
      writeFileSync(packageCanary, "import 'gungen/src/gun/palette.ts';\n");
      // biome-ignore lint/suspicious/noTemplateCurlyInString: this fixture writes dynamic import source.
      writeFileSync(globCanary, 'const modules = import(`./parts/${name}.ts`);\n');
      writeFileSync(
        identifierCanary,
        'export const calibre = 5; export const bore = 1; export const gungen = true; export const calibreParams = []; export const byCalibre = {}; export const boreAxis = []; export const gungenId = "";\n',
      );

      const violations = await findBoundaryViolations([relativeCanary, packageCanary, globCanary], fixtureEngineSrc);
      expect(violations).toHaveLength(3);
      expect(violations[0]).toContain('relative import leaves engine/src');
      expect(violations[1]).toContain('imports gungen/src/gun/palette.ts');
      expect(violations[2]).toContain('import cannot be resolved statically');
      expect(findDomainIdentifierViolations([identifierCanary])).toHaveLength(7);
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('flags an import from a lower layer into a higher one but allows the reverse', async () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), 'engine-layer-boundary-'));
    const fixtureEngineSrc = join(fixtureRoot, 'engine', 'src');
    const foundationRoot = join(fixtureEngineSrc, 'foundation');
    const shapesRoot = join(fixtureEngineSrc, 'shapes');
    mkdirSync(foundationRoot, { recursive: true });
    mkdirSync(shapesRoot, { recursive: true });

    try {
      const upward = join(foundationRoot, 'math.ts');
      const downward = join(shapesRoot, 'solid.ts');
      writeFileSync(upward, "import '../shapes/solid.ts';\n");
      writeFileSync(downward, "import '../foundation/math.ts';\n");
      const aboveEngine = join(shapesRoot, 'scene.ts');
      writeFileSync(aboveEngine, "import '@skelly/tool-ui/scene';\n");

      expect(await findBoundaryViolations([downward], fixtureEngineSrc)).toEqual([]);
      expect(await findBoundaryViolations([aboveEngine], fixtureEngineSrc)).toHaveLength(1);
      const violations = await findBoundaryViolations([upward], fixtureEngineSrc);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain('imports upward into a higher layer');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
