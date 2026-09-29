import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { buildRevisionFromGit } from './src/core/buildRevision.ts';
import { canonicalJson } from './src/core/canonicalJson.ts';

const contentDirectory = fileURLToPath(new URL('./src/content/base/', import.meta.url));
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
    canonicalJson(
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
  buildRevision = buildRevisionFromGit((args) =>
    execFileSync('git', [...args], {
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      encoding: 'utf8',
    }),
  );
} catch {
  buildRevision = 'development';
}

// Vite snapshots build identity at config load; restart the dev server after editing base-pack content.
const buildRevisionDefine = '__DEADVOX_BUILD_REVISION__';
const baseContentHashDefine = '__DEADVOX_BASE_CONTENT_HASH__';

// mobgen's pure core/mob modules (no three, no DOM — see src/render/mobActors.ts's own header comment)
// live in the sibling project, reused here rather than duplicated. three.js itself always comes from
// *this* project's own node_modules — mobgen/src/viewer (which imports three from mobgen's node_modules)
// must never be reachable through this alias; see test/mobgenBoundary.test.ts.
const mobgenSrc = fileURLToPath(new URL('../mobgen/src/', import.meta.url));

export default defineConfig({
  define: {
    [buildRevisionDefine]: JSON.stringify(buildRevision),
    [baseContentHashDefine]: JSON.stringify(baseContentHash),
  },
  base: './', // served from /skelly/deadvox/ on GitHub Pages
  resolve: {
    alias: {
      '@mobgen/': mobgenSrc,
    },
  },
  server: {
    fs: {
      // The alias resolves outside this project's own root; Vite's dev server otherwise refuses to serve
      // files from outside it.
      allow: [fileURLToPath(new URL('.', import.meta.url)), mobgenSrc],
    },
  },
  build: {
    chunkSizeWarningLimit: 1000, // three.js
    rollupOptions: { input: ['index.html', 'sounds.html'] },
  },
  worker: { format: 'es' },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
