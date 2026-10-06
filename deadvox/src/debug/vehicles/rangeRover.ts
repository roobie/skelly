/**
 * A Range Rover Classic-type 4-door 4×4, built from parts. Sizes follow the 100-inch-wheelbase
 * car: 4.45 m long, 1.78 m wide and tall, 2.54 m wheelbase, 1.49 m track, 205R16 tyres, with the
 * glasshouse, pillar and overhang proportions of a period side elevation.
 */
import { type Fitting, type PartLayer, type PartType, type Vehicle, VOXELS_PER_CELL } from './model.ts';
import { type Axis, opsMinimum, type ShapeOp, translateOp, type Vec3i } from './voxels.ts';

type Point = readonly [number, number];
type Circle = readonly [u: number, v: number, radius: number, inner?: number];
interface Look {
  readonly mat: string;
  readonly paint?: true;
  readonly sectors?: { readonly count: number; readonly duty: number };
}

const box = (from: Vec3i, to: Vec3i, mat: string): ShapeOp => ({ op: 'box', from, to, mat });
const paintBox = (from: Vec3i, to: Vec3i, mat: string): ShapeOp => ({ op: 'box', from, to, mat, paint: true });
const prism = (axis: Axis, profile: readonly Point[], [from, to]: Point, mat: string): ShapeOp => ({
  op: 'prism',
  axis,
  profile,
  from,
  to,
  mat,
});
const disc = (axis: Axis, [u, v, radius, inner]: Circle, [from, to]: Point, look: string | Look): ShapeOp => ({
  op: 'cylinder',
  axis,
  center: [u, v],
  radius,
  from,
  to,
  ...(inner === undefined ? {} : { inner }),
  ...(typeof look === 'string' ? { mat: look } : look),
});

// Vehicle-local voxels (3.125 cm): x forward from behind the rear bumper, y up from the ground, z
// across, with the near (driver's, right-hand) side at high z and the centre plane at 32.
const AXLE_FRONT = 120;
const AXLE_REAR = 39;
const WHEEL_Y = 12;
const ARCH_R = 13.5;
const SILL_Y = 12;
const DOOR_Y = 16;
const WAIST = 37;
const ROOF_Y = 54;
const ROOF_TOP = 57;
const SIDE = 60;
/** The windscreen and A-pillars lean back 14 voxels over 17, about 40° from vertical. */
const A_RAKE = 14 / 17;
const aLine = (x0: number, y: number): number => x0 - (y - WAIST) * A_RAKE;
/** The tailgate glass and D-pillars lean forward about 33°; the lower tailgate is vertical. */
const T_RAKE = 11.5 / 18;
const tLine = (y: number): number => 3 + (y - WAIST) * T_RAKE;
const NEAR_SUFFIX = /-near$/;

interface PartMeta {
  readonly id: string;
  readonly label: string;
  readonly layer: PartLayer;
  readonly massKg: number;
  readonly panel?: Axis;
  /** In vehicle voxels, like the shape. */
  readonly pivot?: Vec3i;
}
const meta = (id: string, label: string, layer: PartLayer, massKg: number): PartMeta => ({ id, label, layer, massKg });

interface Authored {
  readonly type: PartType;
  readonly at: Vec3i;
}

/** A part drawn in vehicle voxels; its type holds the shape relative to the lattice cell it starts in. */
const authored = ({ pivot, ...rest }: PartMeta, shape: readonly ShapeOp[]): Authored => {
  const [x, y, z] = opsMinimum(shape).map((v) => Math.floor(v / VOXELS_PER_CELL) * VOXELS_PER_CELL) as [
    number,
    number,
    number,
  ];
  const at: Vec3i = [x, y, z];
  const type: PartType = {
    ...rest,
    shape: shape.map((op) => translateOp(op, at)),
    ...(pivot ? { pivot: [pivot[0] - x, pivot[1] - y, pivot[2] - z] as const } : {}),
  };
  return { type, at };
};

/** A part drawn in its own frame, placed by each fitting. */
const local = (type: PartType): Authored => ({ type, at: [0, 0, 0] });

