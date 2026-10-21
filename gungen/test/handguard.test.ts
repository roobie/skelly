import { localSolidBounds } from '@skelly/engine/shapes/geometry.ts';
import { describe, expect, it } from 'vitest';
import { FAMILIES } from '../src/gun/parts.ts';

describe('barrel-fitted handguards', () => {
  it('keeps slabs between the barrel opening and receiver envelope', () => {
    for (const bore of ['S', 'M', 'L'] as const) {
      const barrel = FAMILIES.barrel!.build({ length: 'L', bore });
      const receiver = FAMILIES.receiver!.build({ action: 'auto', feed: 'box', bore });
      const handguard = FAMILIES.handguard!.build({ length: 'L', barrelBore: bore, bore });
      const top = handguard.solids.find(({ id }) => id === 'top')!;
      const side = handguard.solids.find(({ id }) => id === 'right')!;
      expect(top.kind).toBe('box');
      expect(side.kind).toBe('box');
      if (top.kind !== 'box' || side.kind !== 'box') {
        throw new Error('Expected box slabs for the handguard.');
      }
      const max = (solids: typeof barrel.solids, axis: number) =>
        Math.max(...solids.map((solid) => localSolidBounds(solid)[1][axis]!));
      expect(top.box.center[1] - top.box.half[1]).toBeGreaterThanOrEqual(max(barrel.solids, 1));
      expect(side.box.center[2] - side.box.half[2]).toBeGreaterThanOrEqual(max(barrel.solids, 2));
      expect(top.box.center[1] + top.box.half[1]).toBeLessThanOrEqual(max(receiver.solids, 1));
      expect(side.box.center[2] + side.box.half[2]).toBeLessThanOrEqual(max(receiver.solids, 2));
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
        const ends = handguard.solids.map((solid) => localSolidBounds(solid)[1][0]);
        expect(ends.length, `${layout}/${size}`).toBeGreaterThan(0);
        expect(ends.every(Number.isFinite), `${layout}/${size}`).toBe(true);
        return Math.max(...ends);
      });
      expect(reaches[0]).toBeLessThan(reaches[1]!);
      expect(reaches[1]).toBeLessThan(reaches[2]!);
    }
  });
});
