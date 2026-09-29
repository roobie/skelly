import { Euler, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { aimDirection } from '../src/game/aim.ts';

describe('gameplay aim', () => {
  it('uses input pitch and yaw without any presentation roll', () => {
    const pitch = 0.35;
    const yaw = 1.1;
    const aim = aimDirection(pitch, yaw);
    const expected = new Vector3(0, 0, -1).applyEuler(new Euler(pitch, yaw, 0, 'YXZ'));
    expect(aim[0]).toBeCloseTo(expected.x, 12);
    expect(aim[1]).toBeCloseTo(expected.y, 12);
    expect(aim[2]).toBeCloseTo(expected.z, 12);
  });
});
