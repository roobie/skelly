import { describe, expect, it } from 'vitest';
import { build, generateValid } from '../src/core/generate.ts';
import { applyPoint, type Mat3 } from '../src/core/math.ts';
import { boneTransforms } from '../src/core/pose.ts';
import { voxelize } from '../src/core/voxelize.ts';
import { corners, footRestExtents, legGeometryFor, strideLength, walkPose } from '../src/mob/gait.ts';
import type { HumanoidParams } from '../src/mob/humanoid.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const SPEEDS = [0.8, 2.8]; // deadvox shamblers: wander / chase (PROJECT.md)

const setup = (name: string, seed = 1) => {
  const t = TEMPLATES.find((x) => x.name === name)!;
  const found = generateValid(t, seed)!;
  const body = build(found.genome);
  const voxels = voxelize(body, found.genome.voxelSize, found.genome.seed);
  const extents = footRestExtents(body.bones, voxels);
  return { body, voxels, extents, params: found.genome.params as HumanoidParams };
};

/**
 * The actual ground-contact point: the centroid of whichever of the foot's 8 rest-extent corners are
 * (near-)tied for the lowest *posed* Y, transformed by `pose`, plus a constant world offset (the root's
 * own forward advance — walkPose only solves the vertical bob; see gait.ts). This has to be dynamic,
 * not a fixed rest-pose corner set, now that gait.ts's heel-toe roll deliberately tilts the sole during
 * stance: the true contact is the heel corners at heel-strike, the toe corners at push-off, and all 4
 * bottom corners (tied) in between — averaging whichever corners are currently lowest (within a small
 * epsilon, so a genuine 4-way tie doesn't collapse to one arbitrarily-chosen corner) tracks that roll
 * correctly instead of measuring a fixed, partly-airborne set of corners.
 */
const contactPoint = (
  extents: ReturnType<typeof setup>['extents'],
  footBone: string,
  transforms: ReturnType<typeof boneTransforms>,
  worldOffset: readonly [number, number, number],
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
  return [sx / n + worldOffset[0], sy / n + worldOffset[1], sz / n + worldOffset[2]];
};

/**
 * Transforms one *fixed* rest-extent corner (not dynamically re-picked) and adds `worldOffset`. Used to
 * track a single physical point of the sole — e.g. the heel or toe corner specifically — across a
 * whole stance, which `contactPoint`'s "whichever corners are currently lowest" can't do: the *set* of
 * tied-lowest corners changes size at the heel-toe roll's handoffs (2 corners touching down to 4, or 4
 * to 2), and averaging a changing set shifts the centroid by a real, foot-length-scale amount even when
 * no individual corner slides — that's an artifact of averaging a changing contact area, not sliding.
 */
const fixedCornerPoint = (
  transforms: ReturnType<typeof boneTransforms>,
  footBone: string,
  corner: readonly [number, number, number],
  worldOffset: readonly [number, number, number],
): readonly [number, number, number] => {
  const p = applyPoint(transforms.get(footBone)!, corner);
  return [p[0] + worldOffset[0], p[1] + worldOffset[1], p[2] + worldOffset[2]];
};

/**
 * Sweeps `phases` through `walkPose` and, for one fixed sole corner, reports whether it ever touched
 * down (Y within `groundedY` of the ground) and the largest X/Z drift between any two samples where it
 * was grounded — i.e. did this single physical point slide while bearing weight. Factored out of the
 * planted-foot test below, whose own `it()` does the asserting, to keep that test under Biome's
 * cognitive-complexity limit.
 */
