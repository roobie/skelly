import { describe, expect, it } from 'vitest';
import { generateValid } from '../src/core/generate.ts';
import { applyPoint } from '../src/core/math.ts';
import { boneTransforms } from '../src/core/pose.ts';
import {
  advanceClock,
  corners,
  createGaitCache,
  footRestExtents,
  type GaitBasis,
  type GaitClock,
  IDLE_BLEND_SPEED_MPS,
  INITIAL_CLOCK,
  legGeometryFor,
  stepLengthMeters,
  strideCap,
  strideLength,
  walkPose,
} from '../src/mob/gait.ts';
import type { HumanoidParams } from '../src/mob/humanoid.ts';
import { idleBasePose } from '../src/mob/idle.ts';
import { type StepStyle, stepPlanFor } from '../src/mob/steps.ts';
import { HUMANOID_TEMPLATES as TEMPLATES } from '../src/mob/templates.ts';
import { sweepGroup } from './sweeps.ts';

const SPEEDS = [0.8, 2.8]; // deadvox shamblers: wander / chase

const setup = (name: string, seed = 1) => {
  const t = TEMPLATES.find((x) => x.name === name)!;
  const found = generateValid(t, seed)!;
  const { body, voxels } = found.realized;
  const extents = footRestExtents(body.bones, voxels);
  return { body, voxels, extents, params: found.genome.params as HumanoidParams, seed: found.genome.seed };
};

/**
 * The actual ground-contact point: the centroid of whichever of the foot's 8 rest-extent corners are
 * (near-)tied for the lowest *posed* Y. `transforms` must come from boneTransforms(bones, pose) — the
 * root bone's own transform already bakes pose.root into every bone below it, world X included, so no
 * further offset is added here. This has to be dynamic, not a fixed rest-pose corner set, since the
 * heel-toe roll deliberately tilts the sole during stance: the true contact is the heel corners at
 * heel-strike, the toe corners at push-off, and all 4 bottom corners (tied) in between — averaging
 * whichever corners are currently lowest (within a small epsilon, so a genuine 4-way tie doesn't collapse
 * to one arbitrarily chosen corner) tracks that roll correctly instead of measuring a fixed, partly-airborne
 * set of corners.
 */
const contactPoint = (
  extents: ReturnType<typeof setup>['extents'],
  footBone: string,
  transforms: ReturnType<typeof boneTransforms>,
): readonly [number, number, number] => {
  const t = transforms.get(footBone)!;
  const extent = extents.get(footBone)!;
  const posed = corners(extent).map((c) => applyPoint(t, c));
  const minY = Math.min(...posed.map((p) => p[1]));
  const lowest = posed.filter((p) => p[1] <= minY + 1e-6);
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const p of lowest) {
    sx += p[0];
    sy += p[1];
    sz += p[2];
  }
  const n = lowest.length;
  return [sx / n, sy / n, sz / n];
};

