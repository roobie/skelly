import { boxFromMinMax, localSolidBounds } from '../core/geometry.ts';
import { applyDir, applyPoint, cross, dot, length, sub, type Vec3 } from '../core/math.ts';
import type { ClipPlane, KeepOut, ParamSpec, PartDef, PartFamily, PortDef, Rule, Solid } from '../core/schema.ts';
import { buildReceiverSection, type ReceiverSectionSpec } from './receiverSection.ts';

const SCALE = 1.15;
const MILLIMETRES_PER_U = 11.5;
const GRID_U = 0.25;

const dimension = (sourceRow: string, referenceMm: number, pickedU?: number) => {
  const scaledMm = referenceMm * SCALE;
  const scaledU = scaledMm / MILLIMETRES_PER_U;
  return {
    sourceRow,
    referenceMm,
    scale: SCALE,
    scaledMm,
    scaledU,
    gridU: GRID_U,
    pickedU: pickedU ?? Math.round(scaledU / GRID_U) * GRID_U,
  } as const;
};

/** Approved 686-class reference rows, ×1.15, rounded to the project's 0.25u grid. */
export const REVOLVER_PROPORTIONS = {
  cylinderDiameter: dimension('686-class top/left photo estimate: 40 mm', 40, 4),
  cylinderLength: dimension(
    'BR 2026-10-02: extend approved ×1.15/rounded 4.00u cylinder by 25% to 5.00u',
    39,
    5,
  ),
  chamberCircleRadius: dimension('686-class top photo estimate: 13.5 mm', 13.5, 1.25),
  frameHeight: dimension('686-class side photo estimate: 80 mm', 80, 8),
  frameWidth: dimension('686-class top photo estimate: 35 mm', 35, 3.5),
  barrelAcrossFlats: dimension('686-class side photo estimate: 18 mm', 18, 1.75),
  barrelLengthS: dimension('S&W 686 family 3.00 in barrel', 76.2, 7.5),
  barrelLengthM: dimension('S&W 686 Mountain Gun listed 4.13 in barrel', 104.9, 10.5),
  barrelLengthL: dimension('S&W 686 family 6.00 in barrel', 152.4, 15.25),
  topstrapThickness: dimension('686-class side photo estimate: 6 mm', 6, 0.5),
  gripLength: dimension('686-class side photo estimate: 105 mm', 105, 10.5),
  gripDepth: dimension('686-class top photo estimate: 38 mm', 38, 3.75),
  cylinderGap: dimension('modeling allowance; nominal 686 gap estimate 0.15 mm', 0.15, 0.25),
} as const;

const C = REVOLVER_PROPORTIONS;
const CYLINDER_RADIUS = C.cylinderDiameter.pickedU / 2;
const CYLINDER_LENGTH = C.cylinderLength.pickedU;
const CHAMBER_ORBIT = C.chamberCircleRadius.pickedU;
const FRAME_FRONT_X = 0;
const FRAME_REAR_X = FRAME_FRONT_X - C.cylinderGap.pickedU - CYLINDER_LENGTH;
const REAR_BLOCK_FRONT_X = FRAME_REAR_X - 0.25;
const REAR_BLOCK_TOP_REAR_X = REAR_BLOCK_FRONT_X - 0.75;
const REAR_BLOCK_BOTTOM_REAR_X = REAR_BLOCK_FRONT_X - 2.25;
const CYLINDER_REAR_X = FRAME_REAR_X;
const CYLINDER_FRONT_X = CYLINDER_REAR_X + CYLINDER_LENGTH;
const CYLINDER_CENTER_X = (CYLINDER_REAR_X + CYLINDER_FRONT_X) / 2;
const CYLINDER_CENTER_Y = -CHAMBER_ORBIT;
const BARREL_LENGTH: Readonly<Record<string, number>> = {
  S: C.barrelLengthS.pickedU,
  M: C.barrelLengthM.pickedU,
  L: C.barrelLengthL.pickedU,
};
const FRAME_SIZE: Readonly<Record<string, { width: number; height: number; bodyBottom: number }>> = {
  S: { width: 3, height: 7.5, bodyBottom: -4.25 },
  M: { width: C.frameWidth.pickedU, height: C.frameHeight.pickedU, bodyBottom: -4.5 },
  L: { width: 4, height: 8.5, bodyBottom: -5 },
};
const GRIP_LENGTH = C.gripLength.pickedU;
const GRIP_RAKE_DEGREES = 22.5;
export const REVOLVER_GRIP_RAKE_DEGREES = GRIP_RAKE_DEGREES;
const GRIP_BUTT_CHAMFER = 0.375;
const CHAMBER_COUNT = 6;
const TOLERANCE = 1e-6;