type PlaceExtra = Pick<Fitting, 'motion' | 'optional'> & { readonly at?: Vec3i };

const place = (id: string, part: Authored, supportedBy: readonly string[], extra: PlaceExtra = {}): Fitting => {
  const { at, ...rest } = extra;
  return { id, type: part.type.id, at: at ?? part.at, supportedBy, ...rest };
};

/** A near-side fitting and its mirrored far-side twin; `-near` in support ids becomes `-far` for the twin. */
const pair = (id: string, part: Authored, supportedBy: readonly string[], extra: PlaceExtra = {}): Fitting[] => {
  const near = place(`${id}-near`, part, supportedBy, extra);
  return [
    near,
    { ...near, id: `${id}-far`, mirror: true, supportedBy: supportedBy.map((s) => s.replace(NEAR_SUFFIX, '-far')) },
  ];
};

const wheel = local({
  ...meta('wheel', 'Wheel (205R16 on a five-spoke alloy)', 'under', 30),
  pivot: [12, 12, 3.5],
  shape: [
    disc('z', [12, 12, 12, 6.5], [0, 7], 'tyre'),
    disc('z', [12, 12, 12, 11], [0, 7], { mat: 'tread', paint: true, sectors: { count: 16, duty: 0.5 } }),
    disc('z', [12, 12, 6.5], [0, 6], 'rim'),
    disc('z', [12, 12, 5.4, 2], [5, 6], { mat: 'rimDark', paint: true, sectors: { count: 5, duty: 0.42 } }),
    disc('z', [12, 12, 1.5], [5, 6], { mat: 'rimDark', paint: true }),
  ],
});

const crossmember = local({
  ...meta('crossmember', 'Chassis crossmember', 'frame', 15),
  shape: [box([0, 0, 0], [4, 3, 28], 'chassis')],
});

const frameRail = authored(meta('frame-rail', 'Chassis rail', 'frame', 95), [
  box([4, 13, 46], [138, 16, 50], 'chassis'),
]);

const axle = (part: PartMeta, x: number, diffZ: number): Authored =>
  authored(part, [
    box([x - 2, 10, 12], [x + 2, 13, 52], 'chassis'),
    box([x - 4, 6, diffZ], [x + 5, 13, diffZ + 10], 'chassis'),
    disc('z', [x, WHEEL_Y, 4.5], [50, 52], 'alloy'),
    disc('z', [x, WHEEL_Y, 4.5], [12, 14], 'alloy'),
    disc('z', [x, WHEEL_Y, 1.6], [50, 52], 'chassis'),
    disc('z', [x, WHEEL_Y, 1.6], [12, 14], 'chassis'),
  ]);
const axleFront = axle(meta('axle-front', 'Front axle', 'under', 110), AXLE_FRONT, 26);
const axleRear = axle(meta('axle-rear', 'Rear axle', 'under', 100), AXLE_REAR, 28);

const engine = authored(meta('engine', 'V8 engine', 'under', 170), [
  box([108, 16, 22], [130, 28, 42], 'engine'),
  box([108, 26, 19], [130, 31, 25], 'engine'),
  box([108, 26, 39], [130, 31, 45], 'engine'),
  box([109, 31, 19], [129, 33, 24], 'alloy'),
  box([109, 31, 40], [129, 33, 45], 'alloy'),
  box([112, 28, 27], [126, 33, 37], 'alloy'),
  box([115, 31, 28], [123, 33, 36], 'trim'),
  box([112, 13, 26], [126, 16, 38], 'engine'),
  box([114, 14, 18], [118, 16, 22], 'chassis'),
  box([114, 14, 42], [118, 16, 46], 'chassis'),
  disc('x', [32, 23, 6.5], [130, 132], { mat: 'trim', sectors: { count: 6, duty: 0.55 } }),
]);
const gearbox = authored(meta('gearbox', 'Gearbox and transfer box', 'under', 75), [
  box([80, 16, 26], [108, 24, 38], 'engine'),
  box([80, 10, 28], [92, 16, 36], 'engine'),
]);
const fuelTank = authored(meta('fuel-tank', 'Fuel tank', 'under', 60), [box([8, 10, 18], [30, 16, 46], 'tank')]);
const exhaust = authored(meta('exhaust', 'Exhaust tailpipe', 'under', 15), [
  disc('x', [14, 11, 1.6], [2, 12], 'chassis'),
]);
const radiator = authored(meta('radiator', 'Radiator', 'under', 15), [box([134, 16, 12], [138, 33, 52], 'radiator')]);
const battery = authored(meta('battery', 'Battery', 'under', 20), [
  box([122, 26, 46], [130, 33, 52], 'trim'),
  box([123, 33, 47], [125, 34, 49], 'tail'),
]);

