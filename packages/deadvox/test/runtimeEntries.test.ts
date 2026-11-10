import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENTRY_POLICY, entryViolations } from '../tools/runtimeEntries.ts';

type Tree = Record<string, string>;
// From a deadvox source directory up to `packages/`; built, not literal, since the import-boundary scan reads literals.
const UP_TO_PACKAGES = '../'.repeat(3);

// Product code that reaches the runtime and presentation packages only through an entry: by package name in
// static, type-only and dynamic imports, and by the entry's file from the Tiled extension, which runs without an
// install. Package files import each other.
const cleanTree: Tree = {
  'packages/engine/package.json': JSON.stringify({
    name: '@skelly/engine',
    exports: { './sim': './src/sim.ts', './internal/*': { 'skelly-test': './src/*' } },
  }),
  'packages/engine/src/core/rule.ts': 'export const rule = 1;\n',
  'packages/engine/src/core/inner.ts': "import { rule } from './rule.ts';\nexport const inner = rule;\n",
  'packages/engine/src/sim.ts': "export { rule } from './core/rule.ts';\n",
  'packages/presentation/package.json': JSON.stringify({
    name: '@skelly/presentation',
    exports: { './render': './src/render.ts', './internal/*': { 'skelly-test': './src/*' } },
  }),
  'packages/presentation/src/render/glow.ts': 'export const glow = 1;\nexport const glowForTests = 2;\n',
  'packages/presentation/src/ui/panel.ts': "import { glow } from '../render/glow.ts';\nexport const panel = glow;\n",
  'packages/presentation/src/render.ts': "export { glow } from './render/glow.ts';\n",
  'packages/deadvox/src/debug/view.ts':
    "import { rule } from '@skelly/engine/sim';\nimport type { rule as Rule } from '@skelly/engine/sim';\nexport const view = (r: typeof Rule) => [rule, r, import('@skelly/engine/sim')];\n",
  'packages/deadvox/tools/report.mjs': "export const report = () => import('@skelly/engine/sim');\n",
  'packages/deadvox/maps/extensions/map.mjs': `export { rule } from '${UP_TO_PACKAGES}engine/src/sim.ts';\n`,
  'packages/deadvox/src/main.ts': "import { glow } from '@skelly/presentation/render';\nexport const page = glow;\n",
};

function violationsIn(changes: Tree) {
  const root = mkdtempSync(join(tmpdir(), 'deadvox-entries-'));
  try {
    for (const [path, source] of Object.entries({ ...cleanTree, ...changes })) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), source);
    }
    return entryViolations(root, ENTRY_POLICY);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe('runtime entries', () => {
  it('keeps every product file on the curated entries', () => {
    expect(entryViolations(fileURLToPath(new URL('../../..', import.meta.url)), ENTRY_POLICY)).toEqual([]);
  });

  it('passes product code that imports only entries, while package files import each other', () => {
    expect(violationsIn({})).toEqual([]);
  });

  it.each([
    ['the runtime', '@skelly/engine/internal/core/rule.ts'],
    ['presentation', '@skelly/presentation/internal/render/glow.ts'],
  ])('fails a product file that imports the test-only subpath of %s', (_name, specifier) => {
    expect(
      violationsIn({
        'packages/deadvox/src/debug/hud.ts': `import { glow } from '${specifier}';\nexport const hud = glow;\n`,
      }),
    ).toEqual([
      {
        importer: 'packages/deadvox/src/debug/hud.ts',
        specifier,
        reason: 'imports a package subpath that is not an entry',
      },
    ]);
  });

  it.each([
    ['the runtime', `${UP_TO_PACKAGES}engine/src/core/rule.ts`],
    ['presentation', `${UP_TO_PACKAGES}presentation/src/render/glow.ts`],
  ])('fails a product file that imports a %s file by path', (_name, specifier) => {
    expect(
      violationsIn({
        'packages/deadvox/src/debug/step.ts': `import { rule } from '${specifier}';\nexport const step = rule;\n`,
      }),
    ).toEqual([
      {
        importer: 'packages/deadvox/src/debug/step.ts',
        specifier,
        reason: 'imports a package file by path instead of by package name',
      },
    ]);
  });
});
