import { localSolidBounds } from '@skelly/engine/shapes/geometry.ts';
import { describe, expect, it } from 'vitest';
import { FAMILIES } from '../src/gun/parts.ts';

describe('barrel-fitted handguards', () => {
  it('builds a bounded opening around each barrel bore', () => {
    for (const bore of ['S', 'M', 'L'] as const) {
      const handguard = FAMILIES.handguard!.build({ length: 'L', barrelBore: bore, bore });
      const top = handguard.solids.find(({ id }) => id === 'top')!;
      const side = handguard.solids.find(({ id }) => id === 'right')!;
      expect(top.kind).toBe('box');
      expect(side.kind).toBe('box');
      if (top.kind !== 'box' || side.kind !== 'box') {
        throw new Error('Expected box slabs for the handguard.');
      }
      expect(top.box.half[1]).toBeGreaterThan(0);
      expect(side.box.half[2]).toBeGreaterThan(0);
      expect(top.box.center[1] - top.box.half[1]).toBeLessThan(top.box.center[1] + top.box.half[1]);
      expect(side.box.center[2] - side.box.half[2]).toBeLessThan(side.box.center[2] + side.box.half[2]);
    }

  });

  it('closes the AK upper handguard around the gas cylinder on top of the lower handguard', () => {
    const handguard = FAMILIES.handguard!.build({ length: 'M', layout: 'ak' });
    const bounds = (id: string) => localSolidBounds(handguard.solids.find((solid) => solid.id === id)!);
    const top = bounds('upper-top');
    for (const side of ['left', 'right']) {
      const upper = bounds(`upper-${side}`);
      expect(upper[1][1], side).toBe(top[0][1]);
      expect(upper[0][1], side).toBe(bounds(side)[1][1]);
    }
  });

  it('keeps standard and AK handguard reaches ordered by length', () => {
    for (const layout of ['standard', 'ak'] as const) {
      const reaches = (['S', 'M', 'L'] as const).map((size) => {
        const handguard = FAMILIES.handguard!.build({ length: size, layout, mount: 'free-float' });
        return Math.max(...handguard.solids.map((solid) => localSolidBounds(solid)[1][0]));
      });
      expect(reaches[0]).toBeLessThan(reaches[1]!);
      expect(reaches[1]).toBeLessThan(reaches[2]!);
    }
  });
});
