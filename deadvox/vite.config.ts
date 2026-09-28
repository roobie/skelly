import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const contentDirectory = fileURLToPath(new URL('./src/content/base/', import.meta.url));
const canonical = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => {
      if (left < right) {
        return -1;
      }
      if (left > right) {
        return 1;
      }
      return 0;
    })
    .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
    .join(',')}}`;
};
const filesUnder = (directory: string, prefix: string): { name: string; path: string }[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${prefix}${entry.name}`;
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return filesUnder(path, `${relative}/`);
    }
    if (entry.isFile()) {
      return [{ name: relative, path }];
    }
    return [];
  });
const contentFiles = filesUnder(contentDirectory, 'base/').sort((left, right) => {
  if (left.name < right.name) {
    return -1;
  }
  if (left.name > right.name) {
    return 1;
  }
  return 0;
});
const baseContentHash = createHash('sha256')
  .update(
    canonical(
      contentFiles.map(({ name, path }) => {
        const bytes = readFileSync(path);
        const content = name.endsWith('.json')
          ? { format: 'json', value: JSON.parse(bytes.toString('utf8')) as unknown }
          : { format: 'bytes-sha256', value: createHash('sha256').update(bytes).digest('hex') };
        return [name, content];
      }),
    ),
  )
  .digest('hex');
let buildRevision: string;
try {
  buildRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    encoding: 'utf8',
  }).trim();
} catch {
  buildRevision = 'development';
}

const buildRevisionDefine = '__DEADVOX_BUILD_REVISION__';
const baseContentHashDefine = '__DEADVOX_BASE_CONTENT_HASH__';

export default defineConfig({
  define: {
    [buildRevisionDefine]: JSON.stringify(buildRevision),
    [baseContentHashDefine]: JSON.stringify(baseContentHash),
  },
  base: './', // served from /skelly/deadvox/ on GitHub Pages
  build: {
    chunkSizeWarningLimit: 1000, // three.js
    rollupOptions: { input: ['index.html', 'sounds.html'] },
  },
  worker: { format: 'es' },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
