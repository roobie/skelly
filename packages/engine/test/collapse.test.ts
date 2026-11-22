import { describe, expect, it } from 'vitest';
import { reachableCollapseExit, refreshBurial } from '../src/core/collapse.ts';
import { type Body, separateBodyPair, stepBody, stepBodyHorizontal } from '../src/core/physics.ts';

const victim = (): Body => ({ pos: [0.5, 1, 0.5], vel: [0, 0, 0], height: 1.5, halfWidth: 0.3, onGround: true });
const search = (body: Body, solid: (x: number, y: number, z: number) => boolean) =>
  reachableCollapseExit({
    body,
    path: [0, 1, 0],
    size: [1, 3, 1],
    solid,
    others: [],
    stride: 0.2,
    budget: 500,
  });

describe('collapse escape routes', () => {
  it('slides to a free spot without crossing the adjacent wall', () => {
    const body = victim();
    const solid = (x: number, y: number) => y < 1 || (x === 1 && y < 4);
    const exit = search(body, solid)!;
    expect(exit).toBeDefined();
    expect(exit[0]).toBeLessThan(1);
    expect(Math.hypot(exit[0] - body.pos[0], exit[2] - body.pos[2])).toBeGreaterThan(0);
    expect(body.pos).toEqual([0.5, 1, 0.5]);
  });
  it('does not evacuate through a sealed wall to free space outside', () => {
    expect(
      search(victim(), (x, y, z) => y < 1 || (y < 4 && (x === -1 || x === 1 || z === -1 || z === 1))),
    ).toBeUndefined();
  });
  it('holds a buried body against steering, gravity and crowd correction until its last blocking cell clears', () => {
    const body = victim();
    body.buried = [
      [0, 1, 0],
      [0, 2, 0],
    ];
    const before = [...body.pos];
    const params = { gravity: 9, stepHeight: 0 };
    stepBody(body, 1, () => false, params);
    stepBodyHorizontal(body, { dx: 1, dz: 1, isSolid: () => false, params });
    separateBodyPair({ first: body, second: victim(), dt: 1, isSolid: () => false, blockSize: 1 });
    expect(body.pos).toEqual(before);
    expect(refreshBurial(body, (_x, y) => y === 2)).toBe(true);
    expect(refreshBurial(body, () => false)).toBe(false);
    stepBodyHorizontal(body, { dx: 1, dz: 0, isSolid: () => false, params });
    expect(body.pos[0]).toBeGreaterThan(before[0]!);
  });
});
