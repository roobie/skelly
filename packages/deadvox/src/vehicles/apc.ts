/**
 * An eight-wheeled armoured personnel carrier, built from parts: 7.0 m long, 2.75 m wide, 2.2 m to
 * the hull roof, on four axles 1.2 m, 2.0 m and 1.2 m apart with 1.06 m wheels. The front two axles
 * steer; the driver sits front left beside the engine; the squad boards by a rear ramp and sits on
 * benches over the wheels. See `docs/vehicle-spike.md`, "Proportions".
 */
import {
  type Authored,
  authored,
  box,
  disc,
  local,
  meta,
  metaFor,
  type PartMeta,
  paintBox,
  pairAcross,
  partsOf,
  place,
  prism,
} from './authoring.ts';
import { type Blueprint, type Fitting, type PartType, VOXELS_PER_CELL } from './model.ts';
import { steering } from './rangeRover.ts';
import type { Vec3i } from './voxels.ts';

const LATTICE = [56, 19, 22] as const;
const own = metaFor('apc');
const pair = pairAcross(LATTICE[2] * VOXELS_PER_CELL);

// Vehicle-local voxels (3.125 cm): x forward from the rear wall, y up, z across with the near
// (right-hand) side at high z and the centre plane at 44. The welded hull is a V-bottomed tub
// between the wheels, with sponsons over the wheels carrying the upper sides out to full width.
const AXLES = [184, 146, 82, 44] as const;
const WHEEL_R = 17;
const WHEEL_Y = 17;
/** The near wheels' inner face; the far ones mirror it. */
const WHEEL_Z = 76;
const BELLY = 17;
const SPONSON_Y = 38;
const ROOF_Y = 67;
const ROOF_TOP = 70;
/** The welded skin's full width; bolt-on armour hangs outside it. */
const SIDE = 86;
const HULL_FRONT = 202;
/** The upper glacis lies at 45°: hull at and in front of `x + y = GLACIS` is the nose's. */
const GLACIS = 260;
/** The far side of the glacis line, carved from parts that stop at the nose. */
const AHEAD_OF_GLACIS = prism(
  'z',
  [
    [GLACIS - 40 + 1, 40],
    [GLACIS, 40],
    [GLACIS, ROOF_TOP + 2],
    [GLACIS - ROOF_TOP - 2 + 1, ROOF_TOP + 2],
  ],
  [0, SIDE + 2],
  'air',
);
/** The V-hull's section between the wheels, in (z, y). */
const BELLY_SECTION = [
  [24, BELLY],
  [64, BELLY],
  [74, 25],
  [74, SPONSON_Y],
  [14, SPONSON_Y],
  [14, 25],
] as const;

/** 12.00R20 on a painted steel rim, with a run-flat insert. */
const wheel = local({
  ...meta('wheel-1200r20', 'Wheel (12.00R20 on a steel rim)', 'under', 170),
  pivot: [WHEEL_R, WHEEL_R, 5],
  shape: [
    disc('z', [WHEEL_R, WHEEL_R, WHEEL_R, 10], [0, 10], 'tyre'),
    disc('z', [WHEEL_R, WHEEL_R, WHEEL_R, 15.5], [0, 10], {
      mat: 'tread',
      paint: true,
      sectors: { count: 20, duty: 0.5 },
    }),
    disc('z', [WHEEL_R, WHEEL_R, 10], [0, 9], 'paint'),
    disc('z', [WHEEL_R, WHEEL_R, 8, 4], [8, 9], { mat: 'steelHub', paint: true, sectors: { count: 8, duty: 0.25 } }),
    disc('z', [WHEEL_R, WHEEL_R, 3], [8, 10], 'steelHub'),
  ],
});

const hullBelly = authored(own('hull-belly', 'Hull belly and floor', 'frame', 2800), [
  prism('x', BELLY_SECTION, [8, HULL_FRONT], 'paint'),
  prism(
    'x',
    [
      [27, 20],
      [61, 20],
      [71, 26.5],
      [71, SPONSON_Y],
      [17, SPONSON_Y],
      [17, 26.5],
    ],
    [8, HULL_FRONT - 3],
    'air',
  ),
  box([8, 24, 17], [HULL_FRONT - 3, 26, 71], 'loadFloor'),
]);

const hullSide = authored({ ...own('hull-side', 'Hull side and sponson', 'frame', 1300), panel: 'z' }, [
  box([8, SPONSON_Y, 71], [HULL_FRONT, SPONSON_Y + 3, SIDE], 'paint'),
  box([8, SPONSON_Y + 3, SIDE - 3], [HULL_FRONT, ROOF_Y, SIDE], 'paint'),
  AHEAD_OF_GLACIS,
]);

