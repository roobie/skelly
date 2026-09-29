import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('reports malformed input and a bad asset path as messages', () => {
    expect(exportFileText('{nope', ASSET)).toMatchObject({ ok: false });
    const bad = exportFileText(read('designs', 'archetype-ar'), { id: 'x', file: 'assets/models/X.glb' });
    expect(bad).toMatchObject({ ok: false, message: expect.stringContaining('invalid-asset-file') });
  });
});
