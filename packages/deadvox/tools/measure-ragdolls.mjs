import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const { chromium, firefox } = await import('playwright');

import { build, createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(root, '../..');
const engine = process.argv[2] ?? 'node';
const selected = process.argv[3] ?? 'standard';
if (
  !(['node', 'chromium', 'firefox', 'bundles'].includes(engine) && ['standard', 'deterministic'].includes(selected))
) {
  throw new Error(
    'Usage: node tools/measure-ragdolls.mjs node|chromium|firefox|bundles [standard|deterministic] [baseline-ref]',
  );
}
const packageName = selected === 'standard' ? '@dimforge/rapier3d-compat' : '@dimforge/rapier3d-deterministic-compat';
const seam = (name) => ({
  name: 'measurement-rapier-package',
  enforce: 'pre',
  transform(_code, id) {
    if (id.endsWith('/src/render/ragdollRapier.ts')) {
      return `export { default } from '${name}';`;
    }
  },
});
async function report(result) {
  const json = JSON.stringify(result);
  // biome-ignore lint/style/noProcessEnv: optional CLI output destination, not game configuration.
  const { RAGDOLL_RESULT_FILE: resultFile } = process.env;
  if (resultFile) {
    await writeFile(resultFile, `${json}\n`);
  }
  console.log(json);
}
const temporary = await mkdtemp(resolve(tmpdir(), 'ragdoll-measurement-'));
try {
  if (engine === 'bundles') {
    const [, , , , baselineRef] = process.argv;
    if (!baselineRef) {
      throw new Error('Bundle comparison needs a baseline git ref as fourth argument');
    }
    const changed = execFileSync(
      'git',
      [
        '-C',
        repository,
        'diff',
        '--name-only',
        '--diff-filter=MD',
        baselineRef,
        '--',
        'packages/deadvox/src',
        'packages/mobgen/src',
      ],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n')
      .filter(Boolean);
    const baselineSources = new Map(
      changed.map((path) => [
        resolve(repository, path),
        execFileSync('git', ['-C', repository, 'show', `${baselineRef}:${path}`], { encoding: 'utf8' }),
      ]),
    );
    const outputs = {};
    for (const variant of ['baseline', 'standard', 'deterministic']) {
      const result = await build({
        root,
        configFile: resolve(root, 'vite.config.ts'),
        logLevel: 'error',
        plugins: [
          seam(variant === 'standard' ? '@dimforge/rapier3d-compat' : '@dimforge/rapier3d-deterministic-compat'),
          {
            name: 'measurement-baseline',
            enforce: 'pre',
            resolveId(source, importer) {
              if (variant === 'baseline' && importer && source.startsWith('.')) {
                const path = resolve(dirname(importer), source);
                if (baselineSources.has(path)) {
                  return path;
                }
              }
            },
            load(id) {
              if (variant === 'baseline') {
                return baselineSources.get(id);
              }
            },
            transform(_code, id) {
              if (variant === 'baseline') {
                return baselineSources.get(id);
              }
            },
          },
        ],
        build: { write: true },
      });
      const files = (Array.isArray(result) ? result : [result])
        .flatMap((output) => output.output)
        .filter((file) => file.type === 'chunk');
      outputs[variant] = {
        jsBytes: files.reduce((sum, file) => sum + Buffer.byteLength(file.code), 0),
        gzipBytes: files.reduce((sum, file) => sum + gzipSync(file.code).length, 0),
      };
    }
    await report({ baselineRef, bundles: outputs });
  } else {
    const result = await build({
      root,
      configFile: false,
      logLevel: 'error',
      plugins: [seam(packageName)],
      resolve: { alias: { '@mobgen': resolve(root, '../mobgen/src') } },
      build: {
        write: false,
        minify: false,
        lib: { entry: resolve(root, 'tools/ragdoll-measurement.ts'), formats: ['es'], fileName: 'measurement' },
      },
    });
    const { code } = (Array.isArray(result) ? result : [result])
      .flatMap((output) => output.output)
      .find((file) => file.type === 'chunk');
    const modulePath = resolve(temporary, 'measurement.mjs');
    await writeFile(modulePath, code);
    let measurement;
    if (engine === 'node') {
      measurement = await (await import(pathToFileURL(modulePath))).measureRagdolls();
    } else {
      await writeFile(resolve(temporary, 'index.html'), '<!doctype html><title>Ragdoll measurement</title>');
      const server = await createServer({
        root: temporary,
        configFile: false,
        logLevel: 'error',
        server: { host: '127.0.0.1', port: 0 },
      });
      let browser;
      try {
        await server.listen();
        browser = await (engine === 'chromium' ? chromium : firefox).launch({ headless: true });
        const page = await browser.newPage();
        await page.goto(server.resolvedUrls.local[0]);
        measurement = await page.evaluate(
          async (moduleUrl) => (await import(moduleUrl)).measureRagdolls(),
          '/measurement.mjs',
        );
      } finally {
        await browser?.close();
        await server.close();
      }
    }
    await report({ engine, package: packageName, version: '0.20.0', ...measurement });
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
