import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, posix, relative as relativePath, resolve } from 'node:path';
import process from 'node:process';
import { gameUrl, inlineStartMod } from './gameUrl.mjs';
import { createStageServer } from './stageServer.mjs';

const BRANCH_REF_PREFIX = /^refs\/heads\//;
const stairsStart = {
  density: null,
  id: 'sky_main_arrival_stairs_start',
  kit: [
    { condition: 0.7, count: 1, destination: { kind: 'worn' }, id: 'jeans', item: 'jeans' },
    { condition: 0.8, count: 1, destination: { kind: 'worn' }, id: 'sneakers', item: 'sneakers' },
    { condition: 0.8, count: 1, destination: { kind: 'worn' }, id: 'hoodie', item: 'hoodie' },
    { destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 }, id: 'beans', item: 'canned_beans' },
    { destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 }, id: 'matches', item: 'matches' },
    { count: 2, destination: { kind: 'pocket', parent: 'jeans', pocket: 2 }, id: 'bandages', item: 'bandage' },
  ],
  recipes: [
    'torch',
    'candle',
    'repair_kit',
    'repair_crowbar',
    'sawn_plank',
    'door_bar',
    'make_rope',
    'grind_kitchen_knife',
    'hone_kitchen_knife',
    'grind_kabar',
    'hone_kabar',
    'grind_machete',
    'hone_machete',
  ],
  seed: 1,
  site: 'stair_demo',
  skills: {},
  startTimeGameTimeOfDay: '12:00',
  storeys: 1,
  wounds: [],
};

// Overlay keys are `<workspace package name>:<path under its src>`: a package name stays stable while a
// revision moves the package directory, and each revision's tree is read where that revision puts it.
// The reference run measures the base's startup, so each base startup file must link against the base modules it
// imports; a branch that removes an export the base imports would otherwise break the reference. The mesher
// protocol stays unlisted: its module is type-only, so nothing links it at runtime.
export const mainSourceOverlays = [
  'deadvox:main.ts',
  'deadvox:bench/run.ts',
  'deadvox:bench/post.ts',
  'deadvox:debug/index.ts',
  'engine:game/melee.ts',
  'engine:game/bundledContent.ts',
  'engine:game/browserMods.ts',
  'engine:game/config.ts',
  'engine:session.ts',
  'engine:game/worldSetup.ts',
  'engine:game/streamer.ts',
  // Removed object members and changed constructor arguments cannot be repaired by export shims.
  'engine:core/authoredSite.ts',
  'engine:core/citySite.ts',
  'engine:core/forest.ts',
  'engine:core/canonicalTerrain.ts',
  'engine:game/weatheringTestSite.ts',
  'presentation:presentation/engine.ts',
  'presentation:render/distanceFog.ts',
  'presentation:presentation/graphicsControls.ts',
  'presentation:presentation/play.ts',
  'presentation:presentation/controls.ts',
  'presentation:presentation/inputBindings.ts',
  'presentation:presentation/damageFeedback.ts',
  'presentation:presentation/painCue.ts',
  'presentation:presentation/worldLoading.ts',
  'presentation:render/playView.ts',
  // The engine adds the chunk meshes' scene object and play reads its drawn chunks, so the chunk owner stays with
  // them. The shadows keep the branch: they use only the caster selection both revisions share.
  'presentation:render/chunks.ts',
  // Keep the view and figure together: their constructor and per-frame pose contracts change together. The
  // view builds the held items, whose arms hang from the figure's shoulders and whose displays sit on its
  // palm, so hands and held display stay on the figure's revision too.
  'presentation:render/playerFigure.ts',
  'presentation:render/hands.ts',
  'presentation:render/heldPresentation.ts',
  'presentation:render/heldDisplay.ts',
  // The view constructs the flashlight, and the flashlight installs the near-field falloff; the three change together.
  'presentation:render/flashlight.ts',
  'presentation:render/lightFalloff.ts',
  'presentation:render/acidEffects.ts',
  'presentation:render/gore.ts',
  'presentation:render/mobActors.ts',
  // The renderer hands its ragdolls the figure body it draws, so the two change their spawn contract together.
  'presentation:render/ragdoll.ts',
  // The engine builds the sky's targets and the sky installs the fog that the height fog patches; the three change together.
  'presentation:render/heightFog.ts',
  'presentation:render/sky.ts',
  'presentation:render/skylight.ts',
  'presentation:render/mood.ts',
  // The view builds the sky environment and calls its members, so a member the branch drops breaks base play.
  'presentation:render/skyEnvironment.ts',
  'presentation:worker/mesh.worker.ts',
];

