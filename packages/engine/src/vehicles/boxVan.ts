/**
 * A typical European 3.5-tonne light box van, built from parts: a rear-wheel-drive chassis cab
 * with a 4.2 m dry-freight box fitted behind it. 6.3 m long, 2.0 m wide at the cab and 2.1 m at the
 * box, 3.1 m tall over the box, 3.75 m wheelbase, 1.72 m track, single rear wheels. The sizes are
 * the class's, not one model's (see `docs/vehicle-spike.md`, "Proportions").
 */
import {
  type Authored,
  authored,
  box,
  disc,
  local,
  meta,
  metaFor,
  paintBox,
  pairAcross,
  partsOf,
  place,
  prism,
} from './authoring.ts';
import { type Blueprint, type Fitting, type PartType, VOXELS_PER_CELL } from './model.ts';
import { battery, crossmember, gearLever, steering } from './rangeRover.ts';
import type { ShapeOp } from './voxels.ts';

const LATTICE = [51, 26, 20] as const;
const own = metaFor('van');
const pair = pairAcross(LATTICE[2] * VOXELS_PER_CELL);

// Vehicle-local voxels (3.125 cm): x forward from behind the rear underrun bar, y up, z across with
// the near side at high z and the centre plane at 40. The rails keep the 4×4's inner spacing, so its
// crossmember fits between them; they sit higher, on the axles' springs.
const AXLE_REAR = 52;
const AXLE_FRONT = 172;
const WHEEL_Y = 12;
const ARCH_R = 13.5;
const WHEEL_Z = 64;
const CAB_SIDE = 72;
const BOX_SIDE = 74;
const WAIST = 48;
const ROOF_Y = 72;
const ROOF_TOP = 75;
const COWL_X = 176;
const CAB_BACK = 140;
/** The box's front wall stands clear of the cab's back, so either comes off without the other. */
const BOX_FRONT = 138;
/** The load floor clears the rear tyres; a box van has no wheel tubs. */
const FLOOR_TOP = 31;
const BOX_TOP = 99;
/** The windscreen and A-pillars lean back 14 voxels over a 24-voxel rise, about 30° from vertical. */
const screenX = (y: number): number => COWL_X - ((y - WAIST) * 14) / 24;

/** A load-rated 16-inch tyre on a steel wheel: the van's, and any light truck's that runs the size. */
const steelWheel = local({
  ...meta('wheel-16c-steel', 'Wheel (16-inch van tyre on a steel rim)', 'under', 32),
  pivot: [12, 12, 3.5],
  shape: [
    disc('z', [12, 12, 12, 7], [0, 7], 'tyre'),
    disc('z', [12, 12, 12, 11], [0, 7], { mat: 'tread', paint: true, sectors: { count: 18, duty: 0.5 } }),
    disc('z', [12, 12, 7], [0, 6], 'steelHub'),
    disc('z', [12, 12, 5.5, 3.5], [5, 6], { mat: 'rimDark', paint: true, sectors: { count: 8, duty: 0.3 } }),
    disc('z', [12, 12, 2], [5, 6], { mat: 'chrome', paint: true }),
  ],
});

const frameRail = authored(own('frame-rail', 'Chassis rail', 'frame', 110), [
  box([4, 17, 54], [198, 23, 58], 'chassis'),
]);

/** A beam axle on leaf springs that carry the rails. */
const beamAxle = (x: number): readonly ShapeOp[] => [
  box([x - 2, 10, 17], [x + 2, 13, 63], 'chassis'),
  box([x - 12, 13, 54], [x + 12, 17, 58], 'spring'),
  box([x - 12, 13, 22], [x + 12, 17, 26], 'spring'),
  disc('z', [x, WHEEL_Y, 4.5], [63, WHEEL_Z], 'steelHub'),
  disc('z', [x, WHEEL_Y, 4.5], [16, 17], 'steelHub'),
];
const axleFront = authored(own('axle-front', 'Front axle', 'under', 110), beamAxle(AXLE_FRONT));
// The differential's pinion takes the propeller shaft.
const axleRear = authored(own('axle-rear', 'Rear axle and differential', 'under', 140), [
  ...beamAxle(AXLE_REAR),
  box([AXLE_REAR - 4, 6, 34], [AXLE_REAR + 5, 16, 46], 'chassis'),
  box([AXLE_REAR + 5, 13, 38], [AXLE_REAR + 8, 19, 43], 'chassis'),
]);

