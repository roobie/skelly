import { describe, expect, it } from 'vitest';
import { feetInAcidPuddle } from '../src/core/acidPuddle.ts';
import type { Body } from '../src/core/physics.ts';
import { makeScale } from '../src/core/scale.ts';
import { startupContent } from './baseRegistry.ts';

describe('acid puddle supporting surface', () => {
  it('includes feet just inside the content radius and excludes feet just outside it', () => {
    const { blockSize } = makeScale(0.5);
    const type = startupContent().registry.zombies.get('acid_zombie')!;
    const radius = type.acidSpit!.puddle.radiusMetres / blockSize;
    const puddle = {
      id: 0,
      type: type.id,
      pos: [0, 1, 0] as [number, number, number],
      remainingSimSeconds: 1,
      damagePerSimSecond: 1,
    };
    const body: Body = { pos: [radius * 0.99, 1, 0], vel: [0, 0, 0], halfWidth: 0.3, height: 1.8, onGround: true };
    expect(feetInAcidPuddle(body, puddle, radius)).toBe(true);
    expect(feetInAcidPuddle({ ...body, pos: [radius * 1.01, 1, 0] }, puddle, radius)).toBe(false);
  });
  it('does not burn feet on another floor or airborne feet at the disk height', () => {
    const puddle = {
      id: 0,
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