describe('walkPose', () => {
  it('speed 0 gives a still standing pose regardless of clock', () => {
    const { body, voxels, extents, params } = setup('shambler');
    const clocks: GaitClock[] = [
      { stepIndex: 0, progress: 0 },
      { stepIndex: 0, progress: 0.4 },
      { stepIndex: 3, progress: 0.9 },
      { stepIndex: 7, progress: 0.1 },
    ];
    const poses = clocks.map((clock) => walkPose({ bones: body.bones, extents, params, seed: 1 }, clock, 0));
    for (const pose of poses) {
      expect(pose.rotations).toEqual({});
    }
    const roots = poses.map((p) => p.root);
    expect(new Set(roots.map((r) => JSON.stringify(r))).size).toBe(1);

    // and the standing pose keeps the lowest foot point on the ground.
    const pose = poses[0]!;
    const transforms = boneTransforms(body.bones, pose);
    for (const footBone of ['foot.L', 'foot.R']) {
      const [, y] = contactPoint(extents, footBone, transforms);
      expect(Math.abs(y)).toBeLessThanOrEqual(voxels.size / 2 + 1e-9);
    }
  });

  const NumSteps = 12; // enough to see several styles per template/seed
  const SamplesPerStep = 24;

  for (const name of TEMPLATES.map((t) => t.name)) {
    it(`${name}: the lowest foot point stays within half a voxel of the ground across ${NumSteps} steps`, () => {
      const { body, voxels, extents, params, seed } = setup(name);
      for (let k = 0; k < NumSteps; k++) {
        for (let i = 0; i <= SamplesPerStep; i++) {
          const clock: GaitClock = { stepIndex: k, progress: i / SamplesPerStep };
          const pose = walkPose({ bones: body.bones, extents, params, seed }, clock, 1.5);
          const transforms = boneTransforms(body.bones, pose);
          const lowest = Math.min(
            contactPoint(extents, 'foot.L', transforms)[1],
            contactPoint(extents, 'foot.R', transforms)[1],
          );
          expect(Math.abs(lowest)).toBeLessThanOrEqual(voxels.size / 2 + 1e-6);
        }
      }
    });
  }

  /**
   * Sweeps `clocks` through walkPose and, for one *fixed* sole corner belonging to whichever side is in
   * stance at clock 0, reports whether it ever touched down (Y within `groundedY` of the ground) and the
   * largest X/Z drift between any two samples where it was grounded — i.e. did this physical point slide
   * while bearing weight. `stepLen` cancels the stance's own intentional hip-relative forward creep
   * (stanceFootTarget's flatZ, whose slope is exactly this step's length — see gait.ts): walkPose never
   * moves root.z itself (a caller, e.g. the viewer, is expected to advance the *world* by the same
   * distance externally, treadmill-style), so without this the hip walking forward over a genuinely
   * planted foot would misread as the foot sliding backward. X needs no such correction (target.x, and
   * so worldX, is constant across a stance). Assumes all `clocks` share the same stepIndex (one stance)
   * so "the stance side" is well-defined.
   */
  const maxGroundedDrift = (opts: {
    readonly setupResult: ReturnType<typeof setup>;
    readonly footBone: string;
    readonly corner: readonly [number, number, number];
    readonly speed: number;
    readonly clocks: readonly GaitClock[];
    readonly groundedY: number;
    readonly stepLen: number;
  }): { touchedDown: boolean; maxDrift: number } => {
    const { body, extents, params, seed } = opts.setupResult;
    let first: readonly [number, number, number] | undefined;
    let maxDrift = 0;
    for (const clock of opts.clocks) {
      const pose = walkPose({ bones: body.bones, extents, params, seed }, clock, opts.speed);
      const transforms = boneTransforms(body.bones, pose);
      const raw = applyPoint(transforms.get(opts.footBone)!, opts.corner);
      const point: readonly [number, number, number] = [raw[0], raw[1], raw[2] - opts.stepLen * clock.progress];
      if (point[1] > opts.groundedY) {
        continue; // lifted clear (mid-roll), not currently grounded
      }
      first ??= point;
      maxDrift = Math.max(maxDrift, Math.hypot(point[0] - first[0], point[2] - first[2]));
    }
    return { touchedDown: first !== undefined, maxDrift };
  };

  /** One step's heel/toe grounded-drift check (the stance foot — sideForStep(k-1)). Factored out of the
   * "doesn't slide" test's own `it()` to keep that under Biome's cognitive-complexity limit. */
  const stepPlantDrift = (
    found: ReturnType<typeof setup>,
    speed: number,
    k: number,
  ): { heel: ReturnType<typeof maxGroundedDrift>; toe: ReturnType<typeof maxGroundedDrift> } => {
    const { body, voxels, extents, params, seed } = found;
    const footBone = k % 2 === 1 ? 'foot.L' : 'foot.R'; // sideForStep(k-1): stance during step k
    // stanceLen = lenAt(k) * limpOf(stanceSide) — limp only shortens the right leg's own stride.
    const limp = footBone === 'foot.R' ? 1 - Math.min(1, Math.max(0, params.limp)) : 1;
    const basis: GaitBasis = { params, geomL: legGeometryFor(body.bones, extents, 'L'), speed, seed };
    const stepLen = stepLengthMeters(basis, k) * limp;
    const allCorners = corners(extents.get(footBone)!);
    const heelCorner = allCorners.reduce((a, b) => (b[2] > a[2] ? b : a));
    const toeCorner = allCorners.reduce((a, b) => (b[2] < a[2] ? b : a));
    const clocks = Array.from({ length: 33 }, (_, i): GaitClock => ({ stepIndex: k, progress: i / 32 }));
    const groundedY = voxels.size;
    return {
      heel: maxGroundedDrift({ setupResult: found, footBone, corner: heelCorner, speed, clocks, groundedY, stepLen }),
      toe: maxGroundedDrift({ setupResult: found, footBone, corner: toeCorner, speed, clocks, groundedY, stepLen }),
    };
  };

  const matchingStance = (
    found: ReturnType<typeof setup>,
    style: StepStyle,
    footBone: 'foot.L' | 'foot.R',
  ): number | undefined => {
    for (let step = 1; step < 24; step++) {
      const stanceFoot = step % 2 === 1 ? 'foot.L' : 'foot.R';
      if (stanceFoot === footBone && stepPlanFor(found.seed, step - 1, found.params).style === style) {
        return step;
      }
    }
    return undefined;
  };

  const driftCaseFor = (style: StepStyle, footBone: 'foot.L' | 'foot.R', speed: number) => {
    for (const template of TEMPLATES) {
      for (let seed = 0; seed < 8; seed++) {
        const found = setup(template.name, seed);
        const step = matchingStance(found, style, footBone);
        if (step !== undefined) {
          return { found, speed, step, style, footBone };
        }
      }
    }
    throw new Error(`no ${style} ${footBone} stance found in the test coverage fixture`);
  };

  const driftCases = [
    driftCaseFor('normal', 'foot.L', 0.8),
    driftCaseFor('lurch', 'foot.R', 1.4),
    driftCaseFor('stagger', 'foot.L', 2.8),
    driftCaseFor('drag', 'foot.R', 0.8),
  ];
  for (const { found, speed, step, style, footBone } of driftCases) {
    it(`${style} ${footBone}: heel and toe drift stay within one voxel through stance transitions`, () => {
      const { heel, toe } = stepPlantDrift(found, speed, step);
      expect(heel.touchedDown).toBe(true);
      expect(toe.touchedDown).toBe(true);
      expect(heel.maxDrift).toBeLessThanOrEqual(found.voxels.size);
      expect(toe.maxDrift).toBeLessThanOrEqual(found.voxels.size);
    });
  }

  sweepGroup('grounded foot drift', () => {
    const seeds = [1, 2];
    const stepsToCheck = 16;
    for (const name of TEMPLATES.map((t) => t.name)) {
      for (const speed of SPEEDS) {
        for (const seed of seeds) {
          it(`${name} seed ${seed}: grounded foot drift stays within one voxel at ${speed} m/s over ${stepsToCheck} steps`, () => {
            const found = setup(name, seed);
            let worstHeelDrift = 0;
            let worstToeDrift = 0;
            let anyHeelDown = false;
            let anyToeDown = false;
            for (let k = 0; k < stepsToCheck; k++) {
              const { heel, toe } = stepPlantDrift(found, speed, k);
              worstHeelDrift = Math.max(worstHeelDrift, heel.maxDrift);
              worstToeDrift = Math.max(worstToeDrift, toe.maxDrift);
              anyHeelDown ||= heel.touchedDown;
              anyToeDown ||= toe.touchedDown;
            }
            expect(anyHeelDown).toBe(true);
            expect(anyToeDown).toBe(true);
            expect(worstHeelDrift).toBeLessThanOrEqual(found.voxels.size);
            expect(worstToeDrift).toBeLessThanOrEqual(found.voxels.size);
          });
        }
      }
    }
  });

  for (const name of TEMPLATES.map((t) => t.name)) {
    it(`${name}: the swing foot never dips below ground across ${NumSteps} steps at 2.8 m/s (drag included)`, () => {
      const { body, voxels, extents, params, seed } = setup(name);
      for (let k = 0; k < NumSteps; k++) {
        const swingFoot = k % 2 === 0 ? 'foot.L' : 'foot.R'; // sideForStep(k): swinging during step k
        for (let i = 0; i <= 64; i++) {
          const clock: GaitClock = { stepIndex: k, progress: i / 64 };
          const pose = walkPose({ bones: body.bones, extents, params, seed }, clock, 2.8);
          const transforms = boneTransforms(body.bones, pose);
          const [, y] = contactPoint(extents, swingFoot, transforms);
          expect(y).toBeGreaterThanOrEqual(-(voxels.size / 2 + 1e-6));
        }
      }
    });
  }

  const ankleGap = (name: string, seed: number, speeds: readonly number[], steps: number): number => {
    const found = setup(name, seed);
    const { body, extents, params } = found;
    const actor = { bones: body.bones, extents, params, seed: found.seed };
    const ankleOf = (side: 'L' | 'R') => body.bones.find((bone) => bone.id === `foot.${side}`)!.head;
    let worstGap = Number.POSITIVE_INFINITY;
    for (const speed of speeds) {
      for (let k = 0; k < steps; k++) {
        for (let i = 1; i < 20; i++) {
          const pose = walkPose(actor, { stepIndex: k, progress: i / 20 }, speed);
          const transforms = boneTransforms(body.bones, pose);
          const [xL] = applyPoint(transforms.get('foot.L')!, ankleOf('L'));
          const [xR] = applyPoint(transforms.get('foot.R')!, ankleOf('R'));
          worstGap = Math.min(worstGap, Math.abs(xL - xR));
        }
      }
    }
    return worstGap;
  };

  it.each([
    ['shambler', 1, 0.8],
    ['runner', 2, 1.4],
    ['brute', 3, 2.8],
  ] as const)('%s seed %i: the swing ankle stays clear at %f m/s', (name, seed, speed) => {
    const found = setup(name, seed);
    expect(ankleGap(name, seed, [speed], 8)).toBeGreaterThan(found.voxels.size);
  });

  sweepGroup('swing ankle clearance', () => {
    for (const name of TEMPLATES.map((t) => t.name)) {
      for (const seed of [1, 2, 3, 4, 5]) {
        it(`${name} seed ${seed}: the swing ankle stays clear of the stance ankle's X`, () => {
          const found = setup(name, seed);
          expect(ankleGap(name, seed, [0.8, 1.4, 2.8], 40)).toBeGreaterThan(found.voxels.size);
        });
      }
    }
  });
});

