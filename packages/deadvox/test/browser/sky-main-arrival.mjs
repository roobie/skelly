import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { createServer } from 'vite';

const BRANCH_REF_PREFIX = /^refs\/heads\//;

// The reference run measures the base's startup, so each base startup file must link against the base
// modules it imports; a branch that removes an export the base imports would otherwise break the reference.
export const mainSourceOverlays = [
  'main.ts',
  'game/melee.ts',
  'bench/run.ts',
  'game/bundledContent.ts',
  'game/config.ts',
  'game/worldSetup.ts',
  'game/engine.ts',
  'game/graphicsControls.ts',
  'game/play.ts',
  'render/playView.ts',
  // Keep the view and figure together: their constructor and per-frame pose contracts change together.
  'render/playerFigure.ts',
  'render/acidEffects.ts',
  'game/worldLoading.ts',
  'ui/worldLoading.ts',
  'ui/credits.ts',
  'ui/fullscreenOptions.ts',
  'ui/inputOptions.ts',
  'ui/menuState.ts',
  'ui/modsPanel.ts',
  'ui/saveController.ts',
  'render/skylight.ts',
  'render/mood.ts',
  'game/streamer.ts',
  'worker/mesh.worker.ts',
  'worker/protocol.ts',
];

// A base view that still reads the look from core/mood.ts constants meets a branch whose content owns them
// (core/lookDefaults.ts). The branch's core stays, so the base view takes the content look; a base that
// already reads it from content needs no rewrite. Remove this once the base view reads the look from content.
function contentLookView(source) {
  if (!source.includes('DEFAULT_LOOK')) {
    return source;
  }
  const rewritten = source
    .replace(
      "import { DEFAULT_LOOK, DEFAULT_MOOD, DEFAULT_SHADOWS } from '../core/mood.ts';",
      "import { lookDefaultsOf } from '../core/lookDefaults.ts';\nimport { DEFAULT_SHADOWS, lookOf, moodOf } from '../core/mood.ts';",
    )
    .replace(
      'applyLook(renderer, meshes, DEFAULT_LOOK);\n    mood.restore(DEFAULT_MOOD);',
      'applyLook(renderer, meshes, lookOf(lookDefaultsOf(registry)));\n    mood.restore(moodOf(lookDefaultsOf(registry)));',
    );
  if (rewritten.includes('DEFAULT_LOOK')) {
    throw new Error('Main view still reads DEFAULT_LOOK; update contentLookView in sky-main-arrival.mjs');
  }
  return rewritten;
}

// Keep the branch's physical-and-visual reach contract without replacing its core picker with main's.
export function adaptMainInteractionPick(source) {
  return source.replace(
    'worldSeed: config.seed,\n      isSolid: engine.isOpaque,',
    'worldSeed: config.seed,\n      isSolid: engine.isSolid,\n      isOpaque: engine.isOpaque,',
  );
}

const VALUE_DECLARATION =
  /^export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function\*?|(?:abstract\s+)?class|enum)\s+([\w$]+)/gm;
const EXPORT_LIST = /^export\s*\{([^}]*)\}/gm;
const ALIAS = /\s+as\s+/;
const SCRIPT_MODULE = /\.(?:ts|js|mjs)$/;

/** Runtime names a module exports; type-only exports are erased, so a main importer never links them. */
export function valueExports(source) {
  const names = new Set([...source.matchAll(VALUE_DECLARATION)].map(([, name]) => name));
  for (const [, list] of source.matchAll(EXPORT_LIST)) {
    for (const item of list.split(',').map((entry) => entry.trim())) {
      if (item && !item.startsWith('type ')) {
        names.add(item.split(ALIAS).at(-1));
      }
    }
  }
  return names;
}

/** Runtime exports of the base module that the branch module no longer provides. */
export const removedExports = (baseSource, branchSource) => {
  const branch = valueExports(branchSource);
  return [...valueExports(baseSource)].filter((name) => !branch.has(name));
};

const EXPORT_SHIM = '\0main-export-shim:';
const BASE_COPY = '?main-base';

