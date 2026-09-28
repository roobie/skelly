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
