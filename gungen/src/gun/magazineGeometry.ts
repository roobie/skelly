import type { MetallicCartridge } from '../ammo/cartridge.ts';
import { type Column, layoutColumn } from '../ammo/magazineColumn.ts';
import { roundProfiles } from '../ammo/roundProfile.ts';
import type { Vec3 } from '../core/math.ts';
import type { Solid } from '../core/schema.ts';
import { METRES_PER_UNIT } from './exportFrame.ts';
import { magazineCenterline } from './magazineCenterline.ts';

export const MAGAZINE_WALL_U = 0.125;
/** Assumed portion of the top round that stands proud of the magazine feed face. */
export const MAGAZINE_TOP_PROUD_DIAMETERS = 0.35;
export const UNITS_PER_MM = 1 / (METRES_PER_UNIT * 1000);

/** Staggered round column fitted to the generated magazine shell, in gungen units. */
/** Curated magazine labels carry known nominal capacities; other geometries use the dimension-derived fit. */
const nominalCapacity = (params: Readonly<Record<string, string>>): number | undefined => {
  if (params.length === '5-round') {
    return 5;
  }
  if (params.length === '10-round') {
    return 10;
  }
  if (params.length === 'L' && (params.profile === 'ak-curved' || params.profile === 'stanag-curved')) {
    return 30;
  }
  if (params.length === 'M' && params.profile === 'stanag-curved') {
    return 20;
  }
  return undefined;
};

export const magazineRoundColumn = (
  solids: readonly Solid[],
  cartridge: MetallicCartridge,
  params: Readonly<Record<string, string>> = {},
): { readonly column: Column; readonly magazineWidth: number; readonly rearX: number } => {
  const centerline = magazineCenterline(solids);
  if (!centerline) {
    throw new Error('magazine geometry has no recognized body centreline');
  }
  const profiles = roundProfiles(cartridge);
  const diameter = Math.max(...profiles.loadedCase.map(([, radius]) => radius)) * 2 * UNITS_PER_MM;
  const interiorWidth = centerline.width - 2 * MAGAZINE_WALL_U;
  if (interiorWidth <= 0) {
    throw new Error('magazine walls leave no room for a round column');
  }
  const fittedColumn = layoutColumn({
    centerline: centerline.points,
    interiorWidth,
    roundDiameter: diameter,
    floor: MAGAZINE_WALL_U,
    topProud: MAGAZINE_TOP_PROUD_DIAMETERS * diameter,
  });
  const capacity = Math.min(fittedColumn.capacity, nominalCapacity(params) ?? fittedColumn.capacity);
  const column =
    capacity === fittedColumn.capacity
      ? fittedColumn
      : { ...fittedColumn, capacity, rounds: fittedColumn.rounds.slice(0, capacity) };
  return {
    column,
    magazineWidth: centerline.width,
    rearX: centerline.rearX,
  };
};

export interface MagazineRoundPose {
  readonly at: Vec3;
  /** Degrees about magazine-local +z, nose-up positive. */
  readonly tilt: number;
}

const round6 = (value: number): number => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return rounded === 0 ? 0 : rounded;
};

/** Convert a generated column into the optional DeadvoxModelEntry `rounds` field. */
export const magazineRoundPoses = (column: Column): readonly MagazineRoundPose[] =>
  column.rounds.map(({ position, angle, z }) => ({
    at: [round6(position[0] * METRES_PER_UNIT), round6(position[1] * METRES_PER_UNIT), round6(z * METRES_PER_UNIT)],
    tilt: round6((angle * 180) / Math.PI),
  }));
