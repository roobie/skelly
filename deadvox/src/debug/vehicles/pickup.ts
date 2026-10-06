/**
 * A Toyota Hilux N80-type regular-cab, long-bed 4WD pickup, built from parts: 4.72 m long, 1.69 m
 * wide, 1.76 m tall, 2.85 m wheelbase, 1.41 m track, on the 4×4's 205R16 wheels. Proportions follow
 * a period side elevation; the cab and bed split is derived (see the r43-6 report).
 */
import { type Authored, authored, box, disc, meta, paintBox, pair, partsOf, place, prism } from './authoring.ts';
import type { Fitting, Vehicle } from './model.ts';
import { battery, crossmember, gearLever, steering, wheel } from './rangeRover.ts';

// Vehicle-local voxels (3.125 cm): x forward from behind the rear bumper, y up, z across with the
// near side at high z and the centre plane at 32. The frame rails keep the 4×4's spacing, so its
// crossmember fits between them.
const AXLE_REAR = 37;
const AXLE_FRONT = 128;
const WHEEL_Y = 12;
const ARCH_R = 13.5;
/** Body sides; the narrower track leaves the tyres' outer faces a voxel inside them. */
const SIDE = 59;
const WHEEL_Z = 51;
const WAIST = 39;
const ROOF_TOP = 56;
const ROOF_Y = ROOF_TOP - 3;
const COWL_X = 116;
const CAB_BACK = 72;
/** A 4WD's bed floor clears the rear tyres; the wheel tubs rise through it. */
const BED_FLOOR = 27;
/** The windscreen and A-pillars lean back 17 voxels over a 15-voxel rise, about 49° from vertical. */
const screenX = (y: number): number => COWL_X - ((y - 40) * 17) / 15;

const frameRail = authored(meta('frame-rail', 'Chassis rail', 'frame', 80), [
  box([4, 13, 46], [148, 17, 50], 'chassis'),
]);

const axle = (id: string, label: string, x: number): Authored =>
  authored(meta(id, label, 'under', 90), [
    box([x - 2, 10, 14], [x + 2, 13, 50], 'chassis'),
    box([x - 4, 6, 25], [x + 5, 13, 35], 'chassis'),
    disc('z', [x, WHEEL_Y, 4.5], [50, WHEEL_Z], 'steelHub'),
    disc('z', [x, WHEEL_Y, 4.5], [13, 14], 'steelHub'),
  ]);
const axleFront = axle('axle-front', 'Front axle', AXLE_FRONT);
const axleRear = axle('axle-rear', 'Rear axle', AXLE_REAR);

const engine = authored({ ...meta('engine', 'Four-cylinder engine', 'under', 150), noise: { radiusMetres: 65 } }, [
  box([120, 17, 25], [140, 30, 39], 'engine'),
  box([121, 30, 26], [139, 33, 38], 'alloy'),
  box([124, 33, 28], [136, 34, 36], 'trim'),
  box([122, 22, 39], [136, 26, 42], 'chassis'),
  box([124, 15, 18], [128, 17, 25], 'chassis'),
  box([124, 15, 39], [128, 17, 46], 'chassis'),
  disc('x', [32, 23, 5.5], [140, 142], { mat: 'trim', sectors: { count: 6, duty: 0.55 } }),
]);
const gearbox = authored(meta('gearbox', 'Gearbox and transfer box', 'under', 65), [
  box([94, 17, 27], [120, 24, 37], 'engine'),
  box([96, 12, 28], [108, 17, 36], 'engine'),
]);
const fuelTank = authored(meta('fuel-tank', 'Fuel tank', 'under', 45), [box([44, 12, 18], [66, 17, 46], 'tank')]);
const exhaust = authored({ ...meta('exhaust', 'Exhaust and silencer', 'under', 14), noise: { rangeScale: 0.5 } }, [
  disc('x', [12, 15.5, 1.6], [92, 114], 'chassis'),
  box([72, 12, 8], [92, 17, 14], 'chassis'),
  disc('x', [11, 14, 1.6], [56, 72], 'chassis'),
]);
const radiator = authored(meta('radiator', 'Radiator', 'under', 12), [box([142, 16, 18], [146, 34, 46], 'radiator')]);

