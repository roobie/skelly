import { boxFromMinMax, localSolidBounds, worldSolid } from '../core/geometry.ts';
import { applyDir, applyPoint, cross, dot, invert, length, sub, type Vec3 } from '../core/math.ts';
import type { ClipPlane, KeepOut, ParamSpec, PartDef, PartFamily, PortDef, Rule, Solid } from '../core/schema.ts';
import { buildReceiverSection, type ReceiverSectionSpec } from './receiverSection.ts';

const SCALE = 1.15;
const MILLIMETRES_PER_U = 11.5;
const GRID_U = 0.25;

const designPick = (sourceRow: string, pickedU: number) => ({ sourceRow, gridU: GRID_U, pickedU });

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
  frameTopHeight: designPick('BR geometry datum: bore centre to topstrap top', 2),
  rearBlockLength: designPick('BR 2026-10-02 revised side profile: rear-block lower run', 2.25),
  rearBlockTopSetback: designPick('BR 2026-10-02 revised side profile: upper backstrap setback', 0.75),
  gripTopWidth: designPick('BR 2026-10-02 revised grip profile: narrow upper face', 1),
  gripWaistWidth: designPick('BR 2026-10-02 revised grip profile: shared trapezoid transition', 1.4),
  gripButtWidth: designPick('BR 2026-10-02 revised grip profile: flared butt width', 3),
  gripFingerSwell: designPick('BR 2026-10-02 revised grip profile: front finger swell', 0.15),
  gripButtChamfer: designPick('BR 2026-10-02 grip finish: rounded-butt clip', 0.375),
  gripPortInset: designPick('BR 2026-10-02 rear-block grip interface placement', 1),
  triggerGuardBackOffset: designPick('BR 2026-10-02 rear-block trigger-guard placement', 0.75),
  triggerGuardForwardOffset: designPick('BR 2026-10-02 rear-block trigger-guard reach', 2.5),
  triggerCenterOffset: designPick('BR 2026-10-02 trigger position within guard', 0.25),
  triggerFingerBackInset: designPick('BR 2026-10-02 finger keep-out position in trigger guard', 2.25),
  triggerFingerFrontInset: designPick('BR 2026-10-02 finger keep-out position in trigger guard', 1.25),
  triggerFingerWidth: designPick('BR 2026-10-02 finger keep-out width', 1),
} as const;

const C = REVOLVER_PROPORTIONS;
const CYLINDER_RADIUS = C.cylinderDiameter.pickedU / 2;
const CYLINDER_LENGTH = C.cylinderLength.pickedU;
const CHAMBER_ORBIT = C.chamberCircleRadius.pickedU;
const FRAME_TOP_Y = C.frameTopHeight.pickedU;
const FRAME_FRONT_X = 0;
const FRAME_REAR_X = FRAME_FRONT_X - C.cylinderGap.pickedU - CYLINDER_LENGTH;
const REAR_BLOCK_FRONT_X = FRAME_REAR_X - C.cylinderGap.pickedU;
const REAR_BLOCK_TOP_REAR_X = REAR_BLOCK_FRONT_X - C.rearBlockTopSetback.pickedU;
const REAR_BLOCK_BOTTOM_REAR_X = REAR_BLOCK_FRONT_X - C.rearBlockLength.pickedU;
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
const GRIP_DEPTH = C.gripDepth.pickedU;
const GRIP_CORE_DEPTH = (GRIP_DEPTH * 2) / 3;
const GRIP_HALF_DEPTH = GRIP_DEPTH / 2;
const GRIP_RAKE_DEGREES = 22.5;
export const REVOLVER_GRIP_RAKE_DEGREES = GRIP_RAKE_DEGREES;
const GRIP_BUTT_CHAMFER = C.gripButtChamfer.pickedU;
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
  const windowHalfHeight = CYLINDER_RADIUS + C.cylinderGap.pickedU;
  return {
    id: 'revolver-frame',
    outline: [
      [bodyBottom + halfTopStrap, -halfWidth],
      [FRAME_TOP_Y - halfTopStrap, -halfWidth],
      [FRAME_TOP_Y, -halfWidth + halfTopStrap],
      [FRAME_TOP_Y, halfWidth - C.cylinderGap.pickedU],
      [FRAME_TOP_Y - halfTopStrap, halfWidth],
      [bodyBottom + 0.5, halfWidth],
      [bodyBottom, halfWidth - C.rearBlockTopSetback.pickedU],
      [bodyBottom, -halfWidth + C.rearBlockTopSetback.pickedU],
    ],
    x: [FRAME_REAR_X, FRAME_FRONT_X],
    wall: halfTopStrap,
    cavity: {
      y: [CYLINDER_CENTER_Y - windowHalfHeight, CYLINDER_CENTER_Y + windowHalfHeight],
      z: [-halfTopStrap, halfTopStrap],
    },
    port: {
      x: [CYLINDER_REAR_X, CYLINDER_FRONT_X],
      sectionAxis: 0,
      section: [CYLINDER_CENTER_Y - windowHalfHeight, CYLINDER_CENTER_Y + windowHalfHeight],
    },
    farPort: {
      x: [CYLINDER_REAR_X, CYLINDER_FRONT_X],
      sectionAxis: 0,
      section: [CYLINDER_CENTER_Y - windowHalfHeight, CYLINDER_CENTER_Y + windowHalfHeight],
    },
  };
};

