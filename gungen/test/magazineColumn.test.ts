import { describe, expect, it } from 'vitest';
import { feedLips, layoutColumn } from '../src/ammo/magazineColumn.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { magazineCenterline } from '../src/gun/magazineCenterline.ts';

const straight = (length: number) =>
  [
    [0, 0],
    [0, -length],
  ] as const;

describe('staggered double column', () => {
  // Wide enough that the columns do not interlock, and narrow enough that they must.
  it.each([
    ['columns apart', 2.25],
    ['columns interlocked', 1.6],
  ])('keeps rounds clear of each other and inside the walls (%s)', (_name, interiorWidth) => {
    const d = 1;
    const column = layoutColumn({
      centerline: straight(10),
      interiorWidth,
      roundDiameter: d,
      floor: 0.125,
      topProud: 0,
    });
    expect(column.capacity).toBeGreaterThan(5);
    for (const [i, a] of column.rounds.entries()) {
      expect(Math.abs(a.z) + d / 2).toBeLessThanOrEqual(interiorWidth / 2 + 1e-9);
      for (const b of column.rounds.slice(i + 1)) {
        // The rounds lie along x, so each is a circle of diameter d in the (y, z) plane.
        expect(Math.hypot(a.position[1] - b.position[1], a.z - b.z)).toBeGreaterThanOrEqual(d - 1e-9);
      }
    }
    // The last round's bottom stays above the floor.
    expect(column.rounds.at(-1)!.position[1] - d / 2).toBeGreaterThanOrEqual(-10 + 0.125 - 1e-9);
  });
});

describe('feed lips', () => {
  const d = 0.987;
  const column = layoutColumn({
    centerline: straight(10),
    interiorWidth: 2.25,
    roundDiameter: d,
    floor: 0.125,
    topProud: 0.35 * d,
  });
  const [top] = column.rounds;
  const lips = feedLips(top!, d, 0.125);

  it('leave a gap narrower than a round, so the round cannot leave through it', () => {
    expect(lips.gap).toBeGreaterThan(0);
    expect(lips.gap).toBeLessThan(d);
  });

  it('hold the off-centre top round under one lip, with the round shown only as a strip', () => {
    // The edge lies inside the round's width on its own side, and the strip left in view is under half a round.
    expect(lips.innerEdge).toBeGreaterThan(Math.abs(top!.z) - d / 2);
    expect(lips.innerEdge).toBeLessThan(Math.abs(top!.z));
    expect(lips.innerEdge - (Math.abs(top!.z) - d / 2)).toBeLessThan(d / 2);
    // The underside sits above the round's axis, where it can retain the round.
    expect(lips.underside).toBeGreaterThan(top!.position[1]);
  });
});

describe('centreline read from the generated AK magazine', () => {
  const def = gunDomain.families.magazine!.build({ profile: 'ak-curved', length: 'L', variant: 'ak74' });
  const line = magazineCenterline(def.displaySolids ?? def.solids)!;

  it('starts at the feed face and bends forward along the body', () => {
    expect(line.points[0]).toEqual([0, 0]);
    expect(line.points.at(-1)![0]).toBeGreaterThan(1);
    expect(line.points.every((p, i) => i === 0 || p[1] < line.points[i - 1]![1])).toBe(true);
    expect(line.width).toBe(2.5);
  });

  it('runs about the length of the L body band (16.5 u)', () => {
    const length = line.points
      .slice(1)
      .reduce((sum, p, i) => sum + Math.hypot(p[0] - line.points[i]![0], p[1] - line.points[i]![1]), 0);
    expect(length).toBeGreaterThan(16);
    expect(length).toBeLessThan(16.5);
  });
});
