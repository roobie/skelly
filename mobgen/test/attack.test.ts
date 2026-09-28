import { describe, expect, it } from 'vitest';
import { build, generateValid } from '../src/core/generate.ts';
import { applyPoint, IDENTITY_M, type Mat3 } from '../src/core/math.ts';
import { boneTransforms, type Pose } from '../src/core/pose.ts';
import { voxelize } from '../src/core/voxelize.ts';
import { ATTACK_CLIPS, attackPose } from '../src/mob/attack.ts';
import { corners, footRestExtents, legGeometryFor, strideLength, walkPose } from '../src/mob/gait.ts';
import type { HumanoidParams } from '../src/mob/humanoid.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const setup = (name: string, seed = 1) => {
  const t = TEMPLATES.find((x) => x.name === name)!;
  const found = generateValid(t, seed)!;
  const body = build(found.genome);
  const voxels = voxelize(body, found.genome.voxelSize, found.genome.seed);
  const extents = footRestExtents(body.bones, voxels);
  return { body, voxels, extents, params: found.genome.params as HumanoidParams };
};

const CLIP = ATTACK_CLIPS.LUNGE_GRAB!;
const CLIP_BONES = Object.keys(CLIP.keys[0]!.rotations);

/** Walk phase advances with distance, same mechanic the viewer uses — see strideLength's doc comment. */
const phaseTrack = (setupResult: ReturnType<typeof setup>, speed: number) => {
  const { body, extents, params } = setupResult;
  const stride = speed > 0 ? strideLength(params, legGeometryFor(body.bones, extents, 'L'), speed) : 1;
  let phase = 0;
  return {
    at: (dt: number): number => {
      phase = (phase + (speed * dt) / stride) % 1;
      return phase;
    },
  };
};

/** Worst absolute difference between `pose` and `walkBase` — root Y and every bone's rotation matrix,
 * treating a missing entry on either side as identity (boneTransforms' own convention). Returned rather
 * than asserted here so the `it()` caller does the actual expect(). */
const maxPoseDiff = (pose: Pose, walkBase: Pose): number => {
  let worst = Math.abs(pose.root[1] - walkBase.root[1]);
  for (const boneId of new Set([...Object.keys(pose.rotations), ...Object.keys(walkBase.rotations)])) {
    const a = pose.rotations[boneId] ?? IDENTITY_M;
    const b = walkBase.rotations[boneId] ?? IDENTITY_M;
    for (let k = 0; k < 9; k++) {
      worst = Math.max(worst, Math.abs(a[k]! - b[k]!));
    }
  }
  return worst;
};