const floorPan = authored(meta('floor-pan', 'Floor pan and transmission tunnel', 'frame', 90), [
  box([6, 16, 6], [100, 18, 58], 'chassis'),
  box([26, 16, 52], [52, 18, 58], 'air'),
  box([26, 16, 6], [52, 18, 12], 'air'),
  box([70, 16, 26], [100, 18, 38], 'air'),
  box([70, 16, 24], [100, 24, 26], 'carpet'),
  box([70, 16, 38], [100, 24, 40], 'carpet'),
  box([70, 24, 24], [100, 26, 40], 'carpet'),
  paintBox([42, 17, 6], [100, 18, 58], 'carpet'),
  paintBox([6, 17, 6], [42, 18, 58], 'loadFloor'),
]);
const sill = authored(meta('sill', 'Sill', 'frame', 12), [box([52, SILL_Y, 56], [107, DOOR_Y, SIDE], 'trim')]);
const bulkhead = authored(meta('bulkhead', 'Bulkhead and scuttle', 'frame', 40), [
  box([100, 16, 7], [104, WAIST, 57], 'paint'),
  box([100, 16, 26], [104, 24, 38], 'air'),
  paintBox([100, WAIST - 1, 7], [104, WAIST, 57], 'trim'),
]);
const innerWing = authored(meta('inner-wing', 'Inner wing', 'frame', 18), [
  box([104, 16, 52], [138, 34, 54], 'paint'),
  disc('z', [AXLE_FRONT, WHEEL_Y, 15], [52, 54], 'air'),
  box([104, 33, 54], [138, 34, 58], 'paint'),
]);

const aPost = authored(meta('a-post', 'A-pillar', 'body', 8), [
  box([101, DOOR_Y, 57], [104, WAIST, SIDE], 'paint'),
  prism(
    'z',
    [
      [104, WAIST],
      [101, WAIST],
      [aLine(101, ROOF_Y), ROOF_Y],
      [aLine(104, ROOF_Y), ROOF_Y],
    ],
    [57, SIDE],
    'paint',
  ),
  paintBox([101, DOOR_Y, SIDE - 1], [102, WAIST, SIDE], 'seam'),
]);
const bPillar = authored(meta('b-pillar', 'B-pillar', 'body', 6), [
  box([62, 18, 56], [64, WAIST, 58], 'trim'),
  box([62, WAIST, 56], [64, ROOF_Y, 59], 'trim'),
]);

