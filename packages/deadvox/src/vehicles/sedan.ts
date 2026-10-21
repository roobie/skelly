/**
 * A mid-size four-door family sedan, built from parts on a welded monocoque: 4.72 m long, 1.81 m wide,
 * 1.43 m tall, 2.75 m wheelbase, 1.52 m track, 205/55R16 tyres, front-wheel drive with a transverse
 * four-cylinder engine. Proportions follow the class's period side elevation (see `docs/vehicle-spike.md`,
 * "Proportions"); the name stays generic.
 */
import {
  type Authored,
  authored,
  box,
  disc,
  local,
  meta,
  metaFor,
  type Point,
  paintBox,
  pairAcross,
  partsOf,
  place,
  prism,
} from './authoring.ts';
import { type Blueprint, type Fitting, type PartType, VOXELS_PER_CELL } from './model.ts';
import { battery, steering } from './rangeRover.ts';

const LATTICE = [38, 12, 16] as const;
const own = metaFor('sedan');
const pair = pairAcross(LATTICE[2] * VOXELS_PER_CELL);

// Vehicle-local voxels (3.125 cm): x forward from behind the rear bumper, y up, z across with the near
// (driver's, right-hand) side at high z and the centre plane at 32. There is no separate frame: the floor
// pan and the panels welded to it are the structure everything else rests on.
const AXLE_REAR = 34;
const AXLE_FRONT = 122;
const WHEEL_Y = 10;
const ARCH_R = 11.5;
const SILL_Y = 5;
const DOOR_Y = 8;
const WAIST = 31;
const ROOF_Y = 44;
const ROOF_TOP = 46;
/** Body sides; the glasshouse and roof sit one voxel inboard of them. */
const SIDE = 61;
const GLASS_SIDE = 60;
const WHEEL_Z = 53;
const COWL_X = 106;
const B_REAR = 70;
const B_FRONT = 73;
const REAR_DOOR = 45;
/** The windscreen and A-pillars lean back 22 voxels over 13, about 59° from vertical. */
const aLine = (x0: number, y: number): number => x0 - ((y - WAIST) * 22) / 13;
/** The rear window leans forward 2 voxels per voxel of rise, from the boot deck to the roof. */
const bLine = (y: number): number => 22 + (y - WAIST) * 2;
/** The rear door's window frame, and the C-pillar's leading edge, lean forward going up. */
const cLine = (y: number): number => 44 + ((y - WAIST) * 10) / 13;
/** The bonnet and wing top line, falling from the scuttle to the nose. */
const hood = (x: number): number => 30 - ((x - 110) * 4) / 38;

/** 205/55R16 on a steel rim under a plastic trim: a road car's size, shared by any that run it. */
export const wheel = local({
  ...meta('wheel-205-55r16', 'Wheel (205/55R16, steel rim and trim)', 'under', 19),
  pivot: [10, 10, 3],
  shape: [
    disc('z', [10, 10, 10, 6.5], [0, 6], 'tyre'),
    disc('z', [10, 10, 10, 9], [0, 6], { mat: 'tread', paint: true, sectors: { count: 16, duty: 0.5 } }),
    disc('z', [10, 10, 6.5], [0, 5], 'rim'),
    disc('z', [10, 10, 5.6, 2], [4, 5], { mat: 'rimDark', paint: true, sectors: { count: 8, duty: 0.35 } }),
    disc('z', [10, 10, 1.5], [4, 5], { mat: 'rimDark', paint: true }),
  ],
});

