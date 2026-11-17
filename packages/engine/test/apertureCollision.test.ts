import { expect, it, vi } from 'vitest';
import { apertureShapes } from '../src/core/apertureCollision.ts';
import { BlockEntities } from '../src/core/blockEntities.ts';
import type { Registry } from '../src/core/content.ts';
import { type Body, type PhysicsParams, stepBody } from '../src/core/physics.ts';

it('terrain aperture clearance makes no proximity queries and is independent of obstacle tests', () => {
  const entities = new BlockEntities({ furniture: new Map() } as Registry);
  const near = vi.spyOn(entities, 'near');
  const terrainShapeOf = vi.fn(apertureShapes(entities, () => false, 0.5));
  const make = (): Body => ({
    pos: [0, 0, 0],
    vel: [1, 0.1, 1],
    halfWidth: 0.3,
    height: 3.6,
    onGround: false,
  });
  // Exercise discovery itself too: ignoring the terrain callback must not make this pass.
  terrainShapeOf(make());
  expect(near).not.toHaveBeenCalled();
  terrainShapeOf.mockClear();
  const params: PhysicsParams = { gravity: 0, stepHeight: 0, terrainShapeOf };
  const plain = make();
  stepBody(plain, 0.01, () => false, params);
  const terrainCalls = terrainShapeOf.mock.calls.length;
  expect(terrainCalls).toBeGreaterThan(0);
  terrainShapeOf.mockClear();
  const distant: Body = { ...make(), pos: [100, 0, 100] };
  const blocked = make();
  stepBody(blocked, 0.01, () => false, { ...params, obstacles: [distant] });
  expect(blocked).toEqual(plain);
  expect(terrainShapeOf).toHaveBeenCalledTimes(terrainCalls);
  terrainShapeOf.mockClear();
  const touching = make();
  const obstacle: Body = { ...make(), pos: [0.605, 0, 0] };
  stepBody(touching, 0.01, () => false, { ...params, obstacles: [obstacle] });
  expect(touching.pos[0]).toBeLessThan(plain.pos[0]);
  expect(terrainShapeOf).toHaveBeenCalledTimes(terrainCalls);
  expect(near).not.toHaveBeenCalled();
});
