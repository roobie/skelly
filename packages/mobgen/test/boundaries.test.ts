import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const REPO = resolve(ROOT, '../..');
const IMPORT_SPECIFIER = /\bfrom\s+'([^']+)'|\bimport\s+'([^']+)'|\bimport\(\s*'([^']+)'\s*\)/g;
const DOMAIN_DIR = /(^|\/)\.\.\/(mob|viewer|cli)(\/|$)/;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      return walk(p);
    }
    return p.endsWith('.ts') ? [p] : [];
  });

const specifiers = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(IMPORT_SPECIFIER)].map((m) => (m[1] ?? m[2] ?? m[3])!);

const srcFiles = walk(join(ROOT, 'src'));
const files = [...srcFiles, ...walk(join(ROOT, 'test'))];
const coreFiles = srcFiles.filter((f) => relative(ROOT, f).startsWith('src/core/'));

describe('import boundaries', () => {
  it('finds the files it is meant to police', () => {
    expect(coreFiles.length).toBeGreaterThan(5);
    expect(files.length).toBeGreaterThan(coreFiles.length);
  });

  it('keeps mobgen standalone except the viewer and its tests sharing the game ragdoll owner', () => {
    for (const file of files) {
      for (const spec of specifiers(file)) {
        if (spec.startsWith('.')) {
          const target = resolve(file, '..', spec);
          const path = relative(ROOT, file);
          const sharedRagdoll =
            target === resolve(ROOT, '../deadvox/src/render/ragdoll.ts') &&
            (path.startsWith('src/viewer/') || path.startsWith('test/'));
          expect(relative(ROOT, target).startsWith('..') && !sharedRagdoll, `${relative(REPO, file)} -> ${spec}`).toBe(
            false,
          );
        }
        expect(spec.startsWith('/'), `${relative(REPO, file)} -> ${spec}`).toBe(false);
      }
    }
  });

  it('src/core is browser-pure and domain-agnostic (no three, node:, mob, viewer, cli)', () => {
    for (const file of coreFiles) {
      for (const spec of specifiers(file)) {
        const at = `${relative(ROOT, file)} -> ${spec}`;
        expect(spec === 'three' || spec.startsWith('three/'), at).toBe(false);
        expect(spec.startsWith('node:'), at).toBe(false);
        expect(DOMAIN_DIR.test(spec), at).toBe(false);
      }
    }
  });
});