// UI callees can keep their exports while changing arguments; export shims cannot pair those contracts.
// Keep the whole presentation UI boundary with base play/main, including UI-to-UI calls; unrelated core stays branch.
// `basePaths` maps each workspace package name to its base tree of src-relative paths.
export const mainOverlaySources = (basePaths) => [
  ...mainSourceOverlays,
  ...[...(basePaths.get('presentation') ?? [])]
    .filter((path) => path.startsWith('ui/') && SCRIPT_MODULE.test(path))
    .map((path) => `presentation:${path}`),
];

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

const IMPORT_CLAUSE =
  /^import\s+(?!type\s)((?:[\w$]+|\*\s+as\s+[\w$]+)?\s*,?\s*(?:\{[^}]*\})?)\s*from\s+['"]([^'"]+)['"]/gm;
const NAMED_IMPORTS = /\{([^}]*)\}/;

/** Runtime names `source` imports by name, keyed by the specifier as written; type-only imports are erased. */
export function valueImports(source) {
  const imports = new Map();
  for (const [, clause, specifier] of source.matchAll(IMPORT_CLAUSE)) {
    const names = imports.get(specifier) ?? new Set();
    for (const item of (NAMED_IMPORTS.exec(clause)?.[1] ?? '').split(',').map((entry) => entry.trim())) {
      if (item && !item.startsWith('type ')) {
        names.add(item.split(ALIAS)[0]);
      }
    }
    imports.set(specifier, names);
  }
  return imports;
}

/**
 * Branch modules served beside the base overlays whose named runtime imports an overlaid module's base copy
 * lacks. The browser refuses to link them, so the overlay set must take the importer too. Both maps are keyed
 * by the module path under the package's `src`.
 */
export function overlayBoundaryGaps(baseSources, branchSources) {
  const gaps = [];
  for (const [importer, source] of branchSources) {
    if (baseSources.has(importer)) {
      continue;
    }
    for (const [specifier, names] of valueImports(source)) {
      const module = posix.join(posix.dirname(importer), specifier);
      const base = baseSources.get(module);
      if (base === undefined) {
        continue;
      }
      const exported = valueExports(base);
      const missing = [...names].filter((name) => !exported.has(name));
      if (missing.length > 0) {
        gaps.push({ importer, module, names: missing });
      }
    }
  }
  return gaps;
}

const EXPORT_SHIM = '\0main-export-shim:';
const BASE_COPY = '?main-base';
const overlayKeyParts = (key) => {
  const separator = key.indexOf(':');
  return [key.slice(0, separator), key.slice(separator + 1)];
};

/**
 * Overlay key of a served module id, `null` outside every workspace package's src. `packageSources` maps each
 * workspace package name to its src directory; a trailing separator in a directory is normalized away.
 */
export function mainOverlayPath(packageSources, id) {
  const [path] = id.split('?');
  for (const [name, directory] of packageSources) {
    const source = resolve(directory);
    if (path.startsWith(`${source}/`)) {
      return `${name}:${path.slice(source.length + 1)}`;
    }
  }
  return null;
}

/** Workspace packages that `revision`'s root workspace list names, with their repository directories. */
export function workspacePackages(git, revision) {
  const show = (path) => JSON.parse(git(['show', `${revision}:${path}`]));
  const manifests = show('package.json').workspaces.map((workspace) => `${workspace}/package.json`);
  const present = new Set(git(['ls-tree', '--name-only', revision, '--', ...manifests]).split('\n'));
  return manifests
    .filter((path) => present.has(path))
    .map((path) => ({ name: show(path).name, directory: path.slice(0, -'/package.json'.length) }));
}

/** Repository directory where `revision`'s root workspace list places the package named `name`. */
export function workspaceDirectory(git, revision, name) {
  const found = workspacePackages(git, revision).find((workspace) => workspace.name === name);
  if (found === undefined) {
    throw new Error(`No workspace package named ${name} at ${revision}`);
  }
  return found.directory;
}

/**
 * Runtime exports a module's base copy has and its branch copy lacks, for a module in any workspace package's
 * src: main sources also import sibling packages (deadvox imports thing-core from the skelly-assets submodule), and the base may
 * keep a package in another directory. Returns the lookup and a reader of a module's base copy.
 */