const size: ParamSpec = { values: ['S', 'M', 'L'], default: 'M' };
const choice = (...values: string[]): ParamSpec => ({ values, default: values[0]! });
const boxSolid = (id: string, min: Vec3, max: Vec3): Solid => ({ id, kind: 'box', box: boxFromMinMax(min, max) });
// Geometry arguments deliberately mirror the extruded-polygon schema.
// biome-ignore lint/complexity/useMaxParams: the primitive's inputs are the polygon definition itself.
const polySolid = (
  id: string,
  profile: readonly (readonly [number, number])[],
  along: readonly [number, number],
  axis: 'x' | 'z',
  mergeGroup?: string,
  clip?: readonly ClipPlane[],
): Solid => ({
  id,
  kind: 'extruded-polygon',
  profile,
  axis,
  z: along,
  ...(mergeGroup ? { display: { outline: false, bevel: false, mergeGroup } } : {}),
  ...(clip ? { clip } : {}),
});
const keepOut = (id: string, min: Vec3, max: Vec3, allowPort?: string): KeepOut => {
  const bounds = boxFromMinMax(min, max);
  return {
    id,
    kind: id,
    box: { center: bounds.center, half: bounds.half },
    ...(allowPort ? { allowPort } : {}),
  };
};
const octagon = (radius: number, center: readonly [number, number] = [0, 0]) =>
  Array.from({ length: 8 }, (_, index) => {
    const angle = Math.PI / 8 + (Math.PI / 4) * index;
    return [center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle)] as const;
  });
const chamberParams = (params: Readonly<Record<string, string>>) => {
  const index = Number(params.chamberIndex ?? '0');
  return (2 * Math.PI * index) / CHAMBER_COUNT;
};
const vecAngle = (a: Vec3, b: Vec3): number => length(cross(a, b));

const sectionSpec = (frameSize: string): ReceiverSectionSpec => {
  const frame = FRAME_SIZE[frameSize] ?? FRAME_SIZE.M!;
  const { width, bodyBottom } = frame;
  const halfWidth = width / 2;
  const halfTopStrap = C.topstrapThickness.pickedU;
  return {
    id: 'revolver-frame',
    outline: [
      [bodyBottom + 0.5, -halfWidth],
      [2 - halfTopStrap, -halfWidth],
      [2, -halfWidth + 0.5],
      [2, halfWidth - 0.25],
      [2 - halfTopStrap, halfWidth],
      [bodyBottom + 0.5, halfWidth],
      [bodyBottom, halfWidth - 0.75],
      [bodyBottom, -halfWidth + 0.75],
    ],
    x: [FRAME_REAR_X, FRAME_FRONT_X],
    wall: 0.5,
    cavity: { y: [-3.75, 1.25], z: [-0.5, 0.5] },
    port: {
      x: [CYLINDER_REAR_X, CYLINDER_FRONT_X],
      sectionAxis: 0,
      section: [-3.5, 1],
    },
    farPort: {
      x: [CYLINDER_REAR_X, CYLINDER_FRONT_X],
      sectionAxis: 0,
      section: [-3.5, 1],
    },
  };
};

