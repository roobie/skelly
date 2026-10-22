/**
 * A Mitsubishi Canter or Isuzu NPR-type cab-over light truck with a loader crane behind the cab, built
 * from parts: about 6.0 m long, 1.8 m wide across the cab, 2.2 m tall at the roof, 3.4 m wheelbase, on
 * the 4×4's wheels. The crane is fitted parts on the chassis, shown with its boom at rest on the deck
 * (see `docs/vehicle-spike.md`, "Proportions").
 */
import {
  type Authored,
  authored,
  box,
  disc,
  metaFor,
  paintBox,
  pairAcross,
  partsOf,
  place,
  prism,
  tube,
} from './authoring.ts';
import { type Blueprint, type Fitting, type PartType, VOXELS_PER_CELL } from './model.ts';
import { battery, crossmember, gearLever, steering, wheel } from './rangeRover.ts';

const LATTICE = [48, 18, 16] as const;
const own = metaFor('hoist');
const pair = pairAcross(LATTICE[2] * VOXELS_PER_CELL);

// Vehicle-local voxels (3.125 cm): x forward from behind the rear underrun, y up, z across with the
// near side at high z and the centre plane at 32. The frame rails keep the 4×4's spacing, so its
// crossmember fits between them.
const AXLE_REAR = 48;
const AXLE_FRONT = 157;
const WHEEL_Y = 12;
const WHEEL_Z = 51;
const ARCH_R = 13.5;
const SIDE = 61;
/** The cab sits over the engine and front axle, its floor clear of the front tyres. */
const CAB_BACK = 132;
const CAB_FRONT = 188;
const CAB_FLOOR = 32;
const WAIST = 46;
const ROOF_TOP = 70;
const ROOF_Y = ROOF_TOP - 3;
const DECK = 30;
const DECK_FRONT = 110;
/** The crane's slew axis and the boom's luff pin, in the side view. */
const SLEW_X = 121;
const LUFF_Y = 60;
/** The boom at rest runs from the luff pin down to its tip over the rear of the deck. */
const BOOM_ROOT = [122, LUFF_Y] as const;
const BOOM_TIP = [14, 44] as const;

const frameRail = authored(own('frame-rail', 'Chassis rail', 'frame', 110), [
  box([4, 13, 46], [CAB_FRONT, 17, 50], 'chassis'),
]);

const axle = (id: string, label: string, x: number): Authored =>
  authored(own(id, label, 'under', 140), [
    box([x - 2, 10, 14], [x + 2, 13, 50], 'chassis'),
    box([x - 4, 6, 25], [x + 5, 13, 35], 'chassis'),
    disc('z', [x, WHEEL_Y, 4.5], [50, WHEEL_Z], 'steelHub'),
    disc('z', [x, WHEEL_Y, 4.5], [13, 14], 'steelHub'),
  ]);
const axleFront = axle('axle-front', 'Front axle', AXLE_FRONT);
const axleRear = axle('axle-rear', 'Rear axle', AXLE_REAR);

const engine = authored({ ...own('engine', 'Four-cylinder diesel', 'under', 280), noise: { radiusMetres: 70 } }, [
  box([140, 17, 22], [168, 29, 42], 'engine'),
  box([144, 14, 26], [164, 17, 38], 'engine'),
  box([142, 26, 24], [166, 29, 40], 'alloy'),
  box([148, 15, 18], [152, 17, 22], 'chassis'),
  box([148, 15, 42], [152, 17, 46], 'chassis'),
  disc('x', [32, 23, 5.5], [168, 170], { mat: 'trim', sectors: { count: 6, duty: 0.55 } }),
]);
const gearbox = authored(own('gearbox', 'Gearbox', 'under', 70), [
  box([118, 17, 27], [140, 25, 37], 'engine'),
  box([126, 12, 28], [136, 17, 36], 'engine'),
]);
const propShaft = authored(own('prop-shaft', 'Prop shaft', 'under', 18), [
  tube(
    [
      [53, 11],
      [118, 20],
    ],
    3,
    [31, 34],
    'chassis',
  ),
]);
const fuelTank = authored(own('fuel-tank', 'Fuel tank', 'under', 55), [box([70, 8, 4], [100, 17, 14], 'tank')]);
const exhaust = authored({ ...own('exhaust', 'Exhaust and silencer', 'under', 18), noise: { rangeScale: 0.5 } }, [
  disc('x', [52, 14, 1.6], [104, 128], 'chassis'),
  box([84, 10, 50], [104, 16, 58], 'chassis'),
  disc('x', [54, 12, 1.6], [70, 84], 'chassis'),
]);
const radiator = authored(own('radiator', 'Radiator', 'under', 15), [box([182, 16, 20], [186, 29, 44], 'radiator')]);

