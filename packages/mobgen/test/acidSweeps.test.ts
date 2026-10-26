import { beforeAll, expect, it } from 'vitest';
import { generate, generateValid, realize, type ValidGeneration } from '../src/core/generate.ts';
import { organicRead, silhouetteMasks } from '../src/mob/acidMeasurements.ts';
import { acidTemplate } from '../src/mob/acidTemplate.ts';
import { sweepGroup } from './sweeps.ts';

const quantile = (values: readonly number[], fraction: number): number =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)]!;
const iou = (a: ReadonlySet<string>, b: ReadonlySet<string>): number => {
  let intersection = 0;
  for (const cell of a) {
    if (b.has(cell)) {
      intersection += 1;
    }
  }
  return intersection / (a.size + b.size - intersection);
};

sweepGroup('acid population measurements', () => {
  const config = acidTemplate.sweep;
  const sheet: ValidGeneration[] = [];
  beforeAll(() => {
    let nextSeed = 1;
    for (let index = 0; index < config.sheetCount; index++) {
      const generated = generateValid(acidTemplate, nextSeed);
      if (!generated) {
        throw new Error(`acid sheet cannot realize seed ${nextSeed}`);
      }
      sheet.push(generated);
      // Retries must not duplicate a winning genome and turn its pairwise IoU into one.
      nextSeed = generated.seed + 1;
    }
  });

  it('raw population cost quantiles fit the authored ranges without filtering validation failures', () => {
    const samples = Array.from(
      { length: config.count },
      (_, seed) => realize(generate(acidTemplate, seed)).report.stats,
    );
    expect(samples.length).toBeGreaterThan(1);
    const costs = {
      totalVoxels: samples.map((sample) => sample.voxels),
      totalTriangles: samples.map((sample) => sample.triangles),
      ...Object.fromEntries(
        Object.entries(acidTemplate.budgets.groups).map(([name, group]) => [
          name,
          samples.map((sample) =>
            Object.entries(sample.perBoneVoxels)
              .filter(([id]) =>
                group.bones.some((pattern) =>
                  pattern.endsWith('*') ? id.startsWith(pattern.slice(0, -1)) : id === pattern,
                ),
              )
              .reduce((sum, [, amount]) => sum + amount, 0),
          ),
        ]),
      ),
    };
    for (const [name, bounds] of Object.entries({
      totalVoxels: acidTemplate.budgets.totalVoxels,
      totalTriangles: acidTemplate.budgets.totalTriangles,
      ...acidTemplate.budgets.groups,
    })) {
      const values = costs[name as keyof typeof costs]!;
      expect(quantile(values, config.lowerQuantile), name).toBeGreaterThanOrEqual(bounds.min);
      expect(quantile(values, config.upperQuantile), name).toBeLessThanOrEqual(bounds.max);
    }
  });

  it('the valid sheet retains front and side silhouette spread', () => {
    const masks = sheet.map((result) => silhouetteMasks(result.realized));
    expect(masks.length).toBeGreaterThan(1);
    for (let first = 0; first < masks.length; first++) {
      for (let second = first + 1; second < masks.length; second++) {
        for (const view of ['front', 'side'] as const) {
          expect(iou(masks[first]![view], masks[second]![view])).toBeLessThanOrEqual(config.maximumIoU);
        }
      }
    }
  });

  it.each(Array.from({ length: config.sheetCount }, (_, index) => index))(
    'valid sheet row %i retains the organic shape gates after height refitting',
    (index) => {
      const result = sheet[index]!;
      const read = organicRead(result.realized.body, result.genome, acidTemplate);
      expect(read.trunk.chest.passes).toBe(true);
      expect(read.trunk.belly.passes).toBe(true);
      expect(read.back.passes).toBe(true);
      expect(read.joints.every((joint) => joint.passes)).toBe(true);
      expect(read.arms.every((arm) => arm.arm.passes && arm.fore.passes && arm.palmPasses)).toBe(true);
    },
  );
});