const triggerGuardSolids = (guardBottom: number, left: number, right: number): Solid[] => {
  const top = guardBottom + 2.25;
  const bottom = guardBottom;
  const thickness = 0.25;
  const depth = 0.5;
  const triggerCenter = right - 1.5;
  const rectangle = (id: string, x: readonly [number, number], y: readonly [number, number]): Solid =>
    boxSolid(id, [x[0], y[0], -depth], [x[1], y[1], depth]);
  return [
    rectangle('trigger-guard-top', [left, right], [top - thickness, top]),
    rectangle('trigger-guard-bottom', [left, right], [bottom, bottom + thickness]),
    rectangle('trigger-guard-rear', [left, left + thickness], [bottom, top]),
    rectangle('trigger-guard-front', [right - thickness, right], [bottom, top]),
    polySolid(
      'curved-trigger',
      [
        [triggerCenter - 0.25, guardBottom + 1.5],
        [triggerCenter - 0.2, guardBottom + 1.15],
        [triggerCenter, guardBottom + 0.85],
        [triggerCenter + 0.2, guardBottom + 1.2],
        [triggerCenter + 0.15, guardBottom + 1.45],
        [triggerCenter - 0.05, guardBottom + 1.5],
      ],
      [-0.35, 0.35],
      'z',
    ),
  ];
};

export const revolverFrame: PartFamily = {
  name: 'revolver-frame',
  params: {
    bore: size,
    frameSize: choice('S', 'M', 'L'),
    butt: choice('round', 'square'),
  },
  build(params): PartDef {
    const frame = FRAME_SIZE[params.frameSize ?? 'M'] ?? FRAME_SIZE.M!;
    const strapHalfWidth = frame.width / 2;
    const section = buildReceiverSection(sectionSpec(params.frameSize ?? 'M'));
    const topstrapThickness = C.topstrapThickness.pickedU;
    const topstrap: Solid = boxSolid(
      'topstrap',
      [CYLINDER_REAR_X, 2 - topstrapThickness, -strapHalfWidth],
      [FRAME_FRONT_X, 2, strapHalfWidth],
    );
    const recoilShield = boxSolid('recoil-shield', [FRAME_REAR_X - 0.25, -3.5, -1.25], [FRAME_REAR_X, 1.25, 1.25]);
    const rearBlock: Solid = polySolid(
      'rear-grip-block',
      [
        [REAR_BLOCK_BOTTOM_REAR_X, frame.bodyBottom],
        [REAR_BLOCK_FRONT_X, frame.bodyBottom],
        [REAR_BLOCK_FRONT_X, 2],
        [REAR_BLOCK_TOP_REAR_X, 2],
      ],
      [-strapHalfWidth, strapHalfWidth],
      'z',
      'revolver-frame',
    );
    const barrelBoss = polySolid('barrel-thread-boss', octagon(1.05), [-0.5, FRAME_FRONT_X], 'x', 'revolver-frame');
    const hammerX = REAR_BLOCK_TOP_REAR_X + 0.25;
    const hammer = boxSolid('exposed-hammer-spur', [hammerX - 0.25, 2, -0.5], [hammerX + 0.25, 2.75, 0.5]);
    const triggerBottom = frame.bodyBottom - 2.25;
    const triggerGuardLeft = REAR_BLOCK_FRONT_X - 0.75;
    const triggerGuardRight = FRAME_REAR_X + 2.5;
    const gripX = REAR_BLOCK_FRONT_X - 1;
    const gripY = frame.bodyBottom;
    const ports: PortDef[] = [
      {
        id: 'barrel',
        mount: 'barrel',
        gender: 'female',
        size: params.bore ?? 'M',
        pos: [0, 0, 0],
        normal: [1, 0, 0],
        up: [0, 1, 0],
        required: true,
      },
      {
        id: 'cylinder',
        mount: 'revolver-cylinder',
        gender: 'female',
        pos: [CYLINDER_CENTER_X, CYLINDER_CENTER_Y, 0],
        normal: [-1, 0, 0],
        up: [0, 1, 0],
        required: true,
      },
      {
        id: 'grip-frame',
        mount: 'revolver-grip',
        gender: 'female',
        pos: [gripX, gripY, 0],
        normal: [0, -1, 0],
        up: [1, 0, 0],
        required: true,
      },
      {
        id: 'hammer',
        mount: 'revolver-hammer',
        gender: 'female',
        pos: [hammerX, 2, 0],
        normal: [0, 1, 0],
        up: [1, 0, 0],
      },
      {
        id: 'trigger-guard',
        mount: 'revolver-trigger-guard',
        gender: 'female',
        pos: [triggerGuardLeft, gripY, 0],
        normal: [0, -1, 0],
        up: [1, 0, 0],
      },
    ];
    return {
      family: 'revolver-frame',
      solids: [...section, topstrap, recoilShield, rearBlock, barrelBoss, hammer, ...triggerGuardSolids(triggerBottom, triggerGuardLeft, triggerGuardRight)],
      ports,
      keepOuts: [
        keepOut('trigger-finger', [triggerGuardRight - 2.25, triggerBottom + 0.25, -0.5], [triggerGuardRight - 1.25, triggerBottom + 2, 0.5]),
        keepOut('cylinder-swing', [CYLINDER_REAR_X, -3.5, -4], [CYLINDER_FRONT_X, 1, -1.5], 'cylinder'),
        keepOut('hammer-travel', [REAR_BLOCK_TOP_REAR_X - 0.25, 2.25, -0.75], [REAR_BLOCK_FRONT_X, 3.5, 0.75]),
        keepOut('cylinder-gap', [CYLINDER_FRONT_X, -0.25, -1], [FRAME_FRONT_X, 0.25, 1]),
      ],
      axes: [],
    };
  },
};

