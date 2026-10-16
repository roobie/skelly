import type { Resolved } from '@skelly/engine/core/resolve.ts';
import type { Cartridge } from '../ammo/cartridge.ts';

export const internalMagazineCapacity = (resolved: Resolved, cartridge: Cartridge): number | undefined => {
  const well = [...resolved.defs.values()]
    .flatMap((def) => def.keepOuts)
    .find(({ id }) => id === 'internal-magazine-well');
  if (!well) {
    return undefined;
  }
  if (
    cartridge.kind !== 'metallic' ||
    cartridge.case.rim.diameter.value === null ||
    cartridge.overallLength.max.value === null
  ) {
    throw new Error('Integral capacity requires sourced cartridge length and rim diameter');
  }
  const mmPerUnit = resolved.domain.units.metresPerUnit * 1000;
  const diameter = cartridge.case.rim.diameter.value / mmPerUnit;
  if (diameter > 2 * well.box.half[2] || cartridge.overallLength.max.value / mmPerUnit > 2 * well.box.half[0]) {
    throw new Error('Cartridge does not fit the integral well');
  }
  const capacity = Math.floor((2 * well.box.half[1]) / diameter);
  if (capacity < 1) {
    throw new Error('Integral well cannot hold a cartridge');
  }
  return capacity;
};