const cabFloor = authored(own('cab-floor', 'Cab floor and mounts', 'frame', 80), [
  box([CAB_BACK, CAB_FLOOR - 2, 3], [CAB_FRONT, CAB_FLOOR, SIDE], 'chassis'),
  box([134, 17, 14], [138, CAB_FLOOR - 2, 18], 'chassis'),
  box([134, 17, 46], [138, CAB_FLOOR - 2, 50], 'chassis'),
  box([178, 17, 14], [182, CAB_FLOOR - 2, 18], 'chassis'),
  box([178, 17, 46], [182, CAB_FLOOR - 2, 50], 'chassis'),
  box([135, CAB_FLOOR, 8], [178, CAB_FLOOR + 1, 56], 'carpet'),
]);
const cabSkirt = authored(own('cab-skirt', 'Cab skirt and step', 'body', 10), [
  box([CAB_BACK, 18, 57], [CAB_FRONT, CAB_FLOOR - 2, SIDE], 'paint'),
  disc('z', [AXLE_FRONT, WHEEL_Y, ARCH_R], [WHEEL_Z, SIDE + 1], 'air'),
  disc('z', [AXLE_FRONT, WHEEL_Y, 15.5, ARCH_R], [SIDE, SIDE + 1], 'trim'),
  box([CAB_BACK, -4, SIDE], [CAB_FRONT, WHEEL_Y, SIDE + 1], 'air'),
]);
const cabBack = authored({ ...own('cab-back', 'Cab back wall and B-pillars', 'body', 35), panel: 'x' }, [
  box([CAB_BACK, CAB_FLOOR, 3], [135, ROOF_Y, SIDE], 'paint'),
  box([135, CAB_FLOOR, 57], [138, ROOF_Y, SIDE], 'paint'),
  box([135, CAB_FLOOR, 3], [138, ROOF_Y, 7], 'paint'),
  box([CAB_BACK, 48, 14], [135, 58, 50], 'glass'),
]);
const frontPanel = authored(own('front-panel', 'Cab front panel', 'body', 20), [
  box([185, CAB_FLOOR, 7], [CAB_FRONT, WAIST, 57], 'paint'),
  box([183, CAB_FLOOR, 57], [CAB_FRONT, WAIST, SIDE], 'paint'),
  box([183, CAB_FLOOR, 3], [CAB_FRONT, WAIST, 7], 'paint'),
  paintBox([187, 34, 18], [CAB_FRONT, 42, 46], 'grille'),
  paintBox([187, 43, 28], [CAB_FRONT, 45, 36], 'badge'),
]);
const aPost = authored(own('a-post', 'A-pillar', 'body', 6), [
  box([183, WAIST, 57], [CAB_FRONT, ROOF_Y, SIDE], 'paint'),
]);
const windscreen = authored(own('windscreen', 'Windscreen', 'body', 14), [
  box([186, WAIST, 7], [187, ROOF_Y, 57], 'glass'),
]);
const roof = authored({ ...own('roof', 'Roof', 'roof', 30), panel: 'y' }, [
  prism(
    'z',
    [
      [CAB_BACK, ROOF_Y],
      [CAB_FRONT, ROOF_Y],
      [CAB_FRONT - 3, ROOF_TOP],
      [CAB_BACK, ROOF_TOP],
    ],
    [3, SIDE],
    'paint',
  ),
  box([135, ROOF_Y - 1, 8], [183, ROOF_Y, 56], 'headliner'),
]);
const door = authored({ ...own('door', 'Door', 'body', 30), panel: 'z', pivot: [183, 0, SIDE] }, [
  box([138, CAB_FLOOR, 57], [183, WAIST, SIDE], 'paint'),
  box([138, CAB_FLOOR, 56], [183, WAIST, 57], 'doorCardBrown'),
  box([138, WAIST, 57], [183, ROOF_Y, SIDE], 'trim'),
  box([140, WAIST + 1, 57], [181, ROOF_Y - 2, SIDE], 'glass'),
  box([140, 40, SIDE], [145, 41, SIDE + 1], 'chrome'),
]);
const headlight = authored(own('headlight', 'Headlight', 'body', 2), [
  box([CAB_FRONT, 36, 48], [CAB_FRONT + 1, 41, 57], 'lamp'),
  paintBox([CAB_FRONT, 37, 49], [CAB_FRONT + 1, 40, 56], 'lampHot'),
  box([CAB_FRONT, 36, 57], [CAB_FRONT + 1, 41, 60], 'amber'),
]);
const frontBumper = authored(own('front-bumper', 'Front bumper', 'body', 20), [
  box([CAB_FRONT, 18, 3], [CAB_FRONT + 3, 26, SIDE], 'trim'),
  box([CAB_FRONT, 13, 14], [CAB_FRONT + 2, 18, 18], 'chassis'),
  box([CAB_FRONT, 13, 46], [CAB_FRONT + 2, 18, 50], 'chassis'),
  box([CAB_FRONT + 3, 20, 26], [CAB_FRONT + 4, 24, 38], 'plateFront'),
]);
const dashboard = authored(own('dashboard', 'Dashboard', 'interior', 18), [
  box([178, CAB_FLOOR, 8], [185, WAIST, 56], 'dash'),
  box([178, WAIST, 43], [183, 53, 54], 'dash'),
  paintBox([178, 49, 44], [179, 52, 53], 'dial'),
]);
const engineCover = authored({ ...own('engine-cover', 'Engine cover', 'interior', 12), noise: { rangeScale: 0.85 } }, [
  box([150, CAB_FLOOR + 1, 24], [176, 40, 40], 'trim'),
]);
const bench = authored(own('bench', 'Bench seat', 'interior', 30), [
  box([138, CAB_FLOOR + 1, 9], [150, 44, 55], 'seatVinyl'),
  box([135, 44, 9], [139, 62, 55], 'seatVinyl'),
]);

