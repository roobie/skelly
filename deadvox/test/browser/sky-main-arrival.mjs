import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { createServer } from 'vite';

const BRANCH_REF_PREFIX = /^refs\/heads\//;

export const mainSourceOverlays = [
  'main.ts',
  'bench/run.ts',
  'game/bundledContent.ts',
  'game/config.ts',
  'game/engine.ts',
  'game/play.ts',
  'game/worldLoading.ts',
  'ui/worldLoading.ts',
  'render/skylight.ts',
  'render/mood.ts',
  'game/streamer.ts',
  'worker/mesh.worker.ts',
  'worker/protocol.ts',
];

export function mainOverlayPath(root, id) {
  const [path] = id.split('?');
  const prefix = `${resolve(root)}/src/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}

export async function measureMainFirstMesh(browser, { root, artifacts, fixtureTransform, viewport, eventPath }) {
  const event = eventPath ? JSON.parse(await readFile(eventPath, 'utf8')) : null;
  const ref = event?.pull_request?.base?.sha ?? event?.ref?.replace(BRANCH_REF_PREFIX, '') ?? 'origin/main';
  if (eventPath && ref === 'origin/main') {
    throw new Error('GitHub event has neither a pull-request base nor a branch ref');
  }
  const repository = resolve(root, '..');
  const git = (args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8' }).trim();
  let base;
  if (eventPath) {
    git(['fetch', '--no-tags', '--depth=1', 'origin', ref]);
    base = git(['rev-parse', 'FETCH_HEAD']);
  } else {
    base = git(['rev-parse', ref]);
  }
  const basePaths = new Set(git(['ls-tree', '-r', '--name-only', base, '--', 'deadvox/src']).split('\n'));
  const branchPaths = new Set(git(['ls-tree', '-r', '--name-only', 'HEAD', '--', 'deadvox/src']).split('\n'));
  for (const path of mainSourceOverlays) {
    if (!basePaths.has(`deadvox/src/${path}`)) {
      throw new Error(`Main source overlay missing at ${base}: deadvox/src/${path}; update mainSourceOverlays`);
    }
  }
  const overlays = new Map(mainSourceOverlays.map((path) => [path, git(['show', `${base}:deadvox/src/${path}`])]));
  // A main startup source may import a file the branch deleted; serve that file from the base
  // too, so the overlay never fails to resolve a module main still owns.
  const baseOnlyOverlay = (relative) =>
    relative !== null && basePaths.has(`deadvox/src/${relative}`) && !branchPaths.has(`deadvox/src/${relative}`);
  const mainHtml = git(['show', `${base}:deadvox/index.html`]);
  const appliedSources = new Set();
  const server = await createServer({
    root,
    configFile: resolve(root, 'vite.config.ts'),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [
      {
        name: 'main-first-mesh-source-overlay',
        enforce: 'pre',
        resolveId(id, importer) {
          if (!(importer && id.startsWith('.'))) {
            return null;
          }
          const path = resolve(dirname(importer.split('?')[0]), id);
          const relative = mainOverlayPath(root, path);
          return overlays.has(relative) || baseOnlyOverlay(relative) ? path : null;
        },
        load(id) {
          const relative = mainOverlayPath(root, id);
          if (overlays.has(relative)) {
            return overlays.get(relative);
          }
          return baseOnlyOverlay(relative) ? git(['show', `${base}:deadvox/src/${relative}`]) : null;
        },
        transformIndexHtml: {
          order: 'pre',
          handler() {
            appliedSources.add('index.html');
            return mainHtml;
          },
        },
        transform(code, id) {
          const relative = mainOverlayPath(root, id);
          let source = overlays.get(relative) ?? code;
          if (overlays.has(relative)) {
            appliedSources.add(relative);
          }
          if (relative === 'core/authoredSite.ts' || relative === 'content/base/templates-stairs.json') {
            source = fixtureTransform(source, id) ?? source;
          }
          if (relative === 'game/engine.ts') {
            source = source.replace(
              '  return {\n    ...worldSetup,',
              '  globalThis.mainArrival.engineReadyRealMs=performance.now();\n  return {\n    ...worldSetup,',
            );
          }
          if (relative === 'game/streamer.ts') {
            source = source.replace(
              '    this.opts.meshes.set(msg.key, [cx * CHUNK, cy * CHUNK, cz * CHUNK], msg.mesh);',
              `    this.opts.meshes.set(msg.key, [cx * CHUNK, cy * CHUNK, cz * CHUNK], msg.mesh);
if(msg.mesh.indices.length>0 && globalThis.mainArrival.firstMeshRealMs===null) {
  globalThis.mainArrival.firstMeshRealMs=performance.now();
  globalThis.mainArrival.key=msg.key;
  globalThis.mainArrival.workerComputeRealMs=msg.ms;
}`,
            );
          }
          return source;
        },
      },
    ],
  });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack ?? String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  try {
    await page.addInitScript(() => {
      globalThis.mainArrival = { firstMeshRealMs: null };
    });
    await server.listen();
    const address = server.httpServer.address();
    await page.goto(`http://127.0.0.1:${address.port}/?site=stair_demo&seed=1&radius=32&debug=1&time=12:00`);
    await page.waitForFunction(
      () => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false',
      undefined,
      { timeout: 60_000 },
    );
    await page.locator('#go').click();
    for (const source of ['index.html', 'game/engine.ts', 'game/play.ts', 'game/streamer.ts', 'render/skylight.ts']) {
      if (!appliedSources.has(source)) {
        throw new Error(`Main overlay was not applied: ${source}`);
      }
    }
    await page.waitForFunction(() => globalThis.mainArrival.firstMeshRealMs !== null, {}, { timeout: 60_000 });
    if (errors.length > 0) {
      throw new Error(`Main source overlay browser errors: ${errors.join('\n')}`);
    }
    const evidence = await page.evaluate(() => ({
      ...globalThis.mainArrival,
      timeOriginRealMs: performance.timeOrigin,
      engineToFirstMeshRealMs: globalThis.mainArrival.firstMeshRealMs - globalThis.mainArrival.engineReadyRealMs,
    }));
    Object.assign(evidence, {
      base,
      sourceOverlays: mainSourceOverlays,
      appliedSources: [...appliedSources],
      errors,
      browser: browser.version(),
      viewport: page.viewportSize(),
      attribution:
        'Main lighting and worker sources with branch core contracts, the same fixture/content and browser; startup mesh delivery, not first rendered pixels or a pristine whole-build screenshot.',
    });
    await writeFile(resolve(artifacts, 'main-first-mesh.json'), JSON.stringify(evidence, null, 2));
    process.stdout.write(`MAIN_FIRST_MESH_EVIDENCE ${JSON.stringify(evidence)}\n`);
    return evidence;
  } catch (error) {
    const state = await page
      .evaluate(() => ({
        arrival: globalThis.mainArrival,
        goDisabled: document.querySelector('#go')?.getAttribute('aria-disabled'),
        errorReport: document.querySelector('[data-error-text]')?.textContent,
      }))
      .catch(() => null);
    const failure = { error: String(error), base, appliedSources: [...appliedSources], errors, state };
    await writeFile(resolve(artifacts, 'main-first-mesh-failure.json'), JSON.stringify(failure, null, 2));
    process.stdout.write(`MAIN_FIRST_MESH_FAILURE ${JSON.stringify(failure)}\n`);
    throw error;
  } finally {
    await page.close();
    await server.close();
  }
}
