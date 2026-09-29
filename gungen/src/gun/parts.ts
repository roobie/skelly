// Part library: parametric families built from boxes and convex extrusions. All numbers are in u
// (see conventions.ts) and set proportions, not real-world dimensions
// (PROJECT.md, non-goals).
//
// The receiver normally carries the action body and bore line; the revolver
// receiver also forms the frame around its cylinder. Layout still lives in the
// lower that hangs under it, so layouts are data: pick a lower.
//
// Mount types (receivers and lowers carry the female side):
//   barrel     receiver front ↔ barrel rear (sized by bore)
//   cylinder   revolver frame ↔ cylinder axis; cylinder ↔ barrel closes a loop
//   handguard  receiver front ↔ handguard rear
//   clamp      barrel ↔ handguard front (optional: handguards may float free)
//   rail       receiver or handguard top rail (slotted) ↔ sight
//   lower      receiver bottom ↔ lower
//   grip       lower bottom ↔ grip
//   magazine   lower bottom ↔ box magazine
//   stock      receiver rear ↔ stock
//   tube       receiver front ↔ tube magazine (tube-fed receivers)
//   lug        barrel ↔ tube magazine front (closes a loop, like clamp)
//   forend     tube magazine ↔ sliding forend

import { GRID, SIZE_CLASSES, type SizeClass } from '../core/conventions.ts';
import { boxFromMinMax } from '../core/geometry.ts';
import type { Vec3 } from '../core/math.ts';
import type { KeepOut, ParamSpec, PartDef, PartFamily, PortDef, Solid, Vec2 } from '../core/schema.ts';

const size: ParamSpec = { values: SIZE_CLASSES, default: 'M' };
const choice = (...values: string[]): ParamSpec => ({ values, default: values[0]! });
const cls = (params: Readonly<Record<string, string>>, name: string): SizeClass => params[name] as SizeClass;

