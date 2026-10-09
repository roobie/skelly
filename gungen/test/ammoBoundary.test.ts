import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { init, parse } from 'es-module-lexer';
import { describe, expect, it } from 'vitest';

// Ammunition calculations stay independent of firearm assembly and viewer modules.

const SRC = resolve(import.meta.dirname, '..', 'src');

const typeScriptFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return typeScriptFiles(path);
    }
    return entry.name.endsWith('.ts') ? [path] : [];
  });

type Import = ReturnType<typeof parse>[0][number];

/** What is wrong with one import, if anything: a relative path into a forbidden folder, or one that can't be read. */
const importProblem = (file: string, imported: Import, forbidden: readonly string[]): string | undefined => {
  if (imported.type === 'import-meta') {
    return undefined;
  }
  if (imported.specifier === undefined) {
    return `${file}: import that cannot be resolved statically`;
  }
  if (!imported.specifier.startsWith('.')) {
    return undefined;
  }
  const target = resolve(dirname(file), imported.specifier);
  return forbidden.some((name) => target.startsWith(join(SRC, name) + sep))
    ? `${file}: imports ${imported.specifier}`
    : undefined;
};

/** Describes each import in `directory` that lands in one of `forbidden` (names of src/ subfolders). */
const forbiddenImports = async (directory: string, forbidden: readonly string[]): Promise<string[]> => {
  await init();
  return typeScriptFiles(directory).flatMap((file) => {
    const [imports] = parse(readFileSync(file, 'utf8'), file);
    return imports.flatMap((imported) => importProblem(file, imported, forbidden) ?? []);
  });
};

describe('ammo module boundaries', () => {
  it('ammo does not import gun or viewer', async () => {
    expect(await forbiddenImports(join(SRC, 'ammo'), ['gun', 'viewer'])).toEqual([]);
  });
});
