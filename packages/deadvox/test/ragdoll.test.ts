import { describe, expect, it } from 'vitest';
import { zombieFigure } from '../src/core/zombieFigure.ts';
import { RagdollWorld, ragdollContent, ragdollGroups } from '../src/render/ragdoll.ts';

const figure = zombieFigure({ model: 'shambler' }, 17).realized;
const ground = { blockSize: 1, isSolid: (_x: number, y: number, _z: number) => y < 0 };
const pose = { rotations: {}, root: [0, 0, 0] as const };

describe('render ragdoll', () => {
  it('partitions every skeleton bone once with one limited link per non-root group', async () => {
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
  });

  it('repeats the same seeded fall in independent worlds with identical step sequences', async () => {
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