const hullNose = authored(own('hull-nose', 'Nose and glacis', 'frame', 1100), [
  prism(
    'z',
    [
      [HULL_FRONT, BELLY],
      [208, BELLY],
      [224, 31],
      [224, 40],
      [GLACIS + 4 - ROOF_TOP, ROOF_TOP],
      [GLACIS + 1 - ROOF_TOP, ROOF_TOP],
      [HULL_FRONT, GLACIS + 1 - HULL_FRONT],
    ],
    [2, SIDE],
    'paint',
  ),
  prism(
    'z',
    [
      [HULL_FRONT, 20],
      [207, 20],
      [220, 31],
      [220, 40],
      [204, 56],
      [HULL_FRONT, 56],
    ],
    [5, SIDE - 3],
    'air',
  ),
  box([221, 33, 70], [224, 39, 80], 'air'),
  box([221, 33, 8], [224, 39, 18], 'air'),
]);

const SQUAD_HATCH: readonly [Vec3i, Vec3i] = [
  [30, ROOF_Y, 24],
  [70, ROOF_TOP, 64],
];
const DRIVER_HATCH: readonly [Vec3i, Vec3i] = [
  [168, ROOF_Y, 8],
  [184, ROOF_TOP, 22],
];
const ENGINE_DECK: readonly [Vec3i, Vec3i] = [
  [164, ROOF_Y, 50],
  [190, ROOF_TOP, 80],
];
const CUPOLA = [154, 30] as const;
const CUPOLA_HOLE = 7;

const hullRoof = authored({ ...own('hull-roof', 'Hull roof', 'roof', 1300), panel: 'y' }, [
  box([8, ROOF_Y, 2], [HULL_FRONT - 2, ROOF_TOP, SIDE], 'paint'),
  AHEAD_OF_GLACIS,
  box(...SQUAD_HATCH, 'air'),
  box(...DRIVER_HATCH, 'air'),
  box(...ENGINE_DECK, 'air'),
  disc('y', [...CUPOLA, CUPOLA_HOLE], [ROOF_Y, ROOF_TOP], 'air'),
]);

const RAMP: readonly [Vec3i, Vec3i] = [
  [4, 26, 24],
  [8, 62, 64],
];
const hullRear = authored({ ...own('hull-rear', 'Rear wall', 'frame', 450), panel: 'x' }, [
  prism(
    'x',
    [
      ...BELLY_SECTION.slice(0, 3),
      [74, SPONSON_Y],
      [SIDE, SPONSON_Y],
      [SIDE, ROOF_TOP],
      [2, ROOF_TOP],
      [2, SPONSON_Y],
      ...BELLY_SECTION.slice(4),
    ],
    [4, 8],
    'paint',
  ),
  box(...RAMP, 'air'),
  box([4, 52, 76], [5, 58, 82], 'air'),
  box([4, 52, 6], [5, 58, 12], 'air'),
]);

const ramp = authored({ ...own('ramp', 'Rear ramp with crew door', 'body', 520), panel: 'x' }, [
  box(...RAMP, 'paint'),
  paintBox([4, 29, 46], [5, 30, 60], 'seam'),
  paintBox([4, 57, 46], [5, 58, 60], 'seam'),
  paintBox([4, 29, 46], [5, 58, 47], 'seam'),
  paintBox([4, 29, 59], [5, 58, 60], 'seam'),
  box([3, 42, 55], [4, 44, 58], 'trim'),
]);

const axle = (part: PartMeta, x: number, steered: boolean): Authored =>
  authored(part, [
    box([x - 3, 13, 12], [x + 3, BELLY, WHEEL_Z], 'chassis'),
    box([x - 5, 10, 36], [x + 5, BELLY, 52], 'chassis'),
    disc('z', [x, WHEEL_Y, 5], [12, 14], 'steelHub'),
    disc('z', [x, WHEEL_Y, 5], [WHEEL_Z - 2, WHEEL_Z], 'steelHub'),
    ...(steered ? [box([x + 3, 14, 16], [x + 5, 16, 72], 'steelHub')] : []),
  ]);
/** Steering is the axle type's: the front pair steer, the rear pair don't. */
const steeredAxle = axle(own('axle-steered', 'Steered axle and suspension', 'under', 520), AXLES[0], true);
const fixedAxle = axle(own('axle-fixed', 'Axle and suspension', 'under', 480), AXLES[2], false);
const shiftX = (part: Authored, dx: number): Vec3i => [part.at[0] + dx, part.at[1], part.at[2]];