describe('drunk shamble steps', () => {
  it('is deterministic: same (seed, step) always gives the same plan', () => {
    const { params, seed } = setup('shambler', 3);
    for (const k of [0, 1, 5, 17, 40]) {
      const a = stepPlanFor(seed, k, params);
      const b = stepPlanFor(seed, k, params);
      expect(a).toEqual(b);
    }
  });

  it('same seed always gives the same style sequence (across separate calls/order)', () => {
    const { params, seed } = setup('runner', 2);
    const forward = Array.from({ length: 20 }, (_, k) => stepPlanFor(seed, k, params).style);
    const backward = Array.from({ length: 20 }, (_, k) => stepPlanFor(seed, 19 - k, params).style).reverse();
    expect(forward).toEqual(backward);
  });

  it('the selector can reach every style with fixture-owned gait parameters', () => {
    const params = { pelvisSway: 6, limp: 1, hunch: 15, strideFactor: 1.5 } as HumanoidParams;
    const seen = new Set<StepStyle>();
    for (let seed = 0; seed < 12; seed++) {
      for (let step = 0; step < 12; step++) {
        seen.add(stepPlanFor(seed, step, params).style);
      }
    }
    expect(seen).toEqual(new Set(['normal', 'stagger', 'drag', 'lurch']));
  });

  sweepGroup('style population', () => {
    for (const name of TEMPLATES.map((t) => t.name)) {
      it(`${name}: all three styles occur within 40 steps`, () => {
        const found = setup(name, 1);
        const seen = new Set<StepStyle>();
        for (let k = 0; k < 40; k++) {
          seen.add(stepPlanFor(found.seed, k, found.params).style);
        }
        for (const style of ['stagger', 'drag', 'lurch'] as const) {
          expect(seen.has(style)).toBe(true);
        }
      });
    }
  });
});