// The welded shell: floor pan, sills, bulkhead, inner wings, pillars, rear quarters, rear panel and roof.
const floorPan = authored(
  { ...own('floor-pan', 'Floor pan, boot floor and tunnel', 'frame', 150), noise: { rangeScale: 0.9 } },
  [
    box([48, 7, 7], [106, 9, 57], 'chassis'),
    box([3, 9, 13], [48, 11, 51], 'chassis'),
    box([64, 9, 28], [106, 12, 36], 'chassis'),
    paintBox([48, 8, 7], [106, 9, 57], 'carpet'),
    paintBox([64, 11, 28], [106, 12, 36], 'carpet'),
    paintBox([3, 10, 13], [40, 11, 51], 'loadFloor'),
  ],
);
const sill = authored(own('sill', 'Sill', 'frame', 10), [box([46, SILL_Y, 57], [110, DOOR_Y, SIDE], 'trim')]);
const bulkhead = authored(own('bulkhead', 'Bulkhead and scuttle', 'frame', 30), [
  box([COWL_X, 7, 7], [108, WAIST, 57], 'paint'),
  paintBox([COWL_X, WAIST - 1, 7], [108, WAIST, 57], 'trim'),
]);
const innerWing = authored(own('inner-wing', 'Inner wing and chassis leg', 'frame', 22), [
  box([108, 9, 51], [144, 23, WHEEL_Z], 'paint'),
  disc('z', [AXLE_FRONT, WHEEL_Y, 3.5], [51, WHEEL_Z], 'air'),
  box([108, 22, WHEEL_Z], [144, 23, 57], 'paint'),
]);
const aPost = authored(own('a-post', 'A-pillar', 'body', 9), [
  box([COWL_X, DOOR_Y, 57], [110, WAIST, SIDE], 'paint'),
  prism(
    'z',
    [
      [105, WAIST],
      [108, WAIST],
      [aLine(108, ROOF_Y), ROOF_Y],
      [aLine(105, ROOF_Y), ROOF_Y],
    ],
    [57, GLASS_SIDE],
    'paint',
  ),
]);
const bPillar = authored(own('b-pillar', 'B-pillar', 'body', 8), [
  box([B_REAR, DOOR_Y, 57], [B_FRONT, WAIST, GLASS_SIDE], 'paint'),
  box([B_REAR, WAIST, 57], [B_FRONT, ROOF_Y, GLASS_SIDE], 'trim'),
]);
const rearQuarter = authored(
  { ...own('rear-quarter', 'Rear quarter (C-pillar, wheel arch)', 'body', 30), panel: 'z' },
  [
    box([5, DOOR_Y, 58], [REAR_DOOR, WAIST, SIDE], 'paint'),
    box([3, 11, 57], [5, WAIST, SIDE], 'paint'),
    box([3, 24, 56], [5, WAIST, 57], 'paint'),
    box([5, 29, 56], [22, WAIST, 58], 'paint'),
    box([5, 9, 51], [46, 29, WHEEL_Z], 'paint'),
    box([22, 29, 51], [46, WAIST, WHEEL_Z], 'paint'),
    disc('z', [AXLE_REAR, WHEEL_Y, 3.5], [51, WHEEL_Z], 'air'),
    disc('z', [AXLE_REAR, WHEEL_Y, ARCH_R], [WHEEL_Z, SIDE + 1], 'air'),
    disc('z', [AXLE_REAR, WHEEL_Y, ARCH_R + 1.5, ARCH_R], [WHEEL_Z, 57], 'chassis'),
    box([20, -4, WHEEL_Z], [50, 4, 57], 'air'),
    prism(
      'z',
      [
        [bLine(WAIST), WAIST],
        [cLine(WAIST), WAIST],
        [cLine(ROOF_Y), ROOF_Y],
        [bLine(ROOF_Y), ROOF_Y],
      ],
      [57, GLASS_SIDE],
      'paint',
    ),
  ],
);
const rearPanel = authored(own('rear-panel', 'Rear panel', 'body', 8), [box([3, 11, 7], [5, 24, 57], 'paint')]);
const roof = authored({ ...own('roof', 'Roof', 'roof', 22), panel: 'y' }, [
  box([46, ROOF_Y, 4], [86, ROOF_TOP, GLASS_SIDE], 'paint'),
  box([46, ROOF_TOP - 1, 4], [86, ROOF_TOP, 5], 'air'),
  box([46, ROOF_TOP - 1, GLASS_SIDE - 1], [86, ROOF_TOP, GLASS_SIDE], 'air'),
  box([85, ROOF_TOP - 1, 4], [86, ROOF_TOP, GLASS_SIDE], 'air'),
  paintBox([48, ROOF_Y, 7], [84, ROOF_Y + 1, 57], 'headliner'),
]);

