import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

function violationsIn(changes: Tree) {
  const root = mkdtempSync(join(tmpdir(), 'deadvox-closure-'));
  try {
    for (const [path, source] of Object.entries({ ...cleanTree, ...changes })) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), source);
    }
    return runtimeClosureViolations(root, STAGE_ONE_POLICY);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const importers = (violations: ReturnType<typeof violationsIn>) => violations.map((v) => v.importer);

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
