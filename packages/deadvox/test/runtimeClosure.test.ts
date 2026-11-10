import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ConfigEnv, loadConfigFromFile, type UserConfig } from 'vite';
import { describe, expect, it } from 'vitest';
import { ENGINE_POLICY, type RuntimeClosurePolicy, runtimeClosureViolations } from '../tools/runtimeClosure.ts';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
type Tree = Record<string, string>;

// The fixture's runtime set sits inside a product package, beside the render, configuration, mods and page
// files it must not reach, so each witness can reach them by every route, short relative ones included. The
// check reads only the policy, so the same checks guard the runtime package.
const FIXTURE_POLICY: RuntimeClosurePolicy = {
  start: ['packages/deadvox/src/game'],
  leaves: [],
  manifest: 'packages/deadvox/package.json',
  forbidden: [
    'packages/deadvox/src/render',
    'packages/deadvox/src/ui',
    'packages/deadvox/src/presentation',
    'packages/presentation',
  ],
  forbiddenPackages: ENGINE_POLICY.forbiddenPackages,
  viteRoot: 'packages/deadvox',
  tsconfig: 'packages/deadvox/tsconfig.json',
};

// A fixture repository laid out like the real one, whose runtime reaches only allowed targets.
const cleanTree: Tree = {
  'package.json': JSON.stringify({
    type: 'module',
    workspaces: [
      'packages/deadvox',
      'packages/engine',
      'packages/skelly-assets/tools/packages/thing-core',
      'packages/presentation',
      'packages/mods',
    ],
  }),
  'packages/deadvox/package.json': JSON.stringify({
    name: '@skelly/deadvox',
    type: 'module',
    dependencies: { '@skelly/engine': '*', '@skelly/presentation': '*', '@skelly/thing-core': '*', kit: '*' },
  }),
  'packages/deadvox/tsconfig.json':
    '{\n  // Only resolution the check models.\n  "compilerOptions": {\n    "module": "ESNext",\n    "moduleResolution": "Bundler",\n    "types": ["node"],\n  },\n  "include": ["src"],\n}\n',
  'packages/deadvox/src/game/sim.ts':
    "import { rule } from './rule.ts';\nimport { schema } from '@skelly/thing-core/schema';\nimport { join } from 'node:path';\nimport { solid } from '@skelly/engine/sim';\nexport const tick = () => [rule, schema, join, solid];\n",
  'packages/deadvox/src/game/rule.ts': 'export const rule = 1;\n',
  'packages/deadvox/src/game/session.ts': "import { tick } from './sim.ts';\nexport const session = tick;\n",
  // The runtime package, a library the runtime in deadvox follows by its package name.
  'packages/engine/package.json': JSON.stringify({
    name: '@skelly/engine',
    type: 'module',
    exports: { './sim': './src/sim.ts' },
  }),
  'packages/engine/src/sim.ts': "export { solid } from './vehicles/solid.ts';\n",
  'packages/engine/src/vehicles/solid.ts': 'export const solid = 1;\n',
  'packages/deadvox/src/render/view.ts':
    "import { session } from '../game/session.ts';\nexport const view = session;\n",
  'packages/skelly-assets/tools/packages/thing-core/package.json': JSON.stringify({
    name: '@skelly/thing-core',
    type: 'module',
    exports: { './schema': './src/schema.ts' },
  }),
  'packages/skelly-assets/tools/packages/thing-core/src/schema.ts': 'export const schema = 1;\n',
  'packages/presentation/package.json': JSON.stringify({
    name: '@skelly/presentation',
    type: 'module',
    exports: { './*': './src/*.ts' },
  }),
  'packages/presentation/src/hud.ts': 'export const hud = 1;\n',
  // Product configuration, mods and a page, which the runtime may not reach.
  'packages/deadvox/src/config/tuning.json': '{}\n',
  'packages/deadvox/mods/skelly.fixture/pack.json': '{}\n',
  'packages/deadvox/src/main.ts': "import { session } from './game/session.ts';\nexport const page = session;\n",
  'packages/mods/package.json': JSON.stringify({ name: '@skelly/mods', type: 'module' }),
  'packages/mods/skelly.fixture/pack.json': '{}\n',
};