const windscreen = authored(own('windscreen', 'Windscreen', 'body', 12), [
  prism(
    'z',
    [
      [106, WAIST],
      [108, WAIST],
      [aLine(108, ROOF_Y), ROOF_Y],
      [aLine(106, ROOF_Y), ROOF_Y],
    ],
    [7, 57],
    'glass',
  ),
]);
const rearWindow = authored(own('rear-window', 'Rear window', 'body', 9), [
  prism(
    'z',
    [
      [bLine(WAIST), WAIST],
      [bLine(WAIST) + 2, WAIST],
      [bLine(ROOF_Y) + 2, ROOF_Y],
      [bLine(ROOF_Y), ROOF_Y],
    ],
    [7, 57],
    'glass',
  ),
]);
const bootLid = authored({ ...own('boot-lid', 'Boot lid', 'body', 12), panel: 'y' }, [
  box([3, 24, 8], [5, WAIST, 56], 'paint'),
  box([5, 29, 8], [22, WAIST, 56], 'paint'),
  paintBox([3, 26, 30], [4, 28, 34], 'chrome'),
]);
const bonnet = authored({ ...own('bonnet', 'Bonnet', 'body', 14), panel: 'y', noise: { rangeScale: 0.8 } }, [
  prism(
    'z',
    [
      [108, hood(108) - 2],
      [148, hood(148) - 2],
      [148, hood(148)],
      [108, hood(108)],
    ],
    [7, 57],
    'paint',
  ),
]);
const frontWing = authored({ ...own('front-wing', 'Front wing', 'body', 5), panel: 'z' }, [
  prism(
    'z',
    [
      [110, DOOR_Y],
      [148, DOOR_Y],
      [148, hood(148)],
      [110, hood(110)],
    ],
    [58, SIDE],
    'paint',
  ),
  prism(
    'z',
    [
      [110, 22],
      [148, 22],
      [148, hood(148)],
      [110, hood(110)],
    ],
    [57, 58],
    'paint',
  ),
  disc('z', [AXLE_FRONT, WHEEL_Y, ARCH_R], [WHEEL_Z, SIDE + 1], 'air'),
]);
const frontPanel = authored(own('front-panel', 'Front panel, grille and crash bar', 'body', 10), [
  box([144, 12, 11], [146, 24, WHEEL_Z], 'paint'),
  box([146, 14, 20], [148, 24, 44], 'grille'),
  ...[15, 18, 21].map((y) => paintBox([147, y, 21], [148, y + 1, 43], 'trim')),
  paintBox([147, 19, 31], [148, 21, 33], 'chrome'),
]);
const headlight = authored(own('headlight', 'Headlight', 'body', 3), [
  box([146, 18, 44], [148, 24, 57], 'lamp'),
  paintBox([147, 19, 46], [148, 23, 51], 'lampHot'),
  paintBox([147, 19, 53], [148, 23, 56], 'amber'),
]);
const frontBumper = authored(own('front-bumper', 'Front bumper', 'body', 7), [
  box([148, 6, 4], [152, 18, GLASS_SIDE], 'paint'),
  paintBox([151, 8, 20], [152, 11, 44], 'grille'),
  paintBox([151, 13, 25], [152, 16, 39], 'plateFront'),
]);
const rearBumper = authored(own('rear-bumper', 'Rear bumper', 'body', 6), [
  box([0, DOOR_Y, 4], [3, 17, GLASS_SIDE], 'paint'),
  paintBox([0, 11, 25], [1, 15, 39], 'plateRear'),
]);
const tailLamp = authored(own('tail-lamp', 'Tail lamp cluster', 'body', 1), [
  box([2, 20, 46], [3, 29, SIDE - 1], 'tail'),
  paintBox([2, 24, 46], [3, 26, SIDE - 1], 'amber'),
  paintBox([2, 22, 46], [3, 24, 52], 'lampWhite'),
]);
/** On the A-pillar's foot, so it stays put when the door swings. */
const mirror = authored(own('mirror', 'Door mirror', 'body', 1), [
  box([COWL_X, WAIST, GLASS_SIDE], [109, 33, 62], 'trim'),
  box([104, 32, 62], [110, 37, 64], 'paint'),
  paintBox([104, 33, 62], [105, 36, 64], 'chrome'),
]);

