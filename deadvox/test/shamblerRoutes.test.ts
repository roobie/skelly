import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import type { Body } from '../src/core/physics.ts';
import { planShamblerRoute, type StairRouteLink, shamblerRouteSegmentClear } from '../src/core/shamblerRoutes.ts';

const body: Body = { pos: [1, 1, 1], vel: [0, 0, 0], halfWidth: 0.3, height: 1.8, onGround: true };
const floor = (_x: number, y: number, _z: number): boolean => y === 0;

describe('bounded shambler routes', () => {
  it('routes around a finite wall using collision-clear waypoints', () => {
    const solid = (x: number, y: number, z: number) =>
      floor(x, y, z) || (x === 3 && y >= 1 && y <= 3 && Math.abs(z) <= 3);
    const route = planShamblerRoute(body, [5, 1, 1], [], solid);
    expect(route).toBeDefined();
    expect(route!.length).toBeGreaterThan(1);
    expect(route!.some((point) => Math.abs(point[2]) > 3)).toBe(true);
    let from = body.pos;
    for (const point of route!) {
      expect(shamblerRouteSegmentClear(body, from, point, solid)).toBe(true);
      from = point;
    }
  });

  it('treats a one-block step as traversable within a floor route', () => {
    const solid = (x: number, y: number, z: number) => floor(x, y, z) || ((x === 2 || x === 3) && y === 1 && z === 1);
    const route = planShamblerRoute(body, [3, 2, 1], [], solid);
    expect(route).toBeDefined();
    expect(route!.some((point) => point[1] === 2)).toBe(true);
  });

  it('does not invent a cross-floor link when no authored flight is supplied', () => {
    const solid = (x: number, y: number, z: number) => y === 0 || (y === 8 && x >= 0 && x <= 2 && z >= 0 && z <= 2);
    expect(planShamblerRoute(body, [1, 9, 1], [], solid)).toBeUndefined();
  });

  it('composes a reachable authored flight into the route', () => {
    const solid = (x: number, y: number, z: number) =>
      floor(x, y, z) || (z === 1 && x >= 2 && x <= 5 && y === x - 1) || (x === 6 && y === 4 && z === 1);
    const flight: StairRouteLink = { from: 'cellar', to: 'ground', lower: [1, 1, 1], upper: [6, 5, 1], width: 1 };
    const route = planShamblerRoute(body, flight.upper, [flight], solid);
    expect(route).toEqual([flight.lower, [2, 2, 1], [3, 3, 1], [4, 4, 1], [5, 5, 1], flight.upper]);
    const descending = planShamblerRoute({ ...body, pos: flight.upper }, flight.lower, [flight], solid);
    expect(descending).toEqual([flight.upper, [5, 5, 1], [4, 4, 1], [3, 3, 1], [2, 2, 1], flight.lower]);
  });

  it('returns the same equal-cost route for an identical request', () => {
    const solid = (x: number, y: number, z: number) =>
      floor(x, y, z) || (x === 3 && y >= 1 && y <= 3 && Math.abs(z) <= 3);
    const target: Vec3 = [5, 1, 1];
    expect(planShamblerRoute(body, target, [], solid)).toEqual(planShamblerRoute(body, target, [], solid));
  });
});