/** `links` maps a link path to the file or directory it points at, relative to the link's own directory. */
function violationsIn(changes: Tree, links: Tree = {}) {
  const root = mkdtempSync(join(tmpdir(), 'deadvox-closure-'));
  try {
    for (const [path, source] of Object.entries({ ...cleanTree, ...changes })) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), source);
    }
    for (const [path, target] of Object.entries(links)) {
      symlinkSync(target, join(root, path));
    }
    return runtimeClosureViolations(root, FIXTURE_POLICY);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// The product's Vite config bundles the runtime package's source, so it must resolve it as the check does.
const viteRoot = join(repoRoot, 'packages/deadvox');
const resolutionHooks = new Set(['config', 'configEnvironment', 'resolveId']);

/** Vite awaits and flattens the plugin option; so does the gate before it reads hooks. */
async function settledPlugins(option: unknown): Promise<unknown[]> {
  const settled = await option;
  return Array.isArray(settled) ? (await Promise.all(settled.map(settledPlugins))).flat() : [settled];
}

/**
 * What in a loaded Vite config could resolve differently from the closure check: any resolution option, a
 * root other than the policy root (it anchors `/` specifiers and globs), or a plugin hook that edits config or
 * resolves ids. See `packages/deadvox/docs/runtime-closure-limits.md`.
 */
async function viteGateIssues(config: UserConfig): Promise<string[]> {
  const issues: string[] = [];
  if (config.resolve !== undefined) {
    issues.push('resolve');
  }
  // An absent root is the working directory, which the package's scripts set to the policy root.
  if (config.root !== undefined && resolve(viteRoot, config.root) !== viteRoot) {
    issues.push('root');
  }
  for (const plugin of await settledPlugins(config.plugins ?? [])) {
    if (plugin && typeof plugin === 'object') {
      issues.push(...Object.keys(plugin).filter((hook) => resolutionHooks.has(hook)));
    }
  }
  return issues;
}

// The package's scripts run `vite` (serve, development) and `vite build` (build, production); a config
// function may answer each differently, so each is gated.
const packageCommands: readonly ConfigEnv[] = [
  { command: 'build', mode: 'production' },
  { command: 'serve', mode: 'development' },
];

/** The gate's issues for each package command's loaded config, prefixed by the command. */
async function configFileGateIssues(configFile: string): Promise<string[]> {
  const perCommand = await Promise.all(
    packageCommands.map(async (env) => {
      const loaded = await loadConfigFromFile(env, configFile, dirname(configFile), 'silent');
      const found = loaded === null ? ['no config'] : await viteGateIssues(loaded.config);
      return found.map((issue) => `${env.command}: ${issue}`);
    }),
  );
  return perCommand.flat();
}

/** Tree changes that add an exports-free workspace `kit`, whose manifest also holds `extra`. */
function kitWorkspace(extra: Record<string, unknown>): Tree {
  const root = JSON.parse(cleanTree['package.json'] ?? '{}') as { workspaces: string[] };
  return {
    'package.json': JSON.stringify({ ...root, workspaces: [...root.workspaces, 'packages/kit'] }),
    'packages/kit/package.json': JSON.stringify({ name: 'kit', type: 'module', ...extra }),
  };
}

const importers = (violations: ReturnType<typeof violationsIn>) => violations.map((v) => v.importer);
// Each importer with its reason, without the path a reason may end with.
const reasons = (violations: ReturnType<typeof violationsIn>) =>
  violations.map((v) => [v.importer, v.reason.split(':')[0]]);