const X: Vec3 = [1, 0, 0];
const NEG_X: Vec3 = [-1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const NEG_Y: Vec3 = [0, -1, 0];

const solid = (id: string, min: Vec3, max: Vec3): Solid => ({ id, kind: 'box', box: boxFromMinMax(min, max) });
const extrudedPolygon = (
  id: string,
  profile: readonly Vec2[],
  z: readonly [number, number],
): Extract<Solid, { kind: 'extruded-polygon' }> => ({
  id,
  kind: 'extruded-polygon',
  profile,
  z,
});
const keepOut = (id: string, min: Vec3, max: Vec3, allowPort?: string): KeepOut => ({
  id,
  kind: id,
  box: boxFromMinMax(min, max),
  ...(allowPort ? { allowPort } : {}),
});

/** Tag for parts the firing hand can hold (see rules.ts). */
export const FIRING_GRIP = 'firing-grip';

// The handguard reaches 65% of the exposed barrel on standard layouts; AK
// handguards stop at 80% of the gas-port station. See the references in PROJECT.md.
const HANDGUARD_REACH = { barrelFraction: 0.65, akGasPortFraction: 0.8 } as const;
const AK_GAS_PORT_OFFSET = 8;

/** AK barrel gas-port stations from the receiver face; handguards end at 80% of this span. */
const AK_GAS_PORT_X: Record<SizeClass, number> = {
  S: 26 - AK_GAS_PORT_OFFSET,
  M: 36 - AK_GAS_PORT_OFFSET,
  L: 46 - AK_GAS_PORT_OFFSET,
};
const akHandguardLength = (length: SizeClass): number =>
  Math.round((AK_GAS_PORT_X[length] * HANDGUARD_REACH.akGasPortFraction) / 2) * 2;

/** Tube magazines sit this far below the bore line. */
const TUBE_DROP = 2.25;

// A box magazine's section: front to back, and side to side. 1.8× the first
// 3 × 2 box, snapped so each half-extent stays on the 0.25u grid.
const MAGAZINE_DEPTH = 5.5;
const MAGAZINE_WIDTH = 2.5;
const MAGAZINE_WELL_CLEARANCE = 0.25;
const MAGAZINE_WELL_DEPTH = MAGAZINE_DEPTH + 2 * MAGAZINE_WELL_CLEARANCE;
const MAGAZINE_WELL_WIDTH = MAGAZINE_WIDTH + 2 * MAGAZINE_WELL_CLEARANCE;
const MAGAZINE_WELL_HEIGHT = 1;
const MAGAZINE_WELL_CENTER_X = -7 + MAGAZINE_DEPTH / 2;
const RECESSED_MAGAZINE_PORT_Y = 2;
const RECESSED_MAGAZINE_WELL_TOP_Y = 0.5;
/** A magazine's section (front to back, side to side) by profile. */
const magazineSection = (profile: string | undefined): { readonly depth: number; readonly width: number } => {
  if (profile === 'pistol') {
    return { depth: PISTOL_MAGAZINE_DEPTH, width: PISTOL_MAGAZINE_WIDTH };
  }
  const smg = profile === 'smg';
  return { depth: MAGAZINE_DEPTH * (smg ? 0.6 : 1), width: MAGAZINE_WIDTH * (smg ? 0.8 : 1) };
};
type MagazineLength = '5-round' | '10-round' | SizeClass;
type MagazineProfile = 'standard' | 'smg' | 'pistol' | 'ak-curved' | 'stanag-curved';
type MagazineBands = Readonly<Record<SizeClass, number>>;
const MAGAZINE_PROFILE_LENGTHS_U: Readonly<{
  readonly compact: Readonly<Record<'5-round' | '10-round', number>>;
  readonly standard: MagazineBands;
  readonly smg: MagazineBands;
  readonly pistol: MagazineBands;
  readonly 'ak-curved': Readonly<Record<'ak74' | 'akm', MagazineBands>>;
  readonly 'stanag-curved': MagazineBands;
}> = {
  compact: { '5-round': 4.5, '10-round': 5.5 },
  standard: { S: 6, M: 10, L: 16 },
  smg: { S: 6, M: 10, L: 16 },
  pistol: { S: 6, M: 10, L: 16 },
  'ak-curved': {
    ak74: { S: 6, M: 10, L: 16.5 },
    akm: { S: 6, M: 10, L: 19.25 },
  },
  'stanag-curved': { S: 6, M: 10, L: 15.75 },
};
const magazineLengthData = (
  value: string | undefined,
  profile: MagazineProfile,
  variant: string | undefined,
): { size: SizeClass; length: number } => {
  const requested = (value ?? 'M') as MagazineLength;
  const sizeClass = requested === '5-round' || requested === '10-round' ? 'S' : requested;
  if (requested === '5-round' || requested === '10-round') {
    return { size: sizeClass, length: MAGAZINE_PROFILE_LENGTHS_U.compact[requested] };
  }
  const bands =
    profile === 'ak-curved'
      ? MAGAZINE_PROFILE_LENGTHS_U['ak-curved'][variant === 'akm' ? 'akm' : 'ak74']
      : MAGAZINE_PROFILE_LENGTHS_U[profile];
  return { size: sizeClass, length: bands[sizeClass] };
};
interface MagazineShape {
  readonly length: SizeClass;
  readonly depth: number;
  readonly width: number;
  readonly insertion: number;
  readonly bodyLength: number;
}
interface CurvedMagazineProfile {
  readonly seat: 'well' | 'face';
  readonly straightTop: number;
  readonly arc: {
    readonly radius: number;
    readonly sweepDegrees: number;
    readonly collisionFacets: number;
    readonly displayFacets: number;
  };
  readonly straightBottom: number;
  readonly topSlopeDegrees: number;
}
const CURVED_MAGAZINE_PROFILES: Readonly<Record<'ak74' | 'akm' | 'stanag30', CurvedMagazineProfile>> = {
  ak74: {
    seat: 'face',
    straightTop: 4,
    arc: { radius: 25.24, sweepDegrees: 28.5, collisionFacets: 6, displayFacets: 24 },
    straightBottom: 0,
    topSlopeDegrees: 5,
  },
  akm: {
    seat: 'face',
    straightTop: 3.5,
    arc: { radius: 20.12, sweepDegrees: 45, collisionFacets: 8, displayFacets: 24 },
    straightBottom: 0,
    topSlopeDegrees: 5,
  },
  stanag30: {
    seat: 'well',
    straightTop: 7.1,
    arc: { radius: 32, sweepDegrees: 10, collisionFacets: 4, displayFacets: 16 },
    straightBottom: 3.11,
    topSlopeDegrees: 0,
  },
};
const AK_MAGAZINE_CURVE_VARIANTS = ['ak74', 'akm'] as const;
const AK_MAGAZINE_ROCK_IN_SWEEP = 4;
const AK_RECEIVER_REAR_CUT_DEPTH = 2;
const AK_RECEIVER_REAR_CUT_DROP = 1.5;
const MAGAZINE_HOUSING_FRONT_LENGTH = 1.5;
const MAGAZINE_HOUSING_REAR_LENGTH = 2;
const MAGAZINE_HOUSING_REAR_WALL = 0.5;
export const G3_MAGAZINE_WELL_TILT = Math.atan(
  (MAGAZINE_HOUSING_REAR_LENGTH - MAGAZINE_HOUSING_FRONT_LENGTH) / MAGAZINE_WELL_DEPTH,
);
const snapAkGrid = (value: number): number => Math.round(value / GRID) * GRID;
const MAGAZINE_INSERTION = MAGAZINE_WELL_HEIGHT - MAGAZINE_WELL_CLEARANCE;
const MAGAZINE_ORIENTATIONS = ['straight', 'tilt', 'slant-5', 'slant-8', 'slant-10'] as const;
const MAGAZINE_ORIENTATION_PATTERN = /^(slant)-(5|8|10)$/;
export const LOWER_LAYOUTS = {
  conventional: { tiltedMagazineProfiles: ['standard'] },
  bullpup: { tiltedMagazineProfiles: [] },
  trigger: { tiltedMagazineProfiles: [] },
  ak: { tiltedMagazineProfiles: [] },
  ar: { tiltedMagazineProfiles: ['standard'] },
} as const;
const LOWER_TRIGGER_X = { conventional: -10.75, bullpup: 5, trigger: -11.5, ak: -10.75, ar: -10.75 } as const;
const LOWER_GRIP_X = { conventional: -13, bullpup: 3, trigger: -14, ak: -13, ar: -13 } as const;
const AK_GAS_CYLINDER_Y = 2;
export const HANDGUARD_CLEARANCE: Record<SizeClass, number> = { S: 0.25, M: 0.25, L: 0.5 };
const HANDGUARD_WALL_THICKNESS = 0.5;
const RECEIVER_FRONT_HALF_HEIGHT = 2.5;
const RECEIVER_FRONT_HALF_WIDTH = 2;
const BARREL_RADIUS: Record<SizeClass, number> = { S: 0.75, M: 1, L: 1.25 };
const orientationParts = (value: string): { kind: 'straight' | 'tilt' | 'slant'; degrees: number } => {
  const match = MAGAZINE_ORIENTATION_PATTERN.exec(value);
  if (value === 'tilt') {
    return { kind: 'tilt', degrees: 0 };
  }
  return match ? { kind: match[1] as 'slant', degrees: Number(match[2]) } : { kind: 'straight', degrees: 0 };
};
const LOWER_HALF_WIDTH = MAGAZINE_WELL_WIDTH / 2 + MAGAZINE_WELL_CLEARANCE;
const PISTOL_MAGAZINE_DEPTH = 3.5;
const PISTOL_MAGAZINE_WIDTH = 2;
const PISTOL_WELL_DEPTH = PISTOL_MAGAZINE_DEPTH + 2 * MAGAZINE_WELL_CLEARANCE;
const PISTOL_WELL_WIDTH = PISTOL_MAGAZINE_WIDTH + 2 * MAGAZINE_WELL_CLEARANCE;
const PISTOL_GRIP_HALF_X = PISTOL_WELL_DEPTH / 2 + MAGAZINE_WELL_CLEARANCE;
const PISTOL_GRIP_HALF_Z = PISTOL_WELL_WIDTH / 2 + MAGAZINE_WELL_CLEARANCE;
const PISTOL_WELL_HEIGHT = 6;
const PISTOL_MAGAZINE_INSERTION = PISTOL_WELL_HEIGHT - MAGAZINE_WELL_CLEARANCE;
const PISTOL_BARREL_LENGTH: Record<SizeClass, number> = { S: 12, M: 16, L: 20 };
const PISTOL_CROWN_LENGTH = 1;
const PISTOL_BARREL_RADIUS: Record<SizeClass, number> = { S: 0.75, M: 1, L: 1.25 };
const PISTOL_SLIDE_CHANNEL_CLEARANCE = 0.125;
const PISTOL_SLIDE_WALL_THICKNESS = 0.5;
const GRIP_BANDS = { lengthU: { S: 7.5, M: 8.5, L: 9.5 }, leanDegrees: 18 } as const;
/** Profile points at the grip's upper mount; the first is the front vertex touching a lower's guard. */
export const GRIP_MOUNT_PROFILE = [
  [1.5, 0],
  [1.25, Math.tan((GRIP_BANDS.leanDegrees * Math.PI) / 180) * 1.25],
  [-1.5, -Math.tan((GRIP_BANDS.leanDegrees * Math.PI) / 180) * 1.5],
] as const satisfies readonly Vec2[];
export const TRIGGER_GUARD = { innerXClearance: 0.75, sideWall: 0.5, verticalWall: 0.25, zRatio: 0.625 } as const;
const LOWER_TRIGGER_GUARD = { ...TRIGGER_GUARD, innerXClearance: 0.5 };
const triggerGuardSolids = (
  triggerFinger: KeepOut,
  gripContactX?: number,
  dimensions: { innerXClearance: number; sideWall: number; verticalWall: number; zRatio: number } = TRIGGER_GUARD,
): Solid[] => {
  const { center, half } = triggerFinger.box;
  const minX = center[0] - half[0];
  const maxX = center[0] + half[0];
  const minY = center[1] - half[1];
  const maxY = center[1] + half[1];
  const innerRearX = minX - dimensions.innerXClearance;
  const outerRearX = gripContactX ?? innerRearX - dimensions.sideWall;
  const innerFrontX = maxX + dimensions.innerXClearance;
  const outerFrontX = innerFrontX + dimensions.sideWall;
  const lowerY = minY - dimensions.verticalWall;
  const upperY = maxY + dimensions.verticalWall;
  const zHalf = half[2] * dimensions.zRatio;
  const minZ = center[2] - zHalf;
  const maxZ = center[2] + zHalf;
  return [
    solid('trigger-guard-top', [outerRearX, maxY, minZ], [outerFrontX, upperY, maxZ]),
    solid('trigger-guard-rear', [outerRearX, lowerY, minZ], [innerRearX, upperY, maxZ]),
    solid('trigger-guard-front', [innerFrontX, lowerY, minZ], [outerFrontX, upperY, maxZ]),
    solid('trigger-guard-bottom', [outerRearX, lowerY, minZ], [outerFrontX, minY, maxZ]),
  ];
};
const lowerGripContactX = (layout: string, gripXOverride?: number): number => {
  const gripX = gripXOverride ?? LOWER_GRIP_X[layout as keyof typeof LOWER_GRIP_X] ?? LOWER_GRIP_X.conventional;
  const [x, y] = GRIP_MOUNT_PROFILE[0];
  const angle = (GRIP_BANDS.leanDegrees * Math.PI) / 180;
  return gripX + x * Math.cos(angle) - y * Math.sin(angle);
};
const lowerGripRearX = (gripX: number): number => {
  const angle = (GRIP_BANDS.leanDegrees * Math.PI) / 180;
  const faceRearX = Math.min(
    ...GRIP_MOUNT_PROFILE.slice(1).map(([x, y]) => gripX + x * Math.cos(angle) + y * Math.sin(angle)),
  );
  return Math.floor(faceRearX / GRID) * GRID;
};
const pistolSlideChannelHalfWidth = (bore: SizeClass): number =>
  PISTOL_BARREL_RADIUS[bore] + PISTOL_SLIDE_CHANNEL_CLEARANCE;
const pistolSlideHalfWidth = (bore: SizeClass): number =>
  pistolSlideChannelHalfWidth(bore) + PISTOL_SLIDE_WALL_THICKNESS;
const PISTOL_SLIDE_REAR = -8;
const PISTOL_GRIP_X = -6;
const REVOLVER_CYLINDER_RADIUS = 3;
const REVOLVER_CYLINDER_LENGTH = 8;
const REVOLVER_CYLINDER_CENTER_X = -4.25;

// ---- receiver ----

export const receiver: PartFamily = {
  name: 'receiver',
  params: {
    /** auto: charging handle. bolt: bolt travel/handle. pump: forend-driven. revolver: cylinder frame. */
    action: choice('auto', 'bolt', 'pump', 'revolver'),
    /** box: magazine through the lower. top: loaded from above. tube: tube magazine. cylinder: revolver. */
    feed: choice('box', 'top', 'tube', 'cylinder'),
    bore: size,
    chargingHandle: choice('side', 'rear-top'),
    rail: choice('full', 'none'),
    magazineWell: {
      values: ['standard', 'recessed'],
      default: 'standard',
      from: [{ port: 'lower', param: 'magazineWell' }],
    },
  },
  build(params): PartDef {
    const bore = cls(params, 'bore');
    const ports: PortDef[] = [
      { id: 'barrel', mount: 'barrel', gender: 'female', size: bore, pos: [0, 0, 0], normal: X, up: Y, required: true },
      { id: 'handguard', mount: 'handguard', gender: 'female', pos: [0, 0, 0], normal: X, up: Y },
      { id: 'lower', mount: 'lower', gender: 'female', pos: [0, -2.5, 0], normal: NEG_Y, up: X, required: true },
      { id: 'stock', mount: 'stock', gender: 'female', pos: [-16, 0, 0], normal: NEG_X, up: Y },
    ];
    if (params.rail !== 'none') {
      ports.push({
        id: 'rail',
        mount: 'rail',
        gender: 'female',
        pos: [-14, 2.5, 0],
        normal: Y,
        up: X,
        slots: { count: 7, pitch: 2 },
      });
    }
    const keepOuts: KeepOut[] = params.action === 'revolver' ? [] : [keepOut('ejection', [-9, -1, 2], [-5, 2, 10])];

    switch (params.action) {
      case 'auto':
        if (params.chargingHandle === 'rear-top') {
          keepOuts.push(keepOut('charging-handle', [-18, 2.5, -1.5], [-16, 5, 1.5]));
        } else {
          keepOuts.push(keepOut('charging-handle', [-12, 0, -4], [-4, 2, -2]));
        }
        break;
      case 'revolver':
        keepOuts.push(
          keepOut('cylinder-gap', [-0.25, -3, -3], [0, 0, 3], 'cylinder'),
          keepOut('cylinder-swing', [-8.25, -6, 3], [-0.25, 0, 8]),
          keepOut('hammer-travel', [-16, 2.5, -2], [-12, 6, 2]),
        );
        break;
      case 'bolt':
        // The bolt slides out of the back of the receiver; its handle lifts
        // and travels back along the right side.
        keepOuts.push(
          keepOut('bolt-travel', [-26, -1.5, -1.5], [-16, 1.5, 1.5]),
          keepOut('bolt-handle', [-24, -1, 2], [-12, 3, 6]),
        );
        break;
      default:
        // pump: the forend's travel is kept clear by the forend part itself.
        break;
    }

    switch (params.feed) {
      case 'top':
        keepOuts.push(keepOut('loading-port', [-9, 2.5, -1.5], [-4, 9, 1.5]));
        break;
      case 'cylinder':
        break;
      case 'tube':
        ports.push({
          id: 'tube',
          mount: 'tube',
          gender: 'female',
          pos: [0, -TUBE_DROP, 0],
          normal: X,
          up: Y,
          required: true,
        });
        keepOuts.push(keepOut('loading-port', [-7, -6, -1.5], [-2, -2.5, 1.5]));
        break;
      default:
        // box: the magazine well and its keep-out belong to the lower.
        break;
    }

    if (params.action === 'revolver' || params.feed === 'cylinder') {
      ports.push({
        id: 'cylinder',
        mount: 'cylinder',
        gender: 'female',
        size: bore,
        pos: [REVOLVER_CYLINDER_CENTER_X, -REVOLVER_CYLINDER_RADIUS, 0],
        normal: NEG_X,
        up: Y,
        required: true,
      });
    }

    let solids: Solid[];
    if (params.action === 'revolver') {
      solids = [
        solid('top-strap', [-16, 1.25, -3.25], [0, 2.5, 3.25]),
        extrudedPolygon(
          'beavertail-grip-safety',
          [
            [-17.5, 0.75],
            [-15, 0.75],
            [-15, 2.5],
            [-16.5, 2.5],
            [-17.25, 1.75],
          ],
          [-1.25, 1.25],
        ),
        solid('back-strap', [-16, -2.5, -1.5], [-13.5, 1.25, 1.5]),
        solid('front-strap', [-0.25, -2.5, -1.5], [0, 1.25, 1.5]),
        solid('cylinder-side-near', [-8.25, -6, -3.25], [-0.25, 0, -3]),
        solid('cylinder-side-far', [-8.25, -6, 3], [-0.25, 0, 3.25]),
        solid('cylinder-bottom', [-8.25, -6.5, -2.5], [-0.25, -6, 2.5]),
      ];
    } else if (params.magazineWell === 'recessed') {
      const x0 = MAGAZINE_WELL_CENTER_X - MAGAZINE_WELL_DEPTH / 2;
      const x1 = MAGAZINE_WELL_CENTER_X + MAGAZINE_WELL_DEPTH / 2;
      const z0 = MAGAZINE_WELL_WIDTH / 2;
      const y0 = -RECEIVER_FRONT_HALF_HEIGHT;
      const top = RECESSED_MAGAZINE_WELL_TOP_Y;
      solids = [
        solid(
          'body-rear',
          [-16, y0, -RECEIVER_FRONT_HALF_WIDTH],
          [x0, RECEIVER_FRONT_HALF_HEIGHT, RECEIVER_FRONT_HALF_WIDTH],
        ),
        solid(
          'body-front',
          [x1, y0, -RECEIVER_FRONT_HALF_WIDTH],
          [0, RECEIVER_FRONT_HALF_HEIGHT, RECEIVER_FRONT_HALF_WIDTH],
        ),
        solid('magwell-wall-left', [x0, y0, -RECEIVER_FRONT_HALF_WIDTH], [x1, top, -z0]),
        solid('magwell-wall-right', [x0, y0, z0], [x1, top, RECEIVER_FRONT_HALF_WIDTH]),
        solid(
          'magwell-roof',
          [x0, top, -RECEIVER_FRONT_HALF_WIDTH],
          [x1, RECEIVER_FRONT_HALF_HEIGHT, RECEIVER_FRONT_HALF_WIDTH],
        ),
      ];
    } else {
      solids = [
        solid(
          'body',
          [-16, -RECEIVER_FRONT_HALF_HEIGHT, -RECEIVER_FRONT_HALF_WIDTH],
          [0, RECEIVER_FRONT_HALF_HEIGHT, RECEIVER_FRONT_HALF_WIDTH],
        ),
      ];
    }
    return {
      family: 'receiver',
      solids,
      ports,
      keepOuts,
      axes: [{ kind: 'bore', origin: [-16, 0, 0], dir: X }],
    };
  },
};

/** AK-style stamped receiver with a removable dust cover, gas-cylinder and rear-sight interfaces. */
export const akReceiver: PartFamily = {
  name: 'receiver',
  params: { action: choice('bolt'), feed: choice('box'), bore: size },
  build(params): PartDef {
    const bore = cls(params, 'bore');
    const base = receiver.build({ action: 'bolt', feed: 'box', bore, chargingHandle: 'side', rail: 'none' });
    return {
      ...base,
      solids: [
        extrudedPolygon(
          'receiver-body',
          [
            [-16, -RECEIVER_FRONT_HALF_HEIGHT],
            [0, -RECEIVER_FRONT_HALF_HEIGHT],
            [0, RECEIVER_FRONT_HALF_HEIGHT],
            [-16 + AK_RECEIVER_REAR_CUT_DEPTH, RECEIVER_FRONT_HALF_HEIGHT],
            [-16, RECEIVER_FRONT_HALF_HEIGHT - AK_RECEIVER_REAR_CUT_DROP],
          ],
          [-RECEIVER_FRONT_HALF_WIDTH, RECEIVER_FRONT_HALF_WIDTH],
        ),
        solid('dust-cover', [-13, 2.5, -1.75], [-1, 3, 1.75]),
      ],
      ports: [
        ...base.ports,
        {
          id: 'gas-cylinder',
          mount: 'gas-cylinder',
          gender: 'female',
          pos: [0, AK_GAS_CYLINDER_Y, 0],
          normal: X,
          up: Y,
          required: true,
        },
        { id: 'rear-sight', mount: 'sight-block', gender: 'female', pos: [-2, 3, 0], normal: Y, up: X, required: true },
      ],
    };
  },
};

// ---- lower ----

/**
 * Hangs under the receiver and sets the layout. Its frame shares the
 * receiver's X (0 at the receiver's front face); y = 0 is the receiver's
 * underside.
 *   conventional  magazine ahead of the grip
 *   bullpup       grip ahead of the magazine, with the butt built in
 *   trigger       trigger and grip anchor for tube-fed, top-fed, and revolver designs
 */
export const lower: PartFamily = {
  name: 'lower',
  params: {
    layout: { values: Object.keys(LOWER_LAYOUTS), default: 'conventional' },
    triggerGuard: { values: ['present', 'missing'], default: 'present', fault: ['missing'] },
    magazineWell: choice('standard', 'recessed'),
    magazineOrientation: {
      values: MAGAZINE_ORIENTATIONS,
      default: 'straight',
      from: [{ port: 'magazine', param: 'orientation' }],
    },
    magazineProfile: {
      values: ['standard', 'smg', 'pistol', 'ak-curved', 'stanag-curved'],
      default: 'standard',
      from: [{ port: 'magazine', param: 'profile' }],
    },
  },
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: lower layouts have distinct well, contact, and grip contracts that share placement data.
  build(params): PartDef {
    const orientation = orientationParts(params.magazineOrientation ?? 'straight');
    const layout = params.layout ?? 'conventional';
    const magazineProfile = params.magazineProfile ?? 'standard';
    const layoutData = LOWER_LAYOUTS[layout as keyof typeof LOWER_LAYOUTS];
    const tiltedMagazineProfiles: readonly string[] | undefined = layoutData?.tiltedMagazineProfiles;
    const supportsTiltedMagazineWell = tiltedMagazineProfiles?.includes(magazineProfile) ?? false;
    const tilt = orientation.kind === 'tilt' ? G3_MAGAZINE_WELL_TILT : 0;
    // A recessed well has no roof for the magazine to meet, so its walls close on the magazine's own section.
    const section = params.magazineWell === 'recessed' ? magazineSection(magazineProfile) : undefined;
    // Half-extents round up to the grid (the SMG magazine is 3.3u deep).
    const wellSpan = (extent: number) => 2 * Math.ceil((extent / 2 + MAGAZINE_WELL_CLEARANCE) / GRID) * GRID;
    const wellDepth = section ? wellSpan(section.depth) : MAGAZINE_WELL_DEPTH;
    const wellWidth = section ? wellSpan(section.width) : MAGAZINE_WELL_WIDTH;
    const top: PortDef = {
      id: 'top',
      mount: 'lower',
      gender: 'male',
      pos: [0, 0, 0],
      normal: Y,
      up: X,
      required: true,
    };
    const grip = (x: number): PortDef => ({
      id: 'grip',
      mount: 'grip',
      gender: 'female',
      pos: [x, -1.5, 0],
      normal: NEG_Y,
      up: X,
    });
    // The magazine well at x, with a sloped opening only for the G3-style fit.
    const well = (x: number) => {
      let portY = -1.5;
      if (orientation.kind === 'tilt' && supportsTiltedMagazineWell) {
        portY = -1.5 - (MAGAZINE_HOUSING_FRONT_LENGTH + MAGAZINE_HOUSING_REAR_LENGTH) / 2;
      } else if (params.magazineWell === 'recessed') {
        portY = RECESSED_MAGAZINE_PORT_Y;
      }
      const port: PortDef = {
        id: 'magazine',
        mount: 'magazine',
        gender: 'female',
        pos: [x, portY, 0],
        normal: [Math.sin(tilt), -Math.cos(tilt), 0],
        up: [Math.cos(tilt), Math.sin(tilt), 0],
        required: true,
      };
      const path = keepOut(
        'magazine-path',
        [x - wellDepth / 2, -40, -wellWidth / 2],
        [
          x + wellDepth / 2,
          params.magazineWell === 'recessed'
            ? RECESSED_MAGAZINE_PORT_Y + MAGAZINE_WELL_HEIGHT
            : -1.5 + MAGAZINE_WELL_HEIGHT,
          wellWidth / 2,
        ],
        'magazine',
      );
      if (tilt === 0) {
        return { port, path };
      }
      const halfDepth = wellDepth / 2;
      const rotate = ([dx, dy]: Vec2): Vec2 => [
        x + dx * Math.cos(tilt) - dy * Math.sin(tilt),
        portY + dx * Math.sin(tilt) + dy * Math.cos(tilt),
      ];
      const profile = [
        rotate([-halfDepth, -40]),
        rotate([halfDepth, -40]),
        rotate([halfDepth, -0.5]),
        rotate([-halfDepth, -0.5]),
      ];
      const xs = profile.map(([px]) => px);
      const ys = profile.map(([, py]) => py);
      const min = [
        Math.floor(Math.min(...xs) / GRID) * GRID,
        Math.floor(Math.min(...ys) / GRID) * GRID,
        -wellWidth / 2,
      ] as Vec3;
      const max = [
        Math.ceil(Math.max(...xs) / GRID) * GRID,
        Math.ceil(Math.max(...ys) / GRID) * GRID,
        wellWidth / 2,
      ] as Vec3;
      return {
        port,
        path: {
          ...path,
          box: boxFromMinMax(min, max),
          profile,
          z: [-wellWidth / 2, wellWidth / 2] as const,
        },
        wellPath: keepOut(
          'magazine-well-path',
          [x - halfDepth, portY - (MAGAZINE_HOUSING_REAR_LENGTH - MAGAZINE_HOUSING_FRONT_LENGTH) / 2, -wellWidth / 2],
          [x + halfDepth, 0, wellWidth / 2],
          'magazine',
        ),
      };
    };
    const magazineWellFrame = (minX: number, maxX: number, centerX: number): Solid[] => {
      const x0 = centerX - wellDepth / 2;
      const x1 = centerX + wellDepth / 2;
      const z0 = wellWidth / 2;
      const outerZ = LOWER_HALF_WIDTH;
      const roofY = -1.5 + MAGAZINE_WELL_HEIGHT;
      const rearWall = solid('frame-rear', [minX, -1.5, -outerZ], [x0, 0, outerZ]);
      return [
        rearWall,
        solid('frame-front', [x1, -1.5, -outerZ], [maxX, 0, outerZ]),
        solid('well-wall-left', [x0, -1.5, -outerZ], [x1, 0, -z0]),
        solid('well-wall-right', [x0, -1.5, z0], [x1, 0, outerZ]),
        ...(params.magazineWell === 'recessed' ? [] : [solid('well-roof', [x0, roofY, -z0], [x1, 0, z0])]),
      ];
    };
    // Conventional: the rear face meets the trigger-finger volume (it ends at
    // x = −7) without entering it. Bullpup: the front face stays at x = −3.5,
    // behind the grip, which leans back from x = 3.
    const conventionalWellX = MAGAZINE_WELL_CENTER_X + (orientation.kind === 'tilt' ? 0.25 : 0);
    const conventionalWell = well(conventionalWellX);
    const recessedConventional = params.layout === 'conventional' && params.magazineWell === 'recessed';
    const conventionalGripX = recessedConventional ? -12.75 : LOWER_GRIP_X.conventional;
    const conventionalTriggerX = recessedConventional ? -10.5 : LOWER_TRIGGER_X.conventional;
    const bullpupWell = well(-3.5 - MAGAZINE_DEPTH / 2);
    const magazineHousing = (prefix: string, centerX: number, angle: number, frontPanelThickness: number): Solid[] => {
      const halfDepth = MAGAZINE_WELL_DEPTH / 2;
      const z0 = MAGAZINE_WELL_WIDTH / 2;
      const outerZ = LOWER_HALF_WIDTH;
      const rotateProfile = (profile: readonly Vec2[]): Vec2[] =>
        profile.map(([x, y]) => [
          centerX + x * Math.cos(angle) - y * Math.sin(angle),
          -1.5 + x * Math.sin(angle) + y * Math.cos(angle),
        ]);
      const wall = (id: string, profile: readonly Vec2[], z: readonly [number, number]): Solid =>
        extrudedPolygon(`${prefix}-${id}`, rotateProfile(profile), z);
      return [
        wall(
          'rear',
          [
            [-halfDepth - MAGAZINE_HOUSING_REAR_WALL, -MAGAZINE_HOUSING_REAR_LENGTH],
            [-halfDepth, -MAGAZINE_HOUSING_REAR_LENGTH],
            [-halfDepth, 0],
            [-halfDepth - MAGAZINE_HOUSING_REAR_WALL, 0],
          ],
          [-outerZ, outerZ],
        ),
        wall(
          'front',
          [
            [halfDepth, -MAGAZINE_HOUSING_FRONT_LENGTH],
            [halfDepth + frontPanelThickness, -MAGAZINE_HOUSING_FRONT_LENGTH],
            [halfDepth + frontPanelThickness, 0],
            [halfDepth, 0],
          ],
          [-outerZ, outerZ],
        ),
        wall(
          'left',
          [
            [-halfDepth, -MAGAZINE_HOUSING_REAR_LENGTH],
            [halfDepth, -MAGAZINE_HOUSING_FRONT_LENGTH],
            [halfDepth, 0],
            [-halfDepth, 0],
          ],
          [-outerZ, -z0],
        ),
        wall(
          'right',
          [
            [-halfDepth, -MAGAZINE_HOUSING_REAR_LENGTH],
            [halfDepth, -MAGAZINE_HOUSING_FRONT_LENGTH],
            [halfDepth, 0],
            [-halfDepth, 0],
          ],
          [z0, outerZ],
        ),
      ];
    };
    const trigger = (x: number) => keepOut('trigger-finger', [x, -4.5, -1], [x + 2, -1.75, 1]);
    const triggerX =
      params.layout === 'conventional'
        ? conventionalTriggerX
        : (LOWER_TRIGGER_X[layout as keyof typeof LOWER_TRIGGER_X] ?? LOWER_TRIGGER_X.conventional);
    const triggerFinger = trigger(triggerX);
    const triggerGuards =
      params.triggerGuard === 'missing'
        ? []
        : triggerGuardSolids(
            triggerFinger,
            lowerGripContactX(layout, params.layout === 'conventional' ? conventionalGripX : undefined),
            LOWER_TRIGGER_GUARD,
          );

    switch (params.layout) {
      case 'ar': {
        const frame = magazineWellFrame(
          Math.min(-14.75, lowerGripRearX(LOWER_GRIP_X.ar)),
          conventionalWell.port.pos[0] + MAGAZINE_WELL_DEPTH / 2 + MAGAZINE_WELL_CLEARANCE,
          conventionalWell.port.pos[0],
        );
        const frontPanel = frame.find(({ id }) => id === 'frame-front');
        if (frontPanel?.kind !== 'box') {
          throw new Error('Expected a box-shaped magazine-well front panel.');
        }
        const frontPanelThickness = frontPanel.box.half[0] * 2;
        return {
          family: 'lower',
          solids: [
            ...frame,
            ...magazineHousing('magazine-housing', conventionalWell.port.pos[0], 0, frontPanelThickness),
            ...triggerGuards,
          ],
          ports: [top, grip(LOWER_GRIP_X.ar), conventionalWell.port],
          keepOuts: [triggerFinger, conventionalWell.path],
          axes: [],
        };
      }
      case 'bullpup':
        return {
          family: 'lower',
          solids: [
            ...magazineWellFrame(-16, 9, bullpupWell.port.pos[0]),
            solid('butt', [-18, -7, -1.75], [-16, 5, 1.75]),
            ...triggerGuards,
          ],
          ports: [top, grip(LOWER_GRIP_X.bullpup), bullpupWell.port],
          keepOuts: [triggerFinger, bullpupWell.path],
          axes: [],
        };
      case 'ak': {
        const frontHookX = conventionalWell.port.pos[0] + MAGAZINE_DEPTH / 2;
        return {
          family: 'lower',
          solids: [
            solid(
              'frame',
              [Math.min(-14.75, lowerGripRearX(LOWER_GRIP_X.ak)), -1.5, -LOWER_HALF_WIDTH],
              [0, 0, LOWER_HALF_WIDTH],
            ),
            ...triggerGuards,
          ],
          ports: [top, grip(LOWER_GRIP_X.ak), conventionalWell.port],
          keepOuts: [
            triggerFinger,
            keepOut(
              'magazine-rock-in-sweep',
              [frontHookX, -40, -MAGAZINE_WELL_WIDTH / 2],
              [frontHookX + AK_MAGAZINE_ROCK_IN_SWEEP, -3, MAGAZINE_WELL_WIDTH / 2],
              'magazine',
            ),
          ],
          axes: [],
        };
      }
      case 'trigger':
        return {
          family: 'lower',
          solids: [solid('frame', [-16, -1.5, -1.5], [-9, 0, 1.5]), ...triggerGuards],
          ports: [top, grip(LOWER_GRIP_X.trigger)],
          keepOuts: [triggerFinger],
          axes: [],
        };
      default: {
        const frame = magazineWellFrame(
          Math.min(recessedConventional ? -14 : -14.75, lowerGripRearX(conventionalGripX)),
          conventionalWell.port.pos[0] + MAGAZINE_WELL_DEPTH / 2 + MAGAZINE_WELL_CLEARANCE,
          conventionalWell.port.pos[0],
        );
        const tiltedHousing =
          orientation.kind === 'tilt' && supportsTiltedMagazineWell
            ? magazineHousing('tilt-housing', conventionalWell.port.pos[0], 0, MAGAZINE_WELL_CLEARANCE)
            : [];
        return {
          family: 'lower',
          // The well stays upright; only the rear housing plate is longer, so the opening plane tips the seated magazine.
          solids: [...frame, ...tiltedHousing, ...triggerGuards],
          ports: [top, grip(conventionalGripX), conventionalWell.port],
          keepOuts: [
            triggerFinger,
            conventionalWell.path,
            ...(conventionalWell.wellPath ? [conventionalWell.wellPath] : []),
          ],
          axes: [],
        };
      }
    }
  },
};

// ---- along the barrel ----

const barrelLength = (params: Readonly<Record<string, string>>): number => {
  if (params.profile === 'pistol') {
    return PISTOL_BARREL_LENGTH[cls(params, 'length')];
  }
  const sizeClass = cls(params, 'length');
  if (params.profile === 'revolver') {
    return { S: 12, M: 16, L: 20 }[sizeClass];
  }
  return { S: 26, M: 36, L: 46 }[sizeClass];
};

export const barrel: PartFamily = {
  name: 'barrel',
  // Bore follows the receiver it's mounted in, unless set. Pistol profile keeps the same family and size but a shorter external tube.
  params: {
    bore: { ...size, from: [{ port: 'rear', param: 'bore' }] },
    length: size,
    profile: choice('standard', 'pistol', 'revolver'),
    handguardLayout: { values: ['standard', 'ak'], default: 'standard', from: [{ port: 'clamp', param: 'layout' }] },
  },
  build(params): PartDef {
    const bore = cls(params, 'bore');
    const lengthClass = cls(params, 'length');
    const len = barrelLength(params);
    const r = PISTOL_BARREL_RADIUS[bore];
    const fore =
      params.handguardLayout === 'ak'
        ? akHandguardLength(lengthClass)
        : snapAkGrid(len * HANDGUARD_REACH.barrelFraction);
    return {
      family: 'barrel',
      solids: [solid('tube', [0, -r, -r], [len, r, r])],
      ports: [
        {
          id: 'rear',
          mount: 'barrel',
          gender: 'male',
          size: bore,
          pos: [0, 0, 0],
          normal: NEG_X,
          up: Y,
          required: true,
        },
        ...(params.profile === 'pistol'
          ? [
              {
                id: 'frame',
                mount: 'barrel-seat',
                gender: 'male' as const,
                size: bore,
                pos: [0, 0, 0] as Vec3,
                normal: NEG_X,
                up: Y,
                required: true,
              },
            ]
          : []),
        {
          id: 'front-sight',
          mount: 'sight-block',
          gender: 'female',
          size: bore,
          pos: [len - 4, 0, 0],
          normal: NEG_X,
          up: Y,
        },
        ...(params.profile === 'revolver'
          ? [
              {
                id: 'cylinder',
                mount: 'cylinder',
                gender: 'female' as const,
                size: bore,
                pos: [REVOLVER_CYLINDER_CENTER_X, 0, 0] as Vec3,
                normal: NEG_X,
                up: Y,
              },
            ]
          : []),
        ...(params.profile === 'standard'
          ? [
              {
                id: 'gas-port',
                mount: 'gas-block',
                gender: 'male' as const,
                size: bore,
                pos: [AK_GAS_PORT_X[lengthClass], 0, 0] as Vec3,
                normal: X,
                up: Y,
              },
            ]
          : []),
        { id: 'clamp', mount: 'clamp', gender: 'female', pos: [fore, 0, 0], normal: NEG_X, up: Y },
        { id: 'lug', mount: 'lug', gender: 'female', pos: [fore, -TUBE_DROP, 0], normal: NEG_X, up: Y },
        { id: 'muzzle', mount: 'muzzle', gender: 'female', pos: [len, 0, 0], normal: X, up: Y },
      ],
      keepOuts: [keepOut('muzzle', [len, -1.5, -1.5], [len + 30, 1.5, 1.5])],
      axes: [{ kind: 'bore', origin: [0, 0, 0], dir: X }],
    };
  },
};

/** A front sight block and post mounted near the muzzle. */
export const frontSight: PartFamily = {
  name: 'front-sight',
  params: { bore: { ...size, from: [{ port: 'base', param: 'bore' }] } },
  build(params): PartDef {
    const radius = { S: 0.75, M: 1, L: 1.25 }[cls(params, 'bore')];
    return {
      family: 'front-sight',
      solids: [solid('block', [-1, radius, -1.25], [1, 2, 1.25]), solid('post', [-0.25, 2, -0.25], [0.25, 5, 0.25])],
      ports: [{ id: 'base', mount: 'sight-block', gender: 'male', pos: [0, 0, 0], normal: X, up: Y, required: true }],
      keepOuts: [],
      axes: [{ kind: 'sight', origin: [0, 5, 0], dir: X }],
    };
  },
};

/** A raised AK gas block joins the barrel to the gas cylinder behind the front sight. */
export const gasBlock: PartFamily = {
  name: 'gas-block',
  params: {
    bore: { ...size, from: [{ port: 'barrel', param: 'bore' }] },
    barrelLength: { ...size, from: [{ port: 'barrel', param: 'length' }] },
  },
  build(params): PartDef {
    const radius = BARREL_RADIUS[cls(params, 'bore')];
    return {
      family: 'gas-block',
      solids: [
        solid('saddle', [-1, radius, -1.5], [1, radius + 0.5, 1.5]),
        solid('cylinder-support', [-0.5, radius + 0.5, -0.5], [0.5, AK_GAS_CYLINDER_Y, 0.5]),
      ],
      ports: [
        {
          id: 'barrel',
          mount: 'gas-block',
          gender: 'female',
          size: cls(params, 'bore'),
          pos: [0, 0, 0],
          normal: NEG_X,
          up: Y,
          required: true,
        },
        {
          id: 'gas-cylinder',
          mount: 'gas-block',
          gender: 'female',
          pos: [0, AK_GAS_CYLINDER_Y, 0],
          normal: NEG_X,
          up: Y,
          required: true,
        },
      ],
      keepOuts: [],
      axes: [],
    };
  },
};

/** The AK gas cylinder runs under the rear handguard cover and is exposed ahead of it. */
export const gasCylinder: PartFamily = {
  name: 'gas-cylinder',
  params: {
    barrelLength: { ...size, from: [{ port: 'front', param: 'barrelLength' }] },
  },
  build(params): PartDef {
    const len = AK_GAS_PORT_X[cls(params, 'barrelLength')];
    return {
      family: 'gas-cylinder',
      solids: [solid('cylinder', [0, -0.25, -0.5], [len, 0.25, 0.5])],
      ports: [
        { id: 'rear', mount: 'gas-cylinder', gender: 'male', pos: [0, 0, 0], normal: NEG_X, up: Y, required: true },
        { id: 'handguard', mount: 'gas-cylinder', gender: 'female', pos: [8, 0, 0], normal: X, up: Y, required: true },
        { id: 'front', mount: 'gas-block', gender: 'male', pos: [len, 0, 0], normal: X, up: Y, required: true },
      ],
      keepOuts: [],
      axes: [{ kind: 'gas-cylinder', origin: [0, 0, 0], dir: X }],
    };
  },
};

/** A simple leaf rear sight mounted on the AK dust cover, without a receiver rail. */
export const akRearSight: PartFamily = {
  name: 'ak-rear-sight',
  params: {},
  build(): PartDef {
    return {
      family: 'sight',
      solids: [solid('leaf', [-1, 0, -1.25], [1, 1, 1.25]), solid('notch', [-0.5, 1, -0.25], [0.5, 1.5, 0.25])],
      ports: [
        { id: 'base', mount: 'sight-block', gender: 'male', pos: [0, 0, 0], normal: NEG_Y, up: X, required: true },
      ],
      keepOuts: [],
      axes: [{ kind: 'sight', origin: [0, 2.5, 0], dir: X }],
    };
  },
};

/** Revolver cylinder, represented by an extruded chamber-count prism about its X-axis. */
export const cylinder: PartFamily = {
  name: 'cylinder',
  params: {
    chambers: choice('six', 'eight'),
    chamber: { values: ['aligned', 'misaligned'], default: 'aligned', fault: ['misaligned'] },
  },
  build(params): PartDef {
    const count = params.chambers === 'eight' ? 8 : 6;
    const phase = params.chamber === 'misaligned' ? Math.PI / 2 : 0;
    const profile = Array.from({ length: count }, (_, i) => {
      const angle = (2 * Math.PI * i) / count + Math.PI / 2 + phase;
      return [REVOLVER_CYLINDER_RADIUS * Math.cos(angle), REVOLVER_CYLINDER_RADIUS * Math.sin(angle)] as const;
    });
    const chamberAngle = Math.PI / 2 + phase;
    return {
      family: 'cylinder',
      solids: [extrudedPolygon('body', profile, [-REVOLVER_CYLINDER_LENGTH / 2, REVOLVER_CYLINDER_LENGTH / 2])],
      ports: [
        { id: 'frame', mount: 'cylinder', gender: 'male', pos: [0, 0, 0], normal: [0, 0, 1], up: Y, required: true },
        {
          id: 'barrel',
          mount: 'cylinder',
          gender: 'male',
          pos: [0, REVOLVER_CYLINDER_RADIUS, 0],
          normal: [0, 0, 1],
          up: Y,
          required: true,
        },
      ],
      keepOuts: [],
      axes: [
        {
          kind: 'bore',
          origin: [
            REVOLVER_CYLINDER_RADIUS * Math.cos(chamberAngle),
            REVOLVER_CYLINDER_RADIUS * Math.sin(chamberAngle),
            0,
          ],
          dir: [0, 0, 1],
        },
      ],
    };
  },
};

/** A barrel-fitted handguard, capped by the receiver's front-face envelope. */
export const handguard: PartFamily = {
  name: 'handguard',
  params: {
    length: { ...size, from: [{ port: 'front', param: 'length' }] },
    barrelBore: {
      ...size,
      from: [
        { port: 'front', param: 'bore' },
        { port: 'rear', param: 'bore' },
      ],
    },
    clearance: size,
    bore: { values: ['none', ...SIZE_CLASSES], default: 'none', from: [{ port: 'front', param: 'bore' }] },
    layout: choice('standard', 'ak'),
    fit: { values: ['receiver', 'oversized', 'too-tight'], default: 'receiver', fault: ['oversized', 'too-tight'] },
    mount: choice('clamped', 'free-float'),
  },
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: mounting controls both clamp geometry and the exposed front port.
  build(params): PartDef {
    const lengthClass = cls(params, 'length');
    const len =
      params.layout === 'ak'
        ? akHandguardLength(lengthClass)
        : snapAkGrid(barrelLength({ length: lengthClass }) * HANDGUARD_REACH.barrelFraction);
    const bore = (params.barrelBore ?? (params.bore === 'none' ? 'M' : (params.bore ?? 'M'))) as SizeClass;
    const inner =
      params.fit === 'too-tight'
        ? BARREL_RADIUS[bore] - 0.5
        : BARREL_RADIUS[bore] + HANDGUARD_CLEARANCE[(params.clearance ?? 'M') as SizeClass];
    const akLayout = params.layout === 'ak';
    let outerY: number;
    if (params.fit === 'oversized') {
      outerY = RECEIVER_FRONT_HALF_HEIGHT + 1;
    } else if (akLayout) {
      outerY = RECEIVER_FRONT_HALF_HEIGHT;
    } else {
      outerY = Math.min(RECEIVER_FRONT_HALF_HEIGHT, inner + HANDGUARD_WALL_THICKNESS);
    }
    const outerZ =
      params.fit === 'oversized'
        ? RECEIVER_FRONT_HALF_WIDTH + 1
        : Math.min(RECEIVER_FRONT_HALF_WIDTH, inner + HANDGUARD_WALL_THICKNESS);
    const cylinderRadius = 0.25;
    const cylinderBottom = AK_GAS_CYLINDER_Y - cylinderRadius;
    const cylinderTop = AK_GAS_CYLINDER_Y + cylinderRadius;
    const topInner = akLayout ? cylinderTop : inner;
    const sideTop = akLayout ? cylinderBottom : inner;
    const clampRadius =
      params.mount === 'free-float' || params.bore === 'none' ? undefined : BARREL_RADIUS[cls(params, 'bore')];
    const clamp = clampRadius
      ? [
          solid(
            'clamp-top',
            [len - GRID, clampRadius, -clampRadius - GRID],
            [len, clampRadius + GRID, clampRadius + GRID],
          ),
          solid(
            'clamp-bottom',
            [len - GRID, -clampRadius - GRID, -clampRadius - GRID],
            [len, -clampRadius, clampRadius + GRID],
          ),
          solid('clamp-left', [len - GRID, -clampRadius, -clampRadius - GRID], [len, clampRadius, -clampRadius]),
          solid('clamp-right', [len - GRID, -clampRadius, clampRadius], [len, clampRadius, clampRadius + GRID]),
        ]
      : [];
    return {
      family: 'handguard',
      solids: [
        solid('top', [0, topInner, -outerZ], [len, outerY, outerZ]),
        solid('bottom', [0, -outerY, -outerZ], [len, -inner, outerZ]),
        solid('left', [0, -inner, -outerZ], [len, sideTop, -inner]),
        solid('right', [0, -inner, inner], [len, sideTop, outerZ]),
        ...clamp,
      ],
      ports: [
        { id: 'rear', mount: 'handguard', gender: 'male', pos: [0, 0, 0], normal: NEG_X, up: Y, required: true },
        ...(params.mount === 'free-float'
          ? []
          : [{ id: 'front', mount: 'clamp', gender: 'male' as const, pos: [len, 0, 0] as Vec3, normal: X, up: Y }]),
        {
          id: 'gas-cylinder',
          mount: 'gas-cylinder',
          gender: 'male',
          pos: [8, AK_GAS_CYLINDER_Y, 0],
          normal: NEG_X,
          up: Y,
        },
        {
          id: 'rail',
          mount: 'rail',
          gender: 'female',
          pos: [2, outerY, 0],
          normal: Y,
          up: X,
          slots: { count: (len - 4) / 2 + 1, pitch: 2 },
        },
      ],
      keepOuts: [],
      axes: [],
    };
  },
};

/** A magazine tube under the barrel; its front fixes to the barrel's lug. */
export const tubeMagazine: PartFamily = {
  name: 'tube-magazine',
  // Length follows the barrel whose lug the cap fixes to, unless set.
  params: {
    length: { ...size, from: [{ port: 'cap', param: 'length' }] },
    // The barrel's bore sets how far its underside sits above the tube.
    bore: { ...size, from: [{ port: 'cap', param: 'bore' }] },
  },
  build(params): PartDef {
    const len = snapAkGrid(barrelLength({ length: cls(params, 'length') }) * HANDGUARD_REACH.barrelFraction);
    // A slim barrel leaves a gap above the tube; a band on the cap bridges it to the barrel's underside.
    const bandTop = TUBE_DROP - BARREL_RADIUS[cls(params, 'bore')];
    return {
      family: 'tube-magazine',
      solids: [
        solid('tube', [0, -1, -1], [len, 1, 1]),
        ...(bandTop > 1 ? [solid('cap-band', [len - 1, 1, -0.5], [len, bandTop, 0.5])] : []),
      ],
      ports: [
        { id: 'rear', mount: 'tube', gender: 'male', pos: [0, 0, 0], normal: NEG_X, up: Y, required: true },
        { id: 'cap', mount: 'lug', gender: 'male', pos: [len, 0, 0], normal: X, up: Y },
        { id: 'forend', mount: 'forend', gender: 'female', pos: [8, 0, 0], normal: X, up: Y },
      ],
      keepOuts: [],
      axes: [],
    };
  },
};

/** The sliding forend of a pump action: open-topped, around the tube. */
export const forend: PartFamily = {
  name: 'forend',
  params: {},
  build(): PartDef {
    return {
      family: 'forend',
      solids: [
        solid('bottom', [0, -1.5, -1.5], [8, -1, 1.5]),
        solid('left', [0, -1, -1.5], [8, 1, -1]),
        solid('right', [0, -1, 1], [8, 1, 1.5]),
      ],
      ports: [{ id: 'rear', mount: 'forend', gender: 'male', pos: [0, 0, 0], normal: NEG_X, up: Y, required: true }],
      // The forend is pulled back along the tube to cycle the action.
      keepOuts: [keepOut('slide-travel', [-8, -1.5, -1.5], [0, 1, 1.5], 'rear')],
      axes: [],
    };
  },
};

// ---- held parts ----

// Hand-derived S/M/L lengths: about four fingers through a hand-and-a-bit; lean stays at 18°.
export const grip: PartFamily = {
  name: 'grip',
  params: { length: size, well: choice('none', 'magazine') },
  build(params): PartDef {
    const len = GRIP_BANDS.lengthU[cls(params, 'length')];
    const a = (GRIP_BANDS.leanDegrees * Math.PI) / 180;
    const magazineWell = params.well === 'magazine';
    const profile = magazineWell
      ? ([
          [-PISTOL_GRIP_HALF_X, -len],
          [PISTOL_GRIP_HALF_X, -len],
          [PISTOL_GRIP_HALF_X, 0],
          GRIP_MOUNT_PROFILE[1],
          GRIP_MOUNT_PROFILE[2],
        ] as const)
      : ([[-1.5, -len], [1.5, -len], ...GRIP_MOUNT_PROFILE] as const);
    const roofY = -len + PISTOL_WELL_HEIGHT;
    const solids: Solid[] = magazineWell
      ? [
          extrudedPolygon(
            'body-upper',
            [
              [-PISTOL_GRIP_HALF_X, roofY],
              [PISTOL_GRIP_HALF_X, roofY],
              [PISTOL_GRIP_HALF_X, 0],
              GRIP_MOUNT_PROFILE[1],
              GRIP_MOUNT_PROFILE[2],
            ],
            [-PISTOL_GRIP_HALF_Z, PISTOL_GRIP_HALF_Z],
          ),
          solid(
            'well-wall-left',
            [-PISTOL_GRIP_HALF_X, -len, -PISTOL_GRIP_HALF_Z],
            [-PISTOL_WELL_DEPTH / 2, roofY, PISTOL_GRIP_HALF_Z],
          ),
          solid(
            'well-wall-right',
            [PISTOL_WELL_DEPTH / 2, -len, -PISTOL_GRIP_HALF_Z],
            [PISTOL_GRIP_HALF_X, roofY, PISTOL_GRIP_HALF_Z],
          ),
          solid(
            'well-wall-near',
            [-PISTOL_WELL_DEPTH / 2, -len, -PISTOL_GRIP_HALF_Z],
            [PISTOL_WELL_DEPTH / 2, roofY, -PISTOL_WELL_WIDTH / 2],
          ),
          solid(
            'well-wall-far',
            [-PISTOL_WELL_DEPTH / 2, -len, PISTOL_WELL_WIDTH / 2],
            [PISTOL_WELL_DEPTH / 2, roofY, PISTOL_GRIP_HALF_Z],
          ),
        ]
      : [extrudedPolygon('body', profile, [-1.25, 1.25])];
    const ports: PortDef[] = [
      {
        id: 'top',
        mount: 'grip',
        gender: 'male',
        pos: [0, 0, 0],
        normal: [-Math.sin(a), Math.cos(a), 0],
        up: [Math.cos(a), Math.sin(a), 0],
        required: true,
      },
    ];
    if (magazineWell) {
      ports.push({
        id: 'magazine',
        mount: 'magazine',
        gender: 'female',
        pos: [0, -len, 0],
        normal: NEG_Y,
        up: X,
        required: true,
      });
    }
    return {
      family: 'grip',
      // The single beveled face is coplanar with the tilted grip mount; the body remains leaned once mounted.
      solids,
      ports,
      keepOuts: magazineWell
        ? [
            keepOut(
              'magazine-path',
              [-PISTOL_WELL_DEPTH / 2, -40, -PISTOL_WELL_WIDTH / 2],
              [PISTOL_WELL_DEPTH / 2, roofY - MAGAZINE_WELL_CLEARANCE, PISTOL_WELL_WIDTH / 2],
              'magazine',
            ),
          ]
        : [],
      axes: [],
      tags: [FIRING_GRIP],
    };
  },
};

const snapGrid = (value: number): number => Math.round(value / GRID) * GRID;
const snapVec3 = ([x, y, z]: Vec3): Vec3 => [snapGrid(x), snapGrid(y), snapGrid(z)];

const rotateGripPoint = (point: Vec3, angle: number, offset: Vec3): Vec3 => {
  const [x, y, z] = point;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c * x - s * y + offset[0], s * x + c * y + offset[1], z + offset[2]];
};

