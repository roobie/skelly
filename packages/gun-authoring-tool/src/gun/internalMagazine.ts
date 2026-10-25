import type { Resolved } from '@skelly/engine/assembly/schema.ts';
import type { Cartridge } from '../ammo/cartridge.ts';
import { layoutColumn } from '../ammo/magazineColumn.ts';
import { boltWellProfile } from './boltCartridge.ts';

export const internalMagazineLayout = (resolved: Resolved, cartridge: Cartridge) => {
  const [entry] = [...resolved.defs].flatMap(([id, def]) =>
    def.keepOuts
      .filter(({ id: key }) => key === 'internal-magazine-well')
      .map((volume) => ({ owner: id, well: volume })),
  );
  if (!entry) {
    return;
  }
  const { owner, well } = entry;
  if (
    cartridge.kind !== 'metallic' ||
    cartridge.case.rim.diameter.value === null ||
    cartridge.overallLength.max.value === null
  ) {
    throw new Error('Integral capacity requires sourced cartridge length and rim diameter');
  }
  const mmPerUnit = resolved.domain.units.metresPerUnit * 1000;
  const diameter = cartridge.case.rim.diameter.value / mmPerUnit;
  const roundLength = cartridge.overallLength.max.value / mmPerUnit;
  if (diameter > 2 * well.box.half[2] || roundLength > 2 * well.box.half[0]) {
    throw new Error('Cartridge does not fit the integral well');
  }
  const [x, y] = well.box.center;
  const column = layoutColumn({
    centerline: [
      [x, y + well.box.half[1]],
      [x, y - well.box.half[1]],
    ],
    interiorWidth: 2 * well.box.half[2],
    roundDiameter: diameter,
    floor: 0,
    topProud: 0,
  });
  if (column.capacity < 1) {
    throw new Error('Integral well cannot hold a cartridge');
  }
  const profile = resolved.params.get(owner)?.wellBody?.value;
  const targets: Readonly<Record<string, number>> =
    profile === undefined ? {} : boltWellProfile(profile).expectedCapacityByCalibre;
  const expected = targets[cartridge.id];
  if (expected !== undefined && column.capacity !== expected) {
    throw new Error(`Integral well fits ${column.capacity} rounds, expected ${expected}`);
  }
  return { column, well: well.box, placed: resolved.placed.get(owner)!, diameter, roundLength, owner };
};

export const internalMagazineCapacity = (resolved: Resolved, cartridge: Cartridge): number | undefined =>
  internalMagazineLayout(resolved, cartridge)?.column.capacity;
