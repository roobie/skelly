/**
 * A Honda CG125-type motorbike, built from parts: 1.91 m long, 0.75 m across the bars, 1.03 m to the
 * bars, 1.22 m wheelbase on 18-inch spoked wheels. The frame is the structure everything rests on;
 * there is no body shell, and the seat carries the rider. Proportions follow a scaled side view (see
 * the r43-6 report).
 */
import {
  type Authored,
  authored,
  box,
  disc,
  local,
  meta,
  paintBox,
  pair,
  partsOf,
  place,
  prism,
  tube,
} from './authoring.ts';
import type { Fitting, Vehicle } from './model.ts';

// Vehicle-local voxels (3.125 cm): x forward from the tail, y up, z across with the near side at high
// z and the centre plane between 11 and 12. The wheels, frame and fork sit on the centre plane.
const AXLE_REAR = 10.5;
const AXLE_FRONT = 49.5;
const AXLE_Y = 9.5;
const CENTRE = [11, 13] as const;
/** The steering axis leans back 27° from vertical and passes through the front axle. */
const RAKE = Math.tan((27 * Math.PI) / 180);
const forkX = (y: number): number => AXLE_FRONT - (y - AXLE_Y) * RAKE;
/** The backbone tube, from the head tube down under the tank to the seat post. */
const SPINE = [
  [40, 27.5],
  [23, 19.5],
] as const;

const WHEEL_C = 9.5;
const spokes = Array.from({ length: 10 }, (_, k) => {
  const angle = (k * Math.PI) / 5;
  const [c, s] = [Math.cos(angle), Math.sin(angle)];
  const z = 1 + (k % 2);
  return tube(
    [
      [WHEEL_C + 2.3 * c, WHEEL_C + 2.3 * s],
      [WHEEL_C + 6.6 * c, WHEEL_C + 6.6 * s],
    ],
    1.1,
    [z, z + 1],
    'spoke',
  );
});
const wheel = local({
  ...meta('bike-wheel', 'Wheel (18 in, spoked)', 'under', 9),
  pivot: [WHEEL_C, WHEEL_C, 2],
  shape: [
    disc('z', [WHEEL_C, WHEEL_C, 9.5, 7.3], [1, 3], 'tyre'),
    disc('z', [WHEEL_C, WHEEL_C, 9.5, 8.6], [1, 3], { mat: 'tread', paint: true, sectors: { count: 22, duty: 0.5 } }),
    disc('z', [WHEEL_C, WHEEL_C, 7.3, 6.4], [1, 3], 'rim'),
    ...spokes,
    disc('z', [WHEEL_C, WHEEL_C, 2.5], [0, 4], 'hub'),
  ],
});

const frame = authored(meta('frame', 'Frame', 'frame', 14), [
  prism(
    'z',
    [
      [forkX(30) - 1.1, 30],
      [forkX(30) + 1.1, 30],
      [forkX(25) + 1.1, 25],
      [forkX(25) - 1.1, 25],
    ],
    CENTRE,
    'frame',
  ),
  tube(SPINE, 2.2, CENTRE, 'frame'),
  tube(
    [
      [39.5, 27],
      [36.8, 10],
    ],
    2.2,
    CENTRE,
    'frame',
  ),
  tube(
    [
      [23.5, 20.5],
      [20.5, 13],
    ],
    2.2,
    CENTRE,
    'frame',
  ),
  box([19, 13, 8], [22, 15, 16], 'frame'),
  box([18, 8, 8], [22, 14, 9], 'frame'),
  box([18, 8, 15], [22, 14, 16], 'frame'),
  box([3, 20, 9], [24, 22, 10], 'frame'),
  box([3, 20, 14], [24, 22, 15], 'frame'),
  box([21, 20, 10], [24, 22, 14], 'frame'),
  box([3, 20, 10], [5, 22, 14], 'frame'),
]);

const fork = authored(meta('fork', 'Front fork and yokes', 'frame', 7), [
  ...[9, 14].flatMap((z) => [
    tube(
      [
        [forkX(7.5), 7.5],
        [forkX(31), 31],
      ],
      1.6,
      [z, z + 1],
      'chrome',
    ),
    tube(
      [
        [forkX(7.5), 7.5],
        [forkX(17), 17],
      ],
      2.4,
      [z, z + 1],
      'alloy',
    ),
    box([40, 25, z], [42, 29, z + 1], 'frame'),
  ]),
  box([37, 30, 9], [41, 31, 15], 'alloy'),
  box([40, 24, 9], [42, 25, 15], 'alloy'),
]);

