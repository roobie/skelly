import { describe, expect, it } from 'vitest';
import { build, generate, generateValid, realize, recommendedProfileFor } from '../src/core/generate.ts';
import { applyPoint, length, sub } from '../src/core/math.ts';
import { boneTransforms } from '../src/core/pose.ts';
import { consumableTemplate, registerTemplate } from '../src/core/template.ts';
import { cellIndex } from '../src/core/voxelize.ts';
import { corners, createGaitCache, footRestExtents, type GaitClock, walkPose } from '../src/mob/gait.ts';
import type { HumanoidParams } from '../src/mob/humanoid.ts';
import { skeletonTemplate } from '../src/mob/skeletonTemplate.ts';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** Widest run of consecutive voxels one bone owns along an axis, over every perpendicular slice.
 * hand.L hangs in the x-y plane, so its fingers separate along z; foot.L toes separate along x. */
const maxFilledRuns = (seed: number, boneId: string, axis: 'x' | 'z'): number => {
  const { body, voxels } = realize(generate(skeletonTemplate, seed));
  const [nx, ny, nz] = voxels.dims;
  const owner = body.bones.findIndex((b) => b.id === boneId)! + 1;
  const own = (i: number, j: number, k: number): boolean => voxels.owner[cellIndex(voxels.dims, i, j, k)] === owner;
  const countRuns = (n: number, filledAt: (c: number) => boolean): number => {
    let runs = 0;
    let filled = false;
    for (let c = 0; c < n; c++) {
      const here = filledAt(c);
      if (here && !filled) {
        runs += 1;
      }
      filled = here;
    }
    return runs;
  };
  let best = 0;
  const consider = (runs: number): void => {
    best = Math.max(best, runs);
  };
  if (axis === 'z') {
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        consider(countRuns(nz, (c) => own(i, j, c)));
      }
    }
  } else {
    for (let j = 0; j < ny; j++) {
      for (let k = 0; k < nz; k++) {
        consider(countRuns(nx, (c) => own(c, j, k)));
      }
    }
  }
  return best;
};

describe('skeleton template', () => {
  it('every sampled skeleton passes the full rules, budgets included, at full detail', () => {
    for (const seed of SEEDS) {
      const genome = generate(skeletonTemplate, seed);
      expect(recommendedProfileFor(genome), `seed ${seed}`).toBe('full');
      const { report } = realize(genome);
      expect(report.issues, `seed ${seed}`).toEqual([]);
      expect(report.ok).toBe(true);
    }
  });

  it('the authored thumb length sets the built thumb length', () => {
    const handCapsules = (thumbLength: number) => {
      const fixture = {
        ...skeletonTemplate,
        name: `skeleton-thumb-${thumbLength}`,
        geometry: { ...skeletonTemplate.geometry, thumbLength },
      };
      registerTemplate(fixture);
      const genome = generate(fixture, 1);
      const capsules = build(genome).features.flatMap((f) =>
        f.bone === 'hand.L' && f.shape.kind === 'capsule' ? [f.shape] : [],
      );
      return { capsules, height: genome.params.height! };
    };
    const base = skeletonTemplate.geometry.thumbLength;
    const short = handCapsules(base);
    const long = handCapsules(base * 2);
    const changed = short.capsules.flatMap((s, i) => {
      const l = long.capsules[i]!;
      return length(sub(s.b, s.a)) === length(sub(l.b, l.a)) ? [] : [length(sub(l.b, l.a))];
    });
    expect(changed).toHaveLength(1);
    expect(changed[0]).toBeCloseTo(base * 2 * long.height, 9);
  });

  it('fingers and toes read as separate digits, not a wider block', () => {
    // The digits are near the voxel size, so their axes sit on voxel columns (whole-column spacing,
    // alternating toe depth) — see mob/skeleton.ts, buildHand and buildFoot. Sampled seeds must keep
    // the digits apart: sub-column spacing merges them into a slab and the run counts drop.
    const g = skeletonTemplate.geometry;
    for (const seed of SEEDS) {
      expect(maxFilledRuns(seed, 'hand.L', 'z'), `fingers seed ${seed}`).toBeGreaterThanOrEqual(g.fingerCount);
      expect(maxFilledRuns(seed, 'foot.L', 'x'), `toes seed ${seed}`).toBeGreaterThanOrEqual(Math.ceil(g.toeCount / 2));
    }
  });

  it('refuses consumption until its game contracts are decided', () => {
    expect(() => consumableTemplate(skeletonTemplate.name)).toThrow('comparison-only');
  });

  it('the shared walk keeps the lowest foot point on the ground with its own leg layout', () => {
    const found = generateValid(skeletonTemplate, 1)!;
    const { body, voxels } = found.realized;
    const extents = footRestExtents(body.bones, voxels);
    const actor = {
      bones: body.bones,
      extents,
      params: found.genome.params as HumanoidParams,
      seed: found.genome.seed,
      cache: createGaitCache(),
    };
    const lowestOf = (footBone: string, transforms: ReturnType<typeof boneTransforms>) =>
      Math.min(...corners(extents.get(footBone)!).map((c) => applyPoint(transforms.get(footBone)!, c)[1]));
    for (let step = 0; step < 4; step++) {
      for (let i = 0; i <= 8; i++) {
        const clock: GaitClock = { stepIndex: step, progress: i / 8 };
        const transforms = boneTransforms(body.bones, walkPose(actor, clock, 0.8));
        const lowest = Math.min(lowestOf('foot.L', transforms), lowestOf('foot.R', transforms));
        expect(Math.abs(lowest)).toBeLessThanOrEqual(voxels.size / 2 + 1e-6);
      }
    }
  });
});
