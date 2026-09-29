import { describe, expect, it } from 'vitest';
import type { Bone } from '../src/core/body.ts';
import { build, generateValid } from '../src/core/generate.ts';
import { applyPoint, IDENTITY_M } from '../src/core/math.ts';
import { boneTransforms } from '../src/core/pose.ts';
import { voxelize } from '../src/core/voxelize.ts';
import { corners, footRestExtents, INITIAL_CLOCK, walkPose } from '../src/mob/gait.ts';
import type { HumanoidParams } from '../src/mob/humanoid.ts';
import { applyIdleMotion, idleBasePose, idlePose } from '../src/mob/idle.ts';
import { TEMPLATES } from '../src/mob/templates.ts';

const setup = (name: string, seed = 1) => {
  const t = TEMPLATES.find((x) => x.name === name)!;
  const found = generateValid(t, seed)!;
  const body = build(found.genome);
  const voxels = voxelize(body, found.genome.voxelSize, found.genome.seed);
  const extents = footRestExtents(body.bones, voxels);
  return { body, voxels, extents, params: found.genome.params as HumanoidParams, seed: found.genome.seed };
};

const actorOf = (found: ReturnType<typeof setup>) => ({
  bones: found.body.bones,
  extents: found.extents,
  params: found.params,
  seed: found.seed,
});

const boneById = (bones: readonly Bone[], id: string): Bone => bones.find((b) => b.id === id)!;

const worldOf = (bones: readonly Bone[], pose: ReturnType<typeof idlePose>, boneId: string) =>
  applyPoint(boneTransforms(bones, pose).get(boneId)!, boneById(bones, boneId).head);

describe('idleBasePose', () => {
  it('never leaves torso/arms at the bind pose (identity) — the whole point of an idle stance', () => {
    for (const stance of ['slack', 'aggravated'] as const) {
      const found = setup('shambler');
      const actor = actorOf(found);
      const pose = idleBasePose(actor, stance);
      for (const boneId of ['spine', 'chest', 'head', 'jaw', 'upperArm.L', 'upperArm.R']) {
        const r = pose.rotations[boneId]!;
        const isIdentity = r.every((v, i) => Math.abs(v - IDENTITY_M[i]!) < 1e-9);
        expect(isIdentity, `${stance}'s ${boneId} should not be identity`).toBe(false);
      }
    }
  });

  it("plants both feet at their rest xz — the lowest point is within a few mm of 0, and legs don't move sideways", () => {
    for (const stance of ['slack', 'aggravated'] as const) {
      const found = setup('shambler');
      const { body, extents } = found;
      const actor = actorOf(found);
      const pose = idleBasePose(actor, stance);
      const transforms = boneTransforms(body.bones, pose);
      let minY = Number.POSITIVE_INFINITY;
      for (const [boneId, extent] of extents) {
        const t = transforms.get(boneId)!;
        for (const c of corners(extent)) {
          minY = Math.min(minY, applyPoint(t, c)[1]);
        }
      }
      expect(minY).toBeGreaterThanOrEqual(-0.001);
      expect(minY).toBeLessThan(0.02);

      // The idle stance's own knee bend must not have dragged the ankle off its rest X/Z.
      const stand = walkPose(actor, INITIAL_CLOCK, 0); // the plain bind pose — same legs, no idle stance
      const restAnkle = worldOf(body.bones, stand, 'foot.L');
      const idleAnkle = worldOf(body.bones, pose, 'foot.L');
      expect(idleAnkle[0]).toBeCloseTo(restAnkle[0], 3);
      expect(idleAnkle[2]).toBeCloseTo(restAnkle[2], 3);
    }
  });

  it('is deterministic', () => {
    const found = setup('shambler');
    const actor = actorOf(found);
    expect(idleBasePose(actor, 'aggravated')).toEqual(idleBasePose(actor, 'aggravated'));
  });
});

describe('applyIdleMotion / idlePose', () => {
  it('never moves the legs (feet stay put across any time value — see idle.ts on why)', () => {
    const found = setup('shambler');
    const { body } = found;
    const actor = actorOf(found);
    for (const stance of ['slack', 'aggravated'] as const) {
      const feetAt = (time: number) => worldOf(body.bones, idlePose(actor, stance, time), 'foot.R');
      const a = feetAt(0);
      const b = feetAt(7.3);
      const c = feetAt(60);
      expect(b).toEqual(a);
      expect(c).toEqual(a);
    }
  });

  it("phase-offsets by seed, so two different zombies sharing one body don't breathe in lockstep", () => {
    const found = setup('shambler');
    const actor = actorOf(found);
    const base = idleBasePose(actor, 'slack');
    const a = applyIdleMotion(base, 'slack', 1.5, 1);
    const b = applyIdleMotion(base, 'slack', 1.5, 2);
    expect(a.rotations.chest).not.toEqual(b.rotations.chest);
  });

  it('is deterministic for the same (base, stance, time, seed)', () => {
    const found = setup('shambler');
    const actor = actorOf(found);
    const base = idleBasePose(actor, 'aggravated');
    expect(applyIdleMotion(base, 'aggravated', 3.2, 7)).toEqual(applyIdleMotion(base, 'aggravated', 3.2, 7));
  });

  it("aggravated's claw motion only touches the forearms — the base reach/hunch/knee-bend hold steady", () => {
    const found = setup('shambler');
    const actor = actorOf(found);
    const base = idleBasePose(actor, 'aggravated');
    const t0 = applyIdleMotion(base, 'aggravated', 0, 5);
    const t1 = applyIdleMotion(base, 'aggravated', 0.3, 5);
    expect(t0.rotations['upperArm.L']).toEqual(t1.rotations['upperArm.L']);
    expect(t0.rotations['thigh.L']).toEqual(t1.rotations['thigh.L']);
  });
});

describe("aggravated arms match the chase walk's own steady height (no pop on walk -> idle)", () => {
  it('upperArm.L at chase speed (averaged over a full cycle) is close to the aggravated stance', () => {
    const found = setup('shambler');
    const actor = actorOf(found);
    const { body } = found;
    const ChaseSpeed = 2.8;
    const samples = 24;
    let sumX = 0;
    for (let i = 0; i < samples; i++) {
      const pose = walkPose(actor, { stepIndex: i, progress: 0 }, ChaseSpeed);
      const t = boneTransforms(body.bones, pose).get('upperArm.L')!;
      // Recover the local rotX-ish angle via the world -Y direction the (hanging) bone now points along.
      const [, y, z] = applyPoint({ r: t.r, t: [0, 0, 0] }, [0, -1, 0]);
      sumX += Math.atan2(-z, -y);
    }
    const avgDeg = (sumX / samples) * (180 / Math.PI);
    const idleUpperArm = idleBasePose(actor, 'aggravated').rotations['upperArm.L']!;
    const [, iy, iz] = applyPoint({ r: idleUpperArm, t: [0, 0, 0] }, [0, -1, 0]);
    const idleDeg = Math.atan2(-iz, -iy) * (180 / Math.PI);
    // Not exact (the aggravated stance deliberately reaches a little further — see idle.ts's
    // AGGRAVATED_REACH_EXTRA_DEG — and the walk's own chest/torso lean differs from the idle hunch), but
    // close enough that a walk -> idle blend at low speed doesn't pop.
    expect(Math.abs(idleDeg - avgDeg)).toBeLessThan(25);
  });
});