const engine = authored(
  { ...own('engine', 'Six-cylinder diesel engine', 'under', 1050), noise: { radiusMetres: 150 } },
  [
    box([164, 26, 46], [198, 41, 70], 'engine'),
    box([164, 41, 46], [198, 56, 78], 'engine'),
    box([168, 56, 52], [194, 59, 72], 'alloy'),
    box([166, 44, 78], [176, 50, 81], 'chassis'),
  ],
);
const transmission = authored(own('transmission', 'Transmission and transfer case', 'under', 650), [
  box([140, 26, 48], [164, 38, 68], 'engine'),
]);
const radiator = authored(own('radiator', 'Radiator and fan', 'under', 110), [
  box([156, 41, 60], [164, 64, 83], 'radiator'),
]);
const fuelTank = authored(own('fuel-tank', 'Fuel tank', 'under', 160), [box([126, 41, 72], [154, 58, 83], 'tank')]);
const battery = authored(meta('battery-6t', 'Heavy battery (6T)', 'under', 33), [
  box([150, 41, 6], [160, 48, 14], 'trim'),
  box([151, 48, 7], [153, 49, 9], 'tail'),
]);
const exhaust = authored({ ...own('exhaust', 'Exhaust and silencer', 'under', 60), noise: { rangeScale: 0.5 } }, [
  disc('x', [79, 34, 4], [102, 126], 'chassis'),
  disc('x', [79, 34, 1.6], [99, 102], 'chassis'),
]);
const engineDeck = authored(
  { ...own('engine-deck', 'Engine access plate', 'roof', 220), panel: 'y', noise: { rangeScale: 0.8 } },
  [box(...ENGINE_DECK, 'paint'), paintBox([168, ROOF_TOP - 1, 54], [186, ROOF_TOP, 76], 'grille')],
);

const headlight = authored(own('headlight', 'Armoured headlight', 'body', 6), [
  box([221, 33, 70], [224, 39, 80], 'trim'),
  paintBox([223, 34, 73], [224, 38, 79], 'lamp'),
  paintBox([223, 35, 74], [224, 37, 78], 'lampHot'),
  paintBox([223, 34, 70], [224, 36, 72], 'amber'),
]);
const tailLamp = authored(own('tail-lamp', 'Tail lamp', 'body', 2), [
  box([4, 52, 76], [5, 58, 82], 'tail'),
  paintBox([4, 52, 76], [5, 54, 82], 'amber'),
]);

const periscope = authored(own('periscope', 'Periscope', 'roof', 6), [
  box([185, ROOF_TOP, 6], [189, ROOF_TOP + 3, 10], 'chassis'),
  box([188, ROOF_TOP + 1, 6], [189, ROOF_TOP + 2, 10], 'glass'),
]);
const cupola = authored(own('cupola', "Commander's cupola", 'roof', 160), [
  disc('y', [...CUPOLA, 10, CUPOLA_HOLE], [ROOF_TOP, ROOF_TOP + 3], 'paint'),
  disc('y', [...CUPOLA, 10, 8.5], [ROOF_TOP + 1, ROOF_TOP + 2], {
    mat: 'glass',
    paint: true,
    sectors: { count: 6, duty: 0.35 },
  }),
]);
const commanderHatch = authored(own('hatch-commander', "Commander's hatch", 'roof', 55), [
  disc('y', [...CUPOLA, CUPOLA_HOLE], [ROOF_Y, ROOF_TOP + 2], 'paint'),
  box([CUPOLA[0] - 2, ROOF_TOP + 2, CUPOLA[1] - 1], [CUPOLA[0] + 2, ROOF_TOP + 3, CUPOLA[1] + 1], 'trim'),
]);
const driverHatch = authored({ ...own('hatch-driver', "Driver's hatch", 'roof', 45), panel: 'y' }, [
  box(...DRIVER_HATCH, 'paint'),
  box([168, ROOF_TOP, 10], [170, ROOF_TOP + 1, 20], 'trim'),
]);
const squadHatch = authored({ ...own('hatch-squad', 'Squad hatch', 'roof', 85), panel: 'y' }, [
  box([30, ROOF_Y, 44], [70, ROOF_TOP, 64], 'paint'),
  box([48, ROOF_TOP, 46], [52, ROOF_TOP + 1, 48], 'trim'),
]);

const APPLIQUE_PITCH = 37;
/** A bolt-on plate outside the welded side, removable protection rather than hull. */
const applique = authored({ ...own('applique', 'Applique armour panel', 'body', 180), panel: 'z' }, [
  box([8, 42, SIDE], [44, 64, SIDE + 2], 'paint'),
  paintBox([10, 44, SIDE + 1], [11, 45, SIDE + 2], 'steelHub'),
  paintBox([41, 44, SIDE + 1], [42, 45, SIDE + 2], 'steelHub'),
  paintBox([10, 61, SIDE + 1], [11, 62, SIDE + 2], 'steelHub'),
  paintBox([41, 61, SIDE + 1], [42, 62, SIDE + 2], 'steelHub'),
]);