const fluteSolid = (index: number): Solid => {
  const angle = (2 * Math.PI * index) / CHAMBER_COUNT;
  const inner = CYLINDER_RADIUS - 0.04;
  const outer = CYLINDER_RADIUS + 0.015;
  const halfWidth = 0.11;
  const center = (inner + outer) / 2;
  const tangent = [-Math.sin(angle), Math.cos(angle)] as const;
  const radial = [Math.cos(angle), Math.sin(angle)] as const;
  const points = [
    [-halfWidth, -0.025],
    [halfWidth, -0.025],
    [halfWidth, 0.025],
    [-halfWidth, 0.025],
  ].map(
    ([side, depth]) =>
      [
        center * radial[0] + side! * tangent[0] + depth! * radial[0],
        center * radial[1] + side! * tangent[1] + depth! * radial[1],
      ] as const,
  );
  return polySolid(`cylinder-flute-${index}`, points.reverse(), [-1.6, 1.6], 'z');
};

const chamberMarker = (index: number, phase: number): Solid => {
  const angle = Math.PI / 2 + phase + (2 * Math.PI * index) / CHAMBER_COUNT;
  const center: readonly [number, number] = [CHAMBER_ORBIT * Math.cos(angle), CHAMBER_ORBIT * Math.sin(angle)];
  const marker = octagon(0.17, center);
  return polySolid(`chamber-${index}`, marker, [-CYLINDER_LENGTH / 2 - 0.015, -CYLINDER_LENGTH / 2], 'z');
};

export const revolverCylinder: PartFamily = {
  name: 'revolver-cylinder',
  params: {
    chamberCount: { values: ['6'], default: '6' },
    chamberIndex: {
      values: ['0', '1', '2', '3', '4', '5'],
      default: '0',
      fault: ['1', '2', '3', '4', '5'],
    },
  },
  build(params): PartDef {
    const count = Number(params.chamberCount ?? '6');
    const phase = chamberParams(params);
    const body = polySolid('drum', octagon(CYLINDER_RADIUS), [-CYLINDER_LENGTH / 2, CYLINDER_LENGTH / 2], 'z');
    const yoke = polySolid(
      'crane-yoke',
      [
        [-0.3, -2.35],
        [0.2, -2.6],
        [0.45, -2.2],
        [0.3, -1.1],
        [-0.3, -1.1],
      ],
      [-0.55, 0.55],
      'z',
    );
    const ejector = polySolid('ejector-boss', octagon(0.3, [0, -2.2]), [-0.35, 0.35], 'z');
    const chambers = Array.from({ length: count }, (_, index) => chamberMarker(index, phase));
    return {
      family: 'revolver-cylinder',
      solids: [body, yoke, ejector],
      displaySolids: [
        body,
        yoke,
        ejector,
        ...Array.from({ length: CHAMBER_COUNT }, (_, i) => fluteSolid(i)),
        ...chambers,
      ],
      ports: [
        {
          id: 'frame',
          mount: 'revolver-cylinder',
          gender: 'male',
          pos: [0, 0, 0],
          normal: [0, 0, 1],
          up: [0, 1, 0],
          required: true,
        },
        {
          id: 'barrel',
          mount: 'revolver-cylinder',
          gender: 'male',
          pos: [0, CHAMBER_ORBIT, 0],
          normal: [0, 0, 1],
          up: [0, 1, 0],
          required: true,
        },
      ],
      keepOuts: [],
      axes: [
        {
          kind: 'bore',
          origin: [CHAMBER_ORBIT * Math.cos(Math.PI / 2 + phase), CHAMBER_ORBIT * Math.sin(Math.PI / 2 + phase), 0],
          dir: [0, 0, 1],
        },
        { kind: 'revolver-cylinder', origin: [0, 0, 0], dir: [0, 0, 1] },
      ],
    };
  },
};