describe('advanceClock', () => {
  it('is monotonic and lands on the same clock regardless of step size (fine vs coarse dt)', () => {
    const { body, extents, params, seed } = setup('shambler', 1);
    const speed = 1.2;
    const basis: GaitBasis = { params, geomL: legGeometryFor(body.bones, extents, 'L'), speed, seed };
    const totalDistance = 6; // metres
    let fine: GaitClock = INITIAL_CLOCK;
    const fineSteps = 5000;
    for (let i = 0; i < fineSteps; i++) {
      fine = advanceClock(fine, totalDistance / fineSteps, basis);
    }
    let coarse: GaitClock = INITIAL_CLOCK;
    const coarseSteps = 37;
    for (let i = 0; i < coarseSteps; i++) {
      coarse = advanceClock(coarse, totalDistance / coarseSteps, basis);
    }
    expect(coarse.stepIndex).toBe(fine.stepIndex);
    expect(coarse.progress).toBeCloseTo(fine.progress, 3);
  });
});

describe('strideLength', () => {
  // Canonical figure: legLen 0.75 m, ankleRestY near "ground" (0) as real body geometry has it — see
  // legGeometryFor — not near -legLen, or the roll math (rotateYZ) reads it as a near-fully-extended leg.
  const legLen = 0.75;
  const geom = {
    legLen,
    l1: legLen / 2,
    l2: legLen / 2,
    hipY: 0.14 + legLen,
    ankleRestY: 0.14,
    heelLen: 0.104,
    toeLen: 0.271,
  };
  const params = { strideFactor: 1, footLift: 0.04 } as HumanoidParams;

  it('grows with speed until geometry caps the stride', () => {
    const speeds = [0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 100];
    const cycles = speeds.map((speed) => strideLength(params, geom, speed));
    expect(cycles[0]).toBeGreaterThan(0);
    expect(cycles[1]).toBeGreaterThan(cycles[0]!);
    for (let i = 1; i < cycles.length; i++) {
      expect(cycles[i]).toBeGreaterThanOrEqual(cycles[i - 1]!);
    }
    expect(cycles.at(-1)).toBeCloseTo(strideCap(geom), 6);
  });

  it('the reach cap is independent of strideFactor (only the raw pre-cap target scales with it)', () => {
    const capA = strideLength({ ...params, strideFactor: 1 }, geom, 100);
    const capB = strideLength({ ...params, strideFactor: 3 }, geom, 100);
    expect(capB).toBeCloseTo(capA, 6);
  });

  it('never exceeds that same cap, for any strideFactor or speed', () => {
    const cap = strideLength(params, geom, 100); // speed 100 guarantees saturation
    for (const strideFactor of [0.7, 0.85, 1, 1.15, 1.4]) {
      for (const speed of [0.8, 1.4, 2.8, 6]) {
        const cycle = strideLength({ ...params, strideFactor }, geom, speed);
        expect(cycle).toBeLessThanOrEqual(cap + 1e-9);
      }
    }
  });
});

