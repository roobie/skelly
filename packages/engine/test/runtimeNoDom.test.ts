import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

/** tsc's output for one runtime file compiled with the package's compiler config, the no-DOM check. */
function compile(source: string): { status: number | null; output: string } {
  const dir = mkdtempSync(join(tmpdir(), 'engine-no-dom-'));
  try {
    // The fixture finds `@types/node` where the runtime does.
    symlinkSync(join(repoRoot, 'node_modules'), join(dir, 'node_modules'), 'dir');
    writeFileSync(join(dir, 'probe.ts'), source);
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({ extends: join(packageRoot, 'tsconfig.json'), include: [], files: ['probe.ts'] }),
    );
    const result = spawnSync(process.execPath, [join(repoRoot, 'node_modules/typescript/bin/tsc'), '-p', dir], {
      encoding: 'utf8',
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('runtime no-DOM typecheck', () => {
  it('compiles runtime code that uses node globals such as performance', () => {
    expect(compile('export const now = performance.now();\n')).toEqual({ status: 0, output: '' });
  });

  it('fails a runtime file that uses document', () => {
    const { status, output } = compile('export const title = document.title;\n');
    expect(status).not.toBe(0);
    expect(output).toContain("'document'");
  });
});
