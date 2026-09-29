import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { exportFileText } from '../src/cli/exportFile.ts';

const read = (dir: string, name: string): string =>
  readFileSync(join(import.meta.dirname, '..', dir, `${name}.json`), 'utf8');
const ASSET = { id: 'ar', file: 'assets/models/ar.glb' } as const;

describe('export CLI core', () => {
  it('exports a design file and a fixture to the same model', () => {
    const fromDesign = exportFileText(read('designs', 'archetype-ar'), ASSET);
    const fromFixture = exportFileText(read('fixtures', 'archetype-ar'), ASSET);
    expect(fromDesign.ok && fromFixture.ok).toBe(true);
    if (fromDesign.ok && fromFixture.ok) {
      expect(fromDesign.modelEntry.file).toBe('assets/models/ar.glb');
      expect(fromDesign.modelEntry.grip.turn).toEqual(fromFixture.modelEntry.grip.turn);
    }
  });

  it('writes the glb and model entry to separate output directories when requested', () => {
    const temp = mkdtempSync(join(tmpdir(), 'gungen-export-'));
    const glbDir = join(temp, 'models');
    const entryDir = join(temp, 'entries');
    try {
      execFileSync(
        process.execPath,
        [
          join(import.meta.dirname, '../src/cli/export.ts'),
          'designs/archetype-ar.json',
          '--out',
          glbDir,
          '--entry-out',
          entryDir,
          '--id',
          'rifle_assault',
        ],
        { cwd: join(import.meta.dirname, '..') },
      );
      expect(existsSync(join(glbDir, 'rifle_assault.glb'))).toBe(true);
      expect(existsSync(join(glbDir, 'rifle_assault.model.json'))).toBe(false);
      expect(JSON.parse(readFileSync(join(entryDir, 'rifle_assault.model.json'), 'utf8'))).toMatchObject({
        id: 'rifle_assault',
        file: 'assets/models/rifle_assault.glb',
      });
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it('reports malformed input and a bad asset path as messages', () => {
    expect(exportFileText('{nope', ASSET)).toMatchObject({ ok: false });
    const bad = exportFileText(read('designs', 'archetype-ar'), { id: 'x', file: 'assets/models/X.glb' });
    expect(bad).toMatchObject({ ok: false, message: expect.stringContaining('invalid-asset-file') });
  });
});