export function mainOverlayPath(root, id) {
  const [path] = id.split('?');
  const prefix = `${resolve(root)}/src/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : null;
}

/** Repository directory where `revision`'s root workspace list places the package named `name`. */
export function workspaceDirectory(git, revision, name) {
  const show = (path) => JSON.parse(git(['show', `${revision}:${path}`]));
  const manifests = show('package.json').workspaces.map((workspace) => `${workspace}/package.json`);
  const present = new Set(git(['ls-tree', '--name-only', revision, '--', ...manifests]).split('\n'));
  const manifest = manifests.find((path) => present.has(path) && show(path).name === name);
  if (manifest === undefined) {
    throw new Error(`No workspace package named ${name} at ${revision}`);
  }
  return manifest.slice(0, -'/package.json'.length);
}

const treeSources = (git, revision, source) =>
  new Set(
    git(['ls-tree', '-r', '--name-only', revision, '--', source])
      .split('\n')
      .map((path) => path.slice(source.length + 1)),
  );

export function mainArrivalGit(root) {
  // Hooks bind Git to their caller; the reference checkout must remain the command owner.
  // biome-ignore lint/style/noProcessEnv: preserve caller settings except Git's repository-local bindings.
  const env = { ...process.env };
  const localVariables = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
    .trim()
    .split('\n');
  for (const name of localVariables) {
    delete env[name];
  }
  const repository = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', env }).trim();
  return (args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8', env }).trim();
}

export async function measureMainFirstMesh(browser, { root, artifacts, fixtureTransform, viewport, eventPath }) {
  const event = eventPath ? JSON.parse(await readFile(eventPath, 'utf8')) : null;
  const ref = event?.pull_request?.base?.sha ?? event?.ref?.replace(BRANCH_REF_PREFIX, '') ?? 'origin/main';
  if (eventPath && ref === 'origin/main') {
    throw new Error('GitHub event has neither a pull-request base nor a branch ref');
  }
  const git = mainArrivalGit(root);
  let base;
  if (eventPath) {
    git(['fetch', '--no-tags', '--depth=1', 'origin', ref]);
    base = git(['rev-parse', 'FETCH_HEAD']);
  } else {
    base = git(['rev-parse', ref]);
  }
  // The base may place the package elsewhere, so each tree is read where its own revision puts it.
  const { name } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const basePackage = workspaceDirectory(git, base, name);
  const baseSource = `${basePackage}/src`;
  const basePaths = treeSources(git, base, baseSource);
  const branchPaths = treeSources(git, 'HEAD', `${workspaceDirectory(git, 'HEAD', name)}/src`);
  const showBase = (relative) => git(['show', `${base}:${baseSource}/${relative}`]);
  for (const path of mainSourceOverlays) {
    if (!basePaths.has(path)) {
      throw new Error(`Main source overlay missing at ${base}: ${baseSource}/${path}; update mainSourceOverlays`);
    }
  }
  const overlays = new Map(mainSourceOverlays.map((path) => [path, showBase(path)]));
  // A main startup source may import a file the branch deleted; serve that file from the base
  // too, so the overlay never fails to resolve a module main still owns.
  const baseOnlyOverlay = (relative) => relative !== null && basePaths.has(relative) && !branchPaths.has(relative);
  // A main source may import an export the branch removed from a module both keep. That module stays the
  // branch's core owner: a shim re-exports it and adds only the removed names, from main's copy of the module.
  const exportShims = new Map();
  const removedFor = async (relative) => {
    if (!exportShims.has(relative)) {
      const both = SCRIPT_MODULE.test(relative) && basePaths.has(relative) && branchPaths.has(relative);
      exportShims.set(
        relative,
        both ? removedExports(showBase(relative), await readFile(resolve(root, 'src', relative), 'utf8')) : [],
      );
    }
    return exportShims.get(relative);
  };
  const shimmedExports = () =>
    Object.fromEntries([...exportShims].filter(([, names]) => names.length > 0).map(([path, names]) => [path, names]));
  const mainImporter = (importer) => {
    const relative = mainOverlayPath(root, importer);
    return importer.includes(BASE_COPY) || overlays.has(relative) || baseOnlyOverlay(relative);
  };
  const mainHtml = git(['show', `${base}:${basePackage}/index.html`]);
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
        async resolveId(id, importer) {
          if (!(importer && id.startsWith('.'))) {
            return null;
          }
          const path = resolve(dirname(importer.split('?')[0]), id);
          const relative = mainOverlayPath(root, path);
          if (overlays.has(relative) || baseOnlyOverlay(relative)) {
            return path;
          }
          if (relative !== null && mainImporter(importer) && (await removedFor(relative)).length > 0) {
            return `${EXPORT_SHIM}${path}`;
          }
          return null;
        },
        load(id) {
          if (id.startsWith(EXPORT_SHIM)) {
            const path = id.slice(EXPORT_SHIM.length);
            const names = exportShims.get(mainOverlayPath(root, path));
            return `export * from ${JSON.stringify(path)};\nexport { ${names.join(', ')} } from ${JSON.stringify(`${path}${BASE_COPY}`)};\n`;
          }
          const relative = mainOverlayPath(root, id);
          if (id.endsWith(BASE_COPY)) {
            return showBase(relative);
          }
          if (overlays.has(relative)) {
            return overlays.get(relative);
          }
          return baseOnlyOverlay(relative) ? showBase(relative) : null;
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
          if (relative === 'render/playView.ts') {
            source = contentLookView(source);
          }
          if (relative === 'game/engine.ts') {
            source = source.replace(
              '  return {\n    ...worldSetup,',
              '  globalThis.mainArrival.engineReadyRealMs=performance.now();\n  return {\n    ...worldSetup,',
            );
          }
          if (relative === 'game/play.ts') {
            source = adaptMainInteractionPick(source);
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
    for (const source of [
      'index.html',
      'game/engine.ts',
      'game/play.ts',
      'render/playView.ts',
      'game/streamer.ts',
      'render/skylight.ts',
    ]) {
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
      shimmedExports: shimmedExports(),
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
    const failure = {
      error: String(error),
      base,
      appliedSources: [...appliedSources],
      shimmedExports: shimmedExports(),
      errors,
      state,
    };
    await writeFile(resolve(artifacts, 'main-first-mesh-failure.json'), JSON.stringify(failure, null, 2));
    process.stdout.write(`MAIN_FIRST_MESH_FAILURE ${JSON.stringify(failure)}\n`);
    throw error;
  } finally {
    await page.close();
    await server.close();
  }
}