const maxGroundedDrift = (opts: {
  readonly setupResult: ReturnType<typeof setup>;
  readonly corner: readonly [number, number, number];
  readonly speed: number;
  readonly stride: number;
  readonly phases: readonly number[];
  readonly groundedY: number;
}): { touchedDown: boolean; maxDrift: number } => {
  const { body, extents, params } = opts.setupResult;
  let first: readonly [number, number, number] | undefined;
  let maxDrift = 0;
  for (const phase of opts.phases) {
    const pose = walkPose({ bones: body.bones, extents, params }, phase, opts.speed);
    const transforms = boneTransforms(body.bones, pose);
    const point = fixedCornerPoint(transforms, 'foot.L', opts.corner, [0, 0, -phase * opts.stride]);
    if (point[1] > opts.groundedY) {
      continue; // lifted clear (mid-roll), not currently grounded
    }
    first ??= point;
    maxDrift = Math.max(maxDrift, Math.hypot(point[0] - first[0], point[2] - first[2]));
  }
  return { touchedDown: first !== undefined, maxDrift };
};

describe('walkPose', () => {
  it('speed 0 gives a still standing pose regardless of phase', () => {
    const { body, voxels, extents, params } = setup('shambler');
    const poses = [0, 0.1, 0.37, 0.99].map((phase) => walkPose({ bones: body.bones, extents, params }, phase, 0));
    for (const pose of poses) {
      expect(pose.rotations).toEqual({});
    }
    const roots = poses.map((p) => p.root);
    expect(new Set(roots.map((r) => JSON.stringify(r))).size).toBe(1);

    // and the standing pose keeps the lowest foot point on the ground.
    const pose = poses[0]!;
    const transforms = boneTransforms(body.bones, pose);
    for (const footBone of ['foot.L', 'foot.R']) {
      const [, y] = contactPoint(extents, footBone, transforms, [0, 0, 0]);
      expect(Math.abs(y)).toBeLessThanOrEqual(voxels.size / 2 + 1e-9);
    }
  });

  for (const name of TEMPLATES.map((t) => t.name)) {
    it(`${name}: the lowest foot point stays within half a voxel of the ground at every phase`, () => {
      const { body, voxels, extents, params } = setup(name);
      for (let i = 0; i < 32; i++) {
        const phase = i / 32;
        const pose = walkPose({ bones: body.bones, extents, params }, phase, 1.5);
        const transforms = boneTransforms(body.bones, pose);
        const lowest = Math.min(
          contactPoint(extents, 'foot.L', transforms, [0, 0, 0])[1],
          contactPoint(extents, 'foot.R', transforms, [0, 0, 0])[1],
        );
        expect(Math.abs(lowest)).toBeLessThanOrEqual(voxels.size / 2 + 1e-6);
      }
    });
  }

  // 5 genomes per template: a longer stride (this change) pushes the leg IK closer to full
  // extension (see strideLength's doc comment), and that reach margin depends on each genome's
  // sampled legLength/kneeBend/strideFactor, so one seed isn't enough to trust the cap.
  const seeds = [1, 2, 3, 4, 5];
  for (const name of TEMPLATES.map((t) => t.name)) {
    for (const speed of SPEEDS) {
      for (const seed of seeds) {
        it(`${name} seed ${seed}: the planted foot doesn't slide at ${speed} m/s`, () => {
          const found = setup(name, seed);
          const { body, voxels, extents, params } = found;
          const stride = strideLength(params, legGeometryFor(body.bones, extents, 'L'), speed);

          // Heel corner (rest-pose max Z: furthest behind the ankle) and toe corner (min Z), each
          // tracked only while actually grounded — heel from heel-strike through flat, toe from flat
          // through push-off (gait.ts's heel-toe roll). Each is a single fixed point on the sole, so —
          // unlike averaging whichever corners currently read as lowest (contactPoint, used elsewhere
          // in this file) — its own drift while grounded is exactly "did this physical point slide",
          // with no averaging-a-changing-set artifact.
          const allCorners = corners(extents.get('foot.L')!);
          const heelCorner = allCorners.reduce((a, b) => (b[2] > a[2] ? b : a));
          const toeCorner = allCorners.reduce((a, b) => (b[2] < a[2] ? b : a));

          // The left leg's stance is phase in [0, 0.5) directly (see gait.ts's legPhaseOf). Phase
          // advances with distance travelled, so the root's own forward position at a given phase
          // is exactly phase * stride (walkPose's own root only carries the vertical bob) — hence
          // maxGroundedDrift's own worldOffset of -phase*stride.
          const phases = Array.from({ length: 33 }, (_, i) => (i / 32) * 0.5); // heel-strike to push-off
          const groundedY = voxels.size; // "touching the ground" vs. clearly lifted mid-roll (many cm)
          const heel = maxGroundedDrift({ setupResult: found, corner: heelCorner, speed, stride, phases, groundedY });
          const toe = maxGroundedDrift({ setupResult: found, corner: toeCorner, speed, stride, phases, groundedY });

          // Sanity check first: both corners actually touched down somewhere in this sweep (otherwise
          // the drift checks below would be silently checking nothing).
          expect(heel.touchedDown).toBe(true);
          expect(toe.touchedDown).toBe(true);
          // 0.6 voxel: measured worst case (all templates, seeds 1-10) is ~45% of a voxel, at 2.8 m/s
          // where the longest strides push closest to full leg reach — this catches skating regressions
          // without chasing that last, reach-limited sliver.
          expect(heel.maxDrift).toBeLessThan(0.6 * voxels.size);
          expect(toe.maxDrift).toBeLessThan(0.6 * voxels.size);
        });
      }
    }
  }

  for (const name of TEMPLATES.map((t) => t.name)) {
    it(`${name}: the swing foot clears the ground through the whole swing at 2.8 m/s`, () => {
      const { body, voxels, extents, params } = setup(name);
      for (let i = 0; i <= 64; i++) {
        const phase = i / 64;
        const pose = walkPose({ bones: body.bones, extents, params }, phase, 2.8);
        const transforms = boneTransforms(body.bones, pose);
        // Left leg's own phase is `phase` (gait.ts's legPhaseOf); swing is legPhase >= 0.5.
        const legPhase = phase % 1;
        if (legPhase < 0.5) {
          continue; // left leg is in stance this frame — it's the right leg swinging instead
        }
        const [, y] = contactPoint(extents, 'foot.L', transforms, [0, 0, 0]);
        // Never clips through the ground (same tolerance as the "stays within half a voxel" test)...
        expect(y).toBeGreaterThanOrEqual(-(voxels.size / 2 + 1e-6));
        // ...and is clearly lifted (not just grazing) well away from the handoffs at either end.
        const midSwing = legPhase > 0.6 && legPhase < 0.9;
        if (midSwing) {
          expect(y).toBeGreaterThan(0.3 * params.footLift);
        }
      }
    });
  }
});