const cabFloor = authored(meta('cab-floor', 'Cab floor and transmission tunnel', 'frame', 55), [
  box([CAB_BACK, 17, 7], [COWL_X, 19, 25], 'chassis'),
  box([CAB_BACK, 17, 39], [COWL_X, 19, 57], 'chassis'),
  box([CAB_BACK, 17, 25], [94, 19, 39], 'chassis'),
  box([94, 17, 25], [COWL_X, 28, 27], 'chassis'),
  box([94, 17, 37], [COWL_X, 28, 39], 'chassis'),
  box([94, 26, 27], [COWL_X, 28, 37], 'carpet'),
  box([75, 19, 8], [COWL_X, 20, 25], 'carpet'),
  box([75, 19, 39], [COWL_X, 20, 56], 'carpet'),
  box([75, 19, 25], [94, 20, 39], 'carpet'),
]);
const sill = authored(meta('sill', 'Sill', 'frame', 10), [box([75, 17, 57], [COWL_X, 19, SIDE], 'trim')]);
// Below the wheel tops the bulkhead stays inboard of the front tyres, which reach back to the cowl.
const bulkhead = authored(meta('bulkhead', 'Bulkhead and cowl', 'body', 18), [
  box([COWL_X, 17, 13], [118, 40, 25], 'paint'),
  box([COWL_X, 17, 39], [118, 40, WHEEL_Z], 'paint'),
  box([COWL_X, 28, 25], [118, 40, 39], 'paint'),
  box([COWL_X, 24, 5], [118, 40, 13], 'paint'),
  box([COWL_X, 24, WHEEL_Z], [118, 40, SIDE], 'paint'),
  box([118, 38, 13], [120, 40, WHEEL_Z], 'trim'),
]);
const innerWing = authored(meta('inner-wing', 'Inner wing and battery shelf', 'body', 8), [
  box([118, 20, 49], [146, 36, WHEEL_Z], 'paint'),
  box([130, 24, 43], [142, 26, 49], 'paint'),
]);
const aPost = authored(meta('a-post', 'A-pillar', 'body', 6), [
  prism(
    'z',
    [
      [113, 20],
      [COWL_X, 20],
      [COWL_X, 40],
      [screenX(ROOF_Y), ROOF_Y],
      [screenX(ROOF_Y) - 3, ROOF_Y],
      [113, 40],
    ],
    [57, SIDE],
    'paint',
  ),
]);
const cabBack = authored({ ...meta('cab-back', 'Cab back wall and B-pillars', 'body', 30), panel: 'x' }, [
  box([CAB_BACK, 19, 7], [75, ROOF_Y, 57], 'paint'),
  box([75, 19, 57], [78, ROOF_Y, SIDE], 'paint'),
  box([75, 19, 5], [78, ROOF_Y, 7], 'paint'),
  box([CAB_BACK, 41, 14], [75, 51, 50], 'glass'),
]);
const roof = authored({ ...meta('roof', 'Roof', 'roof', 25), panel: 'y' }, [
  prism(
    'z',
    [
      [CAB_BACK, ROOF_Y],
      [screenX(ROOF_Y), ROOF_Y],
      [screenX(ROOF_TOP), ROOF_TOP],
      [CAB_BACK + 1, ROOF_TOP],
    ],
    [5, SIDE],
    'paint',
  ),
  box([75, ROOF_Y - 1, 7], [screenX(ROOF_Y - 1) - 2, ROOF_Y, 57], 'headliner'),
]);
const windscreen = authored(meta('windscreen', 'Windscreen', 'body', 12), [
  prism(
    'z',
    [
      [screenX(40) - 1, 40],
      [screenX(40) + 1, 40],
      [screenX(ROOF_Y) + 1, ROOF_Y],
      [screenX(ROOF_Y) - 1, ROOF_Y],
    ],
    [7, 57],
    'glass',
  ),
  box([114, 39, 13], [COWL_X, 40, WHEEL_Z], 'trim'),
]);
const door = authored({ ...meta('door', 'Door', 'body', 26), panel: 'z', pivot: [113, 0, SIDE] }, [
  box([78, 19, 57], [113, WAIST, SIDE], 'paint'),
  box([78, 19, 56], [113, WAIST, 57], 'doorCard'),
  prism(
    'z',
    [
      [78, WAIST],
      [112, WAIST],
      [screenX(ROOF_Y) - 4, ROOF_Y],
      [78, ROOF_Y],
    ],
    [57, SIDE],
    'trim',
  ),
  prism(
    'z',
    [
      [80, WAIST + 1],
      [109, WAIST + 1],
      [screenX(ROOF_Y - 2) - 6, ROOF_Y - 2],
      [80, ROOF_Y - 2],
    ],
    [57, SIDE],
    'glass',
  ),
  box([82, 33, SIDE], [87, 34, SIDE + 1], 'chrome'),
]);