// thing-core is a library the runtime follows through its workspace.
const thingCoreSchema = 'packages/skelly-assets/tools/packages/thing-core/src/schema.ts';
const thingCoreStep = 'packages/skelly-assets/tools/packages/thing-core/src/step.ts';
// From thing-core's src up to `packages/`; built, not literal, since the import-boundary scan reads literals.
const UP_TO_PACKAGES = '../'.repeat(5);
const catalog = 'packages/deadvox/src/game/catalog.ts';
// Literal file names that Vite's matcher reaches through syntax Node's globSync reads differently.
const oddlyNamedRender: Tree = {
  'packages/deadvox/src/render/brackets/[ab].ts': 'export const ab = 1;\n',
  'packages/deadvox/src/render/groups/ab.ts': 'export const ab = 1;\n',
  'packages/deadvox/src/render/alternation/a.ts': 'export const a = 1;\n',
};

describe('runtime closure', () => {
  it('keeps the runtime package off deadvox, presentation, three and Lit, and on the packages it declares', () => {
    expect(runtimeClosureViolations(repoRoot, ENGINE_POLICY)).toEqual([]);
  });

  // The loaded config is checked, not the file's text, because a config file may compute its values.
  it('runs on a Vite config that sets no resolution options', async () => {
    expect(await configFileGateIssues(join(viteRoot, 'vite.config.ts'))).toEqual([]);
  });

  it('fails a Vite config whose development server alone takes another root', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'deadvox-vite-gate-'));
    try {
      const configFile = join(dir, 'vite.config.mjs');
      writeFileSync(
        configFile,
        "export default ({ command }) => ({\n  root: command === 'serve' ? 'src/render' : '.',\n});\n",
      );
      expect(await configFileGateIssues(configFile)).toEqual(['serve: root']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails a Vite config whose root is not the policy root, one that sets resolution, and one whose promised plugin resolves ids', async () => {
    expect(await viteGateIssues({ root: '.' })).toEqual([]);
    expect(await viteGateIssues({ root: 'src/render' })).toEqual(['root']);
    expect(await viteGateIssues({ resolve: { alias: { '@kit/': 'kit/src/' } } })).toEqual(['resolve']);
    const redirect = { name: 'redirect', resolveId: () => null };
    expect(await viteGateIssues({ plugins: [Promise.resolve([redirect])] })).toEqual(['resolveId']);
  });

  it('passes the clean fixture, so each witness fails for its own edge', () => {
    expect(violationsIn({})).toEqual([]);
  });

  it('fails a runtime file that only type-imports a render file (W1)', () => {
    const violations = violationsIn({
      'packages/deadvox/src/game/rule.ts':
        "import type { view } from '../render/view.ts';\nexport const rule: typeof view | 1 = 1;\n",
    });
    expect(importers(violations)).toEqual(['packages/deadvox/src/game/rule.ts']);
  });

  it('fails a forbidden file reached only through a followed library (W2)', () => {
    const violations = violationsIn({
      [thingCoreSchema]: "import { step } from './step.ts';\nexport const schema = step;\n",
      [thingCoreStep]: `import { view } from '${UP_TO_PACKAGES}deadvox/src/render/view.ts';\nexport const step = view;\n`,
    });
    expect(importers(violations)).toEqual([thingCoreStep]);
  });

  it('fails a runtime file that imports product configuration JSON (W3)', () => {
    const violations = violationsIn({
      [catalog]: "import tuning from '../config/tuning.json' with { type: 'json' };\nexport const t = tuning;\n",
    });
    expect(violations.map((v) => [v.importer, v.target, v.reason])).toEqual([
      [catalog, 'packages/deadvox/src/config/tuning.json', 'reaches outside the runtime set'],
    ]);
  });

  it('fails a runtime glob that matches product mods (W4)', () => {
    const violations = violationsIn({
      [catalog]: "export const packs = import.meta.glob('../../mods/**/*.json');\n",
    });
    expect(violations.map((v) => [v.importer, v.target, v.reason])).toEqual([
      [catalog, 'packages/deadvox/mods/skelly.fixture/pack.json', 'reaches outside the runtime set'],
    ]);
  });

  it.each([
    ['a product page', "export { page } from '../main.ts';\n", 'packages/deadvox/src/main.ts'],
    [
      'a workspace the runtime package does not depend on',
      "import pack from '@skelly/mods/skelly.fixture/pack.json' with { type: 'json' };\nexport const p = pack;\n",
      'packages/mods/skelly.fixture/pack.json',
    ],
    [
      'a dependency library entered by a relative path',
      `export { schema } from '${'../'.repeat(3)}skelly-assets/tools/packages/thing-core/src/schema.ts';\n`,
      thingCoreSchema,
    ],
  ])('fails a runtime file that reaches %s', (_name, source, target) => {
    expect(violationsIn({ [catalog]: source }).map((v) => [v.importer, v.target, v.reason])).toEqual([
      [catalog, target, 'reaches outside the runtime set'],
    ]);
  });

  it('fails a runtime file that imports an npm package its manifest does not name in dependencies', () => {
    const violations = violationsIn({ [catalog]: "import * as v from 'valibot';\nexport const schema = v;\n" });
    expect(violations.map((v) => [v.importer, v.target, v.reason])).toEqual([
      [catalog, 'valibot', 'imports a package its manifest does not name in dependencies'],
    ]);
  });

  it('fails a followed library that imports three', () => {
    const violations = violationsIn({
      [thingCoreSchema]: "import { Vector3 } from 'three';\nexport const schema = Vector3;\n",
    });
    expect(violations.map((v) => [v.importer, v.target])).toEqual([[thingCoreSchema, 'three']]);
  });

  it('fails a bare import of a forbidden workspace even when the runtime lists it as a dependency (W6)', () => {
    const violations = violationsIn({
      'packages/deadvox/src/game/session.ts':
        "import { hud } from '@skelly/presentation/hud';\nexport const session = hud;\n",
    });
    expect(violations.map((v) => [v.importer, v.target])).toEqual([
      ['packages/deadvox/src/game/session.ts', 'packages/presentation/src/hud.ts'],
    ]);
  });

  it('fails a glob whose pattern is neither relative nor rooted', () => {
    const violations = violationsIn({
      'packages/deadvox/src/game/catalog.ts': "export const rigs = import.meta.glob('@kit/rig/*.ts');\n",
    });
    expect(violations.map((v) => [v.importer, v.reason])).toEqual([
      ['packages/deadvox/src/game/catalog.ts', 'uses a glob that does not resolve'],
    ]);
  });

  it('fails a glob whose options spread after a literal base, but passes a literal base that matches nothing', () => {
    const spread = violationsIn({
      'packages/deadvox/src/game/catalog.ts':
        "export const views = import.meta.glob('./*.ts', {\n  base: './missing',\n  ...(true ? { base: '/src/render' } : {}),\n});\n",
    });
    expect(importers(spread)).toEqual(['packages/deadvox/src/game/catalog.ts']);
    expect(
      violationsIn({
        'packages/deadvox/src/game/catalog.ts':
          "export const views = import.meta.glob('./*.ts', { base: './missing' });\n",
      }),
    ).toEqual([]);
  });

  it('fails case-insensitive matching, but passes the case-sensitive default that matches nothing', () => {
    const nocase = violationsIn({
      'packages/deadvox/src/game/catalog.ts':
        "export const views = import.meta.glob('/src/render/*.TS', { caseSensitive: false });\n",
    });
    expect(importers(nocase)).toEqual(['packages/deadvox/src/game/catalog.ts']);
    expect(
      violationsIn({
        'packages/deadvox/src/game/catalog.ts':
          "export const parts = import.meta.glob('./parts/*.ts', { caseSensitive: true, exhaustive: false });\n",
      }),
    ).toEqual([]);
  });

  it('fails exhaustive matching, which also matches dotfiles', () => {
    const violations = violationsIn({
      'packages/deadvox/src/game/catalog.ts':
        "export const panels = import.meta.glob('/src/render/hidden/*.ts', { exhaustive: true });\n",
      'packages/deadvox/src/render/hidden/.panel.ts': 'export const panel = 1;\n',
    });
    expect(importers(violations)).toEqual(['packages/deadvox/src/game/catalog.ts']);
  });

  it('fails a wildcard over a symlinked directory, which Vite follows', () => {
    const violations = violationsIn(
      { [catalog]: "export const views = import.meta.glob('/src/config/*/view.ts');\n" },
      { 'packages/deadvox/src/config/views': '../render' },
    );
    expect(reasons(violations)).toEqual([[catalog, 'globs through a symlink, which the bundler follows']]);
  });

  it('matches an allowlisted glob with ** and * exactly', () => {
    const violations = violationsIn({ [catalog]: "export const views = import.meta.glob('/src/render/**/v*.ts');\n" });
    expect(violations.map((v) => [v.importer, v.target])).toEqual([[catalog, 'packages/deadvox/src/render/view.ts']]);
  });

  it.each([
    ['a bracket class', "import.meta.glob('/src/render/brackets/[ab].ts')"],
    ['escaped brackets in a string', "import.meta.glob('/src/render/brackets/\\\\[ab\\\\].ts')"],
    ['escaped brackets in a template', 'import.meta.glob(`/src/render/brackets/\\[ab\\].ts`)'],
    ['a bare group', "import.meta.glob('/src/render/groups/a(b).ts')"],
    ['an alternation', "import.meta.glob('/src/render/alternation/(a|b).ts')"],
  ])('fails a glob outside the allowlisted syntax: %s', (_name, call) => {
    const violations = violationsIn({ ...oddlyNamedRender, [catalog]: `export const views = ${call};\n` });
    expect(importers(violations)).toEqual([catalog]);
  });

  it('expands a dynamic import hole that is a plain name to one file-name wildcard', () => {
    const violations = violationsIn({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text holding a template literal.
      [catalog]: 'export const load = (kind: { name: string }) => import(`../render/${kind.name}.ts`);\n',
    });
    expect(violations.map((v) => [v.importer, v.target])).toEqual([[catalog, 'packages/deadvox/src/render/view.ts']]);
  });

  it('fails a dynamic import hole that is not a plain name, even one whose braces stay in one segment', () => {
    const violations = violationsIn({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text holding a template literal.
      [catalog]: 'export const view = import(`../render/${({ x: 1 }).x}.ts`);\n',
      'packages/deadvox/src/render/1.ts': 'export const one = 1;\n',
    });
    expect(importers(violations)).toEqual([catalog]);
  });

  it('fails a dynamic import template with a query', () => {
    const violations = violationsIn({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text holding a template literal.
      [catalog]: 'export const load = (name: string) => import(`../render/${name}.ts?raw`);\n',
    });
    expect(importers(violations)).toEqual([catalog]);
  });

  it('fails a dynamic import hole that can add a directory', () => {
    const violations = violationsIn({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: fixture source text holding a template literal.
      [catalog]: 'export const load = (name: string) => import(`../${"render/" + name}.ts`);\n',
    });
    expect(importers(violations)).toEqual([catalog]);
  });

  it.each([
    ['a forbidden package root', "export const raw = import('three?raw');\n"],
    ['a forbidden workspace root', "import '@skelly/presentation?raw';\n"],
  ])('fails a queried bare specifier naming %s', (_name, source) => {
    const violations = violationsIn({ [catalog]: source });
    expect(importers(violations)).toEqual([catalog]);
  });

  it.each([
    ['a type import behind a comment', "export type V = import(/* m */ 'three').Vector3;\n"],
    ['a type import with an escaped name', "export type V = import('th\\u0072ee').Vector3;\n"],
    ['a queried type import behind a comment', "export type V = import(/* m */ 'three?raw');\n"],
    [
      'a queried module URL with a trailing comma',
      "export const u = new URL('../render/view.ts?raw', import.meta.url,);\n",
    ],
    [
      'a module URL whose target is not a literal',
      'export const at = (path: string) => new URL(path, import.meta.url);\n',
    ],
    ['an import-equals require', "import Three = require('three');\nexport const v = Three;\n"],
    ['a CommonJS require call', "export const three = require('three');\n"],
    ['a triple-slash types reference', '/// <reference types="three" />\nexport const v = 1;\n'],
    [
      'a module augmentation',
      "declare module 'three' {\n  interface Vector3 {\n    tag: string;\n  }\n}\nexport {};\n",
    ],
    ['an import.meta.resolve call', "export const at = import.meta.resolve('../render/view.ts');\n"],
  ])('fails %s', (_name, source) => {
    expect(importers(violationsIn({ [catalog]: source }))).toEqual([catalog]);
  });

  it('reads a module URL with a trailing comma', () => {
    const violations = violationsIn({
      [catalog]: "export const u = new URL('../render/view.ts', import.meta.url,);\n",
    });
    expect(violations.map((v) => [v.importer, v.target])).toEqual([[catalog, 'packages/deadvox/src/render/view.ts']]);
  });

  it.each([
    ['on one line', "/** @type {import('three').Vector3 | undefined} */\nexport let v;\n"],
    ['across a line break and its asterisk', "/** @type {import\n * ('three').Vector3} */\nexport let v;\n"],
  ])('fails a JSDoc type import in a JavaScript runtime file, %s', (_name, source) => {
    const legacy = 'packages/deadvox/src/game/legacy.js';
    expect(importers(violationsIn({ [legacy]: source }))).toEqual([legacy]);
  });

  it.each([
    ['a hole-free template with an escape', 'export const m = import(`th\\u0072ee`);\n'],
    [
      'a module URL without a leading ./ or ../',
      "export const u = new URL('sub/../../render/view.ts', import.meta.url);\n",
    ],
  ])('fails %s', (_name, source) => {
    expect(importers(violationsIn({ [catalog]: source }))).toEqual([catalog]);
  });

  it('follows every condition of a workspace export, the types target included', () => {
    const violations = violationsIn({
      'packages/skelly-assets/tools/packages/thing-core/package.json': JSON.stringify({
        name: '@skelly/thing-core',
        type: 'module',
        exports: { './schema': { types: './src/types.ts', import: './src/schema.ts' } },
      }),
      'packages/skelly-assets/tools/packages/thing-core/src/types.ts': "export type V = import('three').Vector3;\n",
      [catalog]: "export type { V } from '@skelly/thing-core/schema';\n",
    });
    expect(violations.map((v) => [v.importer, v.target])).toEqual([
      ['packages/skelly-assets/tools/packages/thing-core/src/types.ts', 'three'],
    ]);
  });

  it('follows the TypeScript source an .mjs specifier also names', () => {
    const rig = 'packages/skelly-assets/tools/packages/thing-core/src/rig';
    const violations = violationsIn({
      'packages/skelly-assets/tools/packages/thing-core/package.json': JSON.stringify({
        name: '@skelly/thing-core',
        type: 'module',
        exports: { './schema': './src/schema.ts', './rig': './src/rig.mjs' },
      }),
      [`${rig}.mjs`]: 'export const rig = 1;\n',
      [`${rig}.mts`]: "export type V = import('three').Vector3;\n",
      [catalog]: "export type { V } from '@skelly/thing-core/rig';\n",
    });
    expect(violations.map((v) => [v.importer, v.target])).toEqual([[`${rig}.mts`, 'three']]);
  });

  // Each forbidden dependency sits only in the implementation file tsc substitutes for the named one.
  it.each([
    ['.d.ts', 'rig.d.ts', 'rig.ts'],
    ['.d.mts', 'rig.d.mts', 'rig.mts'],
    ['.d.cts', 'rig.d.cts', 'rig.cts'],
    ['.js', 'rig.js', 'rig.ts'],
    ['none (a directory with its own package.json)', 'kit', 'kit/types.ts'],
  ])('fails a specifier extension outside the supported set: %s', (_name, named, substitute) => {
    const violations = violationsIn({
      [`packages/deadvox/src/config/${named === 'kit' ? 'kit/index.ts' : named}`]:
        named === 'rig.js' ? 'export const V = 1;\n' : 'export type V = number;\n',
      'packages/deadvox/src/config/kit/package.json': JSON.stringify({ types: './types.ts' }),
      [`packages/deadvox/src/config/${substitute}`]: "export type V = import('three').Vector3;\n",
      [catalog]: `export type { V } from '../config/${named}';\n`,
    });
    expect(reasons(violations)).toEqual([[catalog, 'a specifier extension outside .ts, .mjs and .json']]);
  });

  it.each([
    ['a browser map', { browser: { './src/clean.ts': './src/browser.ts' } }],
    ['typesVersions without exports', { typesVersions: { '*': { 'src/clean.ts': ['src/browser.ts'] } } }],
    ['an unknown key', { frobnicate: true }],
  ])('fails a reached package whose manifest has %s', (_name, extra) => {
    const violations = violationsIn({
      ...kitWorkspace(extra),
      'packages/kit/src/clean.ts': 'export const V = 1;\n',
      'packages/kit/src/browser.ts': "import { Vector3 } from 'three';\nexport const V = Vector3;\n",
      [catalog]: "export { V } from 'kit/src/clean.ts';\n",
    });
    expect(violations.map((v) => v.target)).toEqual(['packages/kit/package.json']);
  });

  it('judges the workspace manifest that resolves a bare name, not only the target file’s nearest one', () => {
    const violations = violationsIn({
      ...kitWorkspace({ typesVersions: { '*': { 'src/clean.ts': ['src/browser.ts'] } } }),
      'packages/kit/src/package.json': JSON.stringify({ type: 'module' }),
      'packages/kit/src/clean.ts': 'export type V = number;\n',
      'packages/kit/src/browser.ts': "export type V = import('three').Vector3;\n",
      [catalog]: "export type { V } from 'kit/src/clean.ts';\n",
    });
    expect(violations.map((v) => v.target)).toEqual(['packages/kit/package.json']);
  });

  const tsconfigWith = (compilerOptions: Record<string, unknown>, include: unknown = ['src']) =>
    JSON.stringify({
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'Bundler',
        ...compilerOptions,
      },
      include,
    });

  it.each([
    ['a resolution option it does not model', tsconfigWith({ baseUrl: '.' })],
    ['a path mapping', tsconfigWith({ paths: { '@kit/*': ['../kit/src/*'] } })],
    ['a types path to a render declaration', tsconfigWith({ types: ['./src/render/view.d.ts'] })],
    ['a forbidden types package', tsconfigWith({ types: ['three'] })],
    ['a forbidden @types package', tsconfigWith({ types: ['@types/three'] })],
    ['typeRoots', tsconfigWith({ typeRoots: ['./src/render'] })],
    ['a lib path', tsconfigWith({ lib: ['./src/render/view.d.ts'] })],
    ['an include outside the package', tsconfigWith({}, ['src', '../presentation/src'])],
  ])('fails a tsconfig with %s', (_name, tsconfig) => {
    const violations = violationsIn({
      'packages/deadvox/tsconfig.json': tsconfig,
      'packages/deadvox/src/render/view.d.ts': "export type V = import('three').Vector3;\n",
    });
    expect(importers(violations)).toEqual(['packages/deadvox/tsconfig.json']);
  });

  it('fails a symlinked file in a runtime root', () => {
    const violations = violationsIn(
      { 'packages/deadvox/src/render/linkTarget.ts': "export type V = import('three').Vector3;\n" },
      { 'packages/deadvox/src/game/linked.ts': '../render/linkTarget.ts' },
    );
    expect(importers(violations)).toEqual(['packages/deadvox/src/game/linked.ts']);
  });

  it.each([
    {
      name: 'a symlinked directory on the literal path',
      pattern: "'/src/config/views/*.ts'",
      link: { 'packages/deadvox/src/config/views': '../render' },
      reason: 'globs through a symlink, which the bundler follows',
    },
    {
      name: 'a symlinked matched file',
      pattern: "'/src/config/view.ts'",
      link: { 'packages/deadvox/src/config/view.ts': '../render/view.ts' },
      reason: 'reaches through a symlink',
    },
  ])('fails a glob through $name', ({ pattern, link, reason }) => {
    const violations = violationsIn({ [catalog]: `export const views = import.meta.glob(${pattern});\n` }, link);
    expect(reasons(violations)).toEqual([[catalog, reason]]);
  });
});
