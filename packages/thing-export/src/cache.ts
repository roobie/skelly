import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/** A model's cached export: its formatted model entry text and its GLB. */
export interface CachedExport {
  readonly entryText: string;
  readonly glb: Uint8Array;
}
export interface ExportCache {
  readonly get: (id: string, key: string) => CachedExport | undefined;
  readonly put: (id: string, key: string, value: CachedExport) => void;
}

const SOURCE_FILE = /\.(ts|mjs|js)$/;
const TEST_FILE = /\.test\.(ts|mjs|js)$/;
const sourceFiles = (dir: string): string[] =>
  statSync(dir).isFile()
    ? [dir]
    : readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          return sourceFiles(path);
        }
        return SOURCE_FILE.test(entry.name) && !TEST_FILE.test(entry.name) ? [path] : [];
      });

/** Hashes the generator code (directories and files), so any change to it misses every entry. */
export const codeFingerprint = (root: string, dirs: readonly string[]): string => {
  const hash = createHash('sha256');
  for (const file of dirs.flatMap((dir) => sourceFiles(join(root, dir))).sort()) {
    hash.update(relative(root, file)).update('\0').update(readFileSync(file)).update('\0');
  }
  return hash.digest('hex');
};

/** Deterministic JSON for hashing: object keys sorted at every depth. */
const byKey = ([a]: [string, unknown], [b]: [string, unknown]): number => (a < b ? -1 : Number(a > b));
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, inner: unknown) =>
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(byKey))
      : inner,
  );
export const cacheKey = (code: string, inputs: unknown): string =>
  createHash('sha256').update(code).update('\0').update(canonical(inputs)).digest('hex');

/** One entry per model id, so a changed model replaces its entry and the cache never grows past the catalogue. */
export const exportCache = (dir: string): ExportCache => {
  mkdirSync(dir, { recursive: true });
  const path = (id: string, ext: string) => join(dir, `${id}.${ext}`);
  return {
    get: (id, key) => {
      const keyFile = path(id, 'key');
      return existsSync(keyFile) && readFileSync(keyFile, 'utf8') === key
        ? { entryText: readFileSync(path(id, 'model.json'), 'utf8'), glb: readFileSync(path(id, 'glb')) }
        : undefined;
    },
    put: (id, key, { entryText, glb }) => {
      writeFileSync(path(id, 'model.json'), entryText);
      writeFileSync(path(id, 'glb'), glb);
      // The key lands last, so an interrupted write leaves a miss rather than a mismatched hit.
      writeFileSync(path(id, 'key.tmp'), key);
      renameSync(path(id, 'key.tmp'), path(id, 'key'));
    },
  };
};