const engine = authored(
  { ...own('engine', 'Four-cylinder diesel engine', 'under', 210), noise: { radiusMetres: 70 } },
  [
    box([178, 24, 30], [192, 40, 50], 'engine'),
    box([179, 40, 31], [191, 43, 49], 'alloy'),
    box([181, 43, 33], [189, 44, 47], 'trim'),
    box([182, 20, 26], [186, 24, 30], 'chassis'),
    box([182, 20, 50], [186, 24, 54], 'chassis'),
    disc('x', [40, 32, 5.5], [192, 194], { mat: 'trim', sectors: { count: 6, duty: 0.55 } }),
  ],
);
const gearbox = authored(own('gearbox', 'Gearbox', 'under', 70), [box([156, 16, 32], [178, 26, 48], 'engine')]);
const propShaft = authored(own('prop-shaft', 'Propeller shaft', 'under', 15), [
  box([AXLE_REAR + 8, 15, 39], [156, 18, 42], 'chassis'),
]);
const fuelTank = authored(own('fuel-tank', 'Fuel tank', 'under', 30), [box([100, 12, 10], [130, 22, 22], 'tank')]);
const exhaust = authored({ ...own('exhaust', 'Exhaust and silencer', 'under', 18), noise: { rangeScale: 0.5 } }, [
  box([70, 15, 58], [176, 18, 61], 'chassis'),
  box([84, 11, 58], [106, 18, 64], 'chassis'),
]);
const radiator = authored(own('radiator', 'Radiator', 'under', 14), [box([194, 23, 20], [196, 44, 60], 'radiator')]);

const cabFloor = authored(own('cab-floor', 'Cab floor and mounts', 'frame', 60), [
  box([CAB_BACK, 26, 8], [COWL_X + 2, 28, CAB_SIDE], 'chassis'),
  box([144, 23, 22], [148, 26, 26], 'rubber'),
  box([144, 23, 54], [148, 26, 58], 'rubber'),
  box([170, 23, 22], [174, 26, 26], 'rubber'),
  box([170, 23, 54], [174, 26, 58], 'rubber'),
]);
const step = authored(own('step', 'Cab step', 'frame', 8), [box([142, 20, 66], [158, 26, CAB_SIDE], 'trim')]);
const bulkhead = authored(own('bulkhead', 'Bulkhead and cowl', 'body', 25), [
  box([COWL_X, 28, 8], [COWL_X + 2, WAIST, CAB_SIDE], 'paint'),
]);
const innerWing = authored(own('inner-wing', 'Inner wing and battery shelf', 'body', 8), [
  box([178, 24, 62], [196, 44, 64], 'paint'),
]);
const aPost = authored(own('a-post', 'A-pillar', 'body', 7), [
  prism(
    'z',
    [
      [173, 28],
      [COWL_X, 28],
      [COWL_X, WAIST],
      [screenX(ROOF_Y), ROOF_Y],
      [screenX(ROOF_Y) - 3, ROOF_Y],
      [173, WAIST],
    ],
    [70, CAB_SIDE],
    'paint',
  ),
]);
// The box hides the cab's back, so it has no window.
const cabBack = authored({ ...own('cab-back', 'Cab back wall', 'body', 30), panel: 'x' }, [
  box([CAB_BACK, 28, 8], [CAB_BACK + 3, ROOF_Y, CAB_SIDE], 'paint'),
]);
const roof = authored({ ...own('roof', 'Cab roof', 'roof', 25), panel: 'y' }, [
  prism(
    'z',
    [
      [CAB_BACK, ROOF_Y],
      [screenX(ROOF_Y), ROOF_Y],
      [screenX(ROOF_TOP), ROOF_TOP],
      [CAB_BACK + 1, ROOF_TOP],
    ],
    [8, CAB_SIDE],
    'paint',
  ),
  box([144, ROOF_Y - 1, 10], [158, ROOF_Y, 70], 'headliner'),
]);
const windscreen = authored(own('windscreen', 'Windscreen', 'body', 15), [
  prism(
    'z',
    [
      [screenX(WAIST) - 1, WAIST],
      [screenX(WAIST) + 1, WAIST],
      [screenX(ROOF_Y) + 1, ROOF_Y],
      [screenX(ROOF_Y) - 1, ROOF_Y],
    ],
    [10, 70],
    'glass',
  ),
]);
const door = authored({ ...own('door', 'Cab door', 'body', 30), panel: 'z', pivot: [173, 0, CAB_SIDE] }, [
  box([143, 28, 70], [173, WAIST, CAB_SIDE], 'paint'),
  box([143, 28, 69], [173, WAIST, 70], 'doorCardBrown'),
  prism(
    'z',
    [
      [143, WAIST],
      [173, WAIST],
      [screenX(ROOF_Y) - 3, ROOF_Y],
      [143, ROOF_Y],
    ],
    [70, CAB_SIDE],
    'trim',
  ),
  prism(
    'z',
    [
      [145, WAIST + 1],
      [171, WAIST + 1],
      [screenX(ROOF_Y - 2) - 6, ROOF_Y - 2],
      [145, ROOF_Y - 2],
    ],
    [70, CAB_SIDE],
    'glass',
  ),
  box([148, 42, CAB_SIDE], [154, 43, CAB_SIDE + 1], 'trim'),
]);
const mirror = authored(own('mirror', 'Wing mirror', 'body', 2), [
  box([168, 58, CAB_SIDE], [170, 60, 76], 'trim'),
  box([166, 50, 76], [170, 64, 78], 'trim'),
  box([165, 51, 76], [166, 63, 78], 'chrome'),
]);