const triggerGuardSolids = (guardBottom: number, top: number, left: number, right: number): Solid[] => {
  const bottom = guardBottom;
  const thickness = C.cylinderGap.pickedU;
  const depth = C.topstrapThickness.pickedU;
  const triggerCenter = (left + right) / 2 + C.triggerCenterOffset.pickedU;
  const triggerHalfHeight = Math.min(0.325, (top - bottom - 2 * thickness) / 2);
  const triggerCenterY = (top + bottom) / 2;
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
        [triggerCenter - 0.25, triggerCenterY + triggerHalfHeight],
        [triggerCenter - 0.2, triggerCenterY + triggerHalfHeight - 0.35],
        [triggerCenter, triggerCenterY - triggerHalfHeight],
        [triggerCenter + 0.2, triggerCenterY - triggerHalfHeight + 0.35],
        [triggerCenter + 0.15, triggerCenterY + triggerHalfHeight - 0.05],
        [triggerCenter - 0.05, triggerCenterY + triggerHalfHeight],
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
      [CYLINDER_REAR_X, FRAME_TOP_Y - topstrapThickness, -strapHalfWidth],
      [FRAME_FRONT_X, FRAME_TOP_Y, strapHalfWidth],
    );
    const recoilShield = boxSolid('recoil-shield', [FRAME_REAR_X - 0.25, -3.5, -1.25], [FRAME_REAR_X, 1.25, 1.25]);
    const rearBlock: Solid = polySolid(
      'rear-grip-block',
      [
        [REAR_BLOCK_BOTTOM_REAR_X, frame.bodyBottom],
        [REAR_BLOCK_FRONT_X, frame.bodyBottom],
        [REAR_BLOCK_FRONT_X, FRAME_TOP_Y],
        [REAR_BLOCK_TOP_REAR_X, FRAME_TOP_Y],
      ],
      [-strapHalfWidth, strapHalfWidth],
      'z',
      'revolver-frame',
    );
    const barrelBoss = polySolid('barrel-thread-boss', octagon(1.05), [-0.5, FRAME_FRONT_X], 'x', 'revolver-frame');
    const hammerX = REAR_BLOCK_TOP_REAR_X + C.cylinderGap.pickedU;
    const hammer = boxSolid(
      'exposed-hammer-spur',
      [hammerX - C.cylinderGap.pickedU, FRAME_TOP_Y, -topstrapThickness],
      [hammerX + C.cylinderGap.pickedU, FRAME_TOP_Y + topstrapThickness * 1.5, topstrapThickness],
    );
    const triggerBottom = FRAME_TOP_Y - frame.height;
    const triggerGuardTop = frame.bodyBottom;
    const triggerGuardLeft = REAR_BLOCK_FRONT_X - C.triggerGuardBackOffset.pickedU;
    const triggerGuardRight = FRAME_REAR_X + C.triggerGuardForwardOffset.pickedU;
    const gripX = REAR_BLOCK_FRONT_X - C.gripPortInset.pickedU;
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
        pos: [hammerX, FRAME_TOP_Y, 0],
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
      solids: [...section, topstrap, recoilShield, rearBlock, barrelBoss, hammer, ...triggerGuardSolids(triggerBottom, triggerGuardTop, triggerGuardLeft, triggerGuardRight)],
      ports,
      keepOuts: [
        keepOut(
          'trigger-finger',
          [
            triggerGuardRight - C.triggerFingerBackInset.pickedU,
            triggerBottom + C.cylinderGap.pickedU,
            -C.triggerFingerWidth.pickedU / 2,
          ],
          [
            triggerGuardRight - C.triggerFingerFrontInset.pickedU,
            triggerGuardTop - C.cylinderGap.pickedU,
            C.triggerFingerWidth.pickedU / 2,
          ],
        ),
        keepOut('cylinder-swing', [CYLINDER_REAR_X, -3.5, -4], [CYLINDER_FRONT_X, 1, -1.5], 'cylinder'),
        keepOut(
          'hammer-travel',
          [REAR_BLOCK_TOP_REAR_X - C.cylinderGap.pickedU, FRAME_TOP_Y + C.cylinderGap.pickedU, -1.5 * topstrapThickness],
          [REAR_BLOCK_FRONT_X, FRAME_TOP_Y + 3 * topstrapThickness, 1.5 * topstrapThickness],
        ),
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
  const topHalfWidth = C.gripTopWidth.pickedU / 2;
  const middleHalfWidth = C.gripWaistWidth.pickedU / 2;
  const buttHalfWidth = C.gripButtWidth.pickedU / 2;
  const upper = [
    [-topHalfWidth, 0],
    [middleCenterX - middleHalfWidth, -halfReach],
    [middleCenterX + middleHalfWidth, -halfReach],
    [topHalfWidth, 0],
  ] as const;
  const bottomLeft = -rearwardOffset - buttHalfWidth;
  const bottomRight = -rearwardOffset + buttHalfWidth;
  const lower = [
    [middleCenterX - middleHalfWidth, -halfReach],
    [bottomLeft, -verticalReach],
    [bottomRight, -verticalReach],
    [
      (middleCenterX + middleHalfWidth + bottomRight) / 2 + C.gripFingerSwell.pickedU,
      -(halfReach + verticalReach) / 2,
    ],
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
      polySolid('grip-core-upper', profiles.upper, [-GRIP_CORE_DEPTH / 2, GRIP_CORE_DEPTH / 2], 'z', 'revolver-grip'),
      polySolid('grip-core', profiles.lower, [-GRIP_CORE_DEPTH / 2, GRIP_CORE_DEPTH / 2], 'z', 'revolver-grip', buttClip),
    ];
    const panels = [
      polySolid('grip-panel-upper-near', profiles.upper, [GRIP_CORE_DEPTH / 2, GRIP_HALF_DEPTH], 'z'),
      polySolid('grip-panel-lower-near', profiles.lower, [GRIP_CORE_DEPTH / 2, GRIP_HALF_DEPTH], 'z', undefined, buttClip),
      polySolid('grip-panel-upper-far', profiles.upper, [-GRIP_HALF_DEPTH, -GRIP_CORE_DEPTH / 2], 'z'),
      polySolid('grip-panel-lower-far', profiles.lower, [-GRIP_HALF_DEPTH, -GRIP_CORE_DEPTH / 2], 'z', undefined, buttClip),
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
export const worldVertices = (
  r: Parameters<NonNullable<import('../core/schema.ts').Rule['check']>>[0],
  part: string,
  solid: Solid,
): Vec3[] => {
  const transform = r.placed.get(part)!;
  if (solid.kind === 'box') {
    const { center, half } = solid.box;
    return [-1, 1].flatMap((x) =>
      [-1, 1].flatMap((y) =>
        [-1, 1].map((z) =>
          applyPoint(transform, [
            center[0] + half[0] * x,
            center[1] + half[1] * y,
            center[2] + half[2] * z,
          ]),
        ),
      ),
    );
  }
  const world = worldSolid(transform, solid);
  return 'vertices' in world ? [...world.vertices] : [];
};

const projectedFace = (
  vertices: readonly Vec3[],
  origin: Vec3,
  normal: Vec3,
  tangentU: Vec3,
  tangentV: Vec3,
) => {
  const points = vertices.filter((point) => Math.abs(dot(normal, sub(point, origin))) <= TOLERANCE);
  if (points.length < 3) {
    return undefined;
  }
  const u = points.map((point) => dot(tangentU, sub(point, origin)));
  const v = points.map((point) => dot(tangentV, sub(point, origin)));
  return {
    points,
    u: [Math.min(...u), Math.max(...u)] as const,
    v: [Math.min(...v), Math.max(...v)] as const,
  };
};

const overlapWidth = (a: readonly [number, number], b: readonly [number, number]) =>
  Math.min(a[1], b[1]) - Math.max(a[0], b[0]);

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
    const cylinder = revolverParts(r).find(([, def]) => def.family === 'revolver-cylinder')?.[0];
    if (!(frame && cylinder)) {
      return true;
    }
    const strap = r.defs.get(frame)!.solids.find(({ id }) => id === 'topstrap');
    const cylinderDef = r.defs.get(cylinder)!;
    const cylinderSolids = cylinderDef.displaySolids ?? cylinderDef.solids;
    if (!strap || cylinderSolids.length === 0) {
      return false;
    }
    const inverseFrame = invert(r.placed.get(frame)!);
    const strapBounds = localSolidBounds(strap);
    const cylinderPoints = cylinderSolids.flatMap((solid) =>
      worldVertices(r, cylinder, solid).map((point) => {
        const frameLocal = applyPoint(inverseFrame, point);
        return frameLocal;
      }),
    );
    if (cylinderPoints.length === 0) {
      return false;
    }
    const cylinderMinX = Math.min(...cylinderPoints.map((point) => point[0]));
    const cylinderMinZ = Math.min(...cylinderPoints.map((point) => point[2]));
    const cylinderMaxZ = Math.max(...cylinderPoints.map((point) => point[2]));
    return (
      strapBounds[0][0] >= cylinderMinX - TOLERANCE &&
      strapBounds[1][0] <= FRAME_FRONT_X + TOLERANCE &&
      strapBounds[0][2] >= cylinderMinZ - TOLERANCE &&
      strapBounds[1][2] <= cylinderMaxZ + TOLERANCE
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
    const frame = r.defs.get(from.part)?.family === 'revolver-frame' ? from : to;
    const grip = frame === from ? to : from;
    const frameTransform = r.placed.get(frame.part)!;
    const gripTransform = r.placed.get(grip.part)!;
    const frameOrigin = applyPoint(frameTransform, frame.port.pos);
    const gripOrigin = applyPoint(gripTransform, grip.port.pos);
    if (length(sub(frameOrigin, gripOrigin)) > TOLERANCE) {
      return false;
    }
    const frameNormal = applyDir(frameTransform, frame.port.normal);
    const gripNormal = applyDir(gripTransform, grip.port.normal);
    if (dot(frameNormal, gripNormal) > -1 + TOLERANCE) {
      return false;
    }
    const tangentU = applyDir(frameTransform, frame.port.up);
    const tangentV = cross(frameNormal, tangentU);
    const frameDef = r.defs.get(frame.part)!;
    const supportFace = frameDef.solids
      .map((solid) =>
        projectedFace(worldVertices(r, frame.part, solid), frameOrigin, frameNormal, tangentU, tangentV),
      )
      .find(
        (face) =>
          face &&
          face.u[0] <= TOLERANCE &&
          face.u[1] >= -TOLERANCE &&
          face.v[0] <= TOLERANCE &&
          face.v[1] >= -TOLERANCE,
      );
    if (!supportFace) {
      return false;
    }
    const panelFaces = r.defs
      .get(grip.part)!
      .solids.filter((solid) => solid.id.startsWith('grip-panel'))
      .map((solid) =>
        projectedFace(worldVertices(r, grip.part, solid), gripOrigin, gripNormal, tangentU, tangentV),
      )
      .filter((face): face is NonNullable<typeof face> => face !== undefined);
    if (panelFaces.length < 2) {
      return false;
    }
    const maxGap = Math.max(
      ...panelFaces.flatMap((face) =>
        face.points.map((point) => Math.abs(dot(frameNormal, sub(point, frameOrigin)))),
      ),
    );
    const boundariesCoincide = panelFaces.every((face) =>
      face.points.every((point) => Math.abs(dot(frameNormal, sub(point, frameOrigin))) <= TOLERANCE),
    );
    return (
      maxGap <= 0.25 &&
      boundariesCoincide &&
      panelFaces.every(
        (face) =>
          overlapWidth(face.u, supportFace.u) > TOLERANCE &&
          overlapWidth(face.v, supportFace.v) > TOLERANCE,
      )
    );
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