const deckFloor = authored(own('deck-floor', 'Deck floor and bearers', 'frame', 120), [
  box([4, DECK - 2, 3], [DECK_FRONT, DECK, SIDE], 'loadFloor'),
  box([4, 17, 14], [DECK_FRONT, DECK - 2, 18], 'chassis'),
  box([4, 17, 46], [DECK_FRONT, DECK - 2, 50], 'chassis'),
]);
/** Low enough that the luff ram clears it. */
const headboard = authored(own('headboard', 'Deck headboard', 'body', 15), [
  box([DECK_FRONT - 2, DECK, 3], [DECK_FRONT, 40, SIDE], 'paint'),
]);
const dropside = authored({ ...own('dropside', 'Dropside', 'body', 35), panel: 'z' }, [
  box([4, DECK, 57], [DECK_FRONT - 2, 40, SIDE], 'paint'),
]);
const tailboard = authored({ ...own('tailboard', 'Tailboard', 'body', 25), panel: 'x' }, [
  box([2, DECK - 2, 3], [4, 40, SIDE], 'paint'),
]);
const mudguard = authored(own('mudguard', 'Rear mudguard', 'body', 4), [
  disc('z', [AXLE_REAR, WHEEL_Y, 16.5, ARCH_R], [WHEEL_Z, 59], 'trim'),
  box([AXLE_REAR - 17, -4, 50], [AXLE_REAR + 17, WHEEL_Y + 4, 60], 'air'),
]);
const rearUnderrun = authored(own('rear-underrun', 'Rear underrun and lamp brackets', 'body', 20), [
  box([0, 12, 14], [4, 17, 18], 'chassis'),
  box([0, 12, 46], [4, 17, 50], 'chassis'),
  box([0, 8, 6], [3, 12, 58], 'trim'),
  box([0, 17, 6], [2, 18, 18], 'chassis'),
  box([0, 17, 46], [2, 18, 58], 'chassis'),
  box([0, 12, 26], [1, 16, 38], 'plateRear'),
]);
const tailLamp = authored(own('tail-lamp', 'Tail lamp', 'body', 1), [
  box([0, 18, 50], [2, 23, 58], 'tail'),
  paintBox([0, 18, 50], [2, 20, 58], 'amber'),
]);

