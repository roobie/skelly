import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENTRY_POLICY, entryViolations } from '../tools/runtimeEntries.ts';

type Tree = Record<string, string>;

// Product code that reaches the runtime only through an entry, by static, type-only and dynamic imports.
const cleanTree: Tree = {
  'packages/deadvox/src/core/rule.ts': 'export const rule = 1;\n',
  'packages/deadvox/src/core/inner.ts': "import { rule } from './rule.ts';\nexport const inner = rule;\n",
  'packages/deadvox/src/engine/sim.ts': "export { rule } from '../core/rule.ts';\n",
  'packages/deadvox/src/render/view.ts':
    "import { rule } from '../engine/sim.ts';\nimport type { rule as Rule } from '../engine/sim.ts';\nexport const view = (r: typeof Rule) => [rule, r, import('../engine/sim.ts')];\n",
  'packages/deadvox/tools/report.mjs': "export const report = () => import('/src/engine/sim.ts');\n",
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

  it('fails a product file that imports a runtime module past the entries', () => {
    expect(
      violationsIn({
        'packages/deadvox/src/ui/hud.ts': "import { rule } from '../core/rule.ts';\nexport const hud = rule;\n",
      }),
    ).toEqual([
      {
        importer: 'packages/deadvox/src/ui/hud.ts',
        specifier: '../core/rule.ts',
        reason: 'imports a runtime module that is not an entry',
      },
    ]);
  });
});
