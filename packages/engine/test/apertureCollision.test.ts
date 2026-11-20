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

it('a cached aperture shape keeps the dimensions it was keyed by when a body changes stance', () => {
  // A stance change rewrites the creating body's height in place (session stance height assignment), so a
  // shared cache entry must never read the live body: only the dimensions it was keyed by.
  const ceilingOnly = (_x: number, y: number, _z: number) => y >= 2;
  const make = (): Body => ({ pos: [0, 0, 0], vel: [0, 0, 0], halfWidth: 0.3, height: 3.6, onGround: false });
  const shapeOfWithWindowNear = () => {
    const entities = new BlockEntities({ furniture: new Map() } as Registry);
    entities.windowNear = () => true;
    return apertureShapes(entities, ceilingOnly, 0.5);
  };
  const clearsCeiling = (shape: ReturnType<ReturnType<typeof apertureShapes>>) => shape?.overlapsTerrain([0, 0, 0]);
  // Standing entry, then its body crouches: another standing body must still hit the ceiling.
  const standingShapes = shapeOfWithWindowNear();
  const standing = make();
  const standingEntry = standingShapes(standing)!;
  expect(clearsCeiling(standingEntry)).toBe(true);
  standing.height = 1.4;
  const otherStanding = make();
  expect(standingShapes(otherStanding)).toBe(standingEntry);
  expect(clearsCeiling(standingShapes(otherStanding))).toBe(true);
  // Crouched entry, then its body stands: a crouched body must still clear the ceiling.
  const crouchedShapes = shapeOfWithWindowNear();
  const crouched = { ...make(), height: 1.4 };
  const crouchedEntry = crouchedShapes(crouched)!;
  expect(clearsCeiling(crouchedEntry)).toBe(false);
  crouched.height = 3.6;
  const otherCrouched = { ...make(), height: 1.4 };
  expect(crouchedShapes(otherCrouched)).toBe(crouchedEntry);
  expect(clearsCeiling(crouchedShapes(otherCrouched))).toBe(false);
});