const craneBase = authored(own('crane-base', 'Crane base and subframe', 'frame', 180), [
  box([112, 17, 14], [130, 26, 18], 'crane'),
  box([112, 17, 46], [130, 26, 50], 'crane'),
  box([112, 26, 14], [130, 30, 50], 'crane'),
]);
/** Shown stowed; package 5 extends and lowers it. */
const stabiliser = authored(own('stabiliser', 'Stabiliser leg', 'under', 45), [
  box([116, 22, 50], [126, 26, 60], 'crane'),
  box([118, 12, 56], [124, 22, 60], 'crane'),
  box([116, 10, 55], [126, 12, 61], 'trim'),
]);
const column = authored(
  { ...own('crane-column', 'Crane column and slewing ring', 'body', 140), pivot: [SLEW_X, DECK, 32] },
  [
    disc('y', [SLEW_X, 32, 7], [DECK, 34], 'chassis'),
    box([117, 34, 28], [125, 56, 36], 'crane'),
    box([116, 52, 25], [126, 64, 28], 'crane'),
    box([116, 52, 36], [126, 64, 39], 'crane'),
    disc('z', [SLEW_X, LUFF_Y, 2], [24, 25], 'chrome'),
    disc('z', [SLEW_X, LUFF_Y, 2], [39, 40], 'chrome'),
  ],
);
const boom = authored({ ...own('boom', 'Crane boom', 'body', 160), pivot: [SLEW_X, LUFF_Y, 32] }, [
  tube([BOOM_ROOT, BOOM_TIP], 6, [28, 36], 'crane'),
]);
const luffRam = authored(own('luff-ram', 'Boom ram', 'body', 35), [
  tube(
    [
      [116.8, 40],
      [92, 50.5],
    ],
    3,
    [30, 34],
    'chrome',
  ),
]);
const winch = authored(own('winch', 'Winch', 'body', 45), [
  disc('z', [128, 44, 3.5], [27, 37], 'chassis'),
  disc('z', [128, 44, 4.5], [26, 27], 'crane'),
  disc('z', [128, 44, 4.5], [37, 38], 'crane'),
]);
const hookBlock = authored(own('hook-block', 'Hook block', 'body', 15), [
  box([12, 36, 30], [18, 41, 34], 'amber'),
  box([14, 33, 31], [16, 36, 33], 'chrome'),
]);
const boomRest = authored(own('boom-rest', 'Boom rest', 'body', 8), [box([22, DECK, 29], [26, 42, 35], 'crane')]);

const PARTS: readonly Authored[] = [
  wheel,
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
  cabSkirt,
  cabBack,
  frontPanel,
  aPost,
  windscreen,
  roof,
  door,
  headlight,
  frontBumper,
  dashboard,
  steering,
  gearLever,
  engineCover,
  bench,
  deckFloor,
  headboard,
  dropside,
  tailboard,
  mudguard,
  rearUnderrun,
  tailLamp,
  craneBase,
  stabiliser,
  column,
  boom,
  luffRam,
  winch,
  hookBlock,
  boomRest,
];

const RAILS = ['frame-rail-near', 'frame-rail-far'];