describe('strideCap/step-plan caching (per-actor GaitCache must not go stale on a different body)', () => {
  // One cache throughout — the exact scenario a stale cache would miss: a voxel-size override, a
  // re-realize, or (here) simply two unrelated bodies handed the same cache.
  const geomA = { legLen: 0.75, l1: 0.375, l2: 0.375, hipY: 0.89, ankleRestY: 0.14, heelLen: 0.104, toeLen: 0.271 };
  const geomB = { legLen: 1.05, l1: 0.525, l2: 0.525, hipY: 1.19, ankleRestY: 0.14, heelLen: 0.104, toeLen: 0.271 }; // longer leg only

  it('gives different (and larger, for the longer leg) caps for two geometries sharing one cache', () => {
    const cache = createGaitCache();
    const capA = strideCap(geomA, cache);
    const capB = strideCap(geomB, cache);
    expect(capB).toBeGreaterThan(capA);
  });

  it("a later call for the first geometry recomputes instead of returning the second geometry's cached value", () => {
    const cache = createGaitCache();
    const capA = strideCap(geomA, cache);
    strideCap(geomB, cache); // overwrites the cache's single slot with geomB's entry
    const capAAgain = strideCap(geomA, cache); // must notice geomA no longer matches what's cached
    expect(capAAgain).toBe(capA);
    expect(capAAgain).not.toBe(strideCap(geomB, cache));
  });

  it('a cache hit equals a fully uncached computation', () => {
    const cache = createGaitCache();
    strideCap(geomA, cache);
    expect(strideCap(geomA, cache)).toBe(strideCap(geomA));
  });

  it('a cloned params object still hits the same per-actor cache (params identity plays no part)', () => {
    const { body, extents, params, seed } = setup('shambler');
    const cache = createGaitCache();
    const geomL = legGeometryFor(body.bones, extents, 'L');
    const len = stepLengthMeters({ params, geomL, speed: 1.4, seed, cache }, 3);
    const plans = cache.stepPlans;
    const cap = cache.strideCap;
    expect(plans?.entries.size).toBeGreaterThan(0);
    expect(cap).toBeDefined();
    const again = stepLengthMeters({ params: structuredClone(params), geomL, speed: 1.4, seed, cache }, 3);
    expect(again).toBe(len);
    expect(cache.stepPlans).toBe(plans);
    expect(cache.strideCap).toBe(cap);
  });

  it('two actors sharing one params object but not a cache never see each other’s step plans', () => {
    const { body, extents, params } = setup('shambler');
    const geomL = legGeometryFor(body.bones, extents, 'L');
    const a = createGaitCache();
    const b = createGaitCache();
    stepLengthMeters({ params, geomL, speed: 1.4, seed: 1, cache: a }, 2);
    stepLengthMeters({ params, geomL, speed: 1.4, seed: 2, cache: b }, 2);
    expect(a.stepPlans?.seed).toBe(1);
    expect(b.stepPlans?.seed).toBe(2);
    expect(a.stepPlans).not.toBe(b.stepPlans);
  });
});