const rearArch = disc('z', [AXLE_REAR, WHEEL_Y, ARCH_R], [56, SIDE + 1], 'air');
/** The arch's flare lip, shared by the rear quarter and the rear door: each keeps its own side of x 42. */
const rearFlare = disc('z', [AXLE_REAR, WHEEL_Y, 15.5, ARCH_R], [SIDE, SIDE + 1], 'paint');
const quarterGlass: readonly Point[] = [
  [tLine(38) + 7.5, 38],
  [38, 38],
  [38, 52.5],
  [tLine(52.5) + 7.5, 52.5],
];
const rearQuarter = authored(
  { ...meta('rear-quarter', 'Rear quarter (C- and D-pillars, wheel arch)', 'body', 30), panel: 'z' },
  [
    box([4, DOOR_Y, 58], [42, WAIST, SIDE], 'paint'),
    box([3, 19, 52], [5, 22, SIDE], 'paint'),
    rearArch,
    disc('z', [AXLE_REAR, WHEEL_Y, 15, ARCH_R], [52, 57], 'chassis'),
    box([20, -4, 52], [60, 18, 58], 'air'),
    box([39, WAIST, 57], [42, ROOF_Y, SIDE], 'paint'),
    prism(
      'z',
      [
        [tLine(WAIST) + 6, WAIST],
        [39, WAIST],
        [39, ROOF_Y],
        [tLine(ROOF_Y) + 6, ROOF_Y],
      ],
      [58, SIDE],
      'trim',
    ),
    prism('z', quarterGlass, [58, 59], 'glass'),
    prism('z', quarterGlass, [59, SIDE], 'air'),
    prism(
      'z',
      [
        [tLine(WAIST), WAIST],
        [tLine(WAIST) + 6, WAIST],
        [tLine(ROOF_Y) + 6, ROOF_Y],
        [tLine(ROOF_Y), ROOF_Y],
      ],
      [57, SIDE],
      'paint',
    ),
    paintBox([5, 40, SIDE - 1], [11, 42, SIDE], 'trim'),
    rearFlare,
    box([20, -4, SIDE], [42, WHEEL_Y, SIDE + 1], 'air'),
    box([42, -4, SIDE], [60, 30, SIDE + 1], 'air'),
  ],
);

const roof = authored({ ...meta('roof', 'Roof', 'roof', 45), panel: 'y' }, [
  box([14, ROOF_Y, 4], [91, ROOF_TOP, SIDE], 'paint'),
  box([90, ROOF_TOP - 1, 4], [91, ROOF_TOP, SIDE], 'air'),
  box([14, ROOF_TOP - 1, 4], [15, ROOF_TOP, SIDE], 'air'),
  paintBox([16, ROOF_Y, 7], [89, ROOF_Y + 1, 57], 'headliner'),
  box([16, ROOF_Y, SIDE], [89, ROOF_Y + 1, SIDE + 1], 'trim'),
  box([16, ROOF_Y, 3], [89, ROOF_Y + 1, 4], 'trim'),
]);
const windscreen = authored(meta('windscreen', 'Windscreen', 'body', 14), [
  prism(
    'z',
    [
      [102.5, WAIST],
      [101, WAIST],
      [aLine(101, ROOF_Y), ROOF_Y],
      [aLine(102.5, ROOF_Y), ROOF_Y],
    ],
    [7, 57],
    'glass',
  ),
]);
const upperTailgate = authored(meta('tailgate-upper', 'Upper tailgate and glass', 'body', 18), [
  prism(
    'z',
    [
      [tLine(WAIST), WAIST],
      [tLine(WAIST) + 2.4, WAIST],
      [tLine(ROOF_Y) + 2.4, ROOF_Y],
      [tLine(ROOF_Y), ROOF_Y],
    ],
    [7, 57],
    'trim',
  ),
  prism(
    'z',
    [
      [tLine(38), 38],
      [tLine(38) + 2.4, 38],
      [tLine(53) + 2.4, 53],
      [tLine(53), 53],
    ],
    [9, 55],
    'glass',
  ),
]);
const lowerTailgate = authored({ ...meta('tailgate-lower', 'Lower tailgate', 'body', 16), panel: 'x' }, [
  box([3, 19, 12], [5, WAIST, 52], 'paint'),
  box([2, 23, 24], [3, 28, 40], 'plateRear'),
  box([2, 33, 28], [3, 34, 36], 'trim'),
]);
const tailLamp = authored(meta('tail-lamp', 'Tail lamp cluster', 'body', 1), [
  box([2, 22, 52], [4, WAIST, 59], 'tail'),
  paintBox([2, 29, 52], [4, 32, 59], 'amber'),
  paintBox([2, 26, 52], [4, 28, 59], 'lampWhite'),
]);
const rearBumper = authored(meta('rear-bumper', 'Rear bumper', 'body', 18), [box([1, 13, 4], [4, 19, SIDE], 'trim')]);