export function removedModuleExports(git, base) {
  const repository = git(['rev-parse', '--show-toplevel']);
  const baseDirectories = new Map(workspacePackages(git, base).map(({ name, directory }) => [name, directory]));
  const sources = workspacePackages(git, 'HEAD').map(({ name, directory }) => ({
    prefix: `${repository}/${directory}/src/`,
    base: baseDirectories.get(name),
  }));
  const basePathOf = (id) => {
    const [path] = id.split('?');
    const owner = sources.find(({ prefix }) => path.startsWith(prefix));
    return owner?.base === undefined ? null : `${owner.base}/src/${path.slice(owner.prefix.length)}`;
  };
  const baseCopy = (id) => git(['show', `${base}:${basePathOf(id)}`]);
  const baseFiles = new Set(git(['ls-tree', '-r', '--name-only', base]).split('\n'));
  const deletedFrom = (id) => {
    const [path] = id.split('?');
    const basePath = basePathOf(path);
    return basePath !== null && baseFiles.has(basePath) && !existsSync(path);
  };
  const removed = new Map();
  const removedFrom = (id) => {
    const [path] = id.split('?');
    if (!removed.has(path)) {
      const basePath = SCRIPT_MODULE.test(path) ? basePathOf(path) : null;
      const both =
        basePath !== null && existsSync(path) && git(['ls-tree', '--name-only', base, '--', basePath]) === basePath;
      removed.set(path, both ? removedExports(baseCopy(path), readFileSync(path, 'utf8')) : []);
    }
    return removed.get(path);
  };
  const shimmed = () =>
    Object.fromEntries(
      [...removed]
        .filter(([, names]) => names.length > 0)
        .map(([path, names]) => [relativePath(repository, path), names]),
    );
  return { removedFrom, baseCopy, deletedFrom, shimmed };
}

export function baseOnlyWorkspacePlugin({ deletedFrom, baseCopy }) {
  let extensions = [];
  return {
    name: 'main-first-mesh-deleted-workspace-files',
    enforce: 'pre',
    configResolved(config) {
      ({ extensions } = config.resolve);
    },
    async resolveId(id, importer) {
      const [path] = id.split('?');
      const query = id.slice(path.length);
      let local = null;
      if (isAbsolute(path)) {
        local = path;
      } else if (importer && path.startsWith('.')) {
        local = resolve(dirname(importer.split('?')[0]), path);
      }
      if (local === null) {
        return null;
      }
      const candidates = [
        local,
        ...extensions.map((ext) => `${local}${ext}`),
        ...extensions.map((ext) => `${local}/index${ext}`),
      ];
      const deleted = candidates.find(deletedFrom);
      if (deleted === undefined || (await this.resolve(id, importer, { skipSelf: true }))) {
        return null;
      }
      return `${deleted}${query}`;
    },
    load(id) {
      return deletedFrom(id) ? baseCopy(id) : null;
    },
  };
}

/** A branch module beside the overlays links against their base copies, so it may import only what they export. */
function assertOverlayBoundary(packageSources, overlays, branchPaths) {
  const branchSources = new Map();
  for (const [name, directory] of packageSources) {
    for (const relative of branchPaths.get(name) ?? []) {
      const key = `${name}:${relative}`;
      const path = resolve(directory, relative);
      if (SCRIPT_MODULE.test(relative) && !overlays.has(key) && existsSync(path)) {
        branchSources.set(key, readFileSync(path, 'utf8'));
      }
    }
  }
  const gaps = overlayBoundaryGaps(overlays, branchSources);
  if (gaps.length > 0) {
    const listed = gaps.map(({ importer, module, names }) => `${importer} imports ${names.join(', ')} from ${module}`);
    throw new Error(
      `Branch modules import names the base overlays lack; extend mainSourceOverlays over the changed boundary: ${listed.join('; ')}`,
    );
  }
}

// Base startup reads one default fogginess from the branch's day-cycle content and one fogginess from the
// branch's look controls; both became whole weather states (#1543). Content selectors and object members are
// beyond export shims, so the base callers read the branch's weather instead. Drop once the base carries it.
export function adaptMainWeather(source) {
  return source
    .replaceAll('{ fogginess: dayCycle.weather.defaultFogginess }', '{ ...dayCycle.weather.defaults }')
    .replace(
      'const { defaultFogginess } = requireDayCycle(hooks.engine.registry).weather;',
      'const defaultWeather = requireDayCycle(hooks.engine.registry).weather.defaults;',
    )
    .replaceAll('defaultFogginess,', 'defaultWeather,')
    .replaceAll('fogginess: look.fogginess,', 'weather: look.weatherState,')
    .replaceAll('look.fogginess', 'look.weatherState.fogginess');
}