describe("walkPose's optional idle blend", () => {
  const found = (() => {
    const t = TEMPLATES.find((x) => x.name === 'shambler')!;
    return generateValid(t, 1)!;
  })();
  const { body, voxels } = found.realized;
  const extents = footRestExtents(body.bones, voxels);
  const params = found.genome.params as HumanoidParams;
  const walkActor = { bones: body.bones, extents, params, seed: found.genome.seed };
  const idle = idleBasePose(walkActor, 'slack');

  it('at speed 0, passing idle returns exactly the idle pose (never the bind pose)', () => {
    const pose = walkPose(walkActor, INITIAL_CLOCK, 0, { idle });
    expect(pose).toBe(idle);
  });

  it('at or above IDLE_BLEND_SPEED_MPS, passing idle changes nothing (matches the no-idle walk exactly)', () => {
    const clock: GaitClock = { stepIndex: 2, progress: 0.4 };
    const withIdle = walkPose(walkActor, clock, IDLE_BLEND_SPEED_MPS, { idle });
    const without = walkPose(walkActor, clock, IDLE_BLEND_SPEED_MPS);
    expect(withIdle).toEqual(without);
  });

  it('between 0 and IDLE_BLEND_SPEED_MPS, blends: strictly between the pure walk and pure idle pose', () => {
    const clock: GaitClock = { stepIndex: 1, progress: 0.5 };
    const speed = IDLE_BLEND_SPEED_MPS / 2;
    const walked = walkPose(walkActor, clock, speed);
    const blended = walkPose(walkActor, clock, speed, { idle });
    expect(blended).not.toEqual(walked);
    expect(blended).not.toEqual(idle);
    // root.y should land strictly between the two endpoints' own root.y (weight 0.5 at the ramp's midpoint).
    const lo = Math.min(walked.root[1], idle.root[1]);
    const hi = Math.max(walked.root[1], idle.root[1]);
    expect(blended.root[1]).toBeGreaterThan(lo);
    expect(blended.root[1]).toBeLessThan(hi);
  });
});