/** Rotation angle (degrees) between two rotation matrices: acos((trace(AᵀB)-1)/2), i.e. trace(AᵀB) as
 * the elementwise dot product of the two (both being orthonormal). */
const rotAngleDeg = (a: Mat3, b: Mat3): number => {
  let tr = 0;
  for (let k = 0; k < 9; k++) {
    tr += a[k]! * b[k]!;
  }
  return (Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2))) * 180) / Math.PI;
};

const SNAP_BONES = ['thigh.L', 'thigh.R', 'shin.L', 'shin.R', 'foot.L', 'foot.R', 'jaw'] as const;

/** Samples walkPose at `n` phases over a full cycle (wrapping n-1 -> 0) and reports, across all
 * SNAP_BONES: the worst per-sample rotation-angle delta, the worst |Δroot.y|, and the worst second
 * difference of a bone's own angle-delta sequence (a velocity kink). Factored out of the "no snaps" test
 * below, whose own it() does the asserting, to keep that under Biome's cognitive-complexity limit.
 */
const sampleGaitDeltas = (
  setupResult: ReturnType<typeof setup>,
  speed: number,
  n: number,
): { maxAngleDelta: number; maxRootYDelta: number; maxSecondDiff: number } => {
  const { body, extents, params } = setupResult;
  const mats: Record<string, Mat3>[] = [];
  const rootYs: number[] = [];
  for (let i = 0; i < n; i++) {
    const pose = walkPose({ bones: body.bones, extents, params }, i / n, speed);
    const transforms = boneTransforms(body.bones, pose);
    const m: Record<string, Mat3> = {};
    for (const b of SNAP_BONES) {
      m[b] = transforms.get(b)!.r;
    }
    mats.push(m);
    rootYs.push(pose.root[1]);
  }

  let maxAngleDelta = 0;
  let maxSecondDiff = 0;
  for (const b of SNAP_BONES) {
    const deltas = mats.map((_, i) => rotAngleDeg(mats[i]![b]!, mats[(i + 1) % n]![b]!));
    for (let i = 0; i < n; i++) {
      maxAngleDelta = Math.max(maxAngleDelta, deltas[i]!);
      maxSecondDiff = Math.max(maxSecondDiff, Math.abs(deltas[(i + 1) % n]! - deltas[i]!));
    }
  }
  let maxRootYDelta = 0;
  for (let i = 0; i < n; i++) {
    maxRootYDelta = Math.max(maxRootYDelta, Math.abs(rootYs[(i + 1) % n]! - rootYs[i]!));
  }
  return { maxAngleDelta, maxRootYDelta, maxSecondDiff };
};