/** The 4×4's steering and levers moved by whole voxels into this cab, which sits higher and further forward. */
const shifted = (part: Authored, dx: number, dy: number): readonly [number, number, number] => [
  part.at[0] + dx,
  part.at[1] + dy,
  part.at[2],
];

const FITTINGS: readonly Fitting[] = [
  ...pair('frame-rail', frameRail, []),
  place('crossmember-rear', crossmember, RAILS, { at: [4, 13, 18] }),
  place('crossmember-axle', crossmember, RAILS, { at: [28, 13, 18] }),
  place('crossmember-gearbox', crossmember, RAILS, { at: [122, 13, 18] }),
  place('crossmember-front', crossmember, RAILS, { at: [182, 13, 18] }),
  place('axle-front', axleFront, RAILS),
  place('axle-rear', axleRear, RAILS),
  ...pair('wheel-front', wheel, ['axle-front'], { at: [AXLE_FRONT - 12, 0, WHEEL_Z], motion: 'spin' }),
  ...pair('wheel-rear', wheel, ['axle-rear'], { at: [AXLE_REAR - 12, 0, WHEEL_Z], motion: 'spin' }),
  place('engine', engine, RAILS),
  place('gearbox', gearbox, ['engine', 'crossmember-gearbox']),
  place('prop-shaft', propShaft, ['gearbox', 'axle-rear']),
  place('fuel-tank', fuelTank, ['frame-rail-far']),
  place('exhaust', exhaust, ['frame-rail-near']),
  place('radiator', radiator, ['crossmember-front']),
  place('battery', battery, ['frame-rail-near'], { at: [128, 8, 48] }),
  place('cab-floor', cabFloor, RAILS),
  ...pair('cab-skirt', cabSkirt, ['cab-floor']),
  place('cab-back', cabBack, ['cab-floor']),
  place('front-panel', frontPanel, ['cab-floor']),
  ...pair('a-post', aPost, ['front-panel']),
  place('windscreen', windscreen, ['a-post-near', 'a-post-far', 'front-panel']),
  place('roof', roof, ['a-post-near', 'a-post-far', 'cab-back']),
  ...pair('door', door, ['a-post-near'], { motion: 'hinge' }),
  ...pair('headlight', headlight, ['front-panel']),
  place('front-bumper', frontBumper, RAILS),
  place('dashboard', dashboard, ['front-panel']),
  place('steering', steering, ['dashboard'], { at: shifted(steering, 84, 13) }),
  place('engine-cover', engineCover, ['cab-floor']),
  place('gear-lever', gearLever, ['engine-cover'], { at: shifted(gearLever, 80, 14) }),
  place('bench', bench, ['cab-floor']),
  place('deck-floor', deckFloor, RAILS),
  place('headboard', headboard, ['deck-floor']),
  ...pair('dropside', dropside, ['deck-floor']),
  place('tailboard', tailboard, ['deck-floor']),
  ...pair('mudguard', mudguard, ['deck-floor']),
  place('rear-underrun', rearUnderrun, RAILS),
  ...pair('tail-lamp', tailLamp, ['rear-underrun']),
  place('crane-base', craneBase, RAILS),
  ...pair('stabiliser', stabiliser, ['crane-base']),
  place('crane-column', column, ['crane-base']),
  place('boom-rest', boomRest, ['deck-floor']),
  place('boom', boom, ['crane-column', 'boom-rest']),
  place('luff-ram', luffRam, ['crane-column']),
  place('winch', winch, ['crane-column']),
  place('hook-block', hookBlock, ['boom']),
];

/** The types it uses; the shared ones are the 4×4's own objects, so the catalogue keeps one entry each. */
export const HOIST_PARTS: readonly PartType[] = partsOf(PARTS);

export const HOIST: Blueprint = {
  id: 'hoist',
  label: 'Canter-type crane truck',
  lattice: LATTICE,
  paint: { body: '#d9d6cc', seam: '#9a978e' },
  fittings: FITTINGS,
};