// Behind the cowl the wing is only the arch's rear, below the door.
const frontWing = authored({ ...own('front-wing', 'Front wing', 'body', 10), panel: 'z' }, [
  box([178, 20, WHEEL_Z], [196, 46, CAB_SIDE], 'paint'),
  box([178, 20, WHEEL_Z + 1], [196, 44, 70], 'air'),
  box([158, 20, WHEEL_Z], [178, 26, CAB_SIDE], 'paint'),
  box([158, 20, WHEEL_Z + 1], [178, 26, 70], 'air'),
  disc('z', [AXLE_FRONT, WHEEL_Y, ARCH_R], [WHEEL_Z, CAB_SIDE + 1], 'air'),
  disc('z', [AXLE_FRONT, WHEEL_Y, 15.5, ARCH_R], [CAB_SIDE, CAB_SIDE + 1], 'trim'),
  box([150, -4, WHEEL_Z], [200, WHEEL_Y, CAB_SIDE + 1], 'air'),
]);
const frontPanel = authored(own('front-panel', 'Grille panel', 'body', 8), [
  box([196, 26, 8], [198, 44, CAB_SIDE], 'grille'),
  box([196, 44, 8], [198, 46, CAB_SIDE], 'paint'),
]);
const headlight = authored(own('headlight', 'Headlight', 'body', 2), [
  box([198, 36, 52], [199, 44, 66], 'lamp'),
  paintBox([198, 37, 53], [199, 43, 60], 'lampHot'),
  paintBox([198, 38, 62], [199, 42, 66], 'amber'),
]);
const frontBumper = authored(own('front-bumper', 'Front bumper', 'body', 12), [
  box([198, 18, 8], [201, 32, CAB_SIDE], 'trim'),
  box([201, 24, 32], [202, 28, 48], 'plateFront'),
]);
const bonnet = authored({ ...own('bonnet', 'Bonnet', 'body', 18), panel: 'y', noise: { rangeScale: 0.8 } }, [
  prism(
    'z',
    [
      [178, 46],
      [196, 44],
      [196, 46],
      [178, WAIST],
    ],
    [16, WHEEL_Z],
    'paint',
  ),
]);