const frontDoorGlass: readonly Point[] = [
  [75, WAIST],
  [aLine(102.5, WAIST), WAIST],
  [aLine(102.5, 42.5), 42.5],
  [75, 42.5],
];
const frontDoor = authored({ ...own('door-front', 'Front door', 'body', 28), panel: 'z', pivot: [COWL_X, 0, SIDE] }, [
  box([B_FRONT, DOOR_Y, 58], [COWL_X, WAIST, SIDE], 'paint'),
  box([74, 10, 57], [COWL_X, WAIST, 58], 'doorCardGrey'),
  prism(
    'z',
    [
      [B_FRONT, WAIST],
      [104, WAIST],
      [aLine(104, ROOF_Y), ROOF_Y],
      [B_FRONT, ROOF_Y],
    ],
    [58, GLASS_SIDE],
    'trim',
  ),
  prism('z', frontDoorGlass, [58, 59], 'glass'),
  prism('z', frontDoorGlass, [59, GLASS_SIDE], 'air'),
  box([77, 26, SIDE], [81, 27, SIDE + 1], 'chrome'),
]);
const rearDoorGlass: readonly Point[] = [
  [cLine(WAIST) + 1.5, WAIST],
  [68, WAIST],
  [68, 42.5],
  [cLine(42.5) + 1.5, 42.5],
];
const rearDoor = authored({ ...own('door-rear', 'Rear door', 'body', 24), panel: 'z', pivot: [B_REAR, 0, SIDE] }, [
  box([REAR_DOOR, DOOR_Y, 58], [B_REAR, WAIST, SIDE], 'paint'),
  box([46, 10, 57], [B_REAR, WAIST, 58], 'doorCardGrey'),
  disc('z', [AXLE_REAR, WHEEL_Y, ARCH_R], [57, SIDE + 1], 'air'),
  prism(
    'z',
    [
      [cLine(WAIST), WAIST],
      [B_REAR, WAIST],
      [B_REAR, ROOF_Y],
      [cLine(ROOF_Y), ROOF_Y],
    ],
    [58, GLASS_SIDE],
    'trim',
  ),
  prism('z', rearDoorGlass, [58, 59], 'glass'),
  prism('z', rearDoorGlass, [59, GLASS_SIDE], 'air'),
  box([62, 26, SIDE], [66, 27, SIDE + 1], 'chrome'),
]);

