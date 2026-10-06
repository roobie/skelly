/** Round 3's hatchback (r43-3), kept as it was; its fittings carry no support relation. */
import type { Blueprint, Fitting, PartLayer, PartType } from './model.ts';
import type { ShapeOp, Vec3i } from './voxels.ts';

const MODEL = 'hatchback';

type Box = readonly [x: number, y: number, z: number, width: number, height: number, depth: number, color: string];

const boxes = (...list: readonly Box[]): ShapeOp[] =>
  list.map(([x, y, z, width, height, depth, mat]) => ({
    op: 'box',
    from: [x, y, z],
    to: [x + width, y + height, z + depth],
    mat,
  }));

const type =
  (id: string, label: string, layer: PartLayer, massKg: number) =>
  (shape: readonly ShapeOp[]): PartType => ({ id: `${MODEL}-${id}`, label, layer, massKg, shape });

export const HATCHBACK_PARTS: readonly PartType[] = [
  type('frame-rail', 'Frame rail', 'frame', 10)(boxes([0, 0, 0, 16, 3, 4, '#596263'], [2, 3, 0, 12, 2, 4, '#747d78'])),
  type(
    'crossmember',
    'Crossmember',
    'frame',
    14,
  )(boxes([0, 0, 0, 8, 4, 40, '#68716d'], [0, 4, 12, 8, 2, 16, '#859087'])),
  type('floor-section', 'Floor section', 'under', 15)(boxes([0, 0, 0, 16, 2, 40, '#626a67'])),
  type(
    'suspension',
    'Suspension mount',
    'under',
    9,
  )(boxes([0, 0, 0, 8, 4, 8, '#6b706a'], [2, 4, 2, 4, 4, 4, '#8d8776'])),
  {
    ...type(
      'wheel',
      'Wheel and axle',
      'under',
      19,
    )([
      { op: 'cylinder', axis: 'z', center: [12, 12], radius: 11.5, inner: 8.5, from: 0, to: 8, mat: '#292e31' },
      { op: 'cylinder', axis: 'z', center: [12, 12], radius: 8.5, inner: 5, from: 0, to: 8, mat: '#9b9d91' },
      { op: 'cylinder', axis: 'z', center: [12, 12], radius: 2.5, from: 0, to: 8, mat: '#555b5b' },
    ]),
    pivot: [12, 12, 4],
  },
  type(
    'engine',
    'Engine',
    'under',
    145,
  )(boxes([0, 0, 0, 24, 12, 24, '#5b6260'], [4, 12, 3, 16, 7, 18, '#8a765c'], [7, 19, 7, 10, 3, 10, '#474c4a'])),
  type(
    'transmission',
    'Transmission',
    'under',
    34,
  )(boxes([0, 0, 0, 16, 9, 16, '#68685f'], [4, 9, 4, 8, 4, 8, '#898576'])),
  type('fuel-tank', 'Fuel tank', 'under', 48)(boxes([0, 0, 0, 24, 9, 20, '#405d4b'], [3, 9, 3, 18, 3, 14, '#586e56'])),
  type(
    'seat',
    'Seat',
    'interior',
    16,
  )(boxes([0, 0, 0, 12, 4, 12, '#907859'], [4, 4, 1, 4, 18, 10, '#a48b67'], [5, 22, 2, 2, 3, 8, '#5d5142'])),
  type(
    'dashboard',
    'Dashboard',
    'interior',
    18,
  )(boxes([0, 0, 0, 16, 9, 48, '#343a3a'], [2, 9, 4, 12, 4, 40, '#676c63'])),
  type(
    'steering',
    'Steering wheel',
    'interior',
    4,
  )(boxes([2, 0, 2, 4, 15, 4, '#77786e'], [0, 12, 2, 8, 2, 4, '#b4aa90'], [2, 10, 0, 4, 5, 8, '#8b8d82'])),
  type(
    'door',
    'Door',
    'body',
    31,
  )(boxes([0, 0, 0, 40, 11, 4, '#68726f'], [5, 11, 0, 30, 9, 4, '#78939a'], [0, 20, 0, 40, 2, 4, '#727c77'])),
  type('hood', 'Hood', 'body', 37)(boxes([0, 0, 0, 32, 4, 48, '#68726f'], [5, 4, 5, 22, 2, 38, '#7c8580'])),
  type('tailgate', 'Tailgate', 'body', 29)(boxes([0, 0, 0, 20, 22, 4, '#69736e'], [4, 13, 0, 12, 7, 4, '#78939a'])),
  type('windshield', 'Windshield', 'body', 11)(boxes([0, 0, 0, 4, 20, 48, '#8aabb0'])),
  type('roof-panel', 'Roof panel', 'roof', 42)(boxes([0, 0, 0, 64, 3, 48, '#626b66'], [3, 3, 3, 58, 2, 42, '#778078'])),
  type(
    'roof-rack',
    'Roof rack',
    'roof',
    24,
  )(
    boxes(
      [0, 0, 0, 32, 2, 3, '#6e716a'],
      [0, 0, 29, 32, 2, 3, '#6e716a'],
      [0, 0, 0, 3, 2, 32, '#8a8c7e'],
      [29, 0, 0, 3, 2, 32, '#8a8c7e'],
    ),
  ),
  type(
    'armour-plate',
    'Armour plate',
    'body',
    58,
  )(boxes([0, 0, 0, 16, 19, 4, '#565c56'], [3, 19, 0, 10, 3, 4, '#858a7b'])),
  type('bumper', 'Bumper', 'body', 22)(boxes([0, 0, 0, 8, 5, 56, '#74796f'], [1, 5, 4, 6, 2, 48, '#484e4c'])),
];