const frontWing = authored({ ...meta('front-wing', 'Front wing', 'body', 9), panel: 'z' }, [
  box([118, 20, WHEEL_Z], [146, 38, SIDE], 'paint'),
  box([118, 20, WHEEL_Z + 1], [146, 36, 57], 'air'),
  disc('z', [AXLE_FRONT, WHEEL_Y, ARCH_R], [WHEEL_Z, SIDE + 1], 'air'),
  disc('z', [AXLE_FRONT, WHEEL_Y, 15.5, ARCH_R], [SIDE, SIDE + 1], 'trim'),
  box([110, -4, SIDE], [148, WHEEL_Y, SIDE + 1], 'air'),
]);
const frontPanel = authored(meta('front-panel', 'Grille panel', 'body', 8), [
  box([146, 26, 7], [148, 36, 57], 'grille'),
  paintBox([147, 27, 19], [148, 33, 45], 'trim'),
  box([146, 34, 7], [148, 36, 57], 'paint'),
]);
const headlight = authored(meta('headlight', 'Headlight', 'body', 2), [
  box([148, 29, 46], [149, 34, 56], 'lamp'),
  paintBox([148, 30, 47], [149, 33, 55], 'lampHot'),
  box([148, 27, 50], [149, 29, 56], 'amber'),
]);
const frontBumper = authored(meta('front-bumper', 'Front bumper', 'body', 14), [
  box([148, 19, 5], [151, 26, SIDE], 'chrome'),
  box([148, 13, 14], [150, 19, 18], 'chassis'),
  box([148, 13, 46], [150, 19, 50], 'chassis'),
  box([151, 21, 26], [152, 24, 38], 'plateFront'),
]);
const bonnet = authored({ ...meta('bonnet', 'Bonnet', 'body', 18), panel: 'y', noise: { rangeScale: 0.8 } }, [
  prism(
    'z',
    [
      [120, 36],
      [148, 36],
      [148, 38],
      [120, 40],
    ],
    [13, WHEEL_Z],
    'paint',
  ),
]);

const bedFloor = authored({ ...meta('bed-floor', 'Bed floor and bearers', 'frame', 45), noise: { rangeScale: 0.95 } }, [
  box([4, BED_FLOOR - 2, 7], [CAB_BACK, BED_FLOOR, 57], 'bedFloor'),
  box([4, 17, 14], [CAB_BACK, BED_FLOOR - 2, 50], 'chassis'),
]);
const bedFront = authored(meta('bed-front', 'Bed headboard', 'body', 10), [
  box([CAB_BACK - 2, BED_FLOOR, 7], [CAB_BACK, WAIST, 57], 'paint'),
]);
const bedSide = authored({ ...meta('bed-side', 'Bed side and wheel tub', 'body', 24), panel: 'z' }, [
  box([2, 20, 57], [CAB_BACK, WAIST, SIDE], 'paint'),
  box([4, 37, 54], [CAB_BACK - 2, WAIST, 57], 'paint'),
  disc('z', [AXLE_REAR, WHEEL_Y, ARCH_R], [54, SIDE + 1], 'air'),
  disc('z', [AXLE_REAR, WHEEL_Y, 15.5, ARCH_R], [SIDE, SIDE + 1], 'trim'),
  disc('z', [AXLE_REAR, WHEEL_Y + 1, 15.5, ARCH_R], [50, 57], 'chassis'),
  box([18, -4, 48], [56, WHEEL_Y, SIDE + 1], 'air'),
  box([18, 17, 48], [56, BED_FLOOR, 57], 'air'),
]);
const tailgate = authored({ ...meta('tailgate', 'Tailgate', 'body', 16), panel: 'x' }, [
  box([2, BED_FLOOR - 3, 7], [4, WAIST - 1, 57], 'paint'),
  box([1, 34, 28], [2, 36, 36], 'trim'),
]);
const tailLamp = authored(meta('tail-lamp', 'Tail lamp', 'body', 1), [
  box([1, 26, 57], [2, 36, SIDE], 'tail'),
  paintBox([1, 26, 57], [2, 28, SIDE], 'amber'),
  paintBox([1, 30, 57], [2, 32, SIDE], 'lampWhite'),
]);
const rearBumper = authored(meta('rear-bumper', 'Step bumper', 'body', 16), [
  box([0, 14, 5], [4, 20, SIDE], 'chrome'),
  box([0, 20, 26], [1, 22, 38], 'plateRear'),
]);