const adaptMainBenchShadows = (source) =>
  `import { graphicsTuningOf as mainGraphicsTuningOf } from '@skelly/engine/look';\n${source}`
    .replace(
      'AUTO_TONE, DEFAULT_SHADOWS, type LookState, lookDefaultsOf, type MoodState',
      'AUTO_TONE, defaultShadows, graphicsTuningOf, type LookState, lookDefaultsOf, type MoodState',
    )
    .replace(
      'shadows.restore(DEFAULT_SHADOWS);',
      'shadows.restore(defaultShadows(mainGraphicsTuningOf(engine.registry).sunShadow));',
    );

const adaptMainDebugShadows = (source) =>
  `import { graphicsTuningOf as mainGraphicsTuningOf } from '@skelly/engine/look';\n${source}`
    .replace('DEFAULT_SHADOWS, graphicsTuningOf', 'defaultShadows, graphicsTuningOf')
    .replace(
      'shadows.restore(DEFAULT_SHADOWS);',
      'shadows.restore(defaultShadows(mainGraphicsTuningOf(hooks.engine.registry).sunShadow));',
    )
    .replace(
      'defaults: lookDefaults,',
      'defaults: lookDefaults,\n    sunShadow: mainGraphicsTuningOf(hooks.engine.registry).sunShadow,',
    )
    .replaceAll(
      'defaultWeather,',
      'defaultWeather,\n    sunShadow: mainGraphicsTuningOf(hooks.engine.registry).sunShadow,',
    );

const adaptMainPlayViewShadows = (source) =>
  source
    .replace('DEFAULT_SHADOWS, graphicsTuningOf', 'defaultShadows, graphicsTuningOf')
    .replace('shadows.restore(DEFAULT_SHADOWS);', 'shadows.restore(defaultShadows(graphics.sunShadow));');