// Running gear: a transverse engine and gearbox driving the front wheels, a twist beam at the rear.
const engine = authored(
  { ...own('engine', 'Four-cylinder engine (transverse)', 'under', 150), noise: { radiusMetres: 55 } },
  [
    box([118, 12, 26], [134, 22, 48], 'engine'),
    box([119, 22, 27], [133, 24, 47], 'alloy'),
    box([124, 10, 30], [134, 12, 44], 'engine'),
    box([114, 16, 30], [118, 22, 44], 'alloy'),
    box([126, 16, 48], [130, 19, 51], 'chassis'),
  ],
);
const gearbox = authored(own('gearbox', 'Gearbox and final drive', 'under', 45), [
  box([116, 12, 16], [128, 22, 26], 'engine'),
  box([116, 16, 13], [120, 19, 16], 'chassis'),
]);
const frontAxle = authored(own('front-axle', 'Front subframe, struts and driveshafts', 'under', 80), [
  box([112, 5, 11], [132, 7, WHEEL_Z], 'chassis'),
  box([120, 14, 49], [124, 22, 51], 'spring'),
  box([120, 14, 13], [124, 22, 15], 'spring'),
  disc('z', [AXLE_FRONT, WHEEL_Y, 2], [15, 49], 'chassis'),
  disc('z', [AXLE_FRONT, WHEEL_Y, 3.5], [49, WHEEL_Z], 'steelHub'),
  disc('z', [AXLE_FRONT, WHEEL_Y, 3.5], [11, 15], 'steelHub'),
]);
const rearAxle = authored(own('rear-axle', 'Rear twist beam and hubs', 'under', 55), [
  box([32, 7, 11], [37, 9, WHEEL_Z], 'chassis'),
  disc('z', [AXLE_REAR, WHEEL_Y, 2.5], [51, WHEEL_Z], 'steelHub'),
  disc('z', [AXLE_REAR, WHEEL_Y, 2.5], [11, 13], 'steelHub'),
]);
const fuelTank = authored(own('fuel-tank', 'Fuel tank', 'under', 12), [box([48, 4, 26], [66, 7, 50], 'tank')]);
const exhaust = authored({ ...own('exhaust', 'Exhaust and silencer', 'under', 18), noise: { rangeScale: 0.45 } }, [
  disc('x', [20, 5, 1.6], [24, 112], 'chassis'),
  box([6, 4, 12], [24, 9, 28], 'chassis'),
  disc('x', [16, 6, 1.2], [2, 6], 'chassis'),
]);
const radiator = authored(own('radiator', 'Radiator', 'under', 8), [box([140, 10, 16], [144, 22, 48], 'radiator')]);

const dashboard = authored(own('dashboard', 'Dashboard and heater', 'interior', 40), [
  box([86, 22, 7], [COWL_X, WAIST, 57], 'dash'),
  box([92, WAIST, 43], [98, 33, 54], 'dash'),
  paintBox([92, WAIST, 44], [93, 33, 53], 'dial'),
  paintBox([86, 26, 28], [87, 29, 36], 'trim'),
]);
/** A five-speed's stick on the tunnel; a road car has no transfer lever. */
export const gearStick = authored(meta('gear-stick', 'Gear lever', 'interior', 1), [
  box([80, 12, 30], [84, 13, 34], 'trim'),
  box([81, 13, 31], [83, 19, 33], 'trim'),
  box([80, 19, 30], [83, 21, 34], 'trim'),
]);
const frontSeat = authored(own('front-seat', 'Front seat', 'interior', 22), [
  box([76, 9, 44], [86, 11, 54], 'trim'),
  box([74, 11, 42], [88, 15, 56], 'seatCloth'),
  prism(
    'z',
    [
      [70, 13],
      [75, 13],
      [72, 36],
      [67, 36],
    ],
    [42, 56],
    'seatCloth',
  ),
  box([67, 36, 45], [71, 40, 53], 'seatCloth'),
]);
const rearBench = authored(own('rear-bench', 'Rear bench', 'interior', 28), [
  box([50, 9, 12], [60, 11, 52], 'trim'),
  box([48, 11, 10], [62, 15, 54], 'seatCloth'),
  prism(
    'z',
    [
      [43, 11],
      [48, 11],
      [45, 34],
      [40, 34],
    ],
    [13, 51],
    'seatCloth',
  ),
]);
const parcelShelf = authored(own('parcel-shelf', 'Parcel shelf', 'interior', 3), [
  box([22, 30, 13], [40, WAIST, 51], 'trim'),
]);

const PARTS: readonly Authored[] = [
  wheel,
  floorPan,
  sill,
  bulkhead,
  innerWing,
  aPost,
  bPillar,
  rearQuarter,
  rearPanel,
  roof,
  windscreen,
  rearWindow,
  bootLid,
  bonnet,
  frontWing,
  frontPanel,
  headlight,
  frontBumper,
  rearBumper,
  tailLamp,
  mirror,
  frontDoor,
  rearDoor,
  engine,
  gearbox,
  frontAxle,
  rearAxle,
  fuelTank,
  exhaust,
  radiator,
  battery,
  dashboard,
  steering,
  gearStick,
  frontSeat,
  rearBench,
  parcelShelf,
];

