import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runtimeClosureViolations, STAGE_ONE_POLICY } from '../tools/runtimeClosure.ts';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
type Tree = Record<string, string>;

// A fixture repository laid out like the real one, whose runtime reaches only allowed targets.
const cleanTree: Tree = {
  'package.json': JSON.stringify({
    workspaces: ['packages/deadvox', 'packages/mobgen', 'packages/thing-core', 'packages/presentation'],
  }),
  'packages/deadvox/package.json': JSON.stringify({
    name: '@skelly/deadvox',
    dependencies: { '@skelly/presentation': '*' },
  }),
  'packages/deadvox/src/core/sim.ts':
    "import { rule } from './rule.ts';\nimport { pose } from '@mobgen/pose.ts';\nimport { schema } from '@skelly/thing-core/schema';\nimport { join } from 'node:path';\nexport const tick = () => [rule, pose, schema, join];\n",
  'packages/deadvox/src/core/rule.ts': 'export const rule = 1;\n',
  'packages/deadvox/src/vehicles/solid.ts': "import { rule } from '../core/rule.ts';\nexport const solid = rule;\n",
  'packages/deadvox/src/game/session.ts': "import { tick } from '../core/sim.ts';\nexport const session = tick;\n",
  'packages/deadvox/src/render/view.ts':
    "import { session } from '../game/session.ts';\nexport const view = session;\n",
  'packages/mobgen/package.json': JSON.stringify({ name: 'mobgen' }),
  'packages/mobgen/src/pose.ts': 'export const pose = 1;\n',
  'packages/thing-core/package.json': JSON.stringify({
    name: '@skelly/thing-core',
    exports: { './schema': './src/schema.ts' },
  }),
  'packages/thing-core/src/schema.ts': 'export const schema = 1;\n',
  'packages/presentation/package.json': JSON.stringify({
    name: '@skelly/presentation',
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
    // The type-position import scan also reads a literal import() call, so one edge can report twice.
    expect([...new Set(importers(violations))]).toEqual([catalog]);
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