const frontWing = authored({ ...meta('front-wing', 'Front wing', 'body', 10), panel: 'z' }, [
  box([104, DOOR_Y, 58], [141, 34, SIDE], 'paint'),
  box([138, 14, 58], [141, 21, SIDE], 'air'),
  disc('z', [AXLE_FRONT, WHEEL_Y, ARCH_R], [58, SIDE], 'air'),
  disc('z', [AXLE_FRONT, WHEEL_Y, 15.5, ARCH_R], [SIDE, SIDE + 1], 'paint'),
  box([100, -4, SIDE], [141, WHEEL_Y, SIDE + 1], 'air'),
]);
const LAMP_NEAR: Circle = [50, 28, 4.5];
const LAMP_FAR: Circle = [14, 28, 4.5];
const frontPanel = authored(meta('front-panel', 'Grille and headlamp panel', 'body', 12), [
  box([138, 21, 6], [141, 33, 58], 'trim'),
  ...[22, 25, 28, 31].map((y) => paintBox([140, y, 19], [141, y + 1, 45], 'grille')),
  disc('x', LAMP_NEAR, [140, 141], 'air'),
  disc('x', LAMP_FAR, [140, 141], 'air'),
  paintBox([140, 22, 45], [141, 24, 55], 'amber'),
  paintBox([140, 22, 9], [141, 24, 19], 'amber'),
]);
const headlight = authored(meta('headlight', 'Headlight', 'body', 2), [
  disc('x', LAMP_NEAR, [140, 142], 'lamp'),
  disc('x', [50, 28, 2.2], [141, 142], { mat: 'lampHot', paint: true }),
  disc('x', [50, 28, 5.3, 4.5], [141, 142], 'chrome'),
]);
const frontBumper = authored(meta('front-bumper', 'Front bumper', 'body', 25), [
  box([138, 14, 4], [143, 21, SIDE], 'trim'),
  paintBox([142, 15, 24], [143, 19, 40], 'plateFront'),
]);
const bonnet = authored({ ...meta('bonnet', 'Clamshell bonnet', 'body', 22), panel: 'y' }, [
  box([104, 34, 4], [141, 36, SIDE], 'paint'),
  paintBox([104, 34, SIDE - 1], [141, 35, SIDE], 'seam'),
  paintBox([104, 34, 4], [141, 35, 5], 'seam'),
]);

const frontDoorGlass: readonly Point[] = [
  [65, WAIST],
  [aLine(99.5, WAIST), WAIST],
  [aLine(99.5, 52.5), 52.5],
  [65, 52.5],
];
const frontDoor = authored({ ...meta('door-front', 'Front door', 'body', 32), panel: 'z', pivot: [101, 0, SIDE] }, [
  box([63, DOOR_Y, 58], [101, WAIST, SIDE], 'paint'),
  box([64, 18, 57], [101, WAIST, 58], 'doorCard'),
  prism(
    'z',
    [
      [64, WAIST],
      [101, WAIST],
      [aLine(101, ROOF_Y), ROOF_Y],
      [64, ROOF_Y],
    ],
    [58, SIDE],
    'trim',
  ),
  prism('z', frontDoorGlass, [58, 59], 'glass'),
  prism('z', frontDoorGlass, [59, SIDE], 'air'),
  box([67, 33, SIDE], [71, 34, SIDE + 1], 'chrome'),
  box([94, 38, SIDE], [99, 43, SIDE + 3], 'trim'),
  box([97, WAIST, SIDE], [99, 38, SIDE + 1], 'trim'),
]);
const rearDoor = authored({ ...meta('door-rear', 'Rear door', 'body', 26), panel: 'z', pivot: [62, 0, SIDE] }, [
  box([42, DOOR_Y, 58], [63, WAIST, SIDE], 'paint'),
  box([42, 18, 57], [62, WAIST, 58], 'doorCard'),
  rearArch,
  box([42, WAIST, 58], [62, ROOF_Y, SIDE], 'trim'),
  box([44, WAIST, 58], [60, 52, 59], 'glass'),
  box([44, WAIST, 59], [60, 52, SIDE], 'air'),
  box([55, 33, SIDE], [59, 34, SIDE + 1], 'chrome'),
  rearFlare,
  box([20, -4, SIDE], [42, 30, SIDE + 1], 'air'),
  box([42, -4, SIDE], [60, WHEEL_Y, SIDE + 1], 'air'),
]);

