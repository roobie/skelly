import type { MetallicCartridge } from '../ammo/cartridge.ts';
import { type Column, layoutColumn, polylineLength } from '../ammo/magazineColumn.ts';
import { roundProfiles } from '../ammo/roundProfile.ts';
import type { Vec3 } from '../core/math.ts';
import type { Solid } from '../core/schema.ts';
import { METRES_PER_UNIT } from './exportFrame.ts';
import { magazineCenterline } from './magazineCenterline.ts';

export const MAGAZINE_WALL_U = 0.125;
/** Assumed portion of the top round that stands proud of the magazine feed face. */
const MAGAZINE_TOP_PROUD_DIAMETERS = 0.35;
export const UNITS_PER_MM = 1 / (METRES_PER_UNIT * 1000);
const BODY_CLEARANCE_EPSILON_U = 1e-9;
type MagazineCenterlineData = NonNullable<ReturnType<typeof magazineCenterline>>;

const sectionDepthAt = (centerline: MagazineCenterlineData, distance: number): number => {
  const lengths = centerline.points
    .slice(1)
    .map((point, index) =>
      Math.hypot(point[0] - centerline.points[index]![0], point[1] - centerline.points[index]![1]),
    );
  let remaining = Math.max(
    0,
    Math.min(
      distance,
      lengths.reduce((sum, length) => sum + length, 0),
    ),
  );
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    if (remaining <= length || index === lengths.length - 1) {
      const fraction = Math.min(remaining / length, 1);
      const startDepth = centerline.sectionDepths[index]!;
      const endDepth = centerline.sectionDepths[index + 1]!;
      return startDepth + (endDepth - startDepth) * fraction;
    }
    remaining -= length;
  }
  return centerline.sectionDepths.at(-1)!;
};

const sectionWidthAt = (centerline: MagazineCenterlineData, distance: number): number => {
  const lengths = centerline.points
    .slice(1)
    .map((point, index) =>
      Math.hypot(point[0] - centerline.points[index]![0], point[1] - centerline.points[index]![1]),
    );
  let remaining = Math.max(
    0,
    Math.min(
      distance,
      lengths.reduce((sum, length) => sum + length, 0),
    ),
  );
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index]!;
    if (remaining <= length || index === lengths.length - 1) {
      const fraction = Math.min(remaining / length, 1);
      const startWidth = centerline.sectionWidths[index]!;
      const endWidth = centerline.sectionWidths[index + 1]!;
      return startWidth + (endWidth - startWidth) * fraction;
    }
    remaining -= length;
  }
  return centerline.sectionWidths.at(-1)!;
};

const validateColumnInsideMagazine = (
  column: Column,
  centerline: MagazineCenterlineData,
  roundDiameter: number,
  roundLength: number,
): void => {
  const totalLength = polylineLength(centerline.points);
  const topProud = MAGAZINE_TOP_PROUD_DIAMETERS * roundDiameter;
  const radius = roundDiameter / 2;
  for (const round of column.rounds) {
    const sectionClearance = sectionDepthAt(centerline, round.distance) - 2 * MAGAZINE_WALL_U - roundLength;
    if (sectionClearance < -BODY_CLEARANCE_EPSILON_U) {
      throw new Error('magazine body section is narrower than the loaded round length plus wall clearance');
    }
    const interiorHalfWidth = sectionWidthAt(centerline, round.distance) / 2 - MAGAZINE_WALL_U;
    if (Math.abs(round.z) + radius > interiorHalfWidth + BODY_CLEARANCE_EPSILON_U) {
      throw new Error('magazine round crosses a side wall');
    }
    if (round.distance + topProud < radius - BODY_CLEARANCE_EPSILON_U) {
      throw new Error('magazine feed face leaves insufficient feed-lip support for the top round');
    }
    if (totalLength - round.distance < radius + MAGAZINE_WALL_U - BODY_CLEARANCE_EPSILON_U) {
      throw new Error('magazine round crosses the floor clearance');
    }
  }
};

/** Staggered round column fitted to the generated magazine shell, in gungen units. */
/** Curated magazine labels carry known nominal capacities; other geometries use the dimension-derived fit. */
export const nominalCapacityForMagazine = (params: Readonly<Record<string, string>>): number | undefined => {
  if (params.length === '5-round') {
    return 5;
  }
  if (params.length === '10-round') {
    return 10;
  }
  if (params.length === 'L' && (params.profile === 'ak-curved' || params.profile === 'stanag-curved')) {
    return 30;
  }
  if (params.length === 'M' && params.profile === 'stanag-straight') {
    return 20;
  }
  return undefined;
};

export const magazineRoundColumn = (
  solids: readonly Solid[],
  cartridge: MetallicCartridge,
  params: Readonly<Record<string, string>> = {},
  physicalSolids: readonly Solid[] = solids,
): { readonly column: Column; readonly magazineWidth: number; readonly rearX: number } => {
  const centerline = magazineCenterline(solids);
  const physicalCenterline = magazineCenterline(physicalSolids);
  if (!(centerline && physicalCenterline)) {
    throw new Error('magazine geometry has no recognized body centreline');
  }
  const profiles = roundProfiles(cartridge);
  const diameter = Math.max(...profiles.loadedCase.map(([, radius]) => radius)) * 2 * UNITS_PER_MM;
  const roundAxialCoordinates = [...profiles.loadedCase, ...profiles.bullet].map(([axial]) => axial);
  const roundLength = (Math.max(...roundAxialCoordinates) - Math.min(...roundAxialCoordinates)) * UNITS_PER_MM;
  const minimumPhysicalWidth = Math.min(...physicalCenterline.sectionWidths);
  const interiorWidth = minimumPhysicalWidth - 2 * MAGAZINE_WALL_U;
  if (interiorWidth < diameter) {
    throw new Error(`magazine interior width ${interiorWidth} is narrower than round diameter ${diameter}`);
  }
  const columnInput = {
    interiorWidth,
    roundDiameter: diameter,
    floor: MAGAZINE_WALL_U,
    topProud: MAGAZINE_TOP_PROUD_DIAMETERS * diameter,
  };
  const fittedColumn = layoutColumn({ ...columnInput, centerline: centerline.points });
  const physicalCapacity = layoutColumn({ ...columnInput, centerline: physicalCenterline.points }).capacity;
  const capacity = Math.min(
    fittedColumn.capacity,
    physicalCapacity,
    nominalCapacityForMagazine(params) ?? fittedColumn.capacity,
  );
  const column =
    capacity === fittedColumn.capacity
      ? fittedColumn
      : { ...fittedColumn, capacity, rounds: fittedColumn.rounds.slice(0, capacity) };
  validateColumnInsideMagazine(column, physicalCenterline, diameter, roundLength);
  return {
    column,
    magazineWidth: physicalCenterline.width,
    rearX: physicalCenterline.rearX,
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
