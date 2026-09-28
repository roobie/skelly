import { describe, expect, it } from 'vitest';
import { build, generateValid } from '../src/core/generate.ts';
import { applyPoint } from '../src/core/math.ts';
import { boneTransforms } from '../src/core/pose.ts';
import { voxelize } from '../src/core/voxelize.ts';
import { corners, footRestExtents, strideLength, walkPose } from '../src/mob/gait.ts';
import type { HumanoidParams } from '../src/mob/humanoid.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const SPEEDS = [0.8, 2.8]; // deadvox shamblers: wander / chase (PROJECT.md)

const setup = (name: string) => {
  const t = TEMPLATES.find((x) => x.name === name)!;
  const found = generateValid(t, 1)!;
  const body = build(found.genome);
  const voxels = voxelize(body, found.genome.voxelSize, found.genome.seed);
  const extents = footRestExtents(body.bones, voxels);
  return { body, voxels, extents, params: found.genome.params as HumanoidParams };
};

/**
 * The sole's position: the centroid of the 4 corners that sit at the bottom of the foot's rest-pose
 * extent, transformed by `pose`, plus a constant world offset (the root's own forward advance —
 * walkPose only solves the vertical bob; see gait.ts). Tracking the corner with the smallest *posed*
 * Y each frame independently doesn't work here: a flat sole's 4 bottom corners start at the same Y, so
 * which one reads as "lowest" can flip between frames from residual tilt alone, which would look like
 * a large jump in X/Z even though the sole itself barely moved. Fixing the corner set from the rest
 * pose (once, geometrically) avoids that.
 */
const solePoint = (
  extents: ReturnType<typeof setup>['extents'],
  footBone: string,
  transforms: ReturnType<typeof boneTransforms>,
  worldOffset: readonly [number, number, number],
): readonly [number, number, number] => {
  const t = transforms.get(footBone)!;
  const extent = extents.get(footBone)!;
  const bottom = corners(extent).filter((c) => c[1] === extent.min[1]);
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const c of bottom) {
    const p = applyPoint(t, c);
    sx += p[0];
    sy += p[1];
    sz += p[2];
  }
  const n = bottom.length;
  return [sx / n + worldOffset[0], sy / n + worldOffset[1], sz / n + worldOffset[2]];
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
      const [, y] = solePoint(extents, footBone, transforms, [0, 0, 0]);
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
          solePoint(extents, 'foot.L', transforms, [0, 0, 0])[1],
          solePoint(extents, 'foot.R', transforms, [0, 0, 0])[1],
        );
        expect(Math.abs(lowest)).toBeLessThanOrEqual(voxels.size / 2 + 1e-6);
      }
    });
  }

  for (const name of TEMPLATES.map((t) => t.name)) {
    for (const speed of SPEEDS) {
      it(`${name}: the planted foot doesn't slide at ${speed} m/s`, () => {
        const { body, voxels, extents, params } = setup(name);
        const thigh = body.bones.find((b) => b.id === 'thigh.L')!;
        const shin = body.bones.find((b) => b.id === 'shin.L')!;
        const legLen =
          Math.hypot(thigh.tail[0] - thigh.head[0], thigh.tail[1] - thigh.head[1], thigh.tail[2] - thigh.head[2]) +
          Math.hypot(shin.tail[0] - shin.head[0], shin.tail[1] - shin.head[1], shin.tail[2] - shin.head[2]);
        const stride = strideLength(params, legLen, speed);

        // The left leg's stance is phase in [0, 0.5) directly (see gait.ts's legPhaseOf). Phase
        // advances with distance travelled, so the root's own forward position at a given phase
        // is exactly phase * stride (walkPose's own root only carries the vertical bob).
        const positions: { x: number; z: number }[] = [];
        for (let i = 0; i <= 8; i++) {
          const phase = 0.05 + (i / 8) * 0.4; // mid-stance, away from the swing handoff at each end
          const pose = walkPose({ bones: body.bones, extents, params }, phase, speed);
          const transforms = boneTransforms(body.bones, pose);
          const [x, , z] = solePoint(extents, 'foot.L', transforms, [0, 0, -phase * stride]);
          positions.push({ x, z });
        }

        const first = positions[0]!;
        for (const p of positions) {
          const drift = Math.hypot(p.x - first.x, p.z - first.z);
          expect(drift).toBeLessThan(voxels.size);
        }
      });
    }
  }
});