const QUARTERS = ['rear-quarter-near', 'rear-quarter-far'];
const INNER_WINGS = ['inner-wing-near', 'inner-wing-far'];
/** The 4×4's steering column fits this lower, shorter dash 4 voxels further back and 6 lower. */
const inDash = (part: Authored): readonly [number, number, number] => [part.at[0] - 4, part.at[1] - 6, part.at[2]];

const FITTINGS: readonly Fitting[] = [
  place('floor-pan', floorPan, []),
  ...pair('sill', sill, ['floor-pan']),
  place('bulkhead', bulkhead, ['floor-pan']),
  ...pair('inner-wing', innerWing, ['bulkhead']),
  ...pair('a-post', aPost, ['bulkhead', 'sill-near']),
  ...pair('b-pillar', bPillar, ['floor-pan', 'sill-near']),
  ...pair('rear-quarter', rearQuarter, ['floor-pan']),
  place('rear-panel', rearPanel, ['floor-pan']),
  place('roof', roof, ['a-post-near', 'a-post-far', 'b-pillar-near', 'b-pillar-far', ...QUARTERS]),
  place('windscreen', windscreen, ['a-post-near', 'a-post-far', 'bulkhead']),
  place('rear-window', rearWindow, ['roof', ...QUARTERS]),
  place('boot-lid', bootLid, QUARTERS),
  ...pair('front-wing', frontWing, ['inner-wing-near']),
  place('front-panel', frontPanel, INNER_WINGS),
  ...pair('headlight', headlight, ['front-panel']),
  place('bonnet', bonnet, ['bulkhead', 'front-panel']),
  place('front-bumper', frontBumper, ['front-panel']),
  place('rear-bumper', rearBumper, ['floor-pan']),
  ...pair('tail-lamp', tailLamp, ['rear-quarter-near']),
  ...pair('mirror', mirror, ['a-post-near']),
  ...pair('door-front', frontDoor, ['a-post-near'], { motion: 'hinge' }),
  ...pair('door-rear', rearDoor, ['b-pillar-near'], { motion: 'hinge' }),
  place('front-axle', frontAxle, INNER_WINGS),
  place('rear-axle', rearAxle, ['floor-pan']),
  ...pair('wheel-front', wheel, ['front-axle'], { at: [AXLE_FRONT - 10, 0, WHEEL_Z], motion: 'spin' }),
  ...pair('wheel-rear', wheel, ['rear-axle'], { at: [AXLE_REAR - 10, 0, WHEEL_Z], motion: 'spin' }),
  place('engine', engine, ['inner-wing-near']),
  place('gearbox', gearbox, ['engine', 'inner-wing-far']),
  place('radiator', radiator, ['front-panel']),
  place('battery', battery, ['inner-wing-far'], { at: [106, 17, 11] }),
  place('fuel-tank', fuelTank, ['floor-pan']),
  place('exhaust', exhaust, ['floor-pan']),
  place('dashboard', dashboard, ['bulkhead']),
  place('steering', steering, ['dashboard'], { at: inDash(steering) }),
  place('gear-stick', gearStick, ['floor-pan']),
  ...pair('front-seat', frontSeat, ['floor-pan']),
  place('rear-bench', rearBench, ['floor-pan']),
  place('parcel-shelf', parcelShelf, QUARTERS),
];

export const SEDAN_PARTS: readonly PartType[] = partsOf(PARTS);

export const SEDAN: Blueprint = {
  id: 'sedan',
  label: 'Family sedan',
  lattice: LATTICE,
  paint: { body: '#8a97a3', seam: '#5f6a74' },
  fittings: FITTINGS,
};