const swingarm = authored(meta('swingarm', 'Swingarm and chain guard', 'frame', 4), [
  ...[9, 14].map((z) =>
    tube(
      [
        [AXLE_REAR - 1, AXLE_Y],
        [21.5, 11],
      ],
      1.6,
      [z, z + 1],
      'frame',
    ),
  ),
  box([20, 10, 10], [22, 12, 14], 'frame'),
  box([14, 9, 8], [18, 12, 9], 'trim'),
]);
const shock = authored(meta('shock', 'Rear shock absorber', 'under', 1.5), [
  tube(
    [
      [12.3, 10],
      [9.3, 21],
    ],
    1.6,
    [15, 17],
    'chrome',
  ),
  tube(
    [
      [11.6, 13],
      [9.9, 19],
    ],
    2.4,
    [15, 17],
    'spring',
  ),
]);

const engine = authored({ ...meta('engine', 'Single-cylinder engine', 'under', 30), noise: { radiusMetres: 50 } }, [
  box([22, 6, 8], [34, 15, 16], 'engine'),
  disc('z', [25.5, 10.5, 3.5], [7, 8], 'alloy'),
  box([24, 7, 16], [32, 14, 17], 'alloy'),
  prism(
    'z',
    [
      [27, 14],
      [32, 14],
      [33.5, 19],
      [28.5, 19],
    ],
    [9, 15],
    'alloy',
  ),
  ...[15, 17].flatMap((y) => [box([26, y, 9], [35, y + 1, 10], 'air'), box([26, y, 14], [35, y + 1, 15], 'air')]),
  box([33, 16, 12], [35, 18, 14], 'engine'),
  box([24, 15, 10], [27, 17, 14], 'alloy'),
  box([34, 9, 10], [36, 12, 12], 'engine'),
]);
const exhaust = authored({ ...meta('exhaust', 'Exhaust and silencer', 'under', 5), noise: { rangeScale: 0.5 } }, [
  box([35, 6, 13], [37, 18, 15], 'chrome'),
  box([34, 6, 15], [37, 8, 19], 'chrome'),
  box([20, 6, 17], [34, 9, 19], 'chrome'),
  disc('x', [19, 10, 2.5], [3, 20], 'chrome'),
  disc('x', [19, 10, 1.2], [2, 3], 'trim'),
  box([5, 11, 16], [7, 13, 18], 'chrome'),
  box([5, 12, 15], [7, 22, 16], 'chrome'),
]);
const footpeg = authored(meta('footpeg', 'Footrest', 'under', 0.5), [
  box([27, 9, 17], [30, 10, 22], 'frame'),
  paintBox([27, 9, 18], [30, 10, 22], 'rubber'),
]);
const stand = authored(meta('centre-stand', 'Centre stand', 'under', 2.5), [
  box([19, 1, 8], [21, 8, 9], 'frame'),
  box([19, 1, 15], [21, 8, 16], 'frame'),
  box([19, 1, 9], [21, 2, 15], 'frame'),
  box([17, 0, 7], [22, 1, 10], 'frame'),
  box([17, 0, 14], [22, 1, 17], 'frame'),
]);

