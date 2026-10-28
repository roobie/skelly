// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen is a workspace source alias.
import { quatToMat3 } from '@mobgen/core/math.ts';
import { crawlerPose } from '@mobgen/mob/crawler.ts';
import { severedBoneSet } from '@mobgen/mob/dismember.ts';
import { describe, expect, it } from 'vitest';
import { AMALGAM_FIGURE_SEED } from '../src/core/amalgamFigure.ts';
import { reachTuning } from '../src/core/reach.ts';
import { amalgamTypeOf, zombieFigure } from '../src/core/zombieFigure.ts';
import { RagdollWorld, ragdollContent, ragdollGroups } from '../src/render/ragdoll.ts';
import type RAPIER from '../src/render/ragdollRapier.ts';
import { baseRegistry } from './baseRegistry.ts';

const fixtureFigure = zombieFigure({ model: 'shambler' }, 17).realized;
const ground = { blockSize: 1, isSolid: (_x: number, y: number, _z: number) => y < 0 };
const pose = { rotations: {}, root: [0, 0, 0] as const };

describe('render ragdoll', () => {
  it.each(ragdollContent.models)(
    '%s partitions every skeleton bone once with one limited link per non-root group',
    async (model) => {
      const type = model === 'amalgam' ? amalgamTypeOf(baseRegistry().zombies)! : { model };
      const figure = zombieFigure(type, model === 'amalgam' ? AMALGAM_FIGURE_SEED : 17).realized;
      const groups = ragdollGroups(figure.body.bones);
      const indices = groups.flatMap((group) => group.indices);
      expect(indices.length).toBe(figure.body.bones.length);
      expect(new Set(indices).size).toBe(indices.length);
      const world = new RagdollWorld();
      try {
        const corpse = world.spawn({
          realized: figure,
          pose,
          position: [0, 0, 0],
          yaw: 0,
          direction: -1,
          seed: 17,
          ground,
        });
        await world.ready;
        expect(corpse.parts.length).toBe(groups.length);
        expect(corpse.joints.length).toBe(groups.filter((group) => group.parent !== undefined).length);
        for (const group of groups) {
          if (group.parent !== undefined) {
            const { body } = corpse.parts[groups.indexOf(group)]!;
            const parent = corpse.parts[group.parent]!.body;
            const links = corpse.joints.filter(
              (joint) => joint.body1().handle === parent.handle && joint.body2().handle === body.handle,
            );
            expect(links.length).toBe(1);
            expect(group.limits).not.toBeNull();
          }
        }
        expect(() => ragdollGroups(figure.body.bones.slice(1))).toThrow();
      } finally {
        world.dispose();
      }
    },
  );

  it('rejects authored grouping omissions and duplicate ownership', () => {
    const figure = fixtureFigure;
    expect(() => ragdollGroups(figure.body.bones, new Set(), ragdollContent.groups.slice(1))).toThrow();
    expect(() =>
      ragdollGroups(figure.body.bones, new Set(), [...ragdollContent.groups, ragdollContent.groups[0]!]),
    ).toThrow();
  });

  it.each([
    { model: 'shambler', cuts: [] },
    { model: 'runner', cuts: ['head'] },
    { model: 'brute', cuts: ['upperArm.L'] },
    { model: 'crawler', cuts: ['thigh.L', 'thigh.R'] },
  ])('$model settles above ground within handling reach with $cuts absent', async ({ model, cuts }) => {
    const figure = zombieFigure({ model }, 17).realized;
    const excluded = new Set(
      [...severedBoneSet(figure.body.bones, cuts)].map((id) => figure.body.bones.findIndex((bone) => bone.id === id)),
    );
    const world = new RagdollWorld();
    try {
      const corpse = world.spawn({
        realized: figure,
        pose: model === 'crawler' ? crawlerPose(figure) : pose,
        position: [0, 0, 0],
        yaw: 0,
        direction: -1,
        seed: 17,
        ground,
        excluded,
      });
      await world.ready;
      expect(corpse.parts.length).toBeGreaterThan(0);
      expect([...corpse.parts.flatMap((part) => [...part.sources.keys()])].some((index) => excluded.has(index))).toBe(
        false,
      );
      for (let step = 0; step < ragdollContent.stepBudget; step++) {
        world.advance(ragdollContent.timestep);
      }
      expect(corpse.settled).toBe(true);
      for (const { body } of corpse.parts) {
        expect(body.isSleeping() || body.isFixed()).toBe(true);
        const collider = body.collider(0);
        const q = collider.rotation();
        const r = quatToMat3([q.x, q.y, q.z, q.w]);
        const half = (collider.shape as InstanceType<typeof RAPIER.Cuboid>).halfExtents;
        const lowest =
          collider.translation().y - Math.abs(r[3]) * half.x - Math.abs(r[4]) * half.y - Math.abs(r[5]) * half.z;
        expect(lowest).toBeGreaterThanOrEqual(-0.01);
      }
      const trunk = corpse.parts[0]!.body.translation();
      expect(Math.hypot(trunk.x, trunk.z)).toBeLessThanOrEqual(reachTuning(baseRegistry()).reachMetres);
      world.remove(corpse);
      expect(world.counts()).toEqual({ bodies: 0, colliders: 0, joints: 0 });
    } finally {
      world.dispose();
    }
  });

  it('shares ground cells until the last overlapping owner is removed, including debris', async () => {
    const figure = fixtureFigure;
    const world = new RagdollWorld();
    try {
      const spawn = () =>
        world.spawn({ realized: figure, pose, position: [0, 0, 0], yaw: 0, direction: -1, seed: 17, ground });
      const first = spawn();
      await world.ready;
      const one = world.counts();
      const second = spawn();
      await world.ready;
      expect(world.counts().colliders - one.colliders).toBe(second.parts.length);
      world.remove(first);
      expect(world.counts()).toEqual(one);
      world.hideColliders(second);
      expect(second.parts.every(({ body }) => !body.isEnabled())).toBe(true);
      const debris = world.spawnRigid(
        {
          mass: 1,
          center: [0, 1, 0],
          orientation: [0, 0, 0, 1],
          velocity: [0, 0, 0],
          angularMomentum: [0, 0, 0],
          inertiaBody: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
          corners: [
            [-0.1, -0.1, -0.1],
            [0.1, 0.1, 0.1],
          ],
          remainderRealSeconds: 0,
          elapsedRealSeconds: 0,
          quietRealSeconds: 0,
          asleep: false,
        },
        ground,
      );
      await world.ready;
      expect(debris.parts.length).toBe(1);
      world.remove(second);
      expect(world.counts().bodies).toBe(1);
      world.remove(debris);
      expect(world.counts()).toEqual({ bodies: 0, colliders: 0, joints: 0 });
      const pending = spawn();
      world.remove(pending);
      await world.ready;
      expect(world.counts()).toEqual({ bodies: 0, colliders: 0, joints: 0 });
    } finally {
      world.dispose();
    }
  });

  it('repeats the same seeded fall in independent worlds with identical step sequences', async () => {
    const figure = fixtureFigure;
    const a = new RagdollWorld();
    const b = new RagdollWorld();
    try {
      const first = a.spawn({ realized: figure, pose, position: [0, 0, 0], yaw: 0, direction: -1, seed: 17, ground });
      const second = b.spawn({ realized: figure, pose, position: [0, 0, 0], yaw: 0, direction: -1, seed: 17, ground });
      await Promise.all([a.ready, b.ready]);
      const initial = [...first.transforms.values()];
      for (let step = 0; step < ragdollContent.stepBudget; step++) {
        a.advance(ragdollContent.timestep);
        b.advance(ragdollContent.timestep);
      }
      expect(first.parts.length).toBeGreaterThan(0);
      expect([...first.transforms.values()]).not.toEqual(initial);
      expect([...first.transforms]).toEqual([...second.transforms]);
      expect(first.settled && second.settled).toBe(true);
    } finally {
      a.dispose();
      b.dispose();
    }
  });
});