describe('attackPose', () => {
  for (const name of TEMPLATES.map((t) => t.name)) {
    it(`${name}: pose at time 0 and at duration equals the base pose`, () => {
      const found = setup(name);
      const { body, extents, params } = found;
      const actor = { bones: body.bones, extents, params };
      for (const speed of [0, 0.8, 2.8]) {
        const walkBase = walkPose(actor, 0.2, speed);
        for (const time of [0, CLIP.duration]) {
          expect(maxPoseDiff(attackPose(actor, CLIP, time, walkBase), walkBase)).toBeLessThan(1e-9);
        }
      }
    });
  }

  const rotAngleDeg = (a: Mat3, b: Mat3): number => {
    let tr = 0;
    for (let k = 0; k < 9; k++) {
      tr += a[k]! * b[k]!;
    }
    return (Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2))) * 180) / Math.PI;
  };

  /** Samples attackPose at N linear times over the clip (not cyclic — an attack plays once, and the
   * walk phase keeps advancing underneath it — see phaseTrack). */
  const collectAttackSamples = (setupResult: ReturnType<typeof setup>, speed: number, n: number) => {
    const { body, extents, params } = setupResult;
    const actor = { bones: body.bones, extents, params };
    const track = phaseTrack(setupResult, speed);
    const dt = CLIP.duration / n;
    const mats: Record<string, Mat3>[] = [];
    const rootYs: number[] = [];
    for (let i = 0; i <= n; i++) {
      const phase = track.at(i === 0 ? 0 : dt);
      const pose = attackPose(actor, CLIP, i * dt, walkPose(actor, phase, speed));
      const transforms = boneTransforms(body.bones, pose);
      const m: Record<string, Mat3> = {};
      for (const b of CLIP_BONES) {
        m[b] = transforms.get(b)!.r;
      }
      mats.push(m);
      rootYs.push(pose.root[1]);
    }
    return { mats, rootYs };
  };

  /** Worst per-sample rotation delta (over CLIP_BONES), worst |Δroot.y|, and worst second difference of
   * the rotation delta — same metric as gait.test.ts's no-snap check. */
  const worstDeltas = (mats: Record<string, Mat3>[], rootYs: number[]) => {
    let maxAngleDelta = 0;
    let maxSecondDiff = 0;
    for (const b of CLIP_BONES) {
      const deltas = mats.slice(0, -1).map((_, i) => rotAngleDeg(mats[i]![b]!, mats[i + 1]![b]!));
      for (const d of deltas) {
        maxAngleDelta = Math.max(maxAngleDelta, d);
      }
      for (let i = 0; i < deltas.length - 1; i++) {
        maxSecondDiff = Math.max(maxSecondDiff, Math.abs(deltas[i + 1]! - deltas[i]!));
      }
    }
    let maxRootYDelta = 0;
    for (let i = 0; i < rootYs.length - 1; i++) {
      maxRootYDelta = Math.max(maxRootYDelta, Math.abs(rootYs[i + 1]! - rootYs[i]!));
    }
    return { maxAngleDelta, maxRootYDelta, maxSecondDiff };
  };

  const sampleAttackDeltas = (setupResult: ReturnType<typeof setup>, speed: number, n: number) => {
    const { mats, rootYs } = collectAttackSamples(setupResult, speed, n);
    return worstDeltas(mats, rootYs);
  };

  for (const name of TEMPLATES.map((t) => t.name)) {
    for (const speed of [0, 0.8, 2.8]) {
      it(`${name} at ${speed} m/s: the attack has no snaps over 400 frames`, () => {
        const { maxAngleDelta, maxRootYDelta, maxSecondDiff } = sampleAttackDeltas(setup(name), speed, 400);
        expect(maxAngleDelta).toBeLessThan(2.5);
        // Root-Y comes entirely from gait.ts's own hip bob (attack.ts doesn't touch it beyond
        // pelvisDrop, which is a separate, exact-key quantity) — its margin was tuned for 400 samples
        // over one full *cycle* (gait.test.ts); 400 samples over the clip's 0.9 s real-time duration at
        // 2.8 m/s covers ~1.4 cycles, a slightly faster phase-per-sample rate, so it needs a hair more
        // room here (verified this is gait.ts's own bob, not something attack.ts adds).
        expect(maxRootYDelta).toBeLessThan(0.0035);
        expect(maxSecondDiff).toBeLessThan(0.5);
      });
    }
  }

  const lowestFootY = (
    bones: ReturnType<typeof setup>['body']['bones'],
    extents: ReturnType<typeof setup>['extents'],
    pose: Pose,
  ): number => {
    const transforms = boneTransforms(bones, pose);
    let lowest = Number.POSITIVE_INFINITY;
    for (const footBone of ['foot.L', 'foot.R']) {
      for (const c of corners(extents.get(footBone)!)) {
        const [, y] = applyPoint(transforms.get(footBone)!, c);
        lowest = Math.min(lowest, y);
      }
    }
    return lowest;
  };

  for (const name of TEMPLATES.map((t) => t.name)) {
    it(`${name}: the lowest foot point stays within half a voxel of the ground throughout the attack`, () => {
      const found = setup(name);
      const { body, voxels, extents, params } = found;
      const actor = { bones: body.bones, extents, params };
      const track = phaseTrack(found, 0.8);
      const n = 100;
      const dt = CLIP.duration / n;
      for (let i = 0; i <= n; i++) {
        const phase = track.at(i === 0 ? 0 : dt);
        const pose = attackPose(actor, CLIP, i * dt, walkPose(actor, phase, 0.8));
        expect(Math.abs(lowestFootY(body.bones, extents, pose))).toBeLessThanOrEqual(voxels.size / 2 + 1e-6);
      }
    });
  }

  for (const name of TEMPLATES.map((t) => t.name)) {
    for (const seed of [1, 2, 3]) {
      it(`${name} seed ${seed}: at hitTime, hands clasp in front of the chest near shoulder height`, () => {
        const found = setup(name, seed);
        const { body, extents, params } = found;
        const actor = { bones: body.bones, extents, params };
        const walkBase = walkPose(actor, 0.2, 0.8);
        const pose = attackPose(actor, CLIP, CLIP.hitTime, walkBase);
        const transforms = boneTransforms(body.bones, pose);
        const chest = body.bones.find((b) => b.id === 'chest')!;
        const [, , chestHeadZ] = applyPoint(transforms.get('chest')!, chest.head);

        const tipXs: number[] = [];
        for (const side of ['L', 'R']) {
          const shoulderBone = body.bones.find((b) => b.id === `upperArm.${side}`)!;
          const hand = body.bones.find((b) => b.id === `hand.${side}`)!;
          const shoulder = applyPoint(transforms.get(`upperArm.${side}`)!, shoulderBone.head);
          const tip = applyPoint(transforms.get(`hand.${side}`)!, hand.tail);
          tipXs.push(tip[0]);
          expect(tip[2]).toBeLessThan(chestHeadZ); // more -Z than the chest = in front of it
          expect(hand.tail[2] - tip[2]).toBeGreaterThan(0.3); // >= ~0.3 m more forward than rest
          expect(Math.abs(tip[1] - shoulder[1])).toBeLessThan(0.12); // within ~0.12 m of shoulder height
          expect(Math.abs(tip[0])).toBeLessThanOrEqual(0.6 * Math.abs(shoulder[0])); // converged inward
        }
        expect(tipXs[1]! - tipXs[0]!).toBeGreaterThan(0.03); // R stays clear of L — hands don't overlap
      });
    }
  }
});