const dashboard = authored(own('dashboard', 'Dashboard', 'interior', 18), [
  box([166, 36, 11], [COWL_X, WAIST, 69], 'dash'),
  paintBox([166, 44, 50], [167, 47, 62], 'dial'),
]);
const driverSeat = authored(own('driver-seat', 'Driver’s seat', 'interior', 22), [
  box([146, 28, 54], [156, 33, 64], 'trim'),
  box([144, 33, 52], [158, 37, 66], 'seatVinyl'),
  box([144, 37, 52], [148, 62, 66], 'seatVinyl'),
]);
const bench = authored(own('bench', 'Passenger bench', 'interior', 30), [
  box([146, 28, 16], [156, 33, 40], 'trim'),
  box([144, 33, 12], [158, 37, 42], 'seatVinyl'),
  box([144, 37, 12], [148, 60, 42], 'seatVinyl'),
]);

// The cargo box: its own structure on the rails, so it comes off whole and leaves the chassis cab.
const boxFloor = authored(own('box-floor', 'Box floor and subframe', 'frame', 180), [
  box([4, 23, 22], [BOX_FRONT, 28, 26], 'chassis'),
  box([4, 23, 54], [BOX_FRONT, 28, 58], 'chassis'),
  ...Array.from({ length: 9 }, (_, k) => box([8 + k * 15, 25, 8], [11 + k * 15, 28, BOX_SIDE - 2], 'chassis')),
  box([3, 28, 8], [BOX_FRONT, FLOOR_TOP, BOX_SIDE - 2], 'loadFloor'),
]);
const boxFront = authored({ ...own('box-front', 'Box front wall', 'body', 45), panel: 'x' }, [
  box([BOX_FRONT - 2, FLOOR_TOP, 6], [BOX_FRONT, BOX_TOP, BOX_SIDE], 'paint'),
]);
const boxSide = authored({ ...own('box-side', 'Box side wall', 'body', 70), panel: 'z' }, [
  box([7, 26, BOX_SIDE - 2], [BOX_FRONT - 2, BOX_TOP - 3, BOX_SIDE], 'paint'),
]);
const boxRoof = authored({ ...own('box-roof', 'Box roof', 'roof', 40), panel: 'y' }, [
  box([7, BOX_TOP - 3, 6], [BOX_FRONT - 2, BOX_TOP, BOX_SIDE], 'paint'),
]);
const rearFrame = authored(own('box-rear-frame', 'Box rear frame', 'body', 35), [
  box([4, FLOOR_TOP, 6], [7, BOX_TOP, 12], 'alloy'),
  box([4, FLOOR_TOP, 68], [7, BOX_TOP, BOX_SIDE], 'alloy'),
  box([3, 88, 12], [7, BOX_TOP, 68], 'alloy'),
]);
const rollerDoor = authored(own('roller-door', 'Roll-up rear door', 'body', 40), [
  box([3, FLOOR_TOP, 12], [4, 88, 68], 'alloy'),
  ...Array.from({ length: 14 }, (_, k) => paintBox([3, 34 + k * 4, 12], [4, 35 + k * 4, 68], 'trim')),
  paintBox([3, 33, 36], [4, 35, 44], 'chrome'),
]);
const rearBumper = authored(own('rear-bumper', 'Rear underrun bar', 'body', 20), [
  box([0, 14, 10], [3, 20, 70], 'chassis'),
  box([3, 16, 22], [4, 23, 26], 'chassis'),
  box([3, 16, 54], [4, 23, 58], 'chassis'),
  box([0, 20, 32], [1, 24, 48], 'plateRear'),
]);
const tailLamp = authored(own('tail-lamp', 'Tail lamp', 'body', 1), [
  box([0, 20, 60], [2, 26, 70], 'tail'),
  paintBox([0, 20, 60], [1, 22, 70], 'amber'),
  paintBox([0, 23, 60], [1, 24, 70], 'lampWhite'),
]);

const PARTS: readonly Authored[] = [
  steelWheel,
  crossmember,
  frameRail,
  axleFront,
  axleRear,
  engine,
  gearbox,
  propShaft,
  fuelTank,
  exhaust,
  radiator,
  battery,
  cabFloor,
  step,
  bulkhead,
  innerWing,
  aPost,
  cabBack,
  roof,
  windscreen,
  door,
  mirror,
  frontWing,
  frontPanel,
  headlight,
  frontBumper,
  bonnet,
  dashboard,
  steering,
  gearLever,
  driverSeat,
  bench,
  boxFloor,
  boxFront,
  boxSide,
  boxRoof,
  rearFrame,
  rollerDoor,
  rearBumper,
  tailLamp,
];

