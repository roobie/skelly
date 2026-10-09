import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { init, parse } from 'es-module-lexer';
import { describe, expect, it } from 'vitest';

type ParsedImport = ReturnType<typeof parse>[0][number];
const sourceExtensions = new Set(['.ts', '.tsx', '.mts', '.js', '.jsx', '.mjs', '.cjs']);

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
  return undefined;
};

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
  const engineSrc = fileURLToPath(new URL('../../engine/src/', import.meta.url));

  it('keeps every engine source file inside engine/src and out of gungen', async () => {
    expect(await findBoundaryViolations(sourceFiles(engineSrc), engineSrc)).toEqual([]);
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
      writeFileSync(target, 'export const fixture = true;\n');
      writeFileSync(relativeCanary, "import '../../../gungen/src/ammo/calibreSlug.ts';\n");
      writeFileSync(packageCanary, "import 'gungen/src/gun/palette.ts';\n");

      const violations = await findBoundaryViolations([relativeCanary, packageCanary], fixtureEngineSrc);
      expect(violations).toHaveLength(2);
      expect(violations[0]).toContain('relative import leaves engine/src');
      expect(violations[1]).toContain('imports gungen/src/gun/palette.ts');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
