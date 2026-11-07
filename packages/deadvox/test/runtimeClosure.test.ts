import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfigFromFile } from 'vite';
import { describe, expect, it } from 'vitest';
import { runtimeClosureViolations, STAGE_ONE_POLICY } from '../tools/runtimeClosure.ts';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
type Tree = Record<string, string>;

// A fixture repository laid out like the real one, whose runtime reaches only allowed targets.
const cleanTree: Tree = {
  'package.json': JSON.stringify({
    type: 'module',
    workspaces: ['packages/deadvox', 'packages/mobgen', 'packages/thing-core', 'packages/presentation'],
  }),
  'packages/deadvox/package.json': JSON.stringify({
    name: '@skelly/deadvox',
    type: 'module',
    dependencies: { '@skelly/presentation': '*' },
  }),
  'packages/deadvox/tsconfig.json':
    '{\n  // The one supported alias.\n  "compilerOptions": { "moduleResolution": "Bundler", "paths": { "@mobgen/*": ["../mobgen/src/*"] } },\n}\n',
  'packages/deadvox/src/core/sim.ts':
    "import { rule } from './rule.ts';\nimport { pose } from '@mobgen/pose.ts';\nimport { schema } from '@skelly/thing-core/schema';\nimport { join } from 'node:path';\nexport const tick = () => [rule, pose, schema, join];\n",
  'packages/deadvox/src/core/rule.ts': 'export const rule = 1;\n',
  'packages/deadvox/src/vehicles/solid.ts': "import { rule } from '../core/rule.ts';\nexport const solid = rule;\n",
  'packages/deadvox/src/game/session.ts': "import { tick } from '../core/sim.ts';\nexport const session = tick;\n",
  'packages/deadvox/src/render/view.ts':
    "import { session } from '../game/session.ts';\nexport const view = session;\n",
  'packages/mobgen/package.json': JSON.stringify({ name: 'mobgen', type: 'module' }),
  'packages/mobgen/src/pose.ts': 'export const pose = 1;\n',
  'packages/thing-core/package.json': JSON.stringify({
    name: '@skelly/thing-core',
    type: 'module',
    exports: { './schema': './src/schema.ts' },
  }),
  'packages/thing-core/src/schema.ts': 'export const schema = 1;\n',
  'packages/presentation/package.json': JSON.stringify({
    name: '@skelly/presentation',
    type: 'module',
    exports: { './*': './src/*.ts' },
  }),
  'packages/presentation/src/hud.ts': 'export const hud = 1;\n',
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
    return runtimeClosureViolations(root, STAGE_ONE_POLICY);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const importers = (violations: ReturnType<typeof violationsIn>) => violations.map((v) => v.importer);
const catalog = 'packages/deadvox/src/core/catalog.ts';
// Literal file names that Vite's matcher reaches through syntax Node's globSync reads differently.
const oddlyNamedRender: Tree = {
  'packages/deadvox/src/render/brackets/[ab].ts': 'export const ab = 1;\n',
  'packages/deadvox/src/render/groups/ab.ts': 'export const ab = 1;\n',
  'packages/deadvox/src/render/alternation/a.ts': 'export const a = 1;\n',
};

describe('runtime closure, stage 1', () => {
  it('keeps the runtime and the libraries it follows from reaching presentation, render, UI, three or Lit', () => {
    expect(runtimeClosureViolations(repoRoot, STAGE_ONE_POLICY)).toEqual([]);
  });

  // The loaded config is checked, not the file's text: the file computes its alias target, and a plugin's
  // config or resolveId hook could change resolution, so the test also requires there be none.
  it('runs on a Vite config whose resolution adds only the policy aliases', async () => {
    const projectRoot = join(repoRoot, STAGE_ONE_POLICY.viteRoot);
    const loaded = await loadConfigFromFile(
      { command: 'build', mode: 'production' },
      join(projectRoot, 'vite.config.ts'),
      projectRoot,
      'silent',
    );
    const aliases = Object.entries(STAGE_ONE_POLICY.aliases).map(([prefix, dir]) => [prefix, join(repoRoot, dir)]);
    expect(loaded?.config.resolve).toEqual({ alias: Object.fromEntries(aliases) });
    const plugins: unknown[] = [...(loaded?.config.plugins ?? [])];
    const hooks = plugins
      .flat(Number.POSITIVE_INFINITY)
      .flatMap((plugin) => (plugin && typeof plugin === 'object' ? Object.keys(plugin) : []));
    expect(hooks.filter((hook) => ['config', 'configEnvironment', 'resolveId'].includes(hook))).toEqual([]);
  });

  it('passes the clean fixture, so each witness fails for its own edge', () => {
    expect(violationsIn({})).toEqual([]);
  });

  it('fails a runtime file that only type-imports a render file (W1)', () => {
    const violations = violationsIn({
      'packages/deadvox/src/core/rule.ts':
        "import type { view } from '../render/view.ts';\nexport const rule: typeof view | 1 = 1;\n",
    });
    expect(importers(violations)).toEqual(['packages/deadvox/src/core/rule.ts']);
  });

  it('fails a forbidden file reached only through a followed library (W2)', () => {
    const violations = violationsIn({
      'packages/mobgen/src/pose.ts': "import { step } from './step.ts';\nexport const pose = step;\n",
      'packages/mobgen/src/step.ts':
        "import { view } from '../../deadvox/src/render/view.ts';\nexport const step = view;\n",
    });
    expect(importers(violations)).toEqual(['packages/mobgen/src/step.ts']);
  });

  it('fails a followed library that imports three (W5)', () => {
    const violations = violationsIn({
      'packages/mobgen/src/pose.ts': "import { Vector3 } from 'three';\nexport const pose = Vector3;\n",
    });
    expect(violations.map((v) => [v.importer, v.target])).toEqual([['packages/mobgen/src/pose.ts', 'three']]);
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

  it('fails a project-root glob that matches a render file', () => {
    const violations = violationsIn({
      'packages/deadvox/src/core/catalog.ts': "export const views = import.meta.glob('/src/render/*.ts');\n",
    });
    expect(violations.map((v) => [v.importer, v.target])).toEqual([
      ['packages/deadvox/src/core/catalog.ts', 'packages/deadvox/src/render/view.ts'],
    ]);
  });

  it('follows an alias glob into a followed library that imports three', () => {
    const violations = violationsIn({
      'packages/deadvox/src/core/catalog.ts': "export const rigs = import.meta.glob('@mobgen/rig/*.ts');\n",
      'packages/mobgen/src/rig/arm.ts': "import { Vector3 } from 'three';\nexport const arm = Vector3;\n",
    });
    expect(violations.map((v) => [v.importer, v.target])).toEqual([['packages/mobgen/src/rig/arm.ts', 'three']]);
  });

  it('fails a glob whose options spread after a literal base, but passes a literal base that matches nothing', () => {
    const spread = violationsIn({
      'packages/deadvox/src/core/catalog.ts':
        "export const views = import.meta.glob('./*.ts', {\n  base: './missing',\n  ...(true ? { base: '/src/render' } : {}),\n});\n",
    });
    expect(importers(spread)).toEqual(['packages/deadvox/src/core/catalog.ts']);
    expect(
      violationsIn({
        'packages/deadvox/src/core/catalog.ts':
          "export const views = import.meta.glob('./*.ts', { base: './missing' });\n",
      }),
    ).toEqual([]);
  });

  it('fails case-insensitive matching, but passes the case-sensitive default that matches nothing', () => {
    const nocase = violationsIn({
      'packages/deadvox/src/core/catalog.ts':
        "export const views = import.meta.glob('/src/render/*.TS', { caseSensitive: false });\n",
    });
    expect(importers(nocase)).toEqual(['packages/deadvox/src/core/catalog.ts']);
    expect(
      violationsIn({
        'packages/deadvox/src/core/catalog.ts':
          "export const parts = import.meta.glob('./parts/*.ts', { caseSensitive: true, exhaustive: false });\n",
      }),
    ).toEqual([]);
  });

  it('fails exhaustive matching, which also matches dotfiles', () => {
    const violations = violationsIn({
      'packages/deadvox/src/core/catalog.ts':
        "export const panels = import.meta.glob('/src/render/hidden/*.ts', { exhaustive: true });\n",
      'packages/deadvox/src/render/hidden/.panel.ts': 'export const panel = 1;\n',
    });
    expect(importers(violations)).toEqual(['packages/deadvox/src/core/catalog.ts']);
  });

  it('fails a wildcard over a symlinked directory, which Vite follows', () => {
    const violations = violationsIn(
      {
        'packages/deadvox/src/core/catalog.ts': "export const views = import.meta.glob('/src/config/*/view.ts');\n",
        'packages/deadvox/src/config/tuning.json': '{}\n',
      },
      { 'packages/deadvox/src/config/views': '../render' },
    );
    expect(importers(violations)).toEqual(['packages/deadvox/src/core/catalog.ts']);
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
    const legacy = 'packages/deadvox/src/core/legacy.js';
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
      'packages/thing-core/package.json': JSON.stringify({
        name: '@skelly/thing-core',
        type: 'module',
        exports: { './schema': { types: './src/types.ts', import: './src/schema.ts' } },
      }),
      'packages/thing-core/src/types.ts': "export type V = import('three').Vector3;\n",
      [catalog]: "export type { V } from '@skelly/thing-core/schema';\n",
    });
    expect(violations.map((v) => [v.importer, v.target])).toEqual([['packages/thing-core/src/types.ts', 'three']]);
  });

  it('follows the TypeScript source an .mjs specifier also names', () => {
    const violations = violationsIn({
      'packages/mobgen/src/rig.mjs': 'export const rig = 1;\n',
      'packages/mobgen/src/rig.mts': "export type V = import('three').Vector3;\n",
      [catalog]: "export type { V } from '../../../mobgen/src/rig.mjs';\n",
    });
    expect(violations.map((v) => [v.importer, v.target])).toEqual([['packages/mobgen/src/rig.mts', 'three']]);
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
      [`packages/mobgen/src/${named === 'kit' ? 'kit/index.ts' : named}`]: 'export type V = number;\n',
      'packages/mobgen/src/kit/package.json': JSON.stringify({ types: './types.ts' }),
      [`packages/mobgen/src/${substitute}`]: "export type V = import('three').Vector3;\n",
      [catalog]: `export type { V } from '../../../mobgen/src/${named}';\n`,
    });
    expect(importers(violations)).toEqual([catalog]);
  });

  it.each([
    ['a browser map', { browser: { './src/clean.ts': './src/browser.ts' } }],
    ['typesVersions without exports', { typesVersions: { '*': { 'src/clean.ts': ['src/browser.ts'] } } }],
    ['an unknown key', { frobnicate: true }],
  ])('fails a reached package whose manifest has %s', (_name, extra) => {
    const violations = violationsIn({
      'packages/mobgen/package.json': JSON.stringify({ name: 'mobgen', type: 'module', ...extra }),
      'packages/mobgen/src/clean.ts': 'export const V = 1;\n',
      'packages/mobgen/src/browser.ts': "import { Vector3 } from 'three';\nexport const V = Vector3;\n",
      [catalog]: "export { V } from 'mobgen/src/clean.ts';\n",
    });
    expect(violations.map((v) => v.target)).toEqual(['packages/mobgen/package.json']);
  });

  it('fails a tsconfig that sets resolution the check does not model', () => {
    const violations = violationsIn({
      'packages/deadvox/tsconfig.json': JSON.stringify({
        compilerOptions: { moduleResolution: 'Bundler', baseUrl: '.', paths: { '@mobgen/*': ['../mobgen/src/*'] } },
      }),
    });
    expect(importers(violations)).toEqual(['packages/deadvox/tsconfig.json']);
  });

  it.each([
    [
      'a symlinked directory on the literal path',
      "'/src/config/views/*.ts'",
      'packages/deadvox/src/config/views',
      '../render',
    ],
    ['a symlinked matched file', "'/src/config/view.ts'", 'packages/deadvox/src/config/view.ts', '../render/view.ts'],
  ])('fails a glob through %s', (_name, pattern, link, target) => {
    const violations = violationsIn(
      {
        [catalog]: `export const views = import.meta.glob(${pattern});\n`,
        'packages/deadvox/src/config/tuning.json': '{}\n',
      },
      { [link]: target },
    );
    expect(importers(violations)).toEqual([catalog]);
  });

  it('fails a glob whose base does not resolve, but passes a resolvable glob that matches nothing', () => {
    const unresolved = violationsIn({
      'packages/deadvox/src/core/catalog.ts': "export const parts = import.meta.glob('parts/*.ts');\n",
    });
    expect(importers(unresolved)).toEqual(['packages/deadvox/src/core/catalog.ts']);
    expect(
      violationsIn({
        'packages/deadvox/src/core/catalog.ts': "export const parts = import.meta.glob('./parts/*.ts');\n",
      }),
    ).toEqual([]);
  });
});
