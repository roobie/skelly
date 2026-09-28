import { describe, expect, it } from 'vitest';
import { generate, generateValid, realize } from '../src/core/generate.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const SEEDS = 100;

/** FNV-1a over owner + colour: fingerprints the actual voxel grid, not the genome (mirrors
 * src/cli/stats.ts's hashVoxels — two genomes can render the same shape, and vice versa). */
const hashVoxels = (owner: Uint8Array, color: Uint8Array): string => {
  let h = 0x81_1c_9d_c5;
  for (const b of owner) {
    h = Math.imul(h ^ b, 0x01_00_01_93);
  }
  for (const b of color) {
    h = Math.imul(h ^ b, 0x01_00_01_93);
  }
  return (h >>> 0).toString(16);
};

describe('generate', () => {
  it('is deterministic: same seed, same genome', () => {
    for (const t of TEMPLATES) {
      expect(generate(t, 42)).toEqual(generate(t, 42));
    }
  });

  it('is deterministic: same genome, identical voxel arrays', () => {
    for (const t of TEMPLATES) {
      const genome = generate(t, 42);
      const a = realize(genome).voxels;
      const b = realize(genome).voxels;
      expect(a.dims).toEqual(b.dims);
      expect(a.origin).toEqual(b.origin);
      expect([...a.owner]).toEqual([...b.owner]);
      expect([...a.color]).toEqual([...b.color]);
    }
  });

  it('varies with the seed', () => {
    for (const t of TEMPLATES) {
      const keys = new Set(Array.from({ length: 50 }, (_, seed) => JSON.stringify(generate(t, seed).params)));
      expect(keys.size).toBeGreaterThan(40);
    }
  });
});

describe('templates', () => {
  for (const t of TEMPLATES) {
    describe(t.name, () => {
      it(`is valid at least half the time (${SEEDS} seeds)`, () => {
        let valid = 0;
        for (let seed = 0; seed < SEEDS; seed++) {
          if (realize(generate(t, seed)).report.ok) {
            valid += 1;
          }
        }
        expect(valid / SEEDS).toBeGreaterThanOrEqual(0.5);
      });

      it('generateValid finds a passing build', () => {
        const found = generateValid(t, 1000)!;
        expect(found).toBeDefined();
        expect(found.report.ok).toBe(true);
        expect(found.seed).toBe(1000 + found.attempts - 1);
        expect(found.genome).toEqual(generate(t, found.seed));
      });
    });
  }

  it('shambler head+jaw voxel count is within the template budget on average', () => {
    const t = TEMPLATES.find((x) => x.name === 'shambler')!;
    let sum = 0;
    for (let seed = 0; seed < SEEDS; seed++) {
      const { report } = realize(generate(t, seed));
      sum += (report.stats.perBoneVoxels.head ?? 0) + (report.stats.perBoneVoxels.jaw ?? 0);
    }
    const mean = sum / SEEDS;
    expect(mean).toBeGreaterThanOrEqual(35);
    expect(mean).toBeLessThanOrEqual(80);
  });

  // Known-good seeds. A snapshot change means generation changed: check the gallery in the viewer
  // (phase B) before updating (vitest -u). Mirrors gungen's generate.test.ts snapshot pattern.
  for (const t of TEMPLATES) {
    it(`${t.name}: known-good seeds (genome + voxel-grid hash)`, () => {
      const gallery = [1, 2, 3].map((seed) => {
        const found = generateValid(t, seed * 100)!;
        const { voxels } = realize(found.genome);
        return { genome: found.genome, gridHash: hashVoxels(voxels.owner, voxels.color) };
      });
      expect(gallery).toMatchSnapshot();
    });
  }
});
