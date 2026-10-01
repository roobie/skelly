import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import validator from 'gltf-validator';
import { describe, expect, it } from 'vitest';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { exportGunGlb } from '../src/gun/exportGlb.ts';

const DESIGNS = join(import.meta.dirname, '..', 'designs');
const names = readdirSync(DESIGNS)
  .filter((f) => f.endsWith('.json'))
  .sort();

// Khronos glTF-Validator over the exported binary of every published archetype design (PROJECT.md 3.4).
describe('gltf-validator', () => {
  it('finds designs to validate', () => {
    expect(names.length).toBeGreaterThanOrEqual(11);
  });

  it.each(names)('validates the export of %s with zero errors and warnings', async (file) => {
    const loaded = loadGunDesign(readFileSync(join(DESIGNS, file), 'utf8'));
    if (!loaded.ok) {
      throw new Error(`${file}: ${loaded.error.message}`);
    }
    const id = basename(file, '.json').replaceAll('-', '_');
    const result = exportGunGlb(
      loaded.design.assembly,
      { id, file: `assets/models/${id}.glb` },
      {
        variant: loaded.design.template,
        ...(loaded.design.finish ? { finish: loaded.design.finish } : {}),
      },
    );
    if (!result.ok) {
      throw new Error(`${file}: ${JSON.stringify(result.error)}`);
    }
    const report = await validator.validateBytes(result.glb, { uri: `${id}.glb` });
    const problems = report.issues.messages
      .filter((m) => m.severity <= 1)
      .map((m) => `${m.code} ${m.pointer ?? ''} ${m.message}`);
    expect(problems).toEqual([]);
    expect(report.issues.numErrors).toBe(0);
    expect(report.issues.numWarnings).toBe(0);
  });
});