const RAILS = ['frame-rail-near', 'frame-rail-far'];

const FITTINGS: readonly Fitting[] = [
  ...pair('frame-rail', frameRail, []),
  place('crossmember-rear', crossmember, RAILS, { at: [8, 20, 26] }),
  place('crossmember-mid', crossmember, RAILS, { at: [96, 20, 26] }),
  place('crossmember-gearbox', crossmember, RAILS, { at: [152, 20, 26] }),
  place('crossmember-front', crossmember, RAILS, { at: [192, 20, 26] }),
  place('axle-front', axleFront, RAILS),
  place('axle-rear', axleRear, RAILS),
  ...pair('wheel-front', steelWheel, ['axle-front'], { at: [AXLE_FRONT - 12, 0, WHEEL_Z], motion: 'spin' }),
  ...pair('wheel-rear', steelWheel, ['axle-rear'], { at: [AXLE_REAR - 12, 0, WHEEL_Z], motion: 'spin' }),
  place('engine', engine, RAILS),
  place('gearbox', gearbox, ['engine', 'crossmember-gearbox']),
  place('prop-shaft', propShaft, ['gearbox', 'axle-rear']),
  place('fuel-tank', fuelTank, ['frame-rail-far']),
  place('exhaust', exhaust, ['frame-rail-near']),
  place('radiator', radiator, ['crossmember-front']),
  place('cab-floor', cabFloor, RAILS),
  ...pair('step', step, ['cab-floor']),
  place('bulkhead', bulkhead, ['cab-floor']),
  ...pair('inner-wing', innerWing, ['bulkhead']),
  place('battery', battery, ['inner-wing-near'], { at: [180, 34, 54] }),
  ...pair('a-post', aPost, ['bulkhead']),
  place('cab-back', cabBack, ['cab-floor']),
  place('roof', roof, ['a-post-near', 'a-post-far', 'cab-back']),
  place('windscreen', windscreen, ['a-post-near', 'a-post-far', 'bulkhead']),
  ...pair('door', door, ['a-post-near'], { motion: 'hinge' }),
  ...pair('mirror', mirror, ['a-post-near']),
  ...pair('front-wing', frontWing, ['inner-wing-near']),
  place('front-panel', frontPanel, ['inner-wing-near', 'inner-wing-far']),
  ...pair('headlight', headlight, ['front-panel']),
  place('front-bumper', frontBumper, RAILS),
  place('bonnet', bonnet, ['bulkhead', 'inner-wing-near', 'inner-wing-far']),
  place('dashboard', dashboard, ['bulkhead']),
  place('steering', steering, ['dashboard'], { at: [158, 47, 46] }),
  place('gear-lever', gearLever, ['cab-floor'], { at: [156, 26, 42] }),
  place('driver-seat', driverSeat, ['cab-floor']),
  place('bench', bench, ['cab-floor']),
  place('box-floor', boxFloor, RAILS),
  place('box-front', boxFront, ['box-floor']),
  ...pair('box-side', boxSide, ['box-floor']),
  place('box-roof', boxRoof, ['box-side-near', 'box-side-far', 'box-front']),
  place('box-rear-frame', rearFrame, ['box-floor', 'box-side-near', 'box-side-far']),
  place('roller-door', rollerDoor, ['box-rear-frame']),
  place('rear-bumper', rearBumper, RAILS),
  ...pair('tail-lamp', tailLamp, ['rear-bumper']),
];

/** The types it uses; the shared ones are the 4×4's own objects, so the catalogue keeps one entry each. */
export const BOX_VAN_PARTS: readonly PartType[] = partsOf(PARTS);

export const BOX_VAN: Blueprint = {
  id: 'box-van',
  label: 'Box van',
  lattice: LATTICE,
  paint: { body: '#d9dbd6', seam: '#9a9c97' },
  fittings: FITTINGS,
};