describe('the walk has no snaps', () => {
  const N = 400;
  for (const name of TEMPLATES.map((t) => t.name)) {
    for (const seed of [1, 2, 3]) {
      for (const speed of [0.8, 1.4, 2.8]) {
        it(`${name} seed ${seed} at ${speed} m/s: no per-sample joint or root-Y snap over a full cycle`, () => {
          const { maxAngleDelta, maxRootYDelta, maxSecondDiff } = sampleGaitDeltas(setup(name, seed), speed, N);
          expect(maxAngleDelta).toBeLessThan(2.5);
          expect(maxRootYDelta).toBeLessThan(0.003);
          expect(maxSecondDiff).toBeLessThan(0.5); // no velocity kink either
        });
      }
    }
  }
});

describe('strideLength', () => {
  // Canonical figure: legLen 0.75 m, ankleRestY near "ground" (0) as real body geometry has it — see
  // legGeometryFor — not near -legLen, or the roll math (rotateYZ) reads it as a near-fully-extended leg.
  const legLen = 0.75;
  const geom = { legLen, hipY: 0.14 + legLen, ankleRestY: 0.14, heelLen: 0.104, toeLen: 0.271 };
  const params = { strideFactor: 1, footLift: 0.04 } as HumanoidParams;

  it('0.8 m/s (deadvox wander): ~1.0 m cycle, close to the ~90 steps/min human-walking target', () => {
    const cycle = strideLength(params, geom, 0.8);
    expect(cycle).toBeGreaterThan(0.9);
    expect(cycle).toBeLessThan(1.15);
    const stepsPerMin = ((2 * 0.8) / cycle) * 60;
    expect(stepsPerMin).toBeGreaterThan(80);
    expect(stepsPerMin).toBeLessThan(110);
  });

  it('1.4 m/s: stride keeps growing, now landing close to the human-walking target of 1.4-1.5 m', () => {
    const cycle08 = strideLength(params, geom, 0.8);
    const cycle = strideLength(params, geom, 1.4);
    expect(cycle).toBeGreaterThan(cycle08);
    expect(cycle).toBeGreaterThan(1.3);
    expect(cycle).toBeLessThan(1.6);
    const stepsPerMin = ((2 * 1.4) / cycle) * 60;
    expect(stepsPerMin).toBeGreaterThan(100);
    expect(stepsPerMin).toBeLessThan(130);
  });

  it('2.8 m/s (deadvox chase): the bob-budget cap is saturated well before this, so cadence carries it', () => {
    const cycleAtCap = strideLength(params, geom, 2.1); // already past the cap (see mobgen's report)
    const cycle = strideLength(params, geom, 2.8);
    expect(cycle).toBeCloseTo(cycleAtCap, 6);
    const stepsPerMin = ((2 * 2.8) / cycle) * 60;
    expect(stepsPerMin).toBeGreaterThan(180);
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
