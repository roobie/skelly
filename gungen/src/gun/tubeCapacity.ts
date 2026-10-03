import type { Shotshell } from '../ammo/cartridge.ts';
import { localSolidBounds } from '../core/geometry.ts';
import type { Resolved } from '../core/resolve.ts';

/** Visual fit estimates, not manufacturer's tube specifications. */
export const TUBE_FOLLOWER_SPRING_RESERVE_U = 1;
export const TUBE_RIM_ALLOWANCE_MM = 0.25;

/** Geometry-derived axial capacity; shells enter singly, so no box-magazine round column is emitted. */
export const tubeMagazineCapacity = (resolved: Resolved, shell: Shotshell): number | undefined => {
  const part = [...resolved.defs.values()].find((def) => def.family === 'tube-magazine');
  if (!part) {
    return undefined;
  }
  const body = part.solids.find((solid) => solid.id === 'tube');
  const cap = part.solids.find((solid) => solid.id === 'cap-lug');
  const loaded = shell.length.loaded.value;
  const rim = shell.head.rimDiameter.value;
  if (!(body && cap && loaded !== null && rim !== null && loaded > 0 && rim > 0)) {
    throw new Error('tube capacity requires tube/cap geometry and sourced loaded length/rim diameter');
  }
  const [minimum, maximum] = localSolidBounds(body);
  const end = Math.min(maximum[0], localSolidBounds(cap)[0][0]);
  const mmPerUnit = resolved.domain.units.metresPerUnit * 1000;
  const diameter = Math.min(maximum[1] - minimum[1], maximum[2] - minimum[2]) * mmPerUnit;
  if (diameter < rim + TUBE_RIM_ALLOWANCE_MM) {
    throw new Error('tube envelope does not clear the selected shell rim');
  }
  const capacity = Math.floor(((end - minimum[0] - TUBE_FOLLOWER_SPRING_RESERVE_U) * mmPerUnit) / loaded);
  if (capacity < 1) {
    throw new Error('tube geometry cannot hold a selected shell plus follower/spring reserve');
  }
  return capacity;
};