const revolverBarrelLength = (params: Readonly<Record<string, string>>): number =>
  BARREL_LENGTH[params.length ?? 'M'] ?? BARREL_LENGTH.M!;

export const revolverBarrel: PartFamily = {
  name: 'revolver-barrel',
  params: {
    bore: { ...size, from: [{ port: 'frame', param: 'bore' }] },
    length: size,
    style: choice('classic', 'vented'),
  },
  build(params): PartDef {
    const len = revolverBarrelLength(params);
    const halfAcrossFlats = C.barrelAcrossFlats.pickedU / 2;
    const vertexRadius = halfAcrossFlats / Math.cos(Math.PI / 8);
    const barrel = polySolid('barrel-octagon', octagon(vertexRadius), [0.5, len], 'x', 'revolver-barrel');
    const forcingCone = polySolid('forcing-cone', octagon(vertexRadius * 1.12), [0, 0.5], 'x', 'revolver-barrel');
    const rib = polySolid(
      'top-rib',
      [
        [halfAcrossFlats, -0.25],
        [halfAcrossFlats + 0.25, -0.25],
        [halfAcrossFlats + 0.25, 0.25],
        [halfAcrossFlats, 0.25],
      ],
      [0.5, len],
      'x',
      'revolver-barrel',
    );
    const shroud = polySolid(
      'underlug-shroud',
      [
        [-1.25, -0.7],
        [-0.35, -0.7],
        [-0.25, -0.45],
        [-0.45, -0.3],
        [-1.15, -0.3],
      ],
      [0.5, Math.min(len - 0.5, params.style === 'vented' ? 3 : 4.5)],
      'x',
      'revolver-barrel',
    );
    const styleDetails =
      params.style === 'vented'
        ? [
            polySolid(
              'rib-vent-left',
              [
                [halfAcrossFlats + 0.25, -0.25],
                [halfAcrossFlats + 0.4, -0.25],
                [halfAcrossFlats + 0.4, 0.25],
                [halfAcrossFlats + 0.25, 0.25],
              ],
              [1.5, 2.5],
              'x',
            ),
            polySolid(
              'rib-vent-right',
              [
                [halfAcrossFlats + 0.25, -0.25],
                [halfAcrossFlats + 0.4, -0.25],
                [halfAcrossFlats + 0.4, 0.25],
                [halfAcrossFlats + 0.25, 0.25],
              ],
              [3, 4],
              'x',
            ),
          ]
        : [];
    const frontSight = polySolid(
      'front-sight',
      [
        [halfAcrossFlats, -0.25],
        [halfAcrossFlats + 0.5, -0.25],
        [halfAcrossFlats + 0.5, 0.25],
        [halfAcrossFlats, 0.25],
      ],
      [len - 0.5, len],
      'x',
    );
    return {
      family: 'revolver-barrel',
      solids: [barrel, forcingCone, rib, shroud, ...styleDetails, frontSight],
      ports: [
        {
          id: 'frame',
          mount: 'barrel',
          gender: 'male',
          size: params.bore ?? 'M',
          pos: [0, 0, 0],
          normal: [-1, 0, 0],
          up: [0, 1, 0],
          required: true,
        },
        {
          id: 'cylinder',
          mount: 'revolver-cylinder',
          gender: 'female',
          pos: [CYLINDER_CENTER_X, 0, 0],
          normal: [-1, 0, 0],
          up: [0, 1, 0],
          required: true,
        },
        { id: 'muzzle', mount: 'muzzle', gender: 'female', pos: [len, 0, 0], normal: [1, 0, 0], up: [0, 1, 0] },
      ],
      keepOuts: [keepOut('muzzle', [len, -1, -1], [len + 30, 1, 1])],
      axes: [{ kind: 'bore', origin: [0, 0, 0], dir: [1, 0, 0] }],
    };
  },
};