const at = (cellX: number, elevation: number, cellZ: number): Vec3i => [cellX * 4, elevation, cellZ * 4];
const place = (id: string, partType: string, position: Vec3i, extra: Pick<Fitting, 'motion'> = {}): Fitting => ({
  id,
  type: `${MODEL}-${partType}`,
  at: position,
  supportedBy: [],
  ...extra,
});

const FITTINGS: readonly Fitting[] = [
  ...[0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap((k) => [
    place(`rail-near-${k}`, 'frame-rail', at(4 * k, 0, 2)),
    place(`rail-far-${k}`, 'frame-rail', at(4 * k, 0, 13)),
  ]),
  place('cross-rear', 'crossmember', at(2, 0, 3)),
  place('cross-rear-seat', 'crossmember', at(8, 0, 3)),
  place('cross-front-seat', 'crossmember', at(17, 0, 3)),
  place('cross-front', 'crossmember', at(28, 0, 3)),
  ...[0, 4, 8, 12, 16, 20, 24].map((x, k) => place(`floor-${k}`, 'floor-section', at(x, 4, 3))),
  place('suspension-rear-near', 'suspension', at(4, 2, 1)),
  place('suspension-rear-far', 'suspension', at(4, 2, 13)),
  place('suspension-front-near', 'suspension', at(27, 2, 1)),
  place('suspension-front-far', 'suspension', at(27, 2, 13)),
  place('wheel-rear-near', 'wheel', at(3, 0, 0), { motion: 'spin' }),
  place('wheel-rear-far', 'wheel', at(3, 0, 14), { motion: 'spin' }),
  place('wheel-front-near', 'wheel', at(27, 0, 0), { motion: 'spin' }),
  place('wheel-front-far', 'wheel', at(27, 0, 14), { motion: 'spin' }),
  place('transmission', 'transmission', at(21, 4, 6)),
  place('engine', 'engine', at(28, 6, 5)),
  place('fuel-tank', 'fuel-tank', at(3, 4, 5)),
  place('seat-driver', 'seat', at(19, 18, 4)),
  place('seat-passenger', 'seat', at(19, 18, 9)),
  place('seat-rear-near', 'seat', at(10, 18, 4)),
  place('seat-rear-far', 'seat', at(10, 18, 9)),
  place('dashboard', 'dashboard', at(26, 20, 2)),
  place('steering-wheel', 'steering', at(29, 24, 5)),
  place('hatch-hood', 'hood', at(28, 22, 2)),
  place('hatch-windshield', 'windshield', at(27, 24, 2)),
  place('hatch-tailgate', 'tailgate', at(1, 6, 2)),
  place('hatch-door-near', 'door', at(13, 17, 15)),
  place('hatch-door-far', 'door', at(13, 17, 0)),
  place('hatch-roof', 'roof-panel', at(11, 43, 2)),
  place('hatch-front-bumper', 'bumper', at(34, 3, 1)),
  place('hatch-rear-bumper', 'bumper', at(0, 3, 1)),
];

/** Parts that aren't in the factory build, at the places the page offers to fit them. */
export const HATCHBACK_ADD_ONS: readonly Fitting[] = [
  place('hatch-roof-rack', 'roof-rack', at(15, 48, 4)),
  place('hatch-armour', 'armour-plate', at(17, 16, 0)),
];

export const HATCHBACK: Blueprint = {
  id: MODEL,
  label: 'Hatchback · cutaway',
  lattice: [36, 15, 16],
  paint: { body: '#68726f', seam: '#555d5a' },
  fittings: FITTINGS,
};
