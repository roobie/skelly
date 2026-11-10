import { readdirSync, readFileSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// The projects are independent on purpose (root README): deadvox copies, it never imports from
// gungen, mobgen or site.
const ROOTS = ['src', 'test', 'tools'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist']);
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const SIBLING = /(^|[\\/])(gungen|mobgen|site)([\\/]|$)/;
// Shared root tooling any package may import, as repository paths: the Jsonnet compiler's entry, and
// the Lit check's whole install, which lives at the root so every package's UI can use it.
const SHARED_ROOT_TOOLS = ['tools/jsonnet/index.mjs', 'tools/lit-check/'];
const REPOSITORY_ROOT = join('..', '..');
// Static `from '…'`, side-effect `import '…'`, dynamic `import('…')` and `require('…')`.
const SPECIFIER = /\b(?:from\s*|import\s*\(?\s*|require\s*\(\s*)(['"`])([^'"`\n]+)\1/g;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : sourceFiles(path);
    }
    return SOURCE_FILE.test(entry.name) ? [path] : [];
  });

const escapesProject = (file: string, specifier: string): boolean => {
  if (SIBLING.test(specifier)) {
    return true;
  }
  if (!specifier.startsWith('.')) {
    return false;
  }
  const target = normalize(join(file, '..', specifier));
  const fromProject = relative('.', target);
  // Shared mods hold content this project loads, not sibling source.
  if (fromProject.startsWith(`..${sep}mods${sep}`) && fromProject.endsWith('.json')) {
    return false;
  }
  return fromProject === '..' || fromProject.startsWith(`..${sep}`);
};

/** Whether a relative specifier names shared root tooling (`SHARED_ROOT_TOOLS`). */
const sharedRootTool = (file: string, specifier: string): boolean => {
  if (!specifier.startsWith('.')) {
    return false;
  }
  const fromRepository = relative(REPOSITORY_ROOT, normalize(join(file, '..', specifier)))
    .split(sep)
    .join('/');
  return SHARED_ROOT_TOOLS.some((tool) =>
    tool.endsWith('/') ? fromRepository.startsWith(tool) : fromRepository === tool,
  );
};

describe('deadvox stays independent of its sibling projects', () => {
  const files = ROOTS.flatMap(sourceFiles);

  it('scans the project source roots', () => {
    expect(files).toContain('src/game/config.ts');
    expect(files).toContain('test/importBoundary.test.ts');
  });

  it('imports no sibling source, allowing only shared root tooling (the Jsonnet compiler and the Lit check)', () => {
    const offenders = files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(SPECIFIER)]
        .map((match) => match[2] ?? '')
        .filter((specifier) => escapesProject(file, specifier) && !sharedRootTool(file, specifier))
        .map((specifier) => `${file}: ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });

  it('recognises escaping specifiers', () => {
    expect(escapesProject('src/a.ts', '../../gungen/x.ts')).toBe(true);
    expect(escapesProject('src/a.ts', '../../README.md')).toBe(true);
    expect(escapesProject('src/game/a.ts', '../../../mobgen/x')).toBe(true);
    expect(escapesProject('src/a.ts', 'site/x')).toBe(true);
    expect(escapesProject('src/game/a.ts', '../core/x.ts')).toBe(false);
    expect(escapesProject('test/a.ts', '../src/core/x.ts')).toBe(false);
    expect(escapesProject('test/a.ts', '../../testTemp.ts')).toBe(true);
    expect(escapesProject('src/a.ts', 'three')).toBe(false);
    expect(escapesProject('test/fixtures/a.ts', '../../../mods/fixture.mod/rows.json')).toBe(false);
    expect(escapesProject('test/fixtures/a.ts', '../../../mods/fixture.mod/source.ts')).toBe(true);
  });

  it('recognises shared root tooling and nothing else under the root tools', () => {
    expect(sharedRootTool('test/a.ts', '../../../tools/jsonnet/index.mjs')).toBe(true);
    expect(sharedRootTool('test/fixtures/a.ts', '../../../../tools/lit-check/inputGuard.ts')).toBe(true);
    expect(sharedRootTool('test/a.ts', '../../../tools/jsonnet/compile.mjs')).toBe(false);
    expect(sharedRootTool('test/a.ts', '../../../tools/lit-checker/x.ts')).toBe(false);
    expect(sharedRootTool('test/a.ts', '../../../tools/zero-drift-check.mjs')).toBe(false);
  });
});