const gripProfiles = (lengthU: number) => {
  const rake = (GRIP_RAKE_DEGREES * Math.PI) / 180;
  const verticalReach = lengthU * Math.cos(rake);
  const rearwardOffset = lengthU * Math.sin(rake);
  const halfReach = verticalReach / 2;
  const middleCenterX = -rearwardOffset / 2;
  const middleHalfWidth = 0.7;
  const buttHalfWidth = 1.5;
  const upper = [
    [-0.5, 0],
    [middleCenterX - middleHalfWidth, -halfReach],
    [middleCenterX + middleHalfWidth, -halfReach],
    [0.5, 0],
  ] as const;
  const bottomLeft = -rearwardOffset - buttHalfWidth;
  const bottomRight = -rearwardOffset + buttHalfWidth;
  const lower = [
    [middleCenterX - middleHalfWidth, -halfReach],
    [bottomLeft, -verticalReach],
    [bottomRight, -verticalReach],
    [(middleCenterX + middleHalfWidth + bottomRight) / 2 + 0.15, -(halfReach + verticalReach) / 2],
    [middleCenterX + middleHalfWidth, -halfReach],
  ] as const;
  const roundButtClip: readonly ClipPlane[] = [
    {
      normal: [1, -1, 0],
      offset: bottomRight + verticalReach - GRIP_BUTT_CHAMFER,
    },
    {
      normal: [-1, -1, 0],
      offset: -bottomLeft + verticalReach - GRIP_BUTT_CHAMFER,
    },
  ];
  return { upper, lower, roundButtClip };
};

export const revolverGrip: PartFamily = {
  name: 'revolver-grip',
  params: {
    length: { values: ['M'], default: 'M' },
    butt: { ...choice('round', 'square'), from: [{ port: 'frame', param: 'butt' }] },
  },
  build(params): PartDef {
    const profiles = gripProfiles(GRIP_LENGTH);
    const buttClip = params.butt === 'square' ? undefined : profiles.roundButtClip;
    const core = [
      polySolid('grip-core-upper', profiles.upper, [-1.25, 1.25], 'z', 'revolver-grip'),
      polySolid('grip-core', profiles.lower, [-1.25, 1.25], 'z', 'revolver-grip', buttClip),
    ];
    const panels = [
      polySolid('grip-panel-upper-near', profiles.upper, [1.25, 1.875], 'z'),
      polySolid('grip-panel-lower-near', profiles.lower, [1.25, 1.875], 'z', undefined, buttClip),
      polySolid('grip-panel-upper-far', profiles.upper, [-1.875, -1.25], 'z'),
      polySolid('grip-panel-lower-far', profiles.lower, [-1.875, -1.25], 'z', undefined, buttClip),
    ];
    return {
      family: 'revolver-grip',
      solids: [...core, ...panels],
      ports: [
        {
          id: 'frame-joint',
          mount: 'revolver-grip',
          gender: 'male',
          pos: [0, 0, 0],
          normal: [0, 1, 0],
          up: [1, 0, 0],
          required: true,
        },
      ],
      keepOuts: [],
      axes: [],
      tags: ['firing-grip'],
    };
  },
};

const revolverParts = (r: Parameters<NonNullable<import('../core/schema.ts').Rule['check']>>[0]) =>
  [...r.defs].filter(([part, def]) => r.placed.has(part) && def.family.startsWith('revolver-'));
