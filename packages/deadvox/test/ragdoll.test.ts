// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen is a workspace source alias.
import { quatToMat3 } from '@mobgen/core/math.ts';
import { crawlerPose } from '@mobgen/mob/crawler.ts';
import { severedBoneSet } from '@mobgen/mob/dismember.ts';
import { describe, expect, it } from 'vitest';
import { AMALGAM_FIGURE_SEED } from '../src/core/amalgamFigure.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { reachTuning } from '../src/core/reach.ts';
import { amalgamTypeOf, zombieFigure } from '../src/core/zombieFigure.ts';
import { RagdollWorld, ragdollContent, ragdollGroups, ragdollMotion } from '../src/render/ragdoll.ts';
import type RAPIER from '../src/render/ragdollRapier.ts';
import type { RigidBody } from '../src/render/rigidImpulse.ts';
import { baseRegistry } from './baseRegistry.ts';
import { WORLD_GRAVITY } from './playerFixture.ts';
import { sweepGroup } from './sweeps.ts';

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
      const world = new RagdollWorld(WORLD_GRAVITY);
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

  // biome-ignore-start lint/suspicious/noMisplacedAssertion: shared invariant probe runs only inside default cases or the gated seed sweep.
  const assertRest = async ({ model, cuts, seed = 17 }: { model: string; cuts: string[]; seed?: number }) => {
    const figure = zombieFigure({ model }, seed).realized;
    const excluded = new Set(
      [...severedBoneSet(figure.body.bones, cuts)].map((id) => figure.body.bones.findIndex((bone) => bone.id === id)),
    );
    const world = new RagdollWorld(WORLD_GRAVITY);
    try {
      const corpse = world.spawn({
        realized: figure,
        pose: model === 'crawler' ? crawlerPose(figure) : pose,
        position: [0, 0, 0],
        yaw: 0,
        direction: -1,
        seed,
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
      world.remove(corpse);
      expect(world.counts()).toEqual({ bodies: 0, colliders: 0, joints: 0 });
    } finally {
      world.dispose();
    }
  };
  // biome-ignore-end lint/suspicious/noMisplacedAssertion: shared invariant probe.

  it.each([
    { model: 'shambler', cuts: [] },
    { model: 'runner', cuts: ['head'] },
    { model: 'brute', cuts: ['upperArm.L'] },
    { model: 'crawler', cuts: ['thigh.L', 'thigh.R'] },
  ])('$model settles above ground with $cuts absent', assertRest);

  sweepGroup('ragdoll seed sweep', () => {
    it.each([31, 89])('rest invariants across the presentation row, seed %s', async (seed) => {
      for (const model of ragdollContent.sweep.models) {
        for (const cuts of ragdollContent.sweep.cuts.slice(0, -1)) {
          // biome-ignore lint/performance/noAwaitInLoops: each solver world is measured independently.
          await assertRest({ model, cuts, seed });
        }
      }
    });
  });

  it('keeps a downed brute trunk within handling reach and removes its tether with the body', async () => {
    const world = new RagdollWorld(WORLD_GRAVITY);
    try {
      const reach = reachTuning(baseRegistry()).reachMetres;
      const corpse = world.spawn({
        realized: zombieFigure({ model: 'brute' }, 17).realized,
        pose,
        position: [0, 0, 0],
        yaw: 0,
        direction: -1,
        seed: 17,
        ground,
        reach,
      });
      await world.ready;
      for (let step = 0; step < ragdollContent.stepBudget; step++) {
        world.advance(ragdollContent.timestep);
      }
      const trunk = corpse.parts[0]!.body.translation();
      expect(Math.hypot(trunk.x, trunk.z)).toBeLessThanOrEqual(reach);
      world.remove(corpse);
      expect(world.counts()).toEqual({ bodies: 0, colliders: 0, joints: 0 });
    } finally {
      world.dispose();
    }
  });

  it('launches along the world-space hit direction regardless of body yaw', async () => {
    const world = new RagdollWorld(WORLD_GRAVITY);
    try {
      const corpse = world.spawn({
        realized: fixtureFigure,
        pose,
        position: [0, 0, 0],
        yaw: Math.PI / 2,
        direction: 1,
        launch: [0, 0, -1],
        seed: 17,
        ground,
      });
      await world.ready;
      expect(corpse.parts.length).toBeGreaterThan(0);
      expect(corpse.parts.every(({ body }) => body.linvel().z < -Math.abs(body.linvel().x))).toBe(true);
    } finally {
      world.dispose();
    }
  });

  it('merges partial crawl motion and scales the kind launch without replacing untouched keys', () => {
    const base = { launchSpeed: 2, upwardLift: 3, spinSpeed: 4, hitDirectionWeight: 0.5, seedSpread: 6 };
    const kind = { launchSpeed: 7, seedSpread: 8 };
    const override = { upwardLift: 9 };
    expect(ragdollMotion(base, kind, override, { launchSpeed: 2 })).toEqual({
      launchSpeed: 14,
      upwardLift: 9,
      spinSpeed: 4,
      hitDirectionWeight: 0.5,
      seedSpread: 8,
    });
    expect(kind).toEqual({ launchSpeed: 7, seedSpread: 8 });
  });

  it('keeps seed spread with full hit-direction weight', async () => {
    const world = new RagdollWorld(WORLD_GRAVITY);
    try {
      const spawn = (seed: number) =>
        world.spawn({
          realized: fixtureFigure,
          model: 'runner',
          pose,
          position: [0, 0, 0],
          yaw: 0,
          direction: -1,
          launch: [0, 0, -1],
          seed,
          ground,
          motion: { ...ragdollContent.crawlFall.motion, hitDirectionWeight: 1, seedSpread: 1 },
          motionScale: ragdollContent.crawlFall.motionScale,
        });
      const first = spawn(17);
      const second = spawn(89);
      await world.ready;
      const a = first.parts[0]!.body.linvel();
      const b = second.parts[0]!.body.linvel();
      expect(a.x).not.toBe(b.x);
    } finally {
      world.dispose();
    }
  });

  it('refreshes corpse terrain after a launch beyond its initial footprint', async () => {
    const world = new RagdollWorld(WORLD_GRAVITY);
    try {
      const corpse = world.spawn({
        realized: fixtureFigure,
        pose,
        position: [0, 8, 0],
        yaw: 0,
        direction: -1,
        launch: [1, 0, 0],
        seed: 17,
        ground,
        motion: { launchSpeed: 25, upwardLift: 0, seedSpread: 0, hitDirectionWeight: 1 },
      });
      await world.ready;
      for (let step = 0; step < ragdollContent.stepBudget; step++) {
        world.advance(ragdollContent.timestep);
      }
      const trunk = corpse.parts[0]!.body.translation();
      expect(trunk.x).toBeGreaterThan(ragdollContent.footprintMetres[0]!);
      expect(trunk.y).toBeGreaterThanOrEqual(0);
      expect(corpse.settled).toBe(true);
      world.remove(corpse);
      expect(world.counts()).toEqual({ bodies: 0, colliders: 0, joints: 0 });
    } finally {
      world.dispose();
    }
  });

  it('shares ground cells until the last overlapping owner is removed, including debris', async () => {
    const figure = fixtureFigure;
    const world = new RagdollWorld(WORLD_GRAVITY);
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
      world.remove(pending);
      await world.ready;
      expect(world.counts()).toEqual({ bodies: 0, colliders: 0, joints: 0 });
    } finally {
      world.dispose();
    }
  });

  it.each([
    { label: 'travels beyond its starting ground footprint', center: [0, 8, 0], velocity: [25, 0, 0], travels: true },
    { label: 'crosses the floor within one timestep', center: [0, 0.6, 0], velocity: [0, -400, 0], travels: false },
  ])(
    'keeps debris above ground when it $label and releases its travelled cells',
    async ({ center, velocity, travels }) => {
      const world = new RagdollWorld(WORLD_GRAVITY);
      try {
        const body: RigidBody = {
          mass: 1,
          center: center as Vec3,
          orientation: [0, 0, 0, 1] as [number, number, number, number],
          velocity: velocity as Vec3,
          angularMomentum: [0, 0, 0] as Vec3,
          inertiaBody: [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
          ],
          corners: [
            [-0.1, -0.1, -0.1],
            [0.1, 0.1, 0.1],
          ] as Vec3[],
          asleep: false,
        };
        const piece = world.spawnRigid(body, ground);
        await world.ready;
        for (let step = 0; step < ragdollContent.stepBudget; step++) {
          world.advance(ragdollContent.timestep);
        }
        if (travels) {
          expect(body.center[0]).toBeGreaterThan(ragdollContent.footprintMetres[0]!);
        }
        expect(body.center[1]).toBeGreaterThanOrEqual(0);
        expect(body.asleep).toBe(true);
        world.remove(piece);
        expect(world.counts()).toEqual({ bodies: 0, colliders: 0, joints: 0 });
      } finally {
        world.dispose();
      }
    },
  );

  it('repeats the same seeded fall in independent worlds with identical step sequences', async () => {
    const figure = fixtureFigure;
    const a = new RagdollWorld(WORLD_GRAVITY);
    const b = new RagdollWorld(WORLD_GRAVITY);
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
