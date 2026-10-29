import { Group } from 'three';
import { expect, it } from 'vitest';
import { zombieFigure } from '../src/core/zombieFigure.ts';
import { FleshChunks } from '../src/render/amalgamFlesh.ts';
import { RagdollWorld, ragdollContent } from '../src/render/ragdoll.ts';
import { WORLD_GRAVITY } from './playerFixture.ts';

it('bounds carved flesh independently and removes evicted physics', async () => {
  const world = new RagdollWorld(WORLD_GRAVITY);
  const group = new Group();
  const chunks = new FleshChunks(group, {
    physics: () => world,
    ground: () => ({ blockSize: 1, isSolid: (_x, y, _z) => y < 0 }),
  });
  const { realized } = zombieFigure({ model: 'shambler' }, 17);
  const cell = realized.voxels.owner.findIndex((owner) => owner > 0);
  expect(cell).toBeGreaterThanOrEqual(0);
  try {
    for (let i = 0; i <= ragdollContent.flesh.capacity; i++) {
      chunks.spawn({
        realized,
        scale: 1,
        cells: [cell],
        rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1],
        translation: [0, 0, 0],
        direction: [1, 0, 0],
      });
    }
    await world.ready;
    expect(chunks.count).toBe(ragdollContent.flesh.capacity);
    expect(group.children.length).toBe(chunks.count);
    expect(world.counts().bodies).toBe(chunks.count);
    chunks.dispose();
    expect(world.counts()).toEqual({ bodies: 0, colliders: 0, joints: 0 });
  } finally {
    chunks.dispose();
    world.dispose();
  }
});