const worldBounds = (
  r: Parameters<NonNullable<import('../core/schema.ts').Rule['check']>>[0],
  part: string,
  solid: Solid,
) => {
  const bounds = localSolidBounds(solid);
  const transform = r.placed.get(part)!;
  const points: Vec3[] = [];
  for (const x of [bounds[0][0], bounds[1][0]]) {
    for (const y of [bounds[0][1], bounds[1][1]]) {
      for (const z of [bounds[0][2], bounds[1][2]]) {
        points.push(applyPoint(transform, [x, y, z]));
      }
    }
  }
  return {
    min: [0, 1, 2].map((axis) => Math.min(...points.map((p) => p[axis]!))),
    max: [0, 1, 2].map((axis) => Math.max(...points.map((p) => p[axis]!))),
  };
};

/** Testable exact alignment checks; the primary bore rule remains core axis-alignment. */
export const revolverAlignment = {
  topChamberBore(r: Parameters<NonNullable<import('../core/schema.ts').Rule['check']>>[0]): boolean {
    const cylinder = revolverParts(r).find(([, def]) => def.family === 'revolver-cylinder')?.[0];
    const barrel = revolverParts(r).find(([, def]) => def.family === 'revolver-barrel')?.[0];
    if (!(cylinder && barrel) || r.params.get(cylinder)?.chamberIndex?.value !== '0') {
      return true;
    }
    const cylinderAxis = r.defs.get(cylinder)!.axes.find(({ kind }) => kind === 'bore')!;
    const barrelAxis = r.defs.get(barrel)!.axes.find(({ kind }) => kind === 'bore')!;
    const cylinderTransform = r.placed.get(cylinder)!;
    const barrelTransform = r.placed.get(barrel)!;
    const originDelta = sub(
      applyPoint(cylinderTransform, cylinderAxis.origin),
      applyPoint(barrelTransform, barrelAxis.origin),
    );
    const dir = applyDir(barrelTransform, barrelAxis.dir);
    const offset = length(cross(originDelta, dir));
    return vecAngle(applyDir(cylinderTransform, cylinderAxis.dir), dir) <= TOLERANCE && offset <= TOLERANCE;
  },
  cylinderAxis(r: Parameters<NonNullable<import('../core/schema.ts').Rule['check']>>[0]): boolean {
    const cylinder = revolverParts(r).find(([, def]) => def.family === 'revolver-cylinder')?.[0];
    const barrel = revolverParts(r).find(([, def]) => def.family === 'revolver-barrel')?.[0];
    if (!(cylinder && barrel)) {
      return true;
    }
    const axis = r.defs.get(cylinder)!.axes.find(({ kind }) => kind === 'revolver-cylinder')!;
    const bore = r.defs.get(barrel)!.axes.find(({ kind }) => kind === 'bore')!;
    const cylinderTransform = r.placed.get(cylinder)!;
    const barrelTransform = r.placed.get(barrel)!;
    const center = applyPoint(cylinderTransform, axis.origin);
    const boreOrigin = applyPoint(barrelTransform, bore.origin);
    const boreDir = applyDir(barrelTransform, bore.dir);
    const centerOffset = sub(center, boreOrigin);
    const parallel = vecAngle(applyDir(cylinderTransform, axis.dir), boreDir) <= TOLERANCE;
    const drop = dot(centerOffset, [0, -1, 0]);
    const lateral = length(cross(centerOffset, boreDir));
    const onCorrectSide = dot(centerOffset, [0, 1, 0]) < 0;
    return (
      parallel &&
      onCorrectSide &&
      Math.abs(drop - CHAMBER_ORBIT) <= TOLERANCE &&
      Math.abs(lateral - CHAMBER_ORBIT) <= TOLERANCE
    );
  },
  cylinderGap(r: Parameters<NonNullable<import('../core/schema.ts').Rule['check']>>[0]): boolean {
    const cylinder = revolverParts(r).find(([, def]) => def.family === 'revolver-cylinder')?.[0];
    const barrel = revolverParts(r).find(([, def]) => def.family === 'revolver-barrel')?.[0];
    const frame = revolverParts(r).find(([, def]) => def.family === 'revolver-frame')?.[0];
    if (!(cylinder && barrel && frame)) {
      return true;
    }
    const drum = r.defs.get(cylinder)!.solids.find(({ id }) => id === 'drum')!;
    const cone = r.defs.get(barrel)!.solids.find(({ id }) => id === 'forcing-cone')!;
    const shield = r.defs.get(frame)!.solids.find(({ id }) => id === 'recoil-shield')!;
    const drumBounds = worldBounds(r, cylinder, drum);
    const coneBounds = worldBounds(r, barrel, cone);
    const shieldBounds = worldBounds(r, frame, shield);
    return (
      Math.abs(coneBounds.min[0]! - drumBounds.max[0]! - C.cylinderGap.pickedU) <= TOLERANCE &&
      Math.abs(shieldBounds.max[0]! - drumBounds.min[0]!) <= TOLERANCE
    );
  },
  topstrapSpan(r: Parameters<NonNullable<import('../core/schema.ts').Rule['check']>>[0]): boolean {
    const frame = revolverParts(r).find(([, def]) => def.family === 'revolver-frame')?.[0];
    if (!frame) {
      return true;
    }
    const strap = r.defs.get(frame)!.solids.find(({ id }) => id === 'topstrap');
    if (!strap) {
      return false;
    }
    const bounds = localSolidBounds(strap);
    const width = FRAME_SIZE[r.params.get(frame)?.frameSize?.value ?? 'M']!.width / 2;
    return (
      bounds[0][0] >= CYLINDER_REAR_X - TOLERANCE &&
      bounds[1][0] <= FRAME_FRONT_X + TOLERANCE &&
      bounds[0][2] >= -width - TOLERANCE &&
      bounds[1][2] <= width + TOLERANCE &&
      bounds[0][2] >= -CYLINDER_RADIUS - TOLERANCE &&
      bounds[1][2] <= CYLINDER_RADIUS + TOLERANCE
    );
  },
  gripJoint(r: Parameters<NonNullable<import('../core/schema.ts').Rule['check']>>[0]): boolean {
    const connection = r.connections.find(({ from: source, to: target }) => {
      const fromFamily = r.defs.get(source.part)?.family;
      const toFamily = r.defs.get(target.part)?.family;
      return (
        (fromFamily === 'revolver-frame' && toFamily === 'revolver-grip') ||
        (fromFamily === 'revolver-grip' && toFamily === 'revolver-frame')
      );
    });
    if (!connection) {
      return true;
    }
    const { from, to } = connection;
    if (!(r.placed.has(from.part) && r.placed.has(to.part))) {
      return true;
    }
    const a = r.placed.get(from.part)!;
    const b = r.placed.get(to.part)!;
    const pa = applyPoint(a, from.port.pos);
    const pb = applyPoint(b, to.port.pos);
    return length(sub(pa, pb)) <= TOLERANCE;
  },
};