const dashboard = authored(meta('dashboard', 'Dashboard', 'interior', 20), [
  box([90, 27, 7], [100, WAIST, 57], 'dash'),
  box([94, WAIST, 43], [99, 40, 54], 'dash'),
  paintBox([94, 38, 44], [95, 40, 53], 'dial'),
  paintBox([90, 33, 26], [91, 35, 38], 'trim'),
]);
const steering = authored(meta('steering', 'Steering wheel and column', 'interior', 6), [
  box([91, WAIST, 48], [94, 39, 50], 'trim'),
  box([89, 39, 48], [92, 42, 50], 'trim'),
  disc('x', [49, 43.5, 6.5, 5.4], [87, 88], 'trim'),
  box([87, 43, 43], [88, 44, 55], 'trim'),
  box([87, WAIST, 48], [88, 44, 50], 'trim'),
  disc('x', [49, 43.5, 1.8], [87, 89], 'trim'),
]);
const gearLever = authored(meta('gear-lever', 'Gear and transfer levers', 'interior', 2), [
  box([84, 26, 31], [89, 27, 36], 'trim'),
  box([86, 27, 33], [87, 33, 34], 'trim'),
  box([85, 33, 32], [88, 35, 35], 'trim'),
  box([84, 27, 31], [85, 31, 32], 'trim'),
  box([83, 31, 30], [86, 33, 33], 'alloy'),
]);
const frontSeat = authored(meta('front-seat', 'Front seat', 'interior', 20), [
  box([72, 18, 44], [84, 25, 53], 'trim'),
  box([70, 25, 42], [86, 29, 55], 'seat'),
  prism(
    'z',
    [
      [66, 26],
      [71, 26],
      [68, 48],
      [63, 48],
    ],
    [42, 55],
    'seat',
  ),
  box([63, 48, 45], [67, 52, 52], 'seat'),
]);
const rearBench = authored(meta('rear-bench', 'Rear bench', 'interior', 30), [
  box([46, 18, 14], [56, 24, 50], 'trim'),
  box([44, 24, 12], [58, 28, 52], 'seat'),
  prism(
    'z',
    [
      [40, 24],
      [45, 24],
      [42, 46],
      [37, 46],
    ],
    [12, 52],
    'seat',
  ),
]);

const PARTS: readonly Authored[] = [
  wheel,
  crossmember,
  frameRail,
  axleFront,
  axleRear,
  engine,
  gearbox,
  fuelTank,
  exhaust,
  radiator,
  battery,
  floorPan,
  sill,
  bulkhead,
  innerWing,
  aPost,
  bPillar,
  rearQuarter,
  roof,
  windscreen,
  upperTailgate,
  lowerTailgate,
  tailLamp,
  rearBumper,
  frontWing,
  frontPanel,
  headlight,
  frontBumper,
  bonnet,
  frontDoor,
  rearDoor,
  dashboard,
  steering,
  gearLever,
  frontSeat,
  rearBench,
];

const RAILS = ['frame-rail-near', 'frame-rail-far'];

