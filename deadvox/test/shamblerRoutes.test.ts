import { describe, expect, it } from 'vitest';
import type { Body } from '../src/core/physics.ts';
import {
  planShamblerRoute,
  ROUTE_MAX_WORK,
  type StairRouteLink,
  shamblerRouteSegmentClear,
} from '../src/core/shamblerRoutes.ts';

const body: Body = { pos: [1, 1, 1], vel: [0, 0, 0], halfWidth: 0.3, height: 1.8, onGround: true };
const floor = (_x: number, y: number, _z: number): boolean => y === 0;

describe('bounded shambler routes', () => {
  it('rejects a swept body corner collision between discrete endpoint samples', () => {
    const from: [number, number, number] = [8.75, 1.0001, -2.625];
    const to: [number, number, number] = [15, 1, -2];
    const solid = (x: number, y: number, z: number) => x === 8 && y >= 1 && y <= 5 && z === -2;
    expect(shamblerRouteSegmentClear({ ...body, pos: from, halfWidth: 0.56, height: 3.4 }, from, to, solid)).toBe(
      false,
    );
  });

  it('routes around a finite wall using collision-clear waypoints', () => {
    const solid = (x: number, y: number, z: number) =>
      floor(x, y, z) || (x === 3 && y >= 1 && y <= 3 && Math.abs(z) <= 3);
    const route = planShamblerRoute({ body, target: [5, 1, 1], flights: [], isSolid: solid });
    expect(route).toBeDefined();
    expect(route!.length).toBeGreaterThan(1);
    expect(route!.some((point) => Math.abs(point[2]) > 3)).toBe(true);
    let from = body.pos;
    for (const point of route!) {
      expect(shamblerRouteSegmentClear(body, from, point, solid)).toBe(true);
      from = point;
    }
  });

  it('preserves terrain drops when compressing a wall detour', () => {
    const terrainFloor = (x: number) => (x < 2 ? 4 : 1);
    const solid = (x: number, y: number, z: number) =>
      y < terrainFloor(x) || (x === 5 && y >= 1 && y <= 3 && Math.abs(z) <= 3);
    const route = planShamblerRoute({
      body: { ...body, pos: [1, 4, 1] },
      target: [9, 1, 1],
      flights: [],
      isSolid: solid,
      terrainFloor,
    });
    expect(route).toBeDefined();
    expect(route!.some((point) => Math.abs(point[2]) > 3)).toBe(true);
  });

  it('connects an authored storey to a distant terrain horizon before pursuing the final height', () => {
    const terrainFloor = (x: number) => 1 + Math.floor(Math.max(0, x - 20) / 12);
    const solid = (x: number, y: number, z: number) =>
      y < terrainFloor(x) ||
      (x >= 2 && x <= 11 && z >= 0 && z <= 1 && y < Math.min(9, x - 1)) ||
      (x >= 11 && x <= 14 && z >= 0 && z <= 1 && y === 8);
    const flight: StairRouteLink = {
      lower: [2, 1, 1],
      upper: [11, 9, 1],
      width: 2,
      from: 'lower',
      to: 'upper',
    };
    const source: Body = { ...body, pos: [12, 9, 1] };
    const target: [number, number, number] = [80, terrainFloor(80), 1];
    const route = planShamblerRoute({ body: source, target, flights: [flight], isSolid: solid, terrainFloor });
    expect(route).toBeDefined();
    expect(route!.some((point) => point[1] === flight.lower[1])).toBe(true);
    const horizon = route!.at(-1)!;
    expect(horizon[1]).toBe(terrainFloor(Math.floor(horizon[0] + source.halfWidth)));
    expect(horizon[1]).toBeLessThan(target[1]);
  });

  it('treats a one-block step as traversable within a floor route', () => {
    const solid = (x: number, y: number, z: number) => floor(x, y, z) || ((x === 2 || x === 3) && y === 1 && z === 1);
    const route = planShamblerRoute({ body, target: [3, 2, 1], flights: [], isSolid: solid });
    expect(route).toBeDefined();
    expect(route!.some((point) => point[1] === 2)).toBe(true);
  });

  it('does not invent a cross-floor link when no authored flight is supplied', () => {
    const solid = (x: number, y: number, z: number) => y === 0 || (y === 8 && x >= 0 && x <= 2 && z >= 0 && z <= 2);
    expect(
      planShamblerRoute({ body, target: [1, 9, 1], flights: [], isSolid: solid, terrainFloor: () => 1 }),
    ).toBeUndefined();
  });

  it('composes a reachable authored flight into the route', () => {
    const solid = (x: number, y: number, z: number) =>
      floor(x, y, z) || (z === 1 && x >= 2 && x <= 5 && y === x - 1) || (x === 6 && y === 4 && z === 1);
    const flight: StairRouteLink = { from: 'cellar', to: 'ground', lower: [1, 1, 1], upper: [6, 5, 1], width: 1 };
    expect(
      planShamblerRoute({ body, target: flight.upper, flights: [], isSolid: solid, terrainFloor: () => 1 }),
    ).toBeUndefined();
    const route = planShamblerRoute({ body, target: flight.upper, flights: [flight], isSolid: solid });
    expect(route).toEqual([[2, 2, 1], [3, 3, 1], [4, 4, 1], [5, 5, 1], flight.upper]);
    const descending = planShamblerRoute({
      body: { ...body, pos: flight.upper },
      target: flight.lower,
      flights: [flight],
      isSolid: solid,
    });
    expect(descending).toEqual([[5, 5, 1], [4, 4, 1], [3, 3, 1], [2, 2, 1], flight.lower]);
  });

  it('bounds metadata preparation before touching the world', () => {
    const link: StairRouteLink = { from: 'lower', to: 'upper', lower: [1, 1, 1], upper: [6, 5, 1], width: 2 };
    let work = 0;
    const route = planShamblerRoute({
      body,
      target: [1, 9, 1],
      flights: Array.from({ length: ROUTE_MAX_WORK + 1 }, () => link),
      isSolid: () => {
        throw new Error('world queried after metadata preparation should exhaust the allowance');
      },
      onWork: (units) => {
        work += units;
      },
    });
    expect(route).toBeUndefined();
    expect(work).toBeGreaterThan(0);
    expect(work).toBeLessThanOrEqual(ROUTE_MAX_WORK);
  });

  it('bounds collision queries used by flight validation, not only grid expansion', () => {
    let queries = 0;
    const solid = (x: number, y: number) => {
      queries += 1;
      return y === 0 || (x >= 2 && x <= 6 && y < Math.min(x, 5));
    };
    const flights: StairRouteLink[] = Array.from({ length: 500 }, (_, index) => ({
      from: `lower-${index}`,
      to: `upper-${index}`,
      lower: [1, 1, 1 + index * 3],
      upper: [6, 5, 1 + index * 3],
      width: 2,
    }));
    expect(planShamblerRoute({ body, target: [1, 9, 1], flights, isSolid: solid })).toBeUndefined();
    expect(queries).toBeGreaterThan(0);
    expect(queries).toBeLessThanOrEqual(ROUTE_MAX_WORK);
  });

  it('keeps a complete route when an unrelated landing is behind an impassable wall', () => {
    const solid = (x: number, y: number, z: number) => floor(x, y, z) || (x === 6 && y >= 1 && y <= 4);
    const unrelated: StairRouteLink = {
      from: 'other-ground',
      to: 'other-upper',
      lower: [8, 1, 1],
      upper: [13, 5, 1],
      width: 2,
    };
    const route = planShamblerRoute({ body, target: [5, 1, 1], flights: [unrelated], isSolid: solid });
    expect(route).toBeDefined();
    expect(route!.at(-1)).toEqual([5, 1, 1]);
  });
});