const revolverRule = (
  id: string,
  title: string,
  passes: (r: Parameters<NonNullable<Rule['check']>>[0]) => boolean,
): Rule => ({
  id,
  title,
  check(r) {
    return passes(r) ? [] : [{ rule: id, message: `${title} failed.`, parts: revolverParts(r).map(([part]) => part) }];
  },
});

export const revolverRules: Rule[] = [
  revolverRule(
    'revolver-top-chamber-bore',
    'Top chamber bore aligns with barrel bore',
    revolverAlignment.topChamberBore,
  ),
  revolverRule('revolver-cylinder-axis', 'Cylinder axis aligns with barrel bore', revolverAlignment.cylinderAxis),
  revolverRule('revolver-cylinder-gap', 'Cylinder gap and recoil shield alignment', revolverAlignment.cylinderGap),
  revolverRule('revolver-topstrap-span', 'Topstrap stays within frame envelope', revolverAlignment.topstrapSpan),
  revolverRule('revolver-grip-joint', 'Grip meets the frame interface', revolverAlignment.gripJoint),
];

export const revolverFamilySet: Readonly<Record<string, PartFamily>> = {
  'revolver-frame': revolverFrame,
  'revolver-cylinder': revolverCylinder,
  'revolver-barrel': revolverBarrel,
  'revolver-grip': revolverGrip,
};

export const revolverStyle = {
  chamberCount: CHAMBER_COUNT,
  cylinderRadius: CYLINDER_RADIUS,
  cylinderLength: CYLINDER_LENGTH,
} as const;
