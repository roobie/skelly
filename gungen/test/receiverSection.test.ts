import { describe, expect, it } from 'vitest';
import { assertConvexSection, buildReceiverSection } from '../src/gun/receiverSection.ts';
import type { Vec2 } from '../src/core/schema.ts';

const square: readonly Vec2[] = [[-3, -2], [3, -2], [3, 2], [-3, 2]];
const section = (outline = square) => buildReceiverSection({
  id: 'test-receiver',
  outline,
  x: [-8, 0],
  wall: 0.5,
  cavity: { y: [-2, 2], z: [-1.5, 1.5] },
  port: { x: [-3, -2], sectionAxis: 0, section: [0, 1] },
});

describe('receiver section builder', () => {
  it('rejects concave, clockwise, and degenerate outlines with a useful error', () => {
    expect(() => assertConvexSection([[-2, -2], [2, -2], [0, 0], [2, 2], [-2, 2]])).toThrow(/convex polygon/);
    expect(() => assertConvexSection([...square].reverse())).toThrow(/counter-clockwise convex polygon/);
    expect(() => assertConvexSection([[-1, 0], [0, 0], [1, 0]])).toThrow(/non-degenerate/);
  });

  it('splits the outline minus cavity into convex pieces and opens only the named port side', () => {
    const solids = section();
    expect(solids.map(({ id }) => id)).toEqual([
      'test-receiver-bottom', 'test-receiver-top', 'test-receiver-far-side',
      'test-receiver-near-side-before-window', 'test-receiver-near-side-after-window',
      'test-receiver-near-side-window-low', 'test-receiver-near-side-window-high',
    ]);
    expect(solids.every((solid) => solid.kind === 'extruded-polygon' && solid.axis === 'x')).toBe(true);
    expect(solids.find(({ id }) => id === 'test-receiver-far-side')?.kind).toBe('extruded-polygon');
  });

  it('requires the declared wall thickness around the entire cavity', () => {
    expect(() => buildReceiverSection({
      id: 'thin-wall', outline: square, x: [-8, 0], wall: 0.75,
      cavity: { y: [-2, 2], z: [-1.5, 1.5] },
    })).toThrow(/at least 0.75u wall thickness/);
  });
});
