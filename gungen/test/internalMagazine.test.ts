import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { PartFamily } from '@skelly/engine/assembly/schema.ts';
import { expect, it } from 'vitest';
import { boltCartridge } from '../src/gun/boltCartridge.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { internalMagazineCapacity } from '../src/gun/internalMagazine.ts';

it('a staggered integral well holds more than a single column at the same depth', () => {
  const cartridge = boltCartridge();
  if (cartridge.kind !== 'metallic') {
    throw new Error('Metallic fixture required');
  }
  const mmPerUnit = gunDomain.units.metresPerUnit * 1000;
  const diameter = cartridge.case.rim.diameter.value! / mmPerUnit;
  const capacity = (width: number) => {
    const family: PartFamily = {
      name: 'fixture-well',
      params: {},
      build: () => ({
        family: 'fixture-well',
        solids: [],
        ports: [],
        axes: [],
        keepOuts: [
          {
            id: 'internal-magazine-well',
            kind: 'fixture-cavity',
            box: {
              center: [0, 0, 0],
              half: [cartridge.overallLength.max.value! / mmPerUnit, 2 * diameter, width / 2],
            },
          },
        ],
      }),
    };
    return internalMagazineCapacity(
      resolve(
        {
          name: 'fixture',
          root: 'well',
          parts: { well: { family: 'fixture-well' } },
          connections: [],
        },
        { ...gunDomain, families: { 'fixture-well': family } },
      ),
      cartridge,
    )!;
  };
  const single = capacity(diameter);
  expect(single).toBeGreaterThan(0);
  expect(capacity(1.8 * diameter)).toBeGreaterThan(single);
});