/** Measurement hooks and contract adapters applied to a served base startup source. */
const OVERLAY_ADAPTERS = {
  'deadvox:bench/post.ts': (source) => adaptMainBenchShadows(adaptMainWeather(source)),
  'deadvox:debug/index.ts': (source) => adaptMainDebugShadows(adaptMainWeather(source)),
  'presentation:render/playView.ts': (source) => adaptMainPlayViewShadows(adaptMainWeather(source)),
  'presentation:presentation/engine.ts': (source) =>
    source.replace(
      '  return {\n    ...worldSetup,',
      '  globalThis.mainArrival.engineReadyRealMs=performance.now();\n  return {\n    ...worldSetup,',
    ),
  'engine:game/streamer.ts': (source) =>
    source.replace(
      '    this.opts.meshes.set(msg.key, [cx * CHUNK, cy * CHUNK, cz * CHUNK], msg.mesh);',
      `    this.opts.meshes.set(msg.key, [cx * CHUNK, cy * CHUNK, cz * CHUNK], msg.mesh);
if(msg.mesh.indices.length>0 && globalThis.mainArrival.firstMeshRealMs===null) {
  globalThis.mainArrival.firstMeshRealMs=performance.now();
  globalThis.mainArrival.key=msg.key;
  globalThis.mainArrival.workerComputeRealMs=msg.ms;
}`,
    ),
};

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
  // Each revision may place a workspace package elsewhere, so each tree is read where its own revision puts it.
  const { name } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  const basePackage = workspaceDirectory(git, base, name);
  const mainHtml = git(['show', `${base}:${basePackage}/index.html`]);
  const repository = git(['rev-parse', '--show-toplevel']);
  // Overlay keys and trees use each package's unscoped name; a workspace list that distinguishes two packages
  // only by scope would make those keys ambiguous, so a shared unscoped name is refused here.
  const packagesAt = (revision) => {
    const packages = new Map();
    for (const { name: packageName, directory } of workspacePackages(git, revision)) {
      const unscoped = packageName.split('/').at(-1);
      if (packages.has(unscoped)) {
        throw new Error(`Two workspace packages at ${revision} share the unscoped name ${unscoped}`);
      }
      packages.set(unscoped, directory);
    }
    return packages;
  };
  const basePackages = packagesAt(base);
  const branchPackages = packagesAt('HEAD');
  const packageSources = new Map(
    [...branchPackages].map(([pkg, directory]) => [pkg, resolve(repository, directory, 'src')]),
  );
  const treeAt = (revision, packages) =>
    new Map([...packages].map(([pkg, directory]) => [pkg, treeSources(git, revision, `${directory}/src`)]));
  const basePaths = treeAt(base, basePackages);
  const branchPaths = treeAt('HEAD', branchPackages);
  const showBase = (key) => {
    const [pkg, path] = overlayKeyParts(key);
    return git(['show', `${base}:${basePackages.get(pkg)}/src/${path}`]);
  };
  const sourceOverlays = mainOverlaySources(basePaths);
  for (const key of sourceOverlays) {
    const [pkg, path] = overlayKeyParts(key);
    if (!basePaths.get(pkg)?.has(path)) {
      throw new Error(
        `Main source overlay missing at ${base}: ${basePackages.get(pkg)}/src/${path}; update mainSourceOverlays`,
      );
    }
  }
  const overlays = new Map(sourceOverlays.map((key) => [key, showBase(key)]));
  assertOverlayBoundary(packageSources, overlays, branchPaths);
  // A main source may import an export the branch removed from a module both keep. That module stays the
  // branch's owner outside the contract-coupled overlays: a shim adds only removed names from main's copy.
  const modules = removedModuleExports(git, base);
  const { removedFrom, baseCopy, deletedFrom, shimmed: shimmedExports } = modules;
  const servedFromBase = (path) => {
    const relative = path === undefined ? null : mainOverlayPath(packageSources, path);
    return overlays.has(relative);
  };
  const mainImporter = (importer) => {
    const relative = mainOverlayPath(packageSources, importer);
    return importer.includes(BASE_COPY) || overlays.has(relative) || deletedFrom(importer);
  };
  const appliedSources = new Set();
  const server = await createStageServer({
    root,
    configFile: resolve(root, 'vite.config.ts'),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0 },
    plugins: [
      baseOnlyWorkspacePlugin(modules),
      {
        name: 'main-first-mesh-source-overlay',
        enforce: 'pre',
        async resolveId(id, importer) {
          if (!importer || id.startsWith('\0')) {
            return null;
          }
          const local = id.startsWith('.') ? resolve(dirname(importer.split('?')[0]), id) : undefined;
          if (servedFromBase(local)) {
            return local;
          }
          if (!mainImporter(importer)) {
            return null;
          }
          // Aliased and package imports go through Vite's own resolver, so the boundary spans sibling packages.
          const path = local ?? (await this.resolve(id, importer, { skipSelf: true }))?.id;
          return path !== undefined && removedFrom(path).length > 0 ? `${EXPORT_SHIM}${path}` : null;
        },
        load(id) {
          if (id.startsWith(EXPORT_SHIM)) {
            const path = id.slice(EXPORT_SHIM.length);
            const names = removedFrom(path);
            return `export * from ${JSON.stringify(path)};\nexport { ${names.join(', ')} } from ${JSON.stringify(`${path}${BASE_COPY}`)};\n`;
          }
          const relative = mainOverlayPath(packageSources, id);
          if (id.endsWith(BASE_COPY)) {
            return baseCopy(id);
          }
          if (overlays.has(relative)) {
            return overlays.get(relative);
          }
          return null;
        },
        transformIndexHtml: {
          order: 'pre',
          handler() {
            appliedSources.add('index.html');
            return mainHtml;
          },
        },
        transform(code, id) {
          const relative = mainOverlayPath(packageSources, id);
          let source = overlays.get(relative) ?? code;
          if (overlays.has(relative)) {
            appliedSources.add(relative);
          }
          if (
            relative === 'engine:core/authoredSite.ts' ||
            id.endsWith('/mods/skelly.deadvox.scenario.stairs/templates-stairs.json')
          ) {
            source = fixtureTransform(source, id) ?? source;
          }
          return OVERLAY_ADAPTERS[relative]?.(source) ?? source;
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
    await page.goto(
      gameUrl(`http://127.0.0.1:${address.port}`, {
        startMod: inlineStartMod('fixture.sky-main-arrival.stairs', stairsStart),
        hash: { debug: true, seed: 1, radius: 32 },
      }),
    );
    await page.waitForFunction(
      () => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false',
      undefined,
      { timeout: 60_000 },
    );
    await page.locator('#go').click();
    for (const source of [
      'index.html',
      'presentation:presentation/engine.ts',
      'presentation:render/distanceFog.ts',
      'presentation:presentation/play.ts',
      'presentation:render/playView.ts',
      'engine:game/streamer.ts',
      'presentation:render/skylight.ts',
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
      sourceOverlays,
      appliedSources: [...appliedSources],
      shimmedExports: shimmedExports(),
      errors,
      browser: browser.version(),
      viewport: page.viewportSize(),
      attribution:
        'Main startup, lighting and worker sources with contract-coupled construction owners and unrelated branch core, the same fixture/content and browser; startup mesh delivery, not first rendered pixels or a pristine whole-build screenshot.',
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
        worldLoadingState: document.querySelector('#world-loading')?.getAttribute('data-state'),
        worldLoadingMessage: document.querySelector('#world-loading-message')?.textContent,
        saveStatus: document.querySelector('#save-status')?.textContent,
        startupErrors: document.querySelector('#errors')?.textContent,
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
