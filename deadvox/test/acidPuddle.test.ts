import { describe, expect, it } from 'vitest';
import { feetInAcidPuddle } from '../src/core/acidPuddle.ts';
import type { Body } from '../src/core/physics.ts';

describe('acid puddle supporting surface', () => {
  it('does not burn feet on another floor or airborne feet at the disk height', () => {
    const puddle = {
      type: 'fixture',
      pos: [0, 1, 0] as [number, number, number],
      remainingSimSeconds: 1,
      damagePerSimSecond: 1,
    };
    const body: Body = { pos: [0, 1, 0], vel: [0, 0, 0], halfWidth: 0.3, height: 1.8, onGround: true };
    expect(feetInAcidPuddle(body, puddle, 1)).toBe(true);
    for (const height of [0, 2]) {
      expect(feetInAcidPuddle({ ...body, pos: [0, height, 0] }, puddle, 1)).toBe(false);
    }
    expect(feetInAcidPuddle({ ...body, onGround: false }, puddle, 1)).toBe(false);
  });
});