const rotatedBoxBounds = (box: { center: Vec3; half: Vec3 }, angle: number, offset: Vec3) => {
  const signs: readonly (readonly [number, number])[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const corners = signs.map(([x, y]) =>
    rotateGripPoint([box.center[0] + x * box.half[0], box.center[1] + y * box.half[1], 0], angle, offset),
  );
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return boxFromMinMax(
    [
      Math.floor(Math.min(...xs) / GRID) * GRID,
      Math.floor(Math.min(...ys) / GRID) * GRID,
      Math.floor((box.center[2] - box.half[2] + offset[2]) / GRID) * GRID,
    ],
    [
      Math.ceil(Math.max(...xs) / GRID) * GRID,
      Math.ceil(Math.max(...ys) / GRID) * GRID,
      Math.ceil((box.center[2] + box.half[2] + offset[2]) / GRID) * GRID,
    ],
  );
};

const removeAdjacentProfileDuplicates = (profile: readonly Vec2[]): Vec2[] => {
  const unique = profile.filter(
    (point, index) =>
      index === 0 || Math.hypot(point[0] - profile[index - 1]![0], point[1] - profile[index - 1]![1]) > 1e-9,
  );
  if (unique.length > 1 && Math.hypot(unique[0]![0] - unique.at(-1)![0], unique[0]![1] - unique.at(-1)![1]) <= 1e-9) {
    unique.pop();
  }
  return unique;
};

const integratedPistolGrip = (gripLength: string): PartDef => {
  const angle = -(GRIP_BANDS.leanDegrees * Math.PI) / 180;
  const offset: Vec3 = [PISTOL_GRIP_X, 0, 0];
  const local = grip.build({ length: gripLength, well: 'magazine' });
  const solids = local.solids.map((part): Solid => {
    const profile =
      part.kind === 'box'
        ? [
            [part.box.center[0] - part.box.half[0], part.box.center[1] - part.box.half[1]],
            [part.box.center[0] + part.box.half[0], part.box.center[1] - part.box.half[1]],
            [part.box.center[0] + part.box.half[0], part.box.center[1] + part.box.half[1]],
            [part.box.center[0] - part.box.half[0], part.box.center[1] + part.box.half[1]],
          ]
        : part.profile;
    return extrudedPolygon(
      part.id,
      removeAdjacentProfileDuplicates(
        profile.map(([x, y]) => {
          const [worldX, worldY] = rotateGripPoint([x, y, 0], angle, offset);
          return [snapGrid(worldX), snapGrid(worldY)] as const;
        }),
      ),
      part.kind === 'box' ? [part.box.center[2] - part.box.half[2], part.box.center[2] + part.box.half[2]] : part.z,
    );
  });
  return {
    ...local,
    solids,
    ports: local.ports
      .filter((port) => port.id === 'magazine')
      .map((port) => ({
        ...port,
        pos: snapVec3(rotateGripPoint(port.pos, angle, offset)),
        normal: rotateGripPoint([port.normal[0], port.normal[1], 0], angle, [0, 0, 0]),
        up: rotateGripPoint([port.up[0], port.up[1], 0], angle, [0, 0, 0]),
      })),
    keepOuts: local.keepOuts.map((gripKeepOut) => ({
      ...gripKeepOut,
      box: rotatedBoxBounds(gripKeepOut.box, angle, offset),
    })),
    axes: local.axes.map((axis) => ({
      ...axis,
      origin: snapVec3(rotateGripPoint(axis.origin, angle, offset)),
      dir: rotateGripPoint(axis.dir, angle, [0, 0, 0]),
    })),
  };
};

const pistolSlideEnd = (length: string): number => PISTOL_BARREL_LENGTH[length as SizeClass] - PISTOL_CROWN_LENGTH;

export const pistolFrame: PartFamily = {
  name: 'frame',
  params: {
    bore: size,
    gripLength: size,
    slideLength: { ...size, from: [{ port: 'slide', param: 'length' }] },
    triggerGuard: { values: ['present', 'missing'], default: 'present', fault: ['missing'] },
  },
  build(params): PartDef {
    const gripDef = integratedPistolGrip(params.gripLength!);
    const bore = cls(params, 'bore');
    const slideEnd = pistolSlideEnd(params.slideLength!);
    const channelHalfWidth = pistolSlideChannelHalfWidth(bore);
    const slideHalfWidth = pistolSlideHalfWidth(bore);
    const triggerFinger = keepOut('trigger-finger', [-2.75, -3.75, -1], [-1.25, -1.75, 1]);
    const pistolTriggerGuard = params.triggerGuard === 'missing' ? [] : triggerGuardSolids(triggerFinger);
    return {
      family: 'frame',
      solids: [
        ...gripDef.solids,
        extrudedPolygon(
          'beavertail-grip-safety',
          [
            [-9, -0.5],
            [-7, 0],
            [-7, 1.5],
            [-8.25, 1.5],
          ],
          [-0.75, 0.75],
        ),
        solid('frame-floor', [-3, -1.5, -1.5], [0, 0, 1.5]),
        solid('dust-cover', [0, -2.5, -slideHalfWidth], [slideEnd, -1, slideHalfWidth]),
        solid('slide-rail-left', [PISTOL_SLIDE_REAR, -1.5, -slideHalfWidth], [slideEnd, -1, -channelHalfWidth]),
        solid('slide-rail-right', [PISTOL_SLIDE_REAR, -1.5, channelHalfWidth], [slideEnd, -1, slideHalfWidth]),
        ...pistolTriggerGuard,
      ],
      ports: [
        { id: 'slide', mount: 'slide-rails', gender: 'female', pos: [0, -1.5, 0], normal: Y, up: X, required: true },
        {
          id: 'barrel',
          mount: 'barrel-seat',
          gender: 'female',
          size: bore,
          pos: [0, 0, 0],
          normal: X,
          up: Y,
          required: true,
        },
        ...gripDef.ports,
      ],
      keepOuts: [
        ...gripDef.keepOuts,
        triggerFinger,
        keepOut('slide-travel', [-16, -1, -slideHalfWidth], [PISTOL_SLIDE_REAR, 1.5, slideHalfWidth], 'slide'),
      ],
      axes: [],
      ...(gripDef.tags ? { tags: gripDef.tags } : {}),
    };
  },
};

export const pistolSlide: PartFamily = {
  name: 'slide',
  params: {
    bore: { ...size, from: [{ port: 'frame', param: 'bore' }] },
    length: { ...size, from: [{ port: 'barrel', param: 'length' }] },
  },
  build(params): PartDef {
    const end = pistolSlideEnd(params.length!);
    const channelHalfWidth = pistolSlideChannelHalfWidth(cls(params, 'bore'));
    const slideHalfWidth = pistolSlideHalfWidth(cls(params, 'bore'));
    const ejection: Solid[] = [
      solid('ejection-port-rear', [PISTOL_SLIDE_REAR, 0.5, channelHalfWidth], [-3, 2.5, slideHalfWidth]),
      solid('ejection-port-upper', [-3, 2, channelHalfWidth], [-1, 2.5, slideHalfWidth]),
      solid('ejection-port-lower', [-3, 0.5, channelHalfWidth], [-1, 1, slideHalfWidth]),
      solid('ejection-port-front', [-1, 0.5, channelHalfWidth], [0, 2.5, slideHalfWidth]),
    ];
    return {
      family: 'slide',
      solids: [
        solid('top', [PISTOL_SLIDE_REAR, 2.5, -slideHalfWidth], [end, 3, slideHalfWidth]),
        solid('side-left', [PISTOL_SLIDE_REAR, 0.5, -slideHalfWidth], [end, 2.5, -channelHalfWidth]),
        ...ejection,
        solid('forward-side-right', [0, 0.5, channelHalfWidth], [end, 2.5, slideHalfWidth]),
      ],
      ports: [
        { id: 'frame', mount: 'slide-rails', gender: 'male', pos: [0, 0, 0], normal: NEG_Y, up: X, required: true },
        {
          id: 'barrel',
          mount: 'barrel',
          gender: 'female',
          size: cls(params, 'bore'),
          pos: [0, 1.5, 0],
          normal: X,
          up: Y,
          required: true,
        },
        {
          id: 'rail',
          mount: 'rail',
          gender: 'female',
          pos: [-6, 3, 0],
          normal: Y,
          up: X,
          slots: { count: 3, pitch: 2 },
        },
      ],
      keepOuts: [],
      axes: [],
    };
  },
};

interface DerivedMagazineGeometry {
  readonly collision: readonly Solid[];
  readonly display: readonly Solid[];
}

const curvedMagazineGeometry = (shape: MagazineShape, description: CurvedMagazineProfile): DerivedMagazineGeometry => {
  const sweep = (description.arc.sweepDegrees * Math.PI) / 180;
  const referenceLength = description.straightTop + description.arc.radius * sweep + description.straightBottom;
  const scale = shape.bodyLength / referenceLength;
  const topLength = description.straightTop * scale;
  const bottomLength = description.straightBottom * scale;
  const radius = description.arc.radius * scale;
  const topSlope = (description.topSlopeDegrees * Math.PI) / 180;
  const rise = shape.depth * Math.tan(topSlope);
  const topBack: Vec2 = [-shape.depth / 2, shape.insertion - topLength];
  const topFront: Vec2 = [shape.depth / 2, shape.insertion - topLength + rise];
  const topEdgeAngle = Math.atan2(topFront[1] - topBack[1], topFront[0] - topBack[0]);
  const topCenter: Vec2 = [(topBack[0] + topFront[0]) / 2, (topBack[1] + topFront[1]) / 2];
  const arcCenter: Vec2 = [
    topCenter[0] + radius * Math.cos(topEdgeAngle),
    topCenter[1] + radius * Math.sin(topEdgeAngle),
  ];
  const upper = extrudedPolygon(
    'upper-body',
    [topBack, topFront, [shape.depth / 2, shape.insertion], [-shape.depth / 2, shape.insertion]],
    [-shape.width / 2, shape.width / 2],
  );
  const buildArc = (facets: number, prefix: string): Solid[] => {
    const step = sweep / facets;
    const rotate = ([x, y]: Vec2): Vec2 => {
      const dx = x - arcCenter[0];
      const dy = y - arcCenter[1];
      const angle = step;
      return [
        arcCenter[0] + dx * Math.cos(angle) - dy * Math.sin(angle),
        arcCenter[1] + dx * Math.sin(angle) + dy * Math.cos(angle),
      ];
    };
    const solids: Solid[] = [];
    let rear = topBack;
    let front = topFront;
    for (let i = 0; i < facets; i++) {
      const nextRear = rotate(rear);
      const nextFront = rotate(front);
      solids.push(
        extrudedPolygon(`${prefix}-${i + 1}`, [nextRear, nextFront, front, rear], [-shape.width / 2, shape.width / 2]),
      );
      rear = nextRear;
      front = nextFront;
    }
    if (bottomLength > 0) {
      const tangent = topEdgeAngle + sweep;
      const stepVector: Vec2 = [bottomLength * Math.sin(tangent), -bottomLength * Math.cos(tangent)];
      const endRear: Vec2 = [rear[0] + stepVector[0], rear[1] + stepVector[1]];
      const endFront: Vec2 = [front[0] + stepVector[0], front[1] + stepVector[1]];
      solids.push(
        extrudedPolygon(
          `${prefix}-straight-bottom`,
          [endRear, endFront, front, rear],
          [-shape.width / 2, shape.width / 2],
        ),
      );
    }
    return solids;
  };
  const collision = [upper, ...buildArc(description.arc.collisionFacets, 'curve-sector')];
  const display = [upper, ...buildArc(description.arc.displayFacets, 'curve-display')];
  return { collision, display };
};

const magazineGeometryFor = (
  params: Readonly<Record<string, string>>,
  shape: MagazineShape,
): DerivedMagazineGeometry => {
  if (params.profile === 'ak-curved') {
    return curvedMagazineGeometry(shape, CURVED_MAGAZINE_PROFILES[params.variant === 'akm' ? 'akm' : 'ak74']);
  }
  if (params.profile === 'stanag-curved') {
    return curvedMagazineGeometry(shape, CURVED_MAGAZINE_PROFILES.stanag30);
  }
  const style = orientationParts(params.orientation ?? 'straight');
  const solids =
    style.kind === 'slant'
      ? [
          extrudedPolygon(
            'slanted-body',
            [
              [-shape.depth / 2, shape.insertion - shape.bodyLength],
              [
                shape.depth / 2,
                shape.insertion -
                  shape.bodyLength +
                  snapAkGrid(shape.depth * Math.tan((style.degrees * Math.PI) / 180)),
              ],
              [shape.depth / 2, shape.insertion],
              [-shape.depth / 2, shape.insertion],
            ],
            [-shape.width / 2, shape.width / 2],
          ),
        ]
      : [
          solid(
            'body',
            [-shape.depth / 2, -shape.bodyLength + shape.insertion, -shape.width / 2],
            [shape.depth / 2, shape.insertion, shape.width / 2],
          ),
        ];
  return { collision: solids, display: solids };
};

export const magazine: PartFamily = {
  name: 'magazine',
  params: {
    length: { values: ['5-round', '10-round', ...SIZE_CLASSES], default: 'M' },
    profile: choice('standard', 'smg', 'pistol', 'ak-curved', 'stanag-curved'),
    orientation: choice(...MAGAZINE_ORIENTATIONS),
    variant: choice(...AK_MAGAZINE_CURVE_VARIANTS),
  },
  build(params): PartDef {
    const profile = (params.profile ?? 'standard') as MagazineProfile;
    const magazineLength = magazineLengthData(params.length, profile, params.variant);
    const isCompactBoltMagazine = params.length === '5-round' || params.length === '10-round';
    const len = magazineLength.length;
    const { depth, width } = magazineSection(params.profile);
    let curveProfile: CurvedMagazineProfile | undefined;
    if (params.profile === 'ak-curved') {
      curveProfile = CURVED_MAGAZINE_PROFILES[params.variant === 'akm' ? 'akm' : 'ak74'];
    } else if (params.profile === 'stanag-curved') {
      curveProfile = CURVED_MAGAZINE_PROFILES.stanag30;
    }
    const insertion = params.profile === 'pistol' ? PISTOL_MAGAZINE_INSERTION : MAGAZINE_INSERTION;
    const resolvedInsertion = curveProfile?.seat === 'face' ? 0 : insertion;
    const shape: MagazineShape = {
      length: magazineLength.size,
      depth,
      width,
      insertion: resolvedInsertion,
      bodyLength: len,
    };
    const geometry = magazineGeometryFor(params, shape);
    const floorplate = isCompactBoltMagazine
      ? [
          solid(
            'floorplate',
            [-depth / 2, resolvedInsertion - len, -width / 2 - 0.25],
            [depth / 2 + 0.25, resolvedInsertion - len + 0.25, width / 2 + 0.25],
          ),
        ]
      : [];
    return {
      family: 'magazine',
      solids: [...geometry.collision, ...floorplate],
      displaySolids: [...geometry.display, ...floorplate],
      ports: [
        {
          id: 'top',
          mount: 'magazine',
          gender: 'male',
          pos: [0, 0, 0],
          normal: Y,
          up: X,
          required: true,
          seat: curveProfile?.seat ?? 'well',
        },
      ],
      keepOuts: [],
      axes: [],
    };
  },
};

/**
 * straight: comb in line with the bore; needs a separate pistol grip.
 * sporting: comb dropped below the bore, with a wrist to hold. It clears a
 * bolt's travel and counts as a firing grip.
 */
export const stock: PartFamily = {
  name: 'stock',
  params: { length: size, style: choice('straight', 'sporting', 'dropped') },
  build(params): PartDef {
    const len = { S: 10, M: 16, L: 22 }[cls(params, 'length')];
    const port: PortDef = {
      id: 'front',
      mount: 'stock',
      gender: 'male',
      pos: [0, 0, 0],
      normal: X,
      up: Y,
      required: true,
    };
    if (params.style === 'sporting') {
      return {
        family: 'stock',
        solids: [
          solid('wrist', [-6, -5, -1.5], [0, -1.5, 1.5]),
          solid('body', [-len, -6, -1.5], [-6, -1.5, 1.5]),
          solid('butt', [-len - 1, -8, -1.75], [-len, 0, 1.75]),
        ],
        ports: [port],
        keepOuts: [],
        axes: [],
        tags: [FIRING_GRIP],
      };
    }
    if (params.style === 'dropped') {
      return {
        family: 'stock',
        solids: [
          solid('comb', [-len, -3, -1.5], [-6, -1.5, 1.5]),
          solid('wrist', [-6, -4, -1.5], [0, -1.5, 1.5]),
          solid('butt', [-len - 1, -8, -1.75], [-len, 0, 1.75]),
        ],
        ports: [port],
        keepOuts: [],
        axes: [],
      };
    }
    return {
      family: 'stock',
      solids: [solid('comb', [-len, -1, -1.5], [0, 2.5, 1.5]), solid('butt', [-len - 1, -8, -1.75], [-len, 3, 1.75])],
      ports: [port],
      keepOuts: [],
      axes: [],
    };
  },
};

export const sight: PartFamily = {
  name: 'sight',
  params: {},
  build(): PartDef {
    return {
      family: 'sight',
      solids: [solid('body', [-2, 0, -1], [2, 1.5, 1])],
      ports: [{ id: 'base', mount: 'rail', gender: 'male', pos: [0, 0, 0], normal: NEG_Y, up: X, required: true }],
      // A thin tube around the line of sight, starting at the sight's front.
      keepOuts: [{ id: 'sightline', kind: 'sightline', box: boxFromMinMax([2, 0.25, -0.75], [42, 1.75, 0.75]) }],
      axes: [{ kind: 'sight', origin: [0, 1, 0], dir: X }],
    };
  },
};

export const FAMILIES: Readonly<Record<string, PartFamily>> = {
  receiver,
  'ak-receiver': akReceiver,
  lower,
  frame: pistolFrame,
  slide: pistolSlide,
  barrel,
  cylinder,
  'front-sight': frontSight,
  'gas-cylinder': gasCylinder,
  'gas-block': gasBlock,
  'ak-rear-sight': akRearSight,
  handguard,
  'tube-magazine': tubeMagazine,
  forend,
  grip,
  magazine,
  stock,
  sight,
};