const FITTINGS: readonly Fitting[] = [
  ...pair('frame-rail', frameRail, []),
  place('crossmember-rear', crossmember, RAILS, { at: [4, 13, 18] }),
  place('crossmember-mid', crossmember, RAILS, { at: [56, 13, 18] }),
  place('crossmember-gearbox', crossmember, RAILS, { at: [96, 13, 18] }),
  place('crossmember-front', crossmember, RAILS, { at: [132, 13, 18] }),
  place('axle-front', axleFront, RAILS),
  place('axle-rear', axleRear, RAILS),
  ...pair('wheel-front', wheel, ['axle-front'], { at: [AXLE_FRONT - 12, 0, 52], motion: 'spin' }),
  ...pair('wheel-rear', wheel, ['axle-rear'], { at: [AXLE_REAR - 12, 0, 52], motion: 'spin' }),
  place('engine', engine, RAILS),
  place('gearbox', gearbox, ['engine', 'crossmember-gearbox']),
  place('fuel-tank', fuelTank, RAILS),
  place('exhaust', exhaust, ['frame-rail-far']),
  place('radiator', radiator, ['crossmember-front']),
  place('floor-pan', floorPan, RAILS),
  ...pair('sill', sill, ['floor-pan']),
  place('bulkhead', bulkhead, ['floor-pan']),
  ...pair('inner-wing', innerWing, ['bulkhead']),
  place('battery', battery, ['inner-wing-near']),
  ...pair('a-post', aPost, ['bulkhead', 'sill-near']),
  ...pair('b-pillar', bPillar, ['floor-pan']),
  ...pair('rear-quarter', rearQuarter, ['floor-pan']),
  place('roof', roof, [
    'a-post-near',
    'a-post-far',
    'b-pillar-near',
    'b-pillar-far',
    'rear-quarter-near',
    'rear-quarter-far',
  ]),
  place('windscreen', windscreen, ['a-post-near', 'a-post-far', 'bulkhead']),
  place('tailgate-upper', upperTailgate, ['roof']),
  place('tailgate-lower', lowerTailgate, ['rear-quarter-near', 'rear-quarter-far']),
  ...pair('tail-lamp', tailLamp, ['rear-quarter-near']),
  place('rear-bumper', rearBumper, RAILS),
  ...pair('front-wing', frontWing, ['inner-wing-near']),
  place('front-panel', frontPanel, ['inner-wing-near', 'inner-wing-far']),
  ...pair('headlight', headlight, ['front-panel']),
  place('front-bumper', frontBumper, RAILS),
  place('bonnet', bonnet, ['bulkhead', 'inner-wing-near', 'inner-wing-far']),
  ...pair('door-front', frontDoor, ['a-post-near'], { motion: 'hinge' }),
  ...pair('door-rear', rearDoor, ['b-pillar-near'], { motion: 'hinge' }),
  place('dashboard', dashboard, ['bulkhead']),
  place('steering', steering, ['dashboard']),
  place('gear-lever', gearLever, ['floor-pan']),
  ...pair('front-seat', frontSeat, ['floor-pan']),
  place('rear-bench', rearBench, ['floor-pan']),
  place('spare-wheel', wheel, ['floor-pan'], { at: [10, 18, 44] }),
];

export const RANGE_ROVER: Vehicle = {
  id: 'rover',
  label: 'Range Rover-type 4×4',
  lattice: [36, 15, 16],
  palette: {
    paint: '#b3a07c',
    seam: '#857552',
    trim: '#24292b',
    chassis: '#2f3335',
    glass: '#55707a',
    chrome: '#c3c6c0',
    tyre: '#272b2d',
    tread: '#34393c',
    rim: '#bcbfb8',
    rimDark: '#4b5053',
    lamp: '#dfe3d8',
    lampHot: '#fbfbf1',
    tail: '#a5292d',
    amber: '#d48b2d',
    lampWhite: '#dcdfd6',
    grille: '#3b4043',
    plateFront: '#e8e8e1',
    plateRear: '#dfc54a',
    seat: '#8e7558',
    doorCard: '#7b6b56',
    dash: '#303435',
    dial: '#596057',
    carpet: '#4b463f',
    loadFloor: '#3f3b36',
    headliner: '#bfb8a7',
    engine: '#8e928c',
    alloy: '#babeb7',
    tank: '#3d4b40',
    radiator: '#3c403e',
  },
  parts: Object.fromEntries(PARTS.map(({ type }) => [type.id, type])),
  fittings: FITTINGS,
};

/** The car on the workshop lift: panels, glass and wheels off, shell, engine and cabin left to read. */
export const STRIPPED_REMOVED: readonly string[] = [
  'bonnet',
  'front-wing-near',
  'front-wing-far',
  'headlight-near',
  'headlight-far',
  'front-panel',
  'front-bumper',
  'rear-bumper',
  'door-front-near',
  'door-front-far',
  'door-rear-near',
  'door-rear-far',
  'tailgate-upper',
  'tailgate-lower',
  'wheel-front-near',
  'wheel-front-far',
  'wheel-rear-near',
  'wheel-rear-far',
];
