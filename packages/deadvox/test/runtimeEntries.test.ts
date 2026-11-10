import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENTRY_POLICY, entryViolations } from '../tools/runtimeEntries.ts';

type Tree = Record<string, string>;
// From a deadvox source directory up to `packages/`; built, not literal, since the import-boundary scan reads literals.
const UP_TO_PACKAGES = '../'.repeat(3);

// Product code that reaches the runtime package only through an entry: by package name in static, type-only and
// dynamic imports, and by the entry's file from the Tiled extension, which runs without an install.
const cleanTree: Tree = {
  'packages/engine/package.json': JSON.stringify({
    name: '@skelly/engine',
    exports: { './sim': './src/sim.ts', './internal/*': { 'skelly-engine-test': './src/*' } },
  }),
  'packages/engine/src/core/rule.ts': 'export const rule = 1;\n',
  'packages/engine/src/core/inner.ts': "import { rule } from './rule.ts';\nexport const inner = rule;\n",
  'packages/engine/src/sim.ts': "export { rule } from './core/rule.ts';\n",
  'packages/deadvox/src/render/view.ts':
    "import { rule } from '@skelly/engine/sim';\nimport type { rule as Rule } from '@skelly/engine/sim';\nexport const view = (r: typeof Rule) => [rule, r, import('@skelly/engine/sim')];\n",
  'packages/deadvox/tools/report.mjs': "export const report = () => import('@skelly/engine/sim');\n",
  'packages/deadvox/maps/extensions/map.mjs': `export { rule } from '${UP_TO_PACKAGES}engine/src/sim.ts';\n`,
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

  it('passes product code that imports only entries, while runtime files import each other', () => {
    expect(violationsIn({})).toEqual([]);
  });

  it('fails a product file that imports the test-only subpath', () => {
    expect(
      violationsIn({
        'packages/deadvox/src/ui/hud.ts':
          "import { rule } from '@skelly/engine/internal/core/rule.ts';\nexport const hud = rule;\n",
      }),
    ).toEqual([
      {
        importer: 'packages/deadvox/src/ui/hud.ts',
        specifier: '@skelly/engine/internal/core/rule.ts',
        reason: 'imports a runtime subpath that is not an entry',
      },
    ]);
  });

  it('fails a product file that imports a runtime file by path', () => {
    expect(
      violationsIn({
        'packages/deadvox/src/presentation/step.ts': `import { rule } from '${UP_TO_PACKAGES}engine/src/core/rule.ts';\nexport const step = rule;\n`,
      }),
    ).toEqual([
      {
        importer: 'packages/deadvox/src/presentation/step.ts',
        specifier: `${UP_TO_PACKAGES}engine/src/core/rule.ts`,
        reason: 'imports a runtime file by path instead of by package name',
      },
    ]);
  });
});
