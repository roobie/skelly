import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { exportFileText } from '../src/cli/exportFile.ts';
import { readGlb } from './glbReader.ts';

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

  it("exports the weapon's eye point and sight axes for ADS", () => {
    const optic = exportFileText(read('designs', 'archetype-ar'), ASSET);
    const irons = exportFileText(read('fixtures', 'archetype-ak'), ASSET);
    expect(optic.ok && irons.ok).toBe(true);
    if (!(optic.ok && irons.ok)) {
      return;
    }
    expect(optic.modelEntry.sight?.kind).toBe('optic');
    expect(irons.modelEntry.sight?.kind).toBe('iron');
    for (const { sight, muzzleDirection } of [optic.modelEntry, irons.modelEntry]) {
      expect(sight).toBeDefined();
      expect(Math.hypot(...sight!.direction)).toBeCloseTo(1);
      expect(Math.hypot(...sight!.up)).toBeCloseTo(1);
      expect(Math.hypot(...muzzleDirection!)).toBeCloseTo(1);
    }
  });

  it('preserves curated AWM and bare AK fixture appearances on the file-export path', () => {
    const awm = exportFileText(read('designs', 'archetype-awm'), ASSET);
    const ak = exportFileText(read('fixtures', 'archetype-ak'), ASSET);
    expect(awm.ok && ak.ok).toBe(true);
    if (!(awm.ok && ak.ok)) {
      return;
    }
    const stockMaterials = (bytes: Uint8Array): string[] => {
      const glb = readGlb(bytes);
      const stock = glb.json.nodes.find((node) => node.extras?.part === 'stock');
      if (stock?.mesh === undefined) {
        throw new Error('exported stock mesh is missing');
      }
      return glb.json.meshes[stock.mesh]!.primitives.map(({ material }) => glb.json.materials[material]!.name!);
    };
    expect(stockMaterials(awm.glb)).toContain('#4b5836');
    expect(stockMaterials(ak.glb)).toContain('#754324');
  });

  // Measured about 1.7 s on a loaded host (load 4-10), too much of vitest's 5 s default; the explicit timeout, about 5x that, keeps it from flaking under load.
  it('preserves the generated template finish through a bare assembly file export', { timeout: 10_000 }, () => {
    for (const template of ['ak', 'pump-shotgun']) {
      const generated = execFileSync(
        process.execPath,
        [join(import.meta.dirname, '../src/cli/generate.ts'), '--template', template, '--seed', '0', '--valid'],
        { cwd: join(import.meta.dirname, '..'), encoding: 'utf8', timeout: 300_000 },
      );
      const output = JSON.parse(generated) as { appearance?: unknown };
      expect(output.appearance).toEqual({ variant: template });

      const exported = exportFileText(generated, ASSET);
      expect(exported.ok).toBe(true);
      if (!exported.ok) {
        continue;
      }
      const glb = readGlb(exported.glb);
      const stock = glb.json.nodes.find((node) => node.extras?.part === 'stock');
      expect(stock?.mesh).toBeDefined();
      // Display-group merging can put the separate rubber pad first. Identify
      // the wood by its semantic slot, not incidental primitive ordering.
      const primitive = glb.json.meshes[stock!.mesh!]!.primitives.find((p) => p.extras?.slot === 'furniture');
      expect(primitive).toBeDefined();
      expect(primitive?.extras).toMatchObject({ material: 'wood-walnut', slot: 'furniture' });
      expect(glb.json.materials[primitive!.material]!.name).toBe('#754324');
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

  it('resolves the CLI calibre option to a real cartridge-data entry', () => {
    const temp = mkdtempSync(join(tmpdir(), 'gungen-export-ammo-'));
    try {
      execFileSync(
        process.execPath,
        [
          join(import.meta.dirname, '../src/cli/export.ts'),
          'designs/archetype-ak-akm.json',
          '--out',
          temp,
          '--id',
          'ak_test',
          '--calibre',
          '7.62x39',
        ],
        { cwd: join(import.meta.dirname, '..') },
      );
      const entry = JSON.parse(readFileSync(join(temp, 'ak_test.model.json'), 'utf8')) as {
        calibre: string;
        anchors?: Record<string, number[]>;
        slots?: { magazine?: { node: string; at: number[]; turn: number[] } };
      };
      expect(entry.calibre).toBe('7.62x39');
      expect(entry.anchors?.magwell).toBeUndefined();
      expect(entry.slots?.magazine?.node).toBeTruthy();
      expect(entry.slots?.magazine?.at).toHaveLength(3);
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