const driverSeat = authored(own('driver-seat', "Driver's seat", 'interior', 25), [
  box([168, 41, 8], [180, 45, 20], 'seatVinyl'),
  prism(
    'z',
    [
      [164, 44],
      [168, 44],
      [166, 60],
      [162, 60],
    ],
    [8, 20],
    'seatVinyl',
  ),
]);
const driverPanel = authored(own('driver-panel', "Driver's instrument panel", 'interior', 20), [
  box([190, 41, 6], [198, 54, 22], 'dash'),
  paintBox([190, 50, 8], [191, 53, 20], 'dial'),
]);
const troopBench = authored(own('troop-bench', 'Troop bench', 'interior', 55), [
  box([16, 41, 72], [110, 44, SIDE - 3], 'seatVinyl'),
  box([16, 44, SIDE - 6], [110, 60, SIDE - 3], 'seatVinyl'),
]);

const PARTS: readonly Authored[] = [
  hullBelly,
  hullSide,
  hullNose,
  hullRoof,
  hullRear,
  ramp,
  steeredAxle,
  fixedAxle,
  wheel,
  engine,
  transmission,
  radiator,
  fuelTank,
  battery,
  exhaust,
  engineDeck,
  headlight,
  tailLamp,
  periscope,
  cupola,
  commanderHatch,
  driverHatch,
  squadHatch,
  applique,
  driverSeat,
  driverPanel,
  steering,
  troopBench,
];

const HULL = ['hull-belly'];
const AXLE_IDS = ['axle-1', 'axle-2', 'axle-3', 'axle-4'] as const;

const FITTINGS: readonly Fitting[] = [
  place('hull-belly', hullBelly, []),
  place('hull-rear', hullRear, HULL),
  ...pair('hull-side', hullSide, HULL),
  place('hull-nose', hullNose, HULL),
  place('hull-roof', hullRoof, ['hull-side-near', 'hull-side-far', 'hull-nose', 'hull-rear']),
  place('ramp', ramp, ['hull-rear']),
  place('axle-1', steeredAxle, HULL),
  place('axle-2', steeredAxle, HULL, { at: shiftX(steeredAxle, AXLES[1] - AXLES[0]) }),
  place('axle-3', fixedAxle, HULL),
  place('axle-4', fixedAxle, HULL, { at: shiftX(fixedAxle, AXLES[3] - AXLES[2]) }),
  ...AXLE_IDS.flatMap((id, k) =>
    pair(`wheel-${k + 1}`, wheel, [id], { at: [AXLES[k]! - WHEEL_R, 0, WHEEL_Z], motion: 'spin' }),
  ),
  place('engine', engine, HULL),
  place('transmission', transmission, ['engine', 'hull-belly']),
  place('radiator', radiator, ['hull-side-near']),
  place('fuel-tank', fuelTank, ['hull-side-near']),
  place('battery-1', battery, ['hull-side-far']),
  place('battery-2', battery, ['hull-side-far'], { at: shiftX(battery, -12) }),
  place('exhaust', exhaust, ['hull-side-near']),
  place('engine-deck', engineDeck, ['hull-roof']),
  ...pair('headlight', headlight, ['hull-nose']),
  ...pair('tail-lamp', tailLamp, ['hull-rear']),
  ...[0, 5, 10].map((dz, k) =>
    place(`periscope-${k + 1}`, periscope, ['hull-roof'], {
      at: [periscope.at[0], periscope.at[1], periscope.at[2] + dz],
    }),
  ),
  place('cupola', cupola, ['hull-roof']),
  place('hatch-commander', commanderHatch, ['cupola']),
  place('hatch-driver', driverHatch, ['hull-roof']),
  ...pair('hatch-squad', squadHatch, ['hull-roof']),
  ...[0, 1, 2, 3, 4].flatMap((k) =>
    pair(`applique-${k + 1}`, applique, ['hull-side-near'], { at: shiftX(applique, k * APPLIQUE_PITCH) }),
  ),
  place('driver-seat', driverSeat, ['hull-side-far']),
  place('driver-panel', driverPanel, ['hull-side-far']),
  // The 4×4's wheel and column, mirrored to the left-hand driver's station.
  { ...place('steering', steering, ['driver-panel'], { at: [180, 48, 24] }), mirror: true },
  ...pair('troop-bench', troopBench, ['hull-side-near']),
];

export const APC_PARTS: readonly PartType[] = partsOf(PARTS);

export const APC: Blueprint = {
  id: 'apc',
  label: 'Wheeled APC',
  lattice: LATTICE,
  paint: { body: '#4f5b3c', seam: '#353d28' },
  fittings: FITTINGS,
};