const dashboard = authored(meta('dashboard', 'Dashboard', 'interior', 16), [
  box([108, 29, 8], [COWL_X, WAIST, 56], 'dash'),
  box([108, WAIST, 43], [113, 42, 54], 'dash'),
  paintBox([108, 40, 44], [109, 42, 53], 'dial'),
]);
const bench = authored(meta('bench', 'Bench seat', 'interior', 28), [
  box([82, 20, 10], [92, 26, 24], 'trim'),
  box([82, 20, 40], [92, 26, 54], 'trim'),
  box([80, 26, 9], [94, 30, 55], 'seat'),
  box([75, 26, 9], [79, 49, 55], 'seat'),
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
  cabFloor,
  sill,
  bulkhead,
  innerWing,
  aPost,
  cabBack,
  roof,
  windscreen,
  door,
  frontWing,
  frontPanel,
  headlight,
  frontBumper,
  bonnet,
  bedFloor,
  bedFront,
  bedSide,
  tailgate,
  tailLamp,
  rearBumper,
  dashboard,
  steering,
  gearLever,
  bench,
];

const RAILS = ['frame-rail-near', 'frame-rail-far'];

/** The 4×4's steering and levers fit this cab 14 voxels further forward and 2 higher. */
const inCab = (part: Authored): readonly [number, number, number] => [part.at[0] + 14, part.at[1] + 2, part.at[2]];

const FITTINGS: readonly Fitting[] = [
  ...pair('frame-rail', frameRail, []),
  place('crossmember-rear', crossmember, RAILS, { at: [4, 13, 18] }),
  place('crossmember-bed', crossmember, RAILS, { at: [66, 13, 18] }),
  place('crossmember-gearbox', crossmember, RAILS, { at: [108, 13, 18] }),
  place('crossmember-front', crossmember, RAILS, { at: [144, 13, 18] }),
  place('axle-front', axleFront, RAILS),
  place('axle-rear', axleRear, RAILS),
  ...pair('wheel-front', wheel, ['axle-front'], { at: [AXLE_FRONT - 12, 0, WHEEL_Z], motion: 'spin' }),
  ...pair('wheel-rear', wheel, ['axle-rear'], { at: [AXLE_REAR - 12, 0, WHEEL_Z], motion: 'spin' }),
  place('engine', engine, RAILS),
  place('gearbox', gearbox, ['engine', 'crossmember-gearbox']),
  place('fuel-tank', fuelTank, RAILS),
  place('exhaust', exhaust, ['frame-rail-far']),
  place('radiator', radiator, ['crossmember-front']),
  place('cab-floor', cabFloor, RAILS),
  ...pair('sill', sill, ['cab-floor']),
  place('bulkhead', bulkhead, ['cab-floor']),
  ...pair('inner-wing', innerWing, ['bulkhead']),
  place('battery', battery, ['inner-wing-near'], { at: [130, 24, 40] }),
  ...pair('a-post', aPost, ['bulkhead']),
  place('cab-back', cabBack, ['cab-floor']),
  place('roof', roof, ['a-post-near', 'a-post-far', 'cab-back']),
  place('windscreen', windscreen, ['a-post-near', 'a-post-far', 'bulkhead']),
  ...pair('door', door, ['a-post-near'], { motion: 'hinge' }),
  ...pair('front-wing', frontWing, ['inner-wing-near']),
  place('front-panel', frontPanel, ['inner-wing-near', 'inner-wing-far']),
  ...pair('headlight', headlight, ['front-panel']),
  place('front-bumper', frontBumper, RAILS),
  place('bonnet', bonnet, ['bulkhead', 'inner-wing-near', 'inner-wing-far']),
  place('bed-floor', bedFloor, RAILS),
  place('bed-front', bedFront, ['bed-floor']),
  ...pair('bed-side', bedSide, ['bed-floor']),
  place('tailgate', tailgate, ['bed-side-near', 'bed-side-far']),
  ...pair('tail-lamp', tailLamp, ['bed-side-near']),
  place('rear-bumper', rearBumper, RAILS),
  place('dashboard', dashboard, ['bulkhead']),
  place('steering', steering, ['dashboard'], { at: inCab(steering) }),
  place('gear-lever', gearLever, ['cab-floor'], { at: inCab(gearLever) }),
  place('bench', bench, ['cab-floor']),
  place('spare-wheel', wheel, ['bed-floor'], { at: [46, BED_FLOOR, 14] }),
];

export const PICKUP: Vehicle = {
  id: 'pickup',
  label: 'Hilux-type pickup',
  lattice: [38, 15, 16],
  palette: {
    paint: '#b4513f',
    seam: '#7a362c',
    trim: '#24292b',
    chassis: '#2f3335',
    glass: '#55707a',
    chrome: '#c3c6c0',
    tyre: '#272b2d',
    tread: '#34393c',
    rim: '#bcbfb8',
    rimDark: '#4b5053',
    steelHub: '#5b6063',
    lamp: '#dfe3d8',
    lampHot: '#fbfbf1',
    tail: '#a5292d',
    amber: '#d48b2d',
    lampWhite: '#dcdfd6',
    grille: '#3b4043',
    plateFront: '#e8e8e1',
    plateRear: '#dfc54a',
    seat: '#6f6458',
    doorCard: '#5b5249',
    dash: '#303435',
    dial: '#596057',
    carpet: '#4b463f',
    bedFloor: '#3a3632',
    headliner: '#bfb8a7',
    engine: '#8e928c',
    alloy: '#babeb7',
    tank: '#3d4b40',
    radiator: '#3c403e',
  },
  parts: partsOf(PARTS),
  fittings: FITTINGS,
};