const mudguardFront = authored(meta('mudguard-front', 'Front mudguard', 'body', 1), [
  disc('z', [AXLE_FRONT, AXLE_Y, 11, 10], [10, 14], { mat: 'chrome', sectors: { count: 1, duty: 0.42 } }),
]);
const headlight = authored(meta('headlight', 'Headlight and speedometer', 'body', 1.5), [
  disc('x', [12, 27.5, 3], [42, 45], 'chrome'),
  disc('x', [12, 27.5, 2.6], [45, 46], 'lamp'),
  disc('x', [12, 27.5, 1.6], [45, 46], { mat: 'lampHot', paint: true }),
  box([41, 30, 10], [44, 32, 14], 'dash'),
  paintBox([41, 31, 11], [43, 32, 13], 'dial'),
]);
const handlebar = authored(meta('handlebar', 'Handlebar, grips and mirrors', 'interior', 2), [
  box([38, 31, 10], [40, 32, 14], 'alloy'),
  box([38, 32, 4], [40, 33, 20], 'chrome'),
  box([36, 32, 0], [38, 33, 5], 'rubber'),
  box([36, 32, 19], [38, 33, 24], 'rubber'),
  box([38, 33, 6], [39, 35, 7], 'chrome'),
  box([38, 33, 17], [39, 35, 18], 'chrome'),
  box([37, 34, 4], [38, 36, 7], 'chrome'),
  box([37, 34, 17], [38, 36, 20], 'chrome'),
]);
const tank = authored(meta('tank', 'Fuel tank', 'body', 4), [
  prism(
    'z',
    [
      [24.5, 20],
      [25, 23.5],
      [27.5, 25.6],
      [33, 26.9],
      [37.5, 28],
      [38.6, 27],
      [38.4, 23.5],
      [36, 21.5],
      [30, 20],
    ],
    [7, 17],
    'paint',
  ),
  tube(SPINE, 3.4, CENTRE, 'air'),
  box([32, 27, 11], [34, 28, 13], 'chrome'),
  ...[7, 16].flatMap((z) => [
    paintBox([30, 23, z], [35, 25, z + 1], 'badge'),
    paintBox([26, 21, z], [29, 24, z + 1], 'rubber'),
  ]),
]);
const seat = authored({ ...meta('seat', 'Seat', 'interior', 3), rider: [19, 25, 12] }, [
  prism(
    'z',
    [
      [4.5, 22],
      [4.5, 23.5],
      [6, 24.6],
      [22, 25.2],
      [23.8, 24.3],
      [24, 22],
    ],
    [8, 16],
    'seat',
  ),
  box([5, 22, 8], [24, 23, 16], 'trim'),
]);
const sideCover = authored({ ...meta('side-cover', 'Side cover', 'body', 0.5), panel: 'z' }, [
  box([18, 15, 15], [24, 21, 17], 'paint'),
  paintBox([19, 17, 16], [23, 19, 17], 'badge'),
]);
const mudguardRear = authored(meta('mudguard-rear', 'Rear mudguard', 'body', 1.5), [
  disc('z', [AXLE_REAR, AXLE_Y, 11, 10], [9, 15], { mat: 'chrome', sectors: { count: 1, duty: 0.55 } }),
  box([16, 0, 9], [24, 22, 15], 'air'),
]);
const tailLight = authored(meta('tail-light', 'Tail lamp', 'body', 0.5), [
  box([0, 17, 10], [3, 20, 14], 'trim'),
  paintBox([0, 17, 10], [1, 20, 14], 'tail'),
]);

const PARTS: readonly Authored[] = [
  wheel,
  frame,
  fork,
  swingarm,
  shock,
  engine,
  exhaust,
  footpeg,
  stand,
  mudguardFront,
  headlight,
  handlebar,
  tank,
  seat,
  sideCover,
  mudguardRear,
  tailLight,
];

const FITTINGS: readonly Fitting[] = [
  place('frame', frame, []),
  place('engine', engine, ['frame']),
  place('exhaust', exhaust, ['engine', 'frame']),
  ...pair('footpeg', footpeg, ['engine']),
  place('centre-stand', stand, ['frame']),
  place('swingarm', swingarm, ['frame']),
  ...pair('shock', shock, ['frame', 'swingarm']),
  place('wheel-rear', wheel, ['swingarm'], { at: [AXLE_REAR - WHEEL_C, 0, 10], motion: 'spin' }),
  place('fork', fork, ['frame']),
  place('wheel-front', wheel, ['fork'], { at: [AXLE_FRONT - WHEEL_C, 0, 10], motion: 'spin' }),
  place('mudguard-front', mudguardFront, ['fork']),
  place('headlight', headlight, ['fork']),
  place('handlebar', handlebar, ['fork']),
  place('tank', tank, ['frame']),
  place('seat', seat, ['frame']),
  ...pair('side-cover', sideCover, ['frame']),
  place('mudguard-rear', mudguardRear, ['frame']),
  place('tail-light', tailLight, ['mudguard-rear']),
];

export const MOTORBIKE: Vehicle = {
  id: 'motorbike',
  label: 'CG125-type motorbike',
  lattice: [16, 9, 6],
  palette: {
    paint: '#a8242a',
    seam: '#6d1619',
    frame: '#25292b',
    chrome: '#c6c9c3',
    alloy: '#b4b7b0',
    engine: '#8f938d',
    tyre: '#26292b',
    tread: '#33383b',
    rim: '#cfd2cc',
    spoke: '#a9ada6',
    hub: '#9da19a',
    spring: '#8b8f89',
    rubber: '#2b2f31',
    seat: '#202325',
    trim: '#2c3032',
    lamp: '#dfe3d8',
    lampHot: '#fbfbf1',
    tail: '#a5292d',
    dash: '#303435',
    dial: '#596057',
    badge: '#e6e2d6',
  },
  parts: partsOf(PARTS),
  fittings: FITTINGS,
};
