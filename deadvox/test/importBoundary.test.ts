import { readdirSync, readFileSync } from 'node:fs';
import { join, normalize, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// The projects are independent on purpose (root README): deadvox copies, it never imports from
// gungen, mobgen or site, and nothing reaches above its own directory.
const ROOTS = ['src', 'test', 'tools'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist']);
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?)$/;
const SIBLING = /(^|[\\/])(gungen|mobgen|site)([\\/]|$)/;

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
  return fromProject === '..' || fromProject.startsWith(`..${sep}`);
};

describe('deadvox stays independent of its sibling projects', () => {
  const files = ROOTS.flatMap(sourceFiles);

  it('scans a real set of files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('imports nothing from gungen, mobgen, site or above deadvox/', () => {
    const offenders = files.flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(SPECIFIER)]
        .map((match) => match[2] ?? '')
        .filter((specifier) => escapesProject(file, specifier))
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
    expect(escapesProject('src/a.ts', 'three')).toBe(false);
  });
});
