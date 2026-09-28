import { describe, expect, it } from 'vitest';
import { FAMILIES } from '../src/gun/parts.ts';

describe('AR-pattern parts', () => {
  it('places a rear-top charging handle behind the flat-top rail', () => {
    const receiver = FAMILIES.receiver!.build({
      action: 'auto',
      feed: 'box',
      bore: 'M',
      chargingHandle: 'rear-top',
      rail: 'full',
    });
    const handle = receiver.keepOuts.find(({ id }) => id === 'charging-handle');
    const rail = receiver.ports.find(({ id }) => id === 'rail');

    expect(handle?.box.center).toEqual([-17, 3.75, 0]);
    expect(handle?.box.half).toEqual([1, 1.25, 1.5]);
    expect(rail?.slots).toEqual({ count: 7, pitch: 2 });
  });

  it('extends the AR magazine-well housing below the receiver without changing insertion clearance', () => {
    const lower = FAMILIES.lower!.build({ layout: 'ar' });
    const conventional = FAMILIES.lower!.build({ layout: 'conventional' });
    const housing = lower.solids.filter(({ id }) => id.startsWith('magazine-housing-'));
    expect(housing.map(({ id }) => id)).toEqual([
      'magazine-housing-rear',
      'magazine-housing-front',
      'magazine-housing-left',
      'magazine-housing-right',
    ]);
    expect(housing.map(({ kind }) => kind)).toEqual(['box', 'box', 'box', 'box']);
    for (const solid of housing) {
      if (solid.kind !== 'box') {
        throw new Error('Expected box-only AR magazine housing.');
      }
      expect(solid.box.center[1] - solid.box.half[1]).toBe(-3);
      expect(solid.box.center[1] + solid.box.half[1]).toBe(-1.5);
    }
    expect(lower.ports.find(({ id }) => id === 'magazine')).toEqual(
      conventional.ports.find(({ id }) => id === 'magazine'),
    );
    expect(lower.keepOuts).toEqual(conventional.keepOuts);
  });

  it('mounts a front sight block four units from the muzzle', () => {
    const barrel = FAMILIES.barrel!.build({ bore: 'M', length: 'M', profile: 'standard' });
    const port = barrel.ports.find(({ id }) => id === 'front-sight');
    const muzzle = barrel.ports.find(({ id }) => id === 'muzzle');
    const sight = FAMILIES['front-sight']!.build({ bore: 'M' });

    expect(port?.pos).toEqual([32, 0, 0]);
    expect(muzzle?.pos[0]).toBe(36);
    expect(sight.solids.map(({ id }) => id)).toEqual(['block', 'post']);
  });
});
