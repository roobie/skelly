// biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: Geometry assembly branches encode firearm configuration and keep aperture construction visible.
// Part library: parametric families built from boxes and convex extrusions. All numbers are in u
// (see conventions.ts) and set proportions, not real-world dimensions
// (PROJECT.md, non-goals).
//
// The receiver normally carries the action body and bore line. The revolver's
// frame, cylinder, and barrel are dedicated families in revolver.ts. Layout
// still lives in the lower that hangs under it, so layouts are data: pick a lower.
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
import { boxFromMinMax, localSolidBounds } from '../core/geometry.ts';
import type { Vec3 } from '../core/math.ts';
import type { KeepOut, ParamSpec, PartDef, PartFamily, PortDef, Solid, Vec2 } from '../core/schema.ts';
import { ANTI_MATERIEL_FAMILIES } from './antiMateriel/index.ts';
import { EJECTION_PORT_MARGIN_U as SHARED_EJECTION_PORT_MARGIN_U } from './ejectionPort.ts';
import { getOptic, OPTIC_TYPE_IDS } from './optics.ts';
import { gunPort } from './portData.ts';
import { PUMP_ACTION_TRAVEL_U, PUMP_SHELL_LOADED_LENGTH_U } from './pumpShell.ts';
import { buildReceiverSection, type SectionPocket, type SectionWindow } from './receiverSection.ts';
import { revolverFamilySet } from './revolver.ts';

export const EJECTION_PORT_MARGIN_U = SHARED_EJECTION_PORT_MARGIN_U;

const size: ParamSpec = { values: SIZE_CLASSES, default: 'M' };
const choice = (...values: string[]): ParamSpec => ({ values, default: values[0]! });
const cls = (params: Readonly<Record<string, string>>, name: string): SizeClass => params[name] as SizeClass;

const X: Vec3 = [1, 0, 0];
const NEG_X: Vec3 = [-1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const NEG_Y: Vec3 = [0, -1, 0];

const solid = (id: string, min: Vec3, max: Vec3): Solid => ({ id, kind: 'box', box: boxFromMinMax(min, max) });
const metalSolid = (id: string, min: Vec3, max: Vec3): Solid => ({ ...solid(id, min, max), slot: 'metal' });
const solidBounds = (component: Solid): readonly [Vec3, Vec3] => localSolidBounds(component);
const AK_CHARGING_HANDLE_OUTSTAND_U = 2.25;
const AK_CHARGING_HANDLE_PADDLE_THICKNESS_U = 0.5;
const akChargingHandleSolids = (envelope: CarrierEnvelope = BOLT_CARRIER_ENVELOPES.ak): Solid[] => {
  const [rootX] = envelope.x;
  const [rootY] = envelope.y;
  const [, receiverSideFace] = RECEIVER_SECTION.ak.faces.handleSides;
  const paddleOuterZ = -receiverSideFace - AK_CHARGING_HANDLE_OUTSTAND_U;
  const paddleInnerZ = paddleOuterZ + AK_CHARGING_HANDLE_PADDLE_THICKNESS_U;
  const stickProfile: readonly Vec2[] = [
    [rootX, rootY],
    [rootX + 0.25, rootY],
    [rootX + 0.5, rootY + 1],
    [rootX + 0.25, rootY + 1],
  ];
  const stickAxis: Vec2 = [rootX + 0.25, rootY + 0.5];
  const halfX = 0.5;
  const halfY = 0.5;
  const chamfer = 0.25;
  const [axisX, axisY] = stickAxis;
  const paddleProfile: readonly Vec2[] = [
    [axisX - halfX + chamfer, axisY - halfY],
    [axisX + halfX - chamfer, axisY - halfY],
    [axisX + halfX, axisY - halfY + chamfer],
    [axisX + halfX, axisY + halfY - chamfer],
    [axisX + halfX - chamfer, axisY + halfY],
    [axisX - halfX + chamfer, axisY + halfY],
    [axisX - halfX, axisY + halfY - chamfer],
    [axisX - halfX, axisY - halfY + chamfer],
  ];
  const xMin = axisX - halfX;
  const xMax = axisX + halfX;
  const yMin = axisY - halfY;
  const yMax = axisY + halfY;
  const bevel = 0.25;
  const stick: Solid = {
    id: 'ak-handle-stick',
    kind: 'extruded-polygon',
    profile: stickProfile,
    z: [paddleInnerZ, envelope.z[0]],
    slot: 'metal',
  };
  const paddle: Solid = {
    id: 'charging-handle',
    kind: 'extruded-polygon',
    profile: paddleProfile,
    z: [paddleOuterZ, paddleInnerZ],
    clip: [
      { normal: [1, 0, -1], offset: xMax - paddleOuterZ - bevel },
      { normal: [-1, 0, -1], offset: -xMin - paddleOuterZ - bevel },
      { normal: [0, 1, -1], offset: yMax - paddleOuterZ - bevel },
      { normal: [0, -1, -1], offset: -yMin - paddleOuterZ - bevel },
    ],
    display: { bevel: false },
    slot: 'metal',
  };
  return [stick, paddle];
};
const solidsBounds = (components: readonly Solid[]): readonly [Vec3, Vec3] => {
  if (components.length === 0) {
    throw new Error('Charging-handle bounds require at least one solid.');
  }
  const bounds = components.map(solidBounds);
  return [
    [0, 1, 2].map((axis) => Math.min(...bounds.map(([minimum]) => minimum[axis]!))) as unknown as Vec3,
    [0, 1, 2].map((axis) => Math.max(...bounds.map(([, maximum]) => maximum[axis]!))) as unknown as Vec3,
  ];
};
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
const keepOut = (
  id: string,
  min: Vec3,
  max: Vec3,
  allowPortOrOptions?: string | { readonly allowPort?: string; readonly allowFamilies?: readonly string[] },
): KeepOut => {
  const options = typeof allowPortOrOptions === 'string' ? { allowPort: allowPortOrOptions } : allowPortOrOptions;
  return {
    id,
    kind: id,
    box: boxFromMinMax(min, max),
    ...(options?.allowPort ? { allowPort: options.allowPort } : {}),
    ...(options?.allowFamilies ? { allowFamilies: options.allowFamilies } : {}),
  };
};
/** Tag for parts the firing hand can hold (see rules.ts). */
export const FIRING_GRIP = 'firing-grip';

// Standard handguards reach 65% of the exposed barrel. AK handguards use
// distinct compact bands, and their gas block clears the end by 10%.
const HANDGUARD_REACH = { barrelFraction: 0.65 } as const;
const AR_FRONT_SIGHT_HALF_LENGTH = 1;
const AK_HANDGUARD_LENGTH: Record<SizeClass, number> = { S: 8, M: 14, L: 22 };
const AK_GAS_BLOCK_CLEARANCE = 0.1;
const AK_GAS_BLOCK_HALF_LENGTH = 1;
const akHandguardLength = (length: SizeClass): number => AK_HANDGUARD_LENGTH[length];

/** Tube magazines keep a shared barrel-support clearance; the forend is slimmed to show its top. */
const TUBE_HALF_HEIGHT = 1;
const PUMP_TUBE_CAP_LENGTH = 2.5;
const PUMP_TUBE_CAP_END_INSET = 0.5;
const PUMP_TUBE_CAP_HALF_EXTENT = 1.25;
const OCTAGONAL_RECTANGLE_CHAMFER = 0.125;
const TUBE_BARREL_CLEARANCE = 0.5;
const TUBE_RECEIVER_CLEARANCE = 0.25;
const PUMP_RECEIVER_DROP = 1;
// Keep stock/trigger datums fixed while moving the pump action forward clear of the rear slope.
const PUMP_RECEIVER_FORWARD_EXTENSION_U = 1.5;
const PUMP_FOREND_MOUNT_X = 8;
const PUMP_FOREND_LENGTH = PUMP_FOREND_MOUNT_X * 1.2;
const PUMP_FOREND_WALL = 0.25;
const PUMP_TUBE_LENGTH_PERCENTAGES = ['50', '75', '100'] as const;

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
const DROPPED_STOCK_WRIST_TOP_Y = -1.5;
const MAGAZINE_HOUSING_FRONT_LENGTH = 1.5;
const MAGAZINE_HOUSING_REAR_LENGTH = 2;
const MAGAZINE_HOUSING_REAR_WALL = 0.5;
export const G3_MAGAZINE_WELL_TILT = Math.atan(
  (MAGAZINE_HOUSING_REAR_LENGTH - MAGAZINE_HOUSING_FRONT_LENGTH) / MAGAZINE_WELL_DEPTH,
);
const snapAkGrid = (value: number): number => Math.round(value / GRID) * GRID;
const pumpTubeLength = (barrelSpan: number, percentValue: string): number => {
  if (!PUMP_TUBE_LENGTH_PERCENTAGES.includes(percentValue as (typeof PUMP_TUBE_LENGTH_PERCENTAGES)[number])) {
    throw new Error(`Unsupported pump tube length percentage: ${percentValue}`);
  }
  const fraction = Math.min(1, Math.max(0.5, Number(percentValue) / 100));
  return snapAkGrid(barrelSpan * fraction);
};
const MAGAZINE_INSERTION = MAGAZINE_WELL_HEIGHT - MAGAZINE_WELL_CLEARANCE;
const MAGAZINE_ORIENTATIONS = ['straight', 'tilt', 'slant-5', 'slant-8', 'slant-10'] as const;
const MAGAZINE_ORIENTATION_PATTERN = /^(slant)-(5|8|10)$/;
export const LOWER_LAYOUTS = {
  conventional: { tiltedMagazineProfiles: ['standard'] },
  bullpup: { tiltedMagazineProfiles: [] },
  trigger: { tiltedMagazineProfiles: [] },
  pump: { tiltedMagazineProfiles: [] },
  ak: { tiltedMagazineProfiles: [] },
  ar: { tiltedMagazineProfiles: ['standard'] },
  thumbhole: { tiltedMagazineProfiles: ['standard'] },
} as const;
const LOWER_TRIGGER_X = {
  conventional: -10.75,
  bullpup: 5,
  trigger: -11.5,
  pump: -13,
  ak: -10.75,
  ar: -10.75,
  thumbhole: -10.75,
} as const;
const LOWER_GRIP_X = { conventional: -13, bullpup: 3, trigger: -14, ak: -13, ar: -13 } as const;
const AK_GAS_CYLINDER_Y = 2;
const AK_GAS_CYLINDER_HALF_WIDTH = 0.25;
export const AK_REAR_BEVEL = {
  run: 2,
  rise: 1.5,
  angleDegrees: (Math.atan(1.5 / 2) * 180) / Math.PI,
  clip: { normal: [-0.75, 1, 0], offset: 13 },
} as const;
export const PUMP_REAR_SLOPE = {
  run: 4,
  rise: 1.5,
  angleDegrees: (Math.atan(1.5 / 4) * 180) / Math.PI,
  clip: { normal: [-0.375, 1, 0], offset: 7 },
} as const;
const PUMP_REAR_PORT_Y = -1;
const AK_STOCK_PORT_Y = 0.5;
const AR_STOCK_PORT_Y = 0;
export const HANDGUARD_CLEARANCE: Record<SizeClass, number> = { S: 0.25, M: 0.25, L: 0.5 };
const HANDGUARD_WALL_THICKNESS = 0.5;
const RECEIVER_FRONT_HALF_HEIGHT = 2.5;
export const BOLT_CARRIER_RUNNING_CLEARANCE_U = 0.1;
const SMG_HANDLE_TRAVEL_U = 2.5;
const SMG_HANDLE_FRONT_CLEARANCE_U = 0.5;
const BOLT_HANDLE_PROFILES = {
  standard: { armLength: 5.25, knobFlatRadius: 0.875 },
  awm: { armLength: 6, knobFlatRadius: 1 },
} as const;
type BoltHandleProfile = keyof typeof BOLT_HANDLE_PROFILES;
const HANDLE_REFERENCE_ENVELOPES = {
  bolt: { x: [-2.5, 2.5], y: [-0.5, 0.25], z: [-0.75, 0.75] },
  barrett: { x: [-3, 3], y: [-0.75, 0.75], z: [-1.25, 1.25] },
} as const;
const BOLT_TRAVEL = {
  short: { length: 3, restX: -7 },
  standard: { length: 6.5, restX: -7 },
  ak: { length: 6.5, restX: -5.75 },
  // Grow the pump receiver forward with the carrier; travel stays the shell-derived 5.5u.
  pump: { length: PUMP_ACTION_TRAVEL_U, restX: -6.5 + PUMP_RECEIVER_FORWARD_EXTENSION_U },
  long: { length: 8, restX: -4.5 },
  bolt: { length: 7, restX: -6 },
} as const;
const PUMP_ACTION_BAR_THICKNESS = BOLT_CARRIER_RUNNING_CLEARANCE_U;
const PUMP_ACTION_BAR_OUTER_CLEARANCE = 0.15;
const PUMP_ACTION_BAR_CLEARANCE = 0.05;
const PUMP_FOREND_TUBE_CLEARANCE = 0.05;
const pumpActionBarOuterY = (): number =>
  TUBE_HALF_HEIGHT + PUMP_FOREND_TUBE_CLEARANCE + PUMP_FOREND_WALL - PUMP_ACTION_BAR_OUTER_CLEARANCE;
const pumpActionBarSolids = (bore: SizeClass): Solid[] => {
  // Keep the bar tied to the translated forend while the carrier datum moves forward.
  const carrierRestX = BOLT_TRAVEL.pump.restX - PUMP_RECEIVER_FORWARD_EXTENSION_U;
  const tubeY = -tubeDropForBore(bore);
  const halfThickness = PUMP_ACTION_BAR_THICKNESS / 2;
  const barTopY = tubeY + pumpActionBarOuterY();
  return [
    {
      ...extrudedPolygon(
        'action-bar-top',
        [
          [barTopY - PUMP_ACTION_BAR_THICKNESS, -halfThickness],
          [barTopY, -halfThickness],
          [barTopY, halfThickness],
          [barTopY - PUMP_ACTION_BAR_THICKNESS, halfThickness],
        ],
        [carrierRestX - PUMP_FOREND_MOUNT_X, carrierRestX + halfThickness],
      ),
      axis: 'x',
    },
  ];
};

const pumpActionBarSlot = (bore: SizeClass): SectionPocket => {
  const tubeY = -tubeDropForBore(bore);
  const barTopY = tubeY + pumpActionBarOuterY();
  const clearance = PUMP_ACTION_BAR_CLEARANCE;
  const halfThickness = PUMP_ACTION_BAR_THICKNESS / 2;
  return {
    x: [-BOLT_TRAVEL.pump.length - PUMP_ACTION_BAR_THICKNESS / 2 - clearance, PUMP_RECEIVER_FORWARD_EXTENSION_U],
    y: [barTopY - PUMP_ACTION_BAR_THICKNESS - clearance, barTopY + clearance],
    z: [-halfThickness - clearance, halfThickness + clearance],
  };
};
const RECEIVER_FRONT_HALF_WIDTH = 2;
const BARREL_RADIUS: Record<SizeClass, number> = { S: 0.75, M: 1, L: 1.25 };
const tubeDropForBore = (bore: SizeClass): number => TUBE_HALF_HEIGHT + BARREL_RADIUS[bore] + TUBE_BARREL_CLEARANCE;
const receiverTubeSeat = (bore: SizeClass, receiverBottom: number, tubeFed: boolean): Solid[] => {
  if (!tubeFed) {
    return [];
  }
  const seatBottom =
    Math.floor((-tubeDropForBore(bore) - TUBE_HALF_HEIGHT - TUBE_RECEIVER_CLEARANCE) / (2 * GRID)) * (2 * GRID);
  return seatBottom < receiverBottom ? [solid('tube-seat', [-2, seatBottom, -1], [0, receiverBottom, 1])] : [];
};
const orientationParts = (value: string): { kind: 'straight' | 'tilt' | 'slant'; degrees: number } => {
  const match = MAGAZINE_ORIENTATION_PATTERN.exec(value);
  if (value === 'tilt') {
    return { kind: 'tilt', degrees: 0 };
  }
  return match ? { kind: match[1] as 'slant', degrees: Number(match[2]) } : { kind: 'straight', degrees: 0 };
};
const LOWER_HALF_WIDTH = MAGAZINE_WELL_WIDTH / 2 + MAGAZINE_WELL_CLEARANCE;
const THUMBHOLE_HALF_WIDTH = 1.5;
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
const AK_CHARGING_SLOT_MUZZLE_SHIFT_U = 0.25;
export const BOLT_CARRIER_ENVELOPES = {
  ar: { x: [-2.5, 1.5], y: [-0.5, 1], z: [-1.25, 1.25] },
  ak: { x: [-4.5, 1.5], y: [-1.25, 1.25], z: [-1.25, 1.25] },
  pump: { x: [-3.25, 3], y: [-0.75, 0.75], z: [-0.75, 0.75] },
  smg: { x: [-1.5, 1.5], y: [-0.5, 0.5], z: [-0.75, 0.75] },
  barrett: { x: [-3, 3], y: [-0.75, 0.75], z: [-1.25, 1.25] },
  bolt: { x: [-2.5, 2.5], y: [-0.5, 0.25], z: [-0.75, 0.75] },
} as const;
type BoltCarrierPattern = keyof typeof BOLT_CARRIER_ENVELOPES;
type CarrierEnvelope = (typeof BOLT_CARRIER_ENVELOPES)[BoltCarrierPattern];

export const CARRIER_HANDLE_STYLES = {
  ar: { shape: 'rear-t', owner: 'receiver', motion: 'fixed', handClearanceU: 0.25 },
  ak: { shape: 'stick-paddle', owner: 'carrier', motion: 'linear', handClearanceU: 0.25, sweep: true },
  autoShotgun: { shape: 'stick-paddle', owner: 'carrier', motion: 'linear', handClearanceU: 0.25, sweep: true },
  bolt: { shape: 'down-back-ball', owner: 'carrier', motion: 'linear', handClearanceU: 0.25, sweep: true },
  smg: {
    shape: 'mp5-cocking-tube',
    owner: 'handguard',
    motion: 'linear',
    handClearanceU: 0.25,
    sweep: true,
    segment: 'receiver-connected',
  },
  battle: { shape: 'fal-folded-out', owner: 'carrier', motion: 'linear', handClearanceU: 0.25, sweep: true },
  barrett: { shape: 'right-side-crank', owner: 'carrier', motion: 'linear', handClearanceU: 0.25, sweep: true },
  pump: { shape: 'none', owner: 'none', motion: 'none' },
  pistol: { shape: 'none', owner: 'none', motion: 'none' },
  bullpup: { shape: 'none', owner: 'none', motion: 'none' },
  none: { shape: 'none', owner: 'none', motion: 'none' },
} as const;
export const EJECTION_PORT_RULES = {
  marginU: EJECTION_PORT_MARGIN_U,
  pumpShellMinimum: { lengthU: PUMP_SHELL_LOADED_LENGTH_U, endClearanceU: EJECTION_PORT_MARGIN_U },
} as const;

const ejectionPortWindow = (pattern: BoltCarrierPattern, restX: number, carrierY: number) => {
  const envelope = BOLT_CARRIER_ENVELOPES[pattern];
  const margin = EJECTION_PORT_MARGIN_U;
  let xMin = restX - envelope.x[1] - margin;
  let xMax = restX - envelope.x[0] + margin;
  const pumpMinimum =
    pattern === 'pump'
      ? EJECTION_PORT_RULES.pumpShellMinimum.lengthU + 2 * EJECTION_PORT_RULES.pumpShellMinimum.endClearanceU
      : 0;
  if (xMax - xMin < pumpMinimum) {
    const center = (xMin + xMax) / 2;
    xMin = center - pumpMinimum / 2;
    xMax = center + pumpMinimum / 2;
  }
  return {
    x: [xMin, xMax] as const,
    y: [carrierY + envelope.y[0] - margin, carrierY + envelope.y[1] + margin] as const,
  };
};

export const akChargingHandleSlotWindow = (
  carrierY: number,
  port: ReturnType<typeof ejectionPortWindow>,
  travel: number,
) => {
  const [handleMinimum, handleMaximum] = solidsBounds(akChargingHandleSolids());
  const margin = BOLT_CARRIER_RUNNING_CLEARANCE_U;
  return {
    x: [port.x[0] - travel, port.x[0] + AK_CHARGING_SLOT_MUZZLE_SHIFT_U] as const,
    sectionAxis: 0 as const,
    section: [carrierY + handleMinimum[1] - margin, carrierY + handleMaximum[1] + margin] as const,
  };
};

const carrierPatternFor = (params: Readonly<Record<string, string>>): BoltCarrierPattern => {
  if (params.section === 'ak') {
    return 'ak';
  }
  if (params.section === 'ar') {
    return 'ar';
  }
  if (params.section === 'pump' || params.action === 'pump') {
    return 'pump';
  }
  if (
    params.carrierPattern &&
    params.carrierPattern !== 'auto' &&
    Object.hasOwn(BOLT_CARRIER_ENVELOPES, params.carrierPattern)
  ) {
    return params.carrierPattern as BoltCarrierPattern;
  }
  if (params.action === 'bolt') {
    return 'bolt';
  }
  return params.bore === 'S' ? 'smg' : 'ar';
};

type CarrierHandleStyle = keyof typeof CARRIER_HANDLE_STYLES;
const carrierHandleStyleFor = (params: Readonly<Record<string, string>>): CarrierHandleStyle => {
  const requested = params.handleStyle;
  if (requested && requested !== 'auto' && Object.hasOwn(CARRIER_HANDLE_STYLES, requested)) {
    return requested as CarrierHandleStyle;
  }
  if (params.pattern && Object.hasOwn(CARRIER_HANDLE_STYLES, params.pattern)) {
    return params.pattern as CarrierHandleStyle;
  }
  return carrierPatternFor(params);
};

const carrierAxisY = (pattern: BoltCarrierPattern, receiverDrop: number): number => {
  let y = 1.25;
  if (pattern === 'ak') {
    y = 0;
  } else if (pattern === 'ar') {
    y = 0;
  } else if (pattern === 'pump') {
    y = 1;
  } else if (pattern === 'barrett') {
    y = 1;
  } else if (pattern === 'bolt') {
    y = 1.25;
  }
  return y - receiverDrop;
};

export const carrierCavityBounds = (pattern: BoltCarrierPattern, carrierY: number) => {
  const envelope = BOLT_CARRIER_ENVELOPES[pattern];
  return {
    y: [
      carrierY + envelope.y[0] - BOLT_CARRIER_RUNNING_CLEARANCE_U,
      carrierY + envelope.y[1] + BOLT_CARRIER_RUNNING_CLEARANCE_U,
    ] as const,
    z: [envelope.z[0] - BOLT_CARRIER_RUNNING_CLEARANCE_U, envelope.z[1] + BOLT_CARRIER_RUNNING_CLEARANCE_U] as const,
  };
};

export const RECEIVER_SECTION = {
  ar: {
    outline: [
      [-2.5, -1.75],
      [-2.25, -2],
      [1.5, -2],
      [2.5, -1.75],
      [2.5, 1.75],
      [1.5, 2],
      [-2.25, 2],
      [-2.5, 1.75],
    ] as const,
    faces: {
      top: { y: 2.5, halfWidth: 1.75 },
      portSide: 2,
      handleSides: [-2, 2],
      front: 0,
      rear: -16,
      bottom: -2.5,
    } as const,
  },
  ak: {
    clip: [AK_REAR_BEVEL.clip],
    outline: [
      [-2.5, -2],
      [1, -2],
      [2, -1.75],
      [2.5, -1.25],
      [2.5, 1.25],
      [2, 1.75],
      [1, 2],
      [-2.5, 2],
    ] as const,
    faces: {
      top: { y: 2.5, halfWidth: 1.25 },
      portSide: 2,
      handleSides: [-2, 2],
      front: 0,
      rear: -16,
      bottom: -2.5,
    } as const,
  },
  pump: {
    clip: [PUMP_REAR_SLOPE.clip],
    outline: [
      [-2.5, -2],
      [1, -2],
      [2, -1.75],
      [2.5, -1.25],
      [2.5, 1.25],
      [2, 1.75],
      [1, 2],
      [-2.5, 2],
    ] as const,
    faces: {
      top: { y: 2.5, halfWidth: 1.25 },
      portSide: 2.25,
      handleSides: [-2.25, 2.25],
      front: PUMP_RECEIVER_FORWARD_EXTENSION_U,
      rear: -16,
      bottom: -2.5,
    } as const,
  },
} as const;

const isSectionedReceiver = (section: string): section is 'ar' | 'pump' | 'ak' =>
  section === 'ar' || section === 'pump' || section === 'ak';

const receiverShellSolids = ({
  section,
  feed,
  magazineWell,
  receiverBottom,
  receiverTop,
  receiverDrop,
  carrierPattern,
  carrierY,
  portWindow,
  portSlots,
  frontFaceX,
  internalPockets = [],
  farPortWindow,
}: {
  section: string;
  feed: string;
  magazineWell: string;
  receiverBottom: number;
  receiverTop: number;
  receiverDrop: number;
  carrierPattern: BoltCarrierPattern;
  carrierY: number;
  portWindow: ReturnType<typeof ejectionPortWindow>;
  portSlots?: readonly SectionWindow[];
  frontFaceX: number;
  internalPockets?: readonly SectionPocket[];
  farPortWindow?: { readonly x: readonly [number, number]; readonly y: readonly [number, number] };
}): Solid[] => {
  const [xMin, xMax] = [-16, frontFaceX] as const;
  const cavity = carrierCavityBounds(carrierPattern, carrierY);
  if (isSectionedReceiver(section)) {
    const data = RECEIVER_SECTION[section];
    const clipPlanes =
      'clip' in data && data.clip.length > 0
        ? data.clip.map((plane) => ({
            ...plane,
            offset: plane.offset - plane.normal[1] * receiverDrop,
          }))
        : undefined;
    const sectionSolids = buildReceiverSection({
      id: `receiver-${section}`,
      outline: data.outline.map(([y, z]) => [y - receiverDrop, z] as const),
      x: [xMin, xMax],
      wall: 0.5,
      cavity,
      port: { x: portWindow.x, sectionAxis: 0, section: portWindow.y },
      ...(farPortWindow ? { farPort: { x: farPortWindow.x, sectionAxis: 0, section: farPortWindow.y } } : {}),
      ...(portSlots ? { portSlots } : {}),
      internalPockets,
      ...(clipPlanes ? { clip: clipPlanes } : {}),
      ...(feed === 'box'
        ? {
            magazineWell: { x: [-7, -1.5], sectionAxis: 1 as const, section: [-1.25, 1.25] as const },
          }
        : {}),
    });
    if (section !== 'pump' || carrierPattern !== 'pump') {
      return sectionSolids;
    }
    // Close the cut receiver cross-section behind the carrier, following the original rear slope.
    const slope = PUMP_REAR_SLOPE.clip;
    const [slopeNormalX, slopeNormalY] = slope.normal;
    const slopeOffset = slope.offset - slopeNormalY * receiverDrop;
    const cavityRearX = xMin + 0.5;
    const [cavityStartY, endY] = cavity.y;
    const startY = Math.max(cavityStartY, (slopeOffset - slopeNormalX * cavityRearX) / slopeNormalY);
    const slopeXAt = (y: number) => (slopeOffset - slopeNormalY * y) / slopeNormalX;
    if (startY >= endY || slopeXAt(endY) <= cavityRearX) {
      return sectionSolids;
    }
    const closure = extrudedPolygon(
      'receiver-pump-rear-slope-closure',
      [
        [cavityRearX, startY],
        [slopeXAt(endY), endY],
        [cavityRearX, endY],
      ],
      cavity.z,
    );
    sectionSolids.push({ ...closure, display: { mergeGroup: 'receiver-pump' } });
    return sectionSolids;
  }
  const wall = PISTOL_SLIDE_WALL_THICKNESS;
  const innerX: readonly [number, number] = [xMin + wall, xMax - wall];
  const lowerY = receiverBottom + wall;
  const upperY = receiverTop - wall;
  const innerY = cavity.y;
  const innerZ = cavity.z;
  const broadInnerZ: readonly [number, number] = [-RECEIVER_FRONT_HALF_WIDTH + wall, RECEIVER_FRONT_HALF_WIDTH - wall];
  const solids: Solid[] = [
    solid(
      'receiver-shell-rear',
      [xMin, receiverBottom, -RECEIVER_FRONT_HALF_WIDTH],
      [innerX[0], receiverTop, RECEIVER_FRONT_HALF_WIDTH],
    ),
    solid(
      'receiver-shell-front',
      [innerX[1], receiverBottom, -RECEIVER_FRONT_HALF_WIDTH],
      [xMax, receiverTop, RECEIVER_FRONT_HALF_WIDTH],
    ),
    ...(farPortWindow
      ? []
      : [
          solid(
            'receiver-shell-side-far-lower',
            [innerX[0], lowerY, -RECEIVER_FRONT_HALF_WIDTH],
            [innerX[1], innerY[0], broadInnerZ[0]],
          ),
          solid(
            'receiver-shell-side-far',
            [innerX[0], innerY[0], -RECEIVER_FRONT_HALF_WIDTH],
            [innerX[1], innerY[1], innerZ[0]],
          ),
        ]),
  ];
  const addBox = (id: string, min: Vec3, max: Vec3) => {
    if (min.some((coordinate, axis) => coordinate >= max[axis]!)) {
      return;
    }
    solids.push(solid(id, min, max));
  };
  if (!farPortWindow) {
    addBox(
      'receiver-shell-side-far-upper',
      [innerX[0], innerY[1], -RECEIVER_FRONT_HALF_WIDTH],
      [innerX[1], upperY, broadInnerZ[0]],
    );
  }
  if (magazineWell === 'recessed') {
    const x0 = MAGAZINE_WELL_CENTER_X - MAGAZINE_WELL_DEPTH / 2;
    const x1 = MAGAZINE_WELL_CENTER_X + MAGAZINE_WELL_DEPTH / 2;
    solids.push(
      solid(
        'receiver-shell-bottom-rear',
        [innerX[0], receiverBottom, -RECEIVER_FRONT_HALF_WIDTH],
        [x0, lowerY, RECEIVER_FRONT_HALF_WIDTH],
      ),
      solid(
        'receiver-shell-bottom-front',
        [x1, receiverBottom, -RECEIVER_FRONT_HALF_WIDTH],
        [innerX[1], lowerY, RECEIVER_FRONT_HALF_WIDTH],
      ),
      solid(
        'receiver-shell-bottom-well-side-left',
        [x0, receiverBottom, -RECEIVER_FRONT_HALF_WIDTH],
        [x1, lowerY, broadInnerZ[0]],
      ),
      solid(
        'receiver-shell-bottom-well-side-right',
        [x0, receiverBottom, broadInnerZ[1]],
        [x1, lowerY, RECEIVER_FRONT_HALF_WIDTH],
      ),
    );
  } else {
    solids.push(
      solid(
        'receiver-shell-bottom',
        [innerX[0], receiverBottom, -RECEIVER_FRONT_HALF_WIDTH],
        [innerX[1], lowerY, RECEIVER_FRONT_HALF_WIDTH],
      ),
    );
  }
  const clamp = (value: number, bounds: readonly [number, number]) => Math.max(bounds[0], Math.min(bounds[1], value));
  if (farPortWindow) {
    const x0 = clamp(farPortWindow.x[0], innerX);
    const x1 = clamp(farPortWindow.x[1], innerX);
    const y0 = clamp(farPortWindow.y[0], [lowerY, upperY]);
    const y1 = clamp(farPortWindow.y[1], [lowerY, upperY]);
    const addFarWindowPanels = (
      yBounds: readonly [number, number],
      zBounds: readonly [number, number],
      suffix: string,
    ) => {
      addBox(
        `receiver-shell-side-far-${suffix}-rear`,
        [innerX[0], yBounds[0], zBounds[0]],
        [x0, yBounds[1], zBounds[1]],
      );
      addBox(
        `receiver-shell-side-far-${suffix}-front`,
        [x1, yBounds[0], zBounds[0]],
        [innerX[1], yBounds[1], zBounds[1]],
      );
      addBox(`receiver-shell-side-far-${suffix}-lower`, [x0, yBounds[0], zBounds[0]], [x1, y0, zBounds[1]]);
      addBox(`receiver-shell-side-far-${suffix}-upper`, [x0, y1, zBounds[0]], [x1, yBounds[1], zBounds[1]]);
    };
    addFarWindowPanels([lowerY, upperY], [-RECEIVER_FRONT_HALF_WIDTH, broadInnerZ[0]], 'outer');
    addFarWindowPanels(innerY, [broadInnerZ[0], innerZ[0]], 'inner');
  }
  const portX0 = clamp(portWindow.x[0], innerX);
  const portX1 = clamp(portWindow.x[1], innerX);
  const portY0 = clamp(portWindow.y[0], [lowerY, upperY]);
  const portY1 = clamp(portWindow.y[1], [lowerY, upperY]);
  if (feed === 'top') {
    const portX: readonly [number, number] = [-9, -4];
    solids.push(
      solid(
        'receiver-shell-top-side-left',
        [innerX[0], innerY[1], -RECEIVER_FRONT_HALF_WIDTH],
        [innerX[1], receiverTop, broadInnerZ[0]],
      ),
      solid(
        'receiver-shell-top-side-right',
        [innerX[0], innerY[1], broadInnerZ[1]],
        [innerX[1], receiverTop, RECEIVER_FRONT_HALF_WIDTH],
      ),
      solid('receiver-shell-top-rear', [innerX[0], innerY[1], broadInnerZ[0]], [portX[0], receiverTop, broadInnerZ[1]]),
      solid(
        'receiver-shell-top-front',
        [portX[1], innerY[1], broadInnerZ[0]],
        [innerX[1], receiverTop, broadInnerZ[1]],
      ),
    );
  } else {
    addBox(
      'receiver-shell-top-far',
      [innerX[0], innerY[1], -RECEIVER_FRONT_HALF_WIDTH],
      [innerX[1], receiverTop, broadInnerZ[0]],
    );
    addBox('receiver-shell-top', [innerX[0], innerY[1], broadInnerZ[0]], [innerX[1], receiverTop, broadInnerZ[1]]);
    addBox(
      'receiver-shell-top-near-rear',
      [innerX[0], innerY[1], broadInnerZ[1]],
      [portX0, receiverTop, RECEIVER_FRONT_HALF_WIDTH],
    );
    addBox(
      'receiver-shell-top-near-front',
      [portX1, innerY[1], broadInnerZ[1]],
      [innerX[1], receiverTop, RECEIVER_FRONT_HALF_WIDTH],
    );
    const roofPortY0 = clamp(portWindow.y[0], [innerY[1], receiverTop]);
    const roofPortY1 = clamp(portWindow.y[1], [innerY[1], receiverTop]);
    addBox(
      'receiver-shell-top-near-window-lower',
      [portX0, innerY[1], broadInnerZ[1]],
      [portX1, roofPortY0, RECEIVER_FRONT_HALF_WIDTH],
    );
    addBox(
      'receiver-shell-top-near-window-upper',
      [portX0, roofPortY1, broadInnerZ[1]],
      [portX1, receiverTop, RECEIVER_FRONT_HALF_WIDTH],
    );
  }
  solids.push(
    solid(
      'receiver-shell-side-near-rear-lower',
      [innerX[0], lowerY, broadInnerZ[1]],
      [portX0, innerY[0], RECEIVER_FRONT_HALF_WIDTH],
    ),
    solid(
      'receiver-shell-side-near-rear',
      [innerX[0], innerY[0], innerZ[1]],
      [portX0, innerY[1], RECEIVER_FRONT_HALF_WIDTH],
    ),
    solid(
      'receiver-shell-side-near-front-lower',
      [portX1, lowerY, broadInnerZ[1]],
      [innerX[1], innerY[0], RECEIVER_FRONT_HALF_WIDTH],
    ),
    solid(
      'receiver-shell-side-near-front',
      [portX1, innerY[0], innerZ[1]],
      [innerX[1], innerY[1], RECEIVER_FRONT_HALF_WIDTH],
    ),
    solid(
      'receiver-shell-side-near-lower',
      [portX0, lowerY, broadInnerZ[1]],
      [portX1, portY0, RECEIVER_FRONT_HALF_WIDTH],
    ),
  );
  addBox(
    'receiver-shell-side-near-rear-upper',
    [innerX[0], innerY[1], broadInnerZ[1]],
    [portX0, upperY, RECEIVER_FRONT_HALF_WIDTH],
  );
  addBox(
    'receiver-shell-side-near-front-upper',
    [portX1, innerY[1], broadInnerZ[1]],
    [innerX[1], upperY, RECEIVER_FRONT_HALF_WIDTH],
  );
  if (portY1 < upperY) {
    solids.push(
      solid(
        'receiver-shell-side-near-upper',
        [portX0, portY1, broadInnerZ[1]],
        [portX1, upperY, RECEIVER_FRONT_HALF_WIDTH],
      ),
    );
  }
  return solids.filter((component) => component.kind !== 'box' || component.box.half.every((half) => half > 0));
};

const arRearTHandle = (inside = false): Solid[] => {
  const receiverTop = RECEIVER_SECTION.ar.faces.top.y;
  return [
    metalSolid('charging-handle', [-18, receiverTop - 0.5, inside ? 1 : 1.5], [-16, receiverTop, inside ? 1.75 : 2]),
    metalSolid('ar-handle-crossbar', [-18, receiverTop - 0.5, -2], [-17.5, receiverTop, 2]),
    metalSolid('ar-handle-latch', [-16.5, receiverTop - 0.5, -0.5], [-16, receiverTop, 0.5]),
  ];
};

const battleCarrierHandleSolids = (): Solid[] => [
  metalSolid('fal-handle-pivot', [-3.5, 0, 2.15], [-2.5, 0.5, 2.75]),
  metalSolid('fal-handle-arm', [-4.5, 0.05, 2.65], [-3.25, 0.4, 3.25]),
  metalSolid('fal-handle-knob', [-5, -0.15, 2.55], [-4.25, 0.65, 3.35]),
  // The stem crosses the receiver wall and overlaps both the carrier and outer pivot.
  metalSolid('fal-handle-stem', [-3.25, 0, 1], [-2.75, 0.5, 2.25]),
];

const receiverActionDetails = (params: Readonly<Record<string, string>>): Solid[] => {
  if (params.action !== 'auto') {
    return [];
  }
  const handleStyle = carrierHandleStyleFor(params);
  const style = CARRIER_HANDLE_STYLES[handleStyle];
  if (params.chargingHandle === 'inside' && handleStyle === 'ar') {
    return arRearTHandle(true);
  }
  if (style.owner !== 'receiver') {
    return [];
  }
  if (style.shape === 'rear-t') {
    return arRearTHandle();
  }
  return [];
};

// ---- receiver ----

type BoltTravelClass = keyof typeof BOLT_TRAVEL;
interface ReceiverContext {
  readonly params: Readonly<Record<string, string>>;
  readonly bore: SizeClass;
  readonly tubeFed: boolean;
  readonly receiverDrop: number;
  readonly sectionData: (typeof RECEIVER_SECTION)[keyof typeof RECEIVER_SECTION] | undefined;
  readonly frontFaceX: number;
  readonly rearFaceX: number;
  readonly receiverBottom: number;
  readonly receiverTop: number;
  readonly portWindow: ReturnType<typeof ejectionPortWindow>;
  readonly travel: (typeof BOLT_TRAVEL)[BoltTravelClass];
  readonly carrierPattern: BoltCarrierPattern;
  readonly carrierY: number;
}

const receiverTravelClass = (params: Readonly<Record<string, string>>): BoltTravelClass => {
  if (params.section === 'ak') {
    return 'ak';
  }
  if (params.section === 'ar') {
    return 'standard';
  }
  if (params.action === 'pump' || params.section === 'pump') {
    return 'pump';
  }
  if (params.action === 'auto' && params.bore === 'S') {
    return 'short';
  }
  if (params.action === 'bolt' && params.feed === 'top') {
    return 'bolt';
  }
  if (params.action === 'bolt' && params.bore === 'L') {
    return 'long';
  }
  return 'standard';
};

const receiverPorts = (context: ReceiverContext): PortDef[] => {
  const { params, bore, receiverDrop, receiverBottom, receiverTop, frontFaceX, rearFaceX, travel, carrierY } = context;
  const ports: PortDef[] = [
    {
      id: 'barrel',
      mount: 'barrel',
      gender: 'female',
      size: bore,
      pos: [frontFaceX, 0, 0],
      normal: X,
      up: Y,
      required: true,
    },
    { id: 'bolt-carrier', mount: 'bolt-carrier', gender: 'female', pos: [travel.restX, carrierY, 0], normal: X, up: Y },
    { id: 'handguard', mount: 'handguard', gender: 'female', pos: [frontFaceX, 0, 0], normal: X, up: Y },
    {
      id: 'lower',
      mount: 'lower',
      gender: 'female',
      pos: [0, receiverBottom, 0],
      normal: NEG_Y,
      up: X,
      required: true,
    },
    {
      id: 'stock',
      mount: 'stock',
      gender: 'female',
      pos:
        params.section === 'pump'
          ? [rearFaceX, PUMP_REAR_PORT_Y, 0]
          : [rearFaceX, params.section === 'ar' ? AR_STOCK_PORT_Y : -receiverDrop, 0],
      normal: NEG_X,
      up: Y,
    },
  ];
  if (params.rail !== 'none') {
    ports.push({
      id: 'rail',
      mount: 'rail-top',
      gender: 'female',
      // AR scope feet stay on the upper, but the ocular starts ahead of rear charging-handle travel.
      pos: [params.section === 'ar' ? -12 : -14, receiverTop, 0],
      normal: Y,
      up: X,
      slots: { count: 7, pitch: 2 },
    });
  }
  if (params.feed === 'tube') {
    ports.push({
      id: 'tube',
      mount: 'tube',
      gender: 'female',
      pos: [frontFaceX, -tubeDropForBore(bore), 0],
      normal: X,
      up: Y,
      required: true,
    });
  }
  return ports;
};

const addActionKeepOuts = (params: Readonly<Record<string, string>>, keepOuts: KeepOut[]): void => {
  switch (params.action) {
    case 'bolt':
      keepOuts.push(keepOut('bolt-stock-clearance', [-26, -1.5, -1.5], [-16, 1.5, 1.5]));
      break;
    default:
      break;
  }
};

const addReceiverHandleKeepOuts = (params: Readonly<Record<string, string>>, keepOuts: KeepOut[]): void => {
  const style = CARRIER_HANDLE_STYLES[carrierHandleStyleFor(params)];
  if (style.owner !== 'receiver' || !('handClearanceU' in style)) {
    return;
  }
  const solids = receiverActionDetails(params);
  if (solids.length === 0) {
    return;
  }
  if (style.shape === 'rear-t') {
    const crossbar = solids.find(({ id }) => id === 'ar-handle-crossbar');
    if (!crossbar) {
      throw new Error('AR rear-T style requires its crossbar grip profile.');
    }
    const [minimum, maximum] = solidBounds(crossbar);
    const clearance = style.handClearanceU;
    const pullReach = maximum[0] - minimum[0] + 1.5;
    const chargingHandle = solids.find(({ id }) => id === 'charging-handle');
    if (!chargingHandle) {
      throw new Error('AR rear-T style requires its shaft profile.');
    }
    const [shaftMinimum, shaftMaximum] = solidBounds(chargingHandle);
    keepOuts.push(
      keepOut(
        'charging-handle',
        [shaftMinimum[0], shaftMinimum[1] - clearance, -1.5],
        [
          shaftMaximum[0],
          shaftMaximum[1] + clearance,
          shaftMinimum[2] + (params.chargingHandle === 'inside' ? clearance : 0),
        ],
        { allowPort: 'bolt-carrier', allowFamilies: ['stock', 'lower'] },
      ),
      keepOut(
        'rear-t-hand-grip-clearance',
        [minimum[0] - clearance, minimum[1] - clearance, minimum[2] - clearance],
        [maximum[0], maximum[1] + clearance, maximum[2] + clearance],
        { allowPort: 'bolt-carrier', allowFamilies: ['stock', 'lower'] },
      ),
      keepOut(
        'rear-t-hand-clearance',
        [minimum[0] - pullReach, minimum[1] - clearance, minimum[2] - clearance],
        [minimum[0] + clearance, maximum[1] + clearance, maximum[2] + clearance],
        { allowPort: 'bolt-carrier', allowFamilies: ['stock', 'lower'] },
      ),
    );
  }
};

const addFeedKeepOuts = (context: ReceiverContext, keepOuts: KeepOut[]): void => {
  const { params, receiverDrop, receiverBottom, receiverTop } = context;
  switch (params.feed) {
    case 'top':
      // The roof-mouth is closed to every family. Above it, opticLoadingClearance permits only bodies.
      keepOuts.push(
        keepOut('loading-mouth', [-9, receiverTop - 0.5, -1.5], [-4, receiverTop, 1.5]),
        keepOut('loading-port', [-9, receiverTop, -1.5], [-4, 9, 1.5], { allowFamilies: ['sight'] }),
      );
      break;
    case 'tube':
      keepOuts.push(keepOut('loading-port', [-7, -6 - receiverDrop, -1.5], [-2, receiverBottom, 1.5]));
      break;
    default:
      break;
  }
};

const receiverKeepOuts = (context: ReceiverContext): KeepOut[] => {
  const { params, portWindow, sectionData, travel, carrierY } = context;
  const keepOuts = [
    keepOut(
      'ejection',
      [portWindow.x[0], portWindow.y[0], sectionData?.faces.portSide ?? 2],
      [portWindow.x[1], portWindow.y[1], 10],
      { allowPort: 'bolt-carrier', allowFamilies: ['bolt-handle'] },
    ),
  ];
  keepOuts.push(
    keepOut(
      'bolt-travel',
      [travel.restX - travel.length, carrierY - 0.25, -0.25],
      [travel.restX, carrierY + 0.25, 0.25],
      'bolt-carrier',
    ),
  );
  addActionKeepOuts(params, keepOuts);
  if (params.action === 'bolt' && carrierPatternFor(params) === 'bolt') {
    const style = carrierHandleStyleFor(params);
    const bounds =
      style === 'bolt'
        ? boltActionHandleBounds(
            BOLT_CARRIER_ENVELOPES.bolt,
            (params.boltHandleProfile ?? 'standard') as BoltHandleProfile,
          )
        : undefined;
    if (bounds) {
      const [minimum, maximum] = bounds;
      const styleInfo = CARRIER_HANDLE_STYLES[style];
      const clearance = 'handClearanceU' in styleInfo ? styleInfo.handClearanceU : 0.25;
      keepOuts.push(
        keepOut(
          'bolt-handle',
          [
            travel.restX - travel.length - maximum[0] - clearance,
            carrierY + minimum[1] - clearance,
            -maximum[2] - clearance,
          ],
          [travel.restX - minimum[0] + clearance, carrierY + maximum[1] + clearance, -minimum[2] + clearance],
          { allowPort: 'bolt-carrier', allowFamilies: ['stock', 'lower', 'bolt-handle'] },
        ),
      );
    }
  }
  addReceiverHandleKeepOuts(params, keepOuts);
  addFeedKeepOuts(context, keepOuts);
  return keepOuts;
};

const receiverSolids = (context: ReceiverContext): Solid[] => {
  const {
    params,
    bore,
    receiverBottom,
    receiverTop,
    receiverDrop,
    carrierPattern,
    carrierY,
    portWindow,
    travel,
    tubeFed,
    frontFaceX,
  } = context;
  const handleStyleKey = carrierHandleStyleFor(params);
  const movingHandle = carrierHandleSolids(handleStyleKey, carrierPattern);
  const receiverHandles = receiverActionDetails(params);
  const falStem = handleStyleKey === 'battle' ? movingHandle.find(({ id }) => id === 'fal-handle-stem') : undefined;
  const falStemBounds = falStem ? solidBounds(falStem) : undefined;
  const farPortWindow = falStemBounds
    ? {
        x: [
          travel.restX - falStemBounds[1][0] - travel.length - BOLT_CARRIER_RUNNING_CLEARANCE_U,
          travel.restX - falStemBounds[0][0] + BOLT_CARRIER_RUNNING_CLEARANCE_U,
        ] as const,
        y: [
          carrierY + falStemBounds[0][1] - BOLT_CARRIER_RUNNING_CLEARANCE_U,
          carrierY + falStemBounds[1][1] + BOLT_CARRIER_RUNNING_CLEARANCE_U,
        ] as const,
      }
    : undefined;
  const shell = receiverShellSolids({
    section: params.section ?? 'standard',
    feed: params.feed!,
    magazineWell: params.magazineWell ?? 'standard',
    receiverBottom,
    receiverTop,
    receiverDrop,
    carrierPattern,
    carrierY,
    portWindow,
    frontFaceX,
    ...(params.section === 'pump' && tubeFed && carrierPattern === 'pump'
      ? { internalPockets: [pumpActionBarSlot(bore)] }
      : {}),
    ...(farPortWindow ? { farPortWindow } : {}),
  });
  const opticRail: Solid[] = [];
  if (params.rail !== 'none') {
    if (params.feed === 'top') {
      opticRail.push(
        solid('receiver-optic-rail-rear-base', [-14, receiverTop - 0.5, -1.25], [-9, receiverTop, 1.25]),
        solid('receiver-optic-rail-front-base', [-4, receiverTop - 0.5, -1.25], [-2, receiverTop, 1.25]),
      );
    } else {
      const start = params.section === 'ar' ? -12 : -14;
      opticRail.push(solid('receiver-optic-rail', [start, receiverTop - 0.5, -1.25], [start + 12, receiverTop, 1.25]));
    }
  }
  return [...shell, ...receiverHandles, ...receiverTubeSeat(bore, receiverBottom, tubeFed), ...opticRail];
};

export const receiver: PartFamily = {
  name: 'receiver',
  params: {
    /** auto: charging handle. bolt: bolt travel/handle. pump: forend-driven. */
    action: choice('auto', 'bolt', 'pump'),
    /** box: magazine through the lower. top: loaded from above. tube: tube magazine. */
    feed: choice('box', 'top', 'tube'),
    section: choice('standard', 'ar', 'pump', 'ak'),
    carrierPattern: {
      values: ['auto', ...Object.keys(BOLT_CARRIER_ENVELOPES)],
      default: 'auto',
      from: [{ port: 'bolt-carrier', param: 'pattern' }],
    },
    handleStyle: {
      values: ['auto', ...Object.keys(CARRIER_HANDLE_STYLES)],
      default: 'auto',
      from: [{ port: 'bolt-carrier', param: 'handleStyle' }],
    },
    boltHandleProfile: { ...choice('standard', 'awm'), from: [{ port: 'bolt-carrier', param: 'handleProfile' }] },
    bore: size,
    chargingHandle: { values: ['side', 'rear-top', 'inside'], default: 'side', fault: ['inside'] },
    boltHandle: { values: ['rest', 'inside'], default: 'rest', fault: ['inside'] },
    rail: choice('full', 'none'),
    magazineWell: {
      values: ['standard', 'recessed'],
      default: 'standard',
      from: [{ port: 'lower', param: 'magazineWell' }],
    },
  },
  build(params): PartDef {
    const bore = cls(params, 'bore');
    const tubeFed = params.feed === 'tube';
    const receiverDrop = params.action === 'pump' && tubeFed ? PUMP_RECEIVER_DROP : 0;
    const sectionData = Object.hasOwn(RECEIVER_SECTION, params.section ?? 'standard')
      ? RECEIVER_SECTION[params.section as keyof typeof RECEIVER_SECTION]
      : undefined;
    const frontFaceX = sectionData?.faces.front ?? 0;
    const rearFaceX = sectionData?.faces.rear ?? -16;
    const receiverBottom = (sectionData?.faces.bottom ?? -RECEIVER_FRONT_HALF_HEIGHT) - receiverDrop;
    const receiverTop = (sectionData?.faces.top.y ?? RECEIVER_FRONT_HALF_HEIGHT) - receiverDrop;
    if (sectionData && params.rail !== 'none' && sectionData.faces.top.halfWidth < 1.25) {
      throw new Error(`receiver ${params.section}: top flat is too narrow for its rail.`);
    }
    const carrierPattern = carrierPatternFor(params);
    const travel = BOLT_TRAVEL[receiverTravelClass(params)];
    const carrierY = carrierAxisY(carrierPattern, receiverDrop);
    const context: ReceiverContext = {
      params,
      bore,
      tubeFed,
      receiverDrop,
      sectionData,
      frontFaceX,
      rearFaceX,
      receiverBottom,
      receiverTop,
      carrierPattern,
      portWindow: ejectionPortWindow(carrierPattern, travel.restX, carrierY),
      travel,
      carrierY,
    };
    return {
      family: 'receiver',
      solids: receiverSolids(context),
      ports: receiverPorts(context),
      keepOuts: receiverKeepOuts(context),
      axes: [{ kind: 'bore', origin: [rearFaceX, 0, 0], dir: X }],
    };
  },
};

/** AK-style stamped receiver with a removable dust cover, gas-cylinder and rear-sight interfaces. */
export const akReceiver: PartFamily = {
  name: 'receiver',
  params: {
    action: choice('bolt'),
    feed: choice('box'),
    bore: size,
    section: choice('ak'),
  },
  build(params): PartDef {
    const bore = cls(params, 'bore');
    const base = receiver.build({
      action: 'bolt',
      feed: 'box',
      bore,
      section: 'ak',
      chargingHandle: 'side',
      rail: 'none',
    });
    const carrierPattern: BoltCarrierPattern = 'ak';
    const carrierY = carrierAxisY(carrierPattern, 0);
    const travel = BOLT_TRAVEL.ak;
    const portWindow = ejectionPortWindow(carrierPattern, travel.restX, carrierY);
    return {
      ...base,
      solids: [
        ...receiverShellSolids({
          section: 'ak',
          feed: 'box',
          magazineWell: 'standard',
          receiverBottom: -RECEIVER_FRONT_HALF_HEIGHT,
          receiverTop: RECEIVER_FRONT_HALF_HEIGHT,
          receiverDrop: 0,
          carrierPattern,
          carrierY,
          portWindow,
          frontFaceX: 0,
          portSlots: [akChargingHandleSlotWindow(carrierY, portWindow, travel.length)],
        }),
      ],
      // The AK's attached stock occupies the generic extraction sweep; other parts remain excluded from it.
      keepOuts: base.keepOuts.map((path) =>
        path.id === 'bolt-stock-clearance' ? { ...path, allowPort: 'stock' } : path,
      ),
      ports: [
        ...base.ports.map((port) =>
          port.id === 'stock' ? { ...port, pos: [port.pos[0], AK_STOCK_PORT_Y, port.pos[2]] as const } : port,
        ),
        {
          id: 'gas-cylinder',
          mount: 'gas-cylinder',
          gender: 'female',
          pos: [0, AK_GAS_CYLINDER_Y, 0],
          normal: X,
          up: Y,
          required: true,
        },
        {
          id: 'rear-sight',
          mount: 'sight-block',
          gender: 'female',
          pos: [-2, 2.5, 0],
          normal: Y,
          up: X,
          required: true,
        },
      ],
    };
  },
};

const translateSolid = (component: Solid, offset: Vec3): Solid => {
  if (component.kind === 'box') {
    return {
      ...component,
      box: {
        ...component.box,
        center: component.box.center.map((value, coordinateAxis) => value + offset[coordinateAxis]!) as unknown as Vec3,
      },
    };
  }
  if (component.kind === 'revolved') {
    throw new Error(`Solid "${component.id}" cannot be translated as an envelope-local extrusion.`);
  }
  const axis = component.axis ?? 'z';
  if (axis === 'x') {
    return {
      ...component,
      profile: component.profile.map(([y, z]) => [y + offset[1], z + offset[2]]),
      z: [component.z[0] + offset[0], component.z[1] + offset[0]],
    };
  }
  if (axis === 'y') {
    return {
      ...component,
      profile: component.profile.map(([z, x]) => [z + offset[2], x + offset[0]]),
      z: [component.z[0] + offset[1], component.z[1] + offset[1]],
    };
  }
  return {
    ...component,
    profile: component.profile.map(([x, y]) => [x + offset[0], y + offset[1]]),
    z: [component.z[0] + offset[2], component.z[1] + offset[2]],
  };
};

const relativeToEnvelope = (solids: readonly Solid[], source: CarrierEnvelope, target: CarrierEnvelope): Solid[] => {
  const offset: Vec3 = [target.x[0] - source.x[0], target.y[0] - source.y[0], target.z[0] - source.z[0]];
  return solids.map((component) => translateSolid(component, offset));
};

const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize3 = (value: Vec3): Vec3 => {
  const magnitude = Math.hypot(...value);
  return value.map((component) => component / magnitude) as unknown as Vec3;
};
/** A 2-1-2 triangle: 3.5u back, 1.75u down, and 3.5u outward on the 0.25u grid. */
const BOLT_HANDLE_ARM_AXIS: Vec3 = [2 / 3, -1 / 3, -2 / 3];
const BOLT_HANDLE_ARM_UP = normalize3([
  -BOLT_HANDLE_ARM_AXIS[0] * BOLT_HANDLE_ARM_AXIS[1],
  1 - BOLT_HANDLE_ARM_AXIS[1] ** 2,
  -BOLT_HANDLE_ARM_AXIS[2] * BOLT_HANDLE_ARM_AXIS[1],
]);
const BOLT_HANDLE_ARM_SIDE = cross3(BOLT_HANDLE_ARM_AXIS, BOLT_HANDLE_ARM_UP);
const BOLT_HANDLE_KNOB_AXIS: Vec3 = [
  dot3(BOLT_HANDLE_ARM_AXIS, [0, 0, -1]),
  dot3(BOLT_HANDLE_ARM_UP, [0, 0, -1]),
  dot3(BOLT_HANDLE_ARM_SIDE, [0, 0, -1]),
];
const BOLT_HANDLE_KNOB_UP: Vec3 = [
  dot3(BOLT_HANDLE_ARM_AXIS, Y),
  dot3(BOLT_HANDLE_ARM_UP, Y),
  dot3(BOLT_HANDLE_ARM_SIDE, Y),
];
const BOLT_HANDLE_MOTION_AXIS: Vec3 = [BOLT_HANDLE_ARM_AXIS[0], BOLT_HANDLE_ARM_UP[0], BOLT_HANDLE_ARM_SIDE[0]];
const BOLT_HANDLE_KNOB_MOTION_AXIS: Vec3 = [
  dot3(BOLT_HANDLE_KNOB_AXIS, BOLT_HANDLE_MOTION_AXIS),
  dot3(BOLT_HANDLE_KNOB_UP, BOLT_HANDLE_MOTION_AXIS),
  dot3(cross3(BOLT_HANDLE_KNOB_AXIS, BOLT_HANDLE_KNOB_UP), BOLT_HANDLE_MOTION_AXIS),
];
const boltHandleRoot = (envelope: CarrierEnvelope): Vec3 => [
  envelope.x[1],
  envelope.y[0],
  -RECEIVER_FRONT_HALF_WIDTH - 0.5,
];
const boltActionHandleBounds = (
  envelope: CarrierEnvelope,
  profile: BoltHandleProfile = 'standard',
): readonly [Vec3, Vec3] => {
  const root = boltHandleRoot(envelope);
  const tip = root.map(
    (value, axis) => value + BOLT_HANDLE_ARM_AXIS[axis]! * BOLT_HANDLE_PROFILES[profile].armLength,
  ) as unknown as Vec3;
  const knobRadius = 1.25;
  const minimum = root.map(
    (value, axis) => Math.floor((Math.min(value, tip[axis]!) - knobRadius) / GRID) * GRID,
  ) as unknown as Vec3;
  const maximum = root.map(
    (value, axis) => Math.ceil((Math.max(value, tip[axis]!) + knobRadius) / GRID) * GRID,
  ) as unknown as Vec3;
  return [minimum, maximum];
};
const convexHull = (points: readonly (readonly [number, number])[]): readonly Vec2[] => {
  const sorted = [...points].sort(([ax, ay], [bx, by]) => ax - bx || ay - by);
  const turn = (a: Vec2, b: Vec2, c: Vec2) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const half = (sequence: readonly Vec2[]) => {
    const hull: Vec2[] = [];
    for (const vertex of sequence) {
      while (hull.length >= 2 && turn(hull.at(-2)!, hull.at(-1)!, vertex) <= 1e-9) {
        hull.pop();
      }
      hull.push(vertex);
    }
    return hull;
  };
  const lower = half(sorted);
  const upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
};
const boltHandleSweep = (prism: Solid, axis: Vec3, travel: number): KeepOut => {
  if (prism.kind !== 'extruded-polygon') {
    throw new Error(`bolt handle sweep requires a prism: ${prism.id}`);
  }
  const points = prism.profile.flatMap((profilePoint) =>
    prism.z.flatMap((along) => {
      const vertex: Vec3 =
        prism.axis === 'x' ? [along, profilePoint[0], profilePoint[1]] : [profilePoint[0], profilePoint[1], along];
      return [vertex, vertex.map((value, i) => value + axis[i]! * travel) as unknown as Vec3];
    }),
  );
  const profile = convexHull(points.map(([x, y]) => [x, y] as const));
  const zBounds = [
    Math.min(...points.map((corner) => corner[2])),
    Math.max(...points.map((corner) => corner[2])),
  ] as const;
  const minimum: Vec3 = [Math.min(...profile.map(([x]) => x)), Math.min(...profile.map(([, y]) => y)), zBounds[0]];
  const maximum: Vec3 = [Math.max(...profile.map(([x]) => x)), Math.max(...profile.map(([, y]) => y)), zBounds[1]];
  const snappedMinimum = minimum.map((value) => Math.floor((value - 0.25) / GRID) * GRID) as unknown as Vec3;
  const snappedMaximum = maximum.map((value) => Math.ceil((value + 0.25) / GRID) * GRID) as unknown as Vec3;
  return {
    ...keepOut('bolt-handle-sweep', snappedMinimum, snappedMaximum, {
      allowFamilies: ['stock', 'receiver', 'bolt-carrier', 'bolt-handle'],
    }),
    profile,
    axis: 'z',
    z: zBounds,
  };
};

const boltHandleParams = {
  action: { ...choice('auto', 'bolt', 'pump'), from: [{ port: 'base', param: 'action' }] },
  bore: { ...size, from: [{ port: 'base', param: 'bore' }] },
  feed: { ...choice('box', 'top', 'tube'), from: [{ port: 'base', param: 'feed' }] },
  handleProfile: { ...choice('standard', 'awm'), from: [{ port: 'base', param: 'handleProfile' }] },
  section: { ...choice('standard', 'ar', 'pump', 'ak'), from: [{ port: 'base', param: 'section' }] },
};

const boltHandleArm: PartFamily = {
  name: 'bolt-handle-arm',
  params: boltHandleParams,
  build(params) {
    const profile = BOLT_HANDLE_PROFILES[(params.handleProfile ?? 'standard') as BoltHandleProfile];
    const solids = [
      { ...octagonalPrism('bolt-handle-arm', 0.375, [-0.25, profile.armLength - 0.25]), slot: 'metal' as const },
    ];
    const travel = carrierTravelLength(params);
    return {
      family: 'bolt-handle',
      solids,
      ports: [
        { id: 'base', mount: 'bolt-handle', gender: 'female', pos: [0, 0, 0], normal: NEG_X, up: Y, required: true },
        {
          id: 'tip',
          mount: 'bolt-handle-knob',
          gender: 'male',
          pos: [profile.armLength, 0, 0],
          normal: BOLT_HANDLE_KNOB_AXIS,
          up: BOLT_HANDLE_KNOB_UP,
          required: true,
        },
      ],
      keepOuts: [boltHandleSweep(solids[0]!, BOLT_HANDLE_MOTION_AXIS, travel)],
      axes: [],
      motion: {
        kind: 'linear',
        axis: BOLT_HANDLE_MOTION_AXIS,
        start: [0, 0, 0],
        end: [0, 0, 0],
        sourceKeepOut: { port: 'base', id: 'bolt-handle-travel' },
      },
    };
  },
};

const boltHandleKnob: PartFamily = {
  name: 'bolt-handle-knob',
  params: boltHandleParams,
  build(params) {
    const profile = BOLT_HANDLE_PROFILES[(params.handleProfile ?? 'standard') as BoltHandleProfile];
    const solids = [
      { ...octagonalPrism('bolt-handle-knob', profile.knobFlatRadius, [-0.5, 0.5]), slot: 'metal' as const },
    ];
    const travel = carrierTravelLength(params);
    return {
      family: 'bolt-handle',
      solids,
      ports: [
        {
          id: 'base',
          mount: 'bolt-handle-knob',
          gender: 'female',
          pos: [0, 0, 0],
          normal: NEG_X,
          up: Y,
          required: true,
        },
      ],
      keepOuts: [boltHandleSweep(solids[0]!, BOLT_HANDLE_KNOB_MOTION_AXIS, travel)],
      axes: [],
      motion: {
        kind: 'linear',
        axis: BOLT_HANDLE_KNOB_MOTION_AXIS,
        start: [0, 0, 0],
        end: BOLT_HANDLE_KNOB_MOTION_AXIS.map((value) => value * travel) as unknown as Vec3,
      },
    };
  },
};

const barrettCrankHandleSolids = (envelope: CarrierEnvelope): Solid[] =>
  relativeToEnvelope(
    [
      metalSolid('charging-handle', [2, -0.25, -1.25], [2.5, 0.25, -1]),
      metalSolid('barrett-handle-crank', [2, -0.5, -1.25], [2.75, 0.25, -1]),
      metalSolid('barrett-handle-knob', [1.75, -0.75, -1.25], [3, -0.25, -0.75]),
    ],
    HANDLE_REFERENCE_ENVELOPES.barrett,
    envelope,
  );

const carrierHandleSolids = (styleKey: CarrierHandleStyle, pattern: BoltCarrierPattern): Solid[] => {
  const style = CARRIER_HANDLE_STYLES[styleKey];
  if (style.owner !== 'carrier' || style.motion !== 'linear') {
    return [];
  }
  const envelope = BOLT_CARRIER_ENVELOPES[pattern];
  switch (style.shape) {
    case 'stick-paddle':
      return akChargingHandleSolids(envelope);
    case 'down-back-ball':
      return [];
    case 'right-side-crank':
      return barrettCrankHandleSolids(envelope);
    case 'fal-folded-out':
      return battleCarrierHandleSolids();
    default:
      return [];
  }
};

const carrierTravelLength = (params: Readonly<Record<string, string>>): number =>
  BOLT_TRAVEL[receiverTravelClass(params)].length;

const carrierHandleKeepOuts = (style: CarrierHandleStyle, solids: readonly Solid[], travel: number): KeepOut[] => {
  const definition = CARRIER_HANDLE_STYLES[style];
  if (
    definition.owner !== 'carrier' ||
    definition.motion !== 'linear' ||
    !('sweep' in definition && definition.sweep) ||
    !('handClearanceU' in definition) ||
    solids.length === 0
  ) {
    return [];
  }
  const clearance = definition.handClearanceU;
  const [minimum, maximum] = solidsBounds(solids);
  const attachment = style === 'bolt' ? { allowPort: 'mount', allowFamilies: ['stock'] } : 'mount';
  const hand = keepOut(
    `${style}-handle-hand`,
    [minimum[0] - clearance, minimum[1] - clearance, minimum[2] - clearance],
    [maximum[0] + clearance, maximum[1] + clearance, maximum[2] + clearance],
    attachment,
  );
  const swept = keepOut(
    `${style}-handle-sweep`,
    [minimum[0] - clearance, minimum[1] - clearance, minimum[2] - clearance],
    [maximum[0] + travel + clearance, maximum[1] + clearance, maximum[2] + clearance],
    attachment,
  );
  const primaryId = definition.shape === 'down-back-ball' ? 'bolt-handle' : 'charging-handle';
  const primary = solids.find(({ id }) => id === primaryId);
  const restFace = primary ? solidBounds(primary) : undefined;
  let rest: KeepOut | undefined;
  if (restFace && style === 'bolt') {
    rest = keepOut(
      'bolt-handle',
      [restFace[1][0], restFace[0][1], restFace[0][2]],
      [restFace[1][0] + clearance, restFace[1][1], restFace[1][2]],
      attachment,
    );
  } else if (restFace) {
    rest = keepOut(
      'charging-handle',
      [restFace[0][0], restFace[0][1], restFace[0][2] - clearance],
      [restFace[1][0], restFace[1][1], restFace[0][2]],
      'mount',
    );
  }
  return rest ? [hand, swept, rest] : [hand, swept];
};

// ---- independent receiver-connected SMG slide ----

const smgHandleShape = (): Solid[] => [
  metalSolid('smg-sliding-handle', [-0.5, -0.25, -0.25], [0.5, 0.25, 0.25]),
  metalSolid('smg-handle-grip', [-0.25, -0.25, 0.25], [0.25, 0.25, 2]),
];

const smgSlidingHandle: PartFamily = {
  name: 'smg-handle',
  params: {},
  build(): PartDef {
    const solids = smgHandleShape();
    const [minimum, maximum] = solidsBounds(solids);
    const clearance = CARRIER_HANDLE_STYLES.smg.handClearanceU;
    const travel = SMG_HANDLE_TRAVEL_U;
    return {
      family: 'smg-handle',
      solids,
      ports: [{ id: 'mount', mount: 'smg-handle', gender: 'male', pos: [0, 0, 0], normal: X, up: Y, required: true }],
      keepOuts: [
        keepOut(
          'smg-handle-hand',
          [minimum[0] - clearance, Math.max(minimum[1] - clearance, -0.25), minimum[2] - clearance],
          [maximum[0] + clearance, maximum[1] + clearance, maximum[2] + clearance],
          'mount',
        ),
        keepOut(
          'smg-handle-sweep',
          [minimum[0] - clearance, Math.max(minimum[1] - clearance, -0.25), minimum[2] - clearance],
          [maximum[0] + travel + clearance, maximum[1] + clearance, maximum[2] + clearance],
          'mount',
        ),
      ],
      axes: [],
      motion: {
        kind: 'linear',
        axis: [1, 0, 0],
        start: [0, 0, 0],
        end: [0, 0, 0],
        sourceKeepOut: { port: 'mount', id: 'smg-handle-travel' },
      },
    };
  },
};

// ---- procedural bolt-carrier group ----

export const boltCarrier: PartFamily = {
  name: 'bolt-carrier',
  params: {
    action: { ...choice('auto', 'bolt', 'pump'), from: [{ port: 'mount', param: 'action' }] },
    bore: { ...size, from: [{ port: 'mount', param: 'bore' }] },
    pattern: choice('ar', 'ak', 'pump', 'smg', 'barrett', 'bolt'),
    handleStyle: choice('auto', ...Object.keys(CARRIER_HANDLE_STYLES)),
    handleProfile: choice('standard', 'awm'),
    section: { ...choice('standard', 'ar', 'pump', 'ak'), from: [{ port: 'mount', param: 'section' }] },
    feed: { ...choice('box', 'top', 'tube'), from: [{ port: 'mount', param: 'feed' }] },
  },
  build(params): PartDef {
    const pattern = (params.pattern ?? 'ar') as BoltCarrierPattern;
    const handleStyle = carrierHandleStyleFor(params);
    const envelope = BOLT_CARRIER_ENVELOPES[pattern];
    let boreScale = 1;
    if (params.bore === 'L') {
      boreScale = 1.2;
    } else if (params.bore === 'S') {
      boreScale = 0.85;
    }
    const snap = (n: number) => Math.round(n / GRID) * GRID;
    const block = (id: string, min: Vec3, max: Vec3): Solid =>
      solid(id, [snap(min[0]), snap(min[1]), snap(min[2])], [snap(max[0]), snap(max[1]), snap(max[2])]);
    const bodyX: readonly [number, number] =
      pattern === 'ar' || pattern === 'pump' || pattern === 'ak' ? envelope.x : [-1.5, 1.5];
    const bodyZ = envelope.z;
    const solids: Solid[] = [
      solid('carrier-body', [bodyX[0], envelope.y[0], bodyZ[0]], [bodyX[1], envelope.y[1], bodyZ[1]]),
    ];
    if (pattern === 'ar') {
      solids.push(
        block('bolt-head', [0.75, -0.4, -1.25 * boreScale], [1.5, 0.4, 1.25 * boreScale]),
        block('gas-key', [-0.75, 0.5, -0.4], [1.1, 1, 0.4]),
      );
    } else if (pattern === 'ak') {
      solids.push(block('piston', [-4.75, 0.2, -0.35], [-0.25, 0.6, 0.35]));
    } else if (pattern === 'pump') {
      solids.push(...pumpActionBarSolids((params.bore ?? size.default) as SizeClass));
    } else if (pattern === 'barrett') {
      solids.push(block('heavy-carrier', [-3, -0.75, -1.2], [3, 0.75, 1.2]));
    } else if (pattern === 'bolt') {
      solids.push(block('bolt-cylinder', [-2.5, -0.5, -0.75], [2.5, 0.25, 0.75]));
    }
    const handles = carrierHandleSolids(handleStyle, pattern);
    solids.push(...handles);
    const boltStyle = CARRIER_HANDLE_STYLES.bolt;
    const boltHandleEnabled =
      pattern === 'bolt' &&
      handleStyle === 'bolt' &&
      boltStyle.owner === 'carrier' &&
      boltStyle.motion === 'linear' &&
      boltStyle.shape === 'down-back-ball';
    const handleRoot = boltHandleRoot(envelope);
    if (boltHandleEnabled) {
      solids.push(
        metalSolid(
          'bolt-handle-seat',
          [handleRoot[0] - 0.5, handleRoot[1] - 0.5, handleRoot[2]],
          [handleRoot[0], handleRoot[1] + 0.5, -envelope.z[1]],
        ),
      );
    }
    return {
      family: 'bolt-carrier',
      solids,
      ports: [
        { id: 'mount', mount: 'bolt-carrier', gender: 'male', pos: [0, 0, 0], normal: X, up: Y, required: true },
        ...(boltHandleEnabled
          ? [
              {
                id: 'handle',
                mount: 'bolt-handle',
                gender: 'male' as const,
                pos: handleRoot,
                normal: BOLT_HANDLE_ARM_AXIS,
                up: BOLT_HANDLE_ARM_UP,
                required: true,
              },
            ]
          : []),
      ],
      keepOuts: [
        ...carrierHandleKeepOuts(handleStyle, handles, carrierTravelLength(params)),
        ...(pattern === 'pump'
          ? (() => {
              const bounds = solids.map(localSolidBounds);
              const min: Vec3 = [
                Math.min(...bounds.map((entry) => entry[0][0])),
                Math.min(...bounds.map((entry) => entry[0][1])),
                Math.min(...bounds.map((entry) => entry[0][2])),
              ];
              const max: Vec3 = [
                Math.max(...bounds.map((entry) => entry[1][0])) + BOLT_TRAVEL.pump.length,
                Math.max(...bounds.map((entry) => entry[1][1])),
                Math.max(...bounds.map((entry) => entry[1][2])),
              ];
              const gridMin = min.map((value) => Math.floor(value / GRID) * GRID) as unknown as Vec3;
              const gridMax = max.map((value) => Math.ceil(value / GRID) * GRID) as unknown as Vec3;
              return [
                {
                  ...keepOut('action-bar-sweep', gridMin, gridMax, 'mount'),
                  allowFamilies: ['forend', 'barrel', 'tube-magazine'],
                },
              ];
            })()
          : []),
        ...(boltHandleEnabled
          ? [
              keepOut('bolt-handle-travel', [0, -0.25, -0.25], [carrierTravelLength(params), 0.25, 0.25], {
                allowPort: 'handle',
                allowFamilies: ['receiver'],
              }),
            ]
          : []),
      ],
      axes: [],
      motion: {
        kind: 'linear',
        axis: [1, 0, 0],
        start: [0, 0, 0],
        end: [0, 0, 0],
        sourceKeepOut: { port: 'mount', id: 'bolt-travel' },
      },
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
    const magazineWellFrame = (
      minX: number,
      maxX: number,
      centerX: number,
      rearHalfWidth = LOWER_HALF_WIDTH,
    ): Solid[] => {
      const x0 = centerX - wellDepth / 2;
      const x1 = centerX + wellDepth / 2;
      const z0 = wellWidth / 2;
      const outerZ = LOWER_HALF_WIDTH;
      const roofY = -1.5 + MAGAZINE_WELL_HEIGHT;
      const rearWall = solid('frame-rear', [minX, -1.5, -rearHalfWidth], [x0, 0, rearHalfWidth]);
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
            layout === 'pump'
              ? undefined
              : lowerGripContactX(layout, params.layout === 'conventional' ? conventionalGripX : undefined),
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
      case 'thumbhole': {
        const frame = magazineWellFrame(
          -16,
          conventionalWell.port.pos[0] + MAGAZINE_WELL_DEPTH / 2 + MAGAZINE_WELL_CLEARANCE,
          conventionalWell.port.pos[0],
          THUMBHOLE_HALF_WIDTH,
        );
        return {
          family: 'lower',
          solids: [...frame, ...triggerGuards],
          ports: [top, conventionalWell.port],
          keepOuts: [
            triggerFinger,
            conventionalWell.path,
            ...(conventionalWell.wellPath ? [conventionalWell.wellPath] : []),
          ],
          axes: [],
        };
      }
      case 'pump':
        return {
          family: 'lower',
          solids: [solid('frame', [-16, -1.5, -1.5], [-9, 0, 1.5]), ...triggerGuards],
          ports: [top],
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
  return { S: 26, M: 36, L: 46 }[sizeClass];
};

/** Regular octagon with horizontal and vertical flats at the requested half-width. */
const octagonalProfile = (flatRadius: number): readonly Vec2[] => {
  const corner = flatRadius * (Math.SQRT2 - 1);
  return [
    [flatRadius, corner],
    [corner, flatRadius],
    [-corner, flatRadius],
    [-flatRadius, corner],
    [-flatRadius, -corner],
    [-corner, -flatRadius],
    [corner, -flatRadius],
    [flatRadius, -corner],
  ];
};

const octagonalPrism = (id: string, flatRadius: number, along: readonly [number, number]): Solid => ({
  id,
  kind: 'extruded-polygon',
  profile: octagonalProfile(flatRadius),
  axis: 'x',
  z: along,
});

/** Eight-sided extrusion inscribed in its rectangular bounds, with 45-degree corner chamfers. */
const octagonalRectanglePrism = (
  id: string,
  along: readonly [number, number],
  vertical: readonly [number, number],
  lateral: readonly [number, number],
): Solid => {
  const [y0, y1] = vertical;
  const [z0, z1] = lateral;
  const chamfer = OCTAGONAL_RECTANGLE_CHAMFER;
  return {
    id,
    kind: 'extruded-polygon',
    profile: [
      [y0 + chamfer, z0],
      [y1 - chamfer, z0],
      [y1, z0 + chamfer],
      [y1, z1 - chamfer],
      [y1 - chamfer, z1],
      [y0 + chamfer, z1],
      [y0, z1 - chamfer],
      [y0, z0 + chamfer],
    ],
    axis: 'x',
    z: along,
  };
};

const akGasBlockX = (layout: string | undefined, length: SizeClass): number => {
  const handguardLength =
    layout === 'ak' ? akHandguardLength(length) : snapAkGrid(barrelLength({ length }) * HANDGUARD_REACH.barrelFraction);
  return snapAkGrid(handguardLength * (1 + AK_GAS_BLOCK_CLEARANCE) + AK_GAS_BLOCK_HALF_LENGTH);
};
const frontSightPosition = (style: string, length: SizeClass): number =>
  style === 'ak' ? barrelLength({ length }) - 2.5 : akGasBlockX('standard', length);
const arHandguardLength = (length: SizeClass): number => akGasBlockX('standard', length) - AR_FRONT_SIGHT_HALF_LENGTH;
export const barrel: PartFamily = {
  name: 'barrel',
  // Bore follows the receiver it's mounted in, unless set. Pistol profile keeps the same family and size but a shorter external tube.
  params: {
    bore: { ...size, from: [{ port: 'rear', param: 'bore' }] },
    length: size,
    profile: choice('standard', 'heavy', 'pistol'),
    handguardLayout: {
      values: ['standard', 'ak', 'ar'],
      default: 'standard',
      from: [{ port: 'clamp', param: 'layout' }],
    },
    handguardLength: { ...size, from: [{ port: 'clamp', param: 'length' }] },
    frontSightStyle: { ...choice('ar', 'ak'), from: [{ port: 'front-sight', param: 'style' }] },
    tubeLengthPercent: {
      values: PUMP_TUBE_LENGTH_PERCENTAGES,
      default: '75',
      from: [{ port: 'lug', param: 'lengthPercent' }],
    },
  },
  build(params): PartDef {
    const bore = cls(params, 'bore');
    const lengthClass = cls(params, 'length');
    const len = barrelLength(params);
    const r = Math.ceil((PISTOL_BARREL_RADIUS[bore] * (params.profile === 'heavy' ? 1.5 : 1)) / GRID) * GRID;
    const handguardLengthClass = cls(params, 'handguardLength');
    let fore: number;
    if (params.handguardLayout === 'ak') {
      fore = akHandguardLength(handguardLengthClass);
    } else if (params.handguardLayout === 'ar') {
      fore = arHandguardLength(handguardLengthClass);
    } else {
      fore = snapAkGrid(len * HANDGUARD_REACH.barrelFraction);
    }
    const tubeLengthPercent = params.tubeLengthPercent ?? '75';
    const tubeDrop = tubeDropForBore(bore);
    const tubeEnd = pumpTubeLength(len, tubeLengthPercent);
    const supportLug: PortDef[] =
      tubeEnd > fore
        ? [{ id: 'support-lug', mount: 'lug', gender: 'female', pos: [fore, -tubeDrop, 0], normal: NEG_X, up: Y }]
        : [];
    const tube = octagonalPrism('tube', r, [0, len]);
    return {
      family: 'barrel',
      solids: [tube],
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
          pos: [frontSightPosition(params.frontSightStyle ?? 'ar', lengthClass), 0, 0],
          normal: NEG_X,
          up: Y,
        },
        ...(params.profile === 'standard'
          ? [
              {
                id: 'gas-port',
                mount: 'gas-block',
                gender: 'male' as const,
                size: bore,
                pos: [
                  akGasBlockX(
                    params.handguardLayout,
                    params.handguardLayout === 'ak' ? handguardLengthClass : lengthClass,
                  ),
                  0,
                  0,
                ] as Vec3,
                normal: X,
                up: Y,
              },
            ]
          : []),
        { id: 'clamp', mount: 'clamp', gender: 'female', pos: [fore, 0, 0], normal: NEG_X, up: Y },
        { id: 'lug', mount: 'lug', gender: 'female', pos: [tubeEnd, -tubeDrop, 0], normal: NEG_X, up: Y },
        ...supportLug,
        { id: 'muzzle', mount: 'muzzle', gender: 'female', pos: [len, 0, 0], normal: X, up: Y },
      ],
      keepOuts: [keepOut('muzzle', [len, -1.5, -1.5], [len + 30, 1.5, 1.5], 'muzzle')],
      axes: [{ kind: 'bore', origin: [0, 0, 0], dir: X }],
    };
  },
};

/** A front sight block and post mounted near the muzzle. */
const octagonalCollar = (id: string, flatRadius: number, along: readonly [number, number]): Solid[] => {
  const inner = octagonalProfile(flatRadius);
  const outer = octagonalProfile(flatRadius + 0.25);
  return inner.map((point, index) => {
    const next = (index + 1) % inner.length;
    return {
      id: `${id}-${index}`,
      kind: 'extruded-polygon' as const,
      profile: [point, outer[index]!, outer[next]!, inner[next]!],
      axis: 'x' as const,
      z: along,
    };
  });
};

/** A fixed A2 or AK front sight block and post, with the bore axis at y = 0. */
export const frontSight: PartFamily = {
  name: 'front-sight',
  params: {
    bore: { ...size, from: [{ port: 'base', param: 'bore' }] },
    style: choice('ar', 'ak'),
  },
  build(params): PartDef {
    const radius = BARREL_RADIUS[cls(params, 'bore')];
    const postHalf = GRID;
    const postHalfZ = params.style === 'ar' ? GRID / 2 : GRID;
    const postBase = 4.25;
    const post = solid('post', [-postHalf, postBase, -postHalfZ], [postHalf, 5, postHalfZ]);
    const earInner = radius - GRID;
    const commonSolids = octagonalCollar('collar', radius, [-AR_FRONT_SIGHT_HALF_LENGTH, AR_FRONT_SIGHT_HALF_LENGTH]);
    const solids =
      params.style === 'ak'
        ? [
            ...commonSolids,
            extrudedPolygon(
              'block',
              [
                [-radius, radius],
                [radius, radius],
                [radius - GRID, postBase],
                [-radius + GRID, postBase],
              ],
              [-radius, radius],
            ),
            post,
            solid('ear-left', [-postHalf, 4, -radius], [postHalf, 5.5, -earInner]),
            solid('ear-right', [-postHalf, 4, earInner], [postHalf, 5.5, radius]),
          ]
        : [
            ...commonSolids,
            extrudedPolygon(
              'stem',
              [
                [-radius, radius],
                [radius, radius],
                [Math.max(GRID, radius - GRID), postBase],
                [-Math.max(GRID, radius - GRID), postBase],
              ],
              [-radius / 2, radius / 2],
            ),
            post,
          ];
    return {
      family: 'front-sight',
      solids,
      ports: [{ id: 'base', mount: 'sight-block', gender: 'male', pos: [0, 0, 0], normal: X, up: Y, required: true }],
      keepOuts: [],
      axes: [{ kind: 'sight', origin: [0, 5, 0], dir: X }],
    };
  },
};

/** A detachable AR front post that clamps to the forward top-rail slot. */
export const railFrontSight: PartFamily = {
  name: 'rail-front-sight',
  params: {
    bore: { ...size, from: [{ port: 'base', param: 'barrelBore' }] },
    clearance: { ...size, from: [{ port: 'base', param: 'clearance' }] },
  },
  build(params): PartDef {
    const bore = cls(params, 'bore');
    const clearance = cls(params, 'clearance');
    const handguardTop = Math.min(
      RECEIVER_FRONT_HALF_HEIGHT,
      BARREL_RADIUS[bore] + HANDGUARD_CLEARANCE[clearance] + HANDGUARD_WALL_THICKNESS,
    );
    const sightAxisY = RECEIVER_FRONT_HALF_HEIGHT + 1 - handguardTop;
    return {
      family: 'rail-front-sight',
      solids: [
        solid('base', [-1, 0, -1], [1, 0.5, 1]),
        solid('post', [-GRID, 0.5, -GRID / 2], [GRID, sightAxisY, GRID / 2]),
      ],
      ports: [{ id: 'base', mount: 'rail-top', gender: 'male', pos: [0, 0, 0], normal: NEG_Y, up: X, required: true }],
      keepOuts: [],
      axes: [{ kind: 'sight', origin: [0, sightAxisY, 0], dir: X }],
    };
  },
};

/** An AK gas block collars the barrel and rises to the gas cylinder with a raked fore face. */
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
        ...octagonalCollar('collar', radius, [-AR_FRONT_SIGHT_HALF_LENGTH, AR_FRONT_SIGHT_HALF_LENGTH]),
        extrudedPolygon(
          'block',
          [
            [0, radius],
            [1, radius],
            [0.25, AK_GAS_CYLINDER_Y + AK_GAS_CYLINDER_HALF_WIDTH],
            [0, AK_GAS_CYLINDER_Y + AK_GAS_CYLINDER_HALF_WIDTH],
          ],
          [-Math.max(GRID, snapAkGrid(radius * 0.5)), Math.max(GRID, snapAkGrid(radius * 0.5))],
        ),
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
    handguardLayout: {
      values: ['standard', 'ak'],
      default: 'standard',
      from: [{ port: 'handguard', param: 'layout' }],
    },
    handguardLength: { ...size, from: [{ port: 'handguard', param: 'length' }] },
  },
  build(params): PartDef {
    const lengthClass = params.handguardLayout === 'ak' ? cls(params, 'handguardLength') : cls(params, 'barrelLength');
    const len = akGasBlockX(params.handguardLayout, lengthClass);
    return {
      family: 'gas-cylinder',
      solids: [octagonalPrism('cylinder', AK_GAS_CYLINDER_HALF_WIDTH, [0, len])],
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
    layout: choice('standard', 'ak', 'ar'),
    handleStyle: choice('none', 'smg'),
    fit: { values: ['receiver', 'oversized', 'too-tight'], default: 'receiver', fault: ['oversized', 'too-tight'] },
    mount: choice('clamped', 'free-float'),
  },
  build(params): PartDef {
    const lengthClass = cls(params, 'length');
    let len: number;
    if (params.layout === 'ak') {
      len = akHandguardLength(lengthClass);
    } else if (params.layout === 'ar' && params.mount !== 'free-float') {
      len = arHandguardLength(lengthClass);
    } else {
      len = snapAkGrid(barrelLength({ length: lengthClass }) * HANDGUARD_REACH.barrelFraction);
    }
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
    const cylinderTop = AK_GAS_CYLINDER_Y + AK_GAS_CYLINDER_HALF_WIDTH;
    const topInner = akLayout ? cylinderTop : inner;
    const sideTop = akLayout ? cylinderTop : inner;
    const clampRadius =
      params.mount === 'free-float' || params.bore === 'none' ? undefined : BARREL_RADIUS[cls(params, 'bore')];
    const handleStyleKey = (params.handleStyle ?? 'none') as keyof typeof CARRIER_HANDLE_STYLES;
    const handleStyle = CARRIER_HANDLE_STYLES[handleStyleKey];
    const tubeEnd =
      handleStyle.owner === 'handguard' && handleStyle.shape === 'mp5-cocking-tube'
        ? len - SMG_HANDLE_FRONT_CLEARANCE_U
        : undefined;
    const cockingTube =
      tubeEnd === undefined
        ? []
        : [metalSolid('smg-cocking-tube', [0, outerY, -outerZ], [tubeEnd, outerY + 0.5, -outerZ + 0.5])];
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
        ...cockingTube,
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
          mount: 'rail-top',
          gender: 'female',
          pos: [2, outerY, 0],
          normal: Y,
          up: X,
          slots: { count: (len - 4) / 2 + 1, pitch: 2 },
        },
        ...(tubeEnd === undefined
          ? []
          : [
              {
                id: 'smg-handle',
                mount: 'smg-handle',
                gender: 'female' as const,
                pos: [tubeEnd, outerY + 0.25, -outerZ + 0.25] as Vec3,
                normal: X,
                up: Y,
              },
            ]),
      ],
      keepOuts:
        tubeEnd === undefined
          ? []
          : [
              keepOut(
                'smg-support-hand',
                [snapAkGrid(len * 0.25), -outerY, -outerZ - 1],
                [snapAkGrid(len * 0.75), outerY, -outerZ],
              ),
              keepOut(
                'smg-handle-travel',
                [tubeEnd - SMG_HANDLE_TRAVEL_U / 2, outerY + 0.25, -outerZ - 1],
                [tubeEnd + SMG_HANDLE_TRAVEL_U / 2, outerY + 1.25, -outerZ],
                'smg-handle',
              ),
            ],
      axes: [],
    };
  },
};

/** A magazine tube under the barrel; its front fixes to the barrel's lug. */
export const tubeMagazine: PartFamily = {
  name: 'tube-magazine',
  // Tube reach is a percentage of the actual barrel length, not a tube size class.
  params: {
    lengthPercent: { values: PUMP_TUBE_LENGTH_PERCENTAGES, default: '75' },
    barrelLength: { ...size, from: [{ port: 'cap', param: 'length' }] },
    // The barrel's bore sets how far its underside sits above the tube.
    bore: { ...size, from: [{ port: 'cap', param: 'bore' }] },
  },
  build(params): PartDef {
    const barrelLengthClass = (params.barrelLength ?? size.default) as SizeClass;
    const barrelEnd = barrelLength({ length: barrelLengthClass });
    const lengthPercent = params.lengthPercent ?? '75';
    const bore = cls(params, 'bore');
    const tubeDrop = tubeDropForBore(bore);
    const supportX = snapAkGrid(barrelEnd * HANDGUARD_REACH.barrelFraction);
    const length = pumpTubeLength(barrelEnd, lengthPercent);
    // The support spacer spans the barrel clearance; the enlarged cap encloses the tube's forward end.
    const bandTop = tubeDrop - BARREL_RADIUS[bore];
    const band = (id: string, x: number): Solid[] =>
      bandTop > TUBE_HALF_HEIGHT
        ? [octagonalRectanglePrism(id, [x - 1, x], [TUBE_HALF_HEIGHT, bandTop], [-0.5, 0.5])]
        : [];
    const cap: Solid[] =
      bandTop > TUBE_HALF_HEIGHT
        ? [
            {
              ...octagonalPrism('cap-lug', PUMP_TUBE_CAP_HALF_EXTENT, [length - PUMP_TUBE_CAP_LENGTH, length]),
              material: 'steel-blued',
              slot: 'metal',
            },
          ]
        : [];
    const supportPort: PortDef[] =
      length > supportX
        ? [{ id: 'support', mount: 'lug', gender: 'male', pos: [supportX, 0, 0], normal: X, up: Y }]
        : [];
    return {
      family: 'tube-magazine',
      solids: [
        octagonalPrism('tube', TUBE_HALF_HEIGHT, [0, length - PUMP_TUBE_CAP_END_INSET]),
        ...(length > supportX ? band('support-band', supportX) : []),
        ...cap,
      ],
      ports: [
        { id: 'rear', mount: 'tube', gender: 'male', pos: [0, 0, 0], normal: NEG_X, up: Y, required: true },
        ...supportPort,
        { id: 'cap', mount: 'lug', gender: 'male', pos: [length, 0, 0], normal: X, up: Y },
        { id: 'forend', mount: 'forend', gender: 'female', pos: [PUMP_FOREND_MOUNT_X, 0, 0], normal: X, up: Y },
      ],
      keepOuts: [
        {
          ...keepOut(
            'forend-travel',
            [PUMP_FOREND_MOUNT_X - BOLT_TRAVEL.pump.length, -0.25, -1.5],
            [PUMP_FOREND_MOUNT_X, 0.25, 1.5],
            'forend',
          ),
          allowFamilies: ['bolt-carrier'],
        },
      ],
      axes: [],
    };
  },
};

/** Sliding tubular forend: the octagonal sleeve leaves only a narrow top slit for the action bar. */
export const forend: PartFamily = {
  name: 'forend',
  params: {},
  build(): PartDef {
    const innerRadius = TUBE_HALF_HEIGHT + PUMP_FOREND_TUBE_CLEARANCE;
    const outerRadius = innerRadius + PUMP_FOREND_WALL;
    const corner = 0.414;
    const slitHalfWidth = PUMP_ACTION_BAR_THICKNESS / 2 + PUMP_ACTION_BAR_CLEARANCE;
    const outerTopY = pumpActionBarOuterY();
    const outer: readonly Vec2[] = [
      [-outerRadius, -corner * outerRadius],
      [-outerRadius, corner * outerRadius],
      [-corner * outerRadius, outerRadius],
      [corner * outerRadius, outerRadius],
      [outerTopY, corner * outerRadius],
      [outerTopY, slitHalfWidth],
      [outerTopY, -slitHalfWidth],
      [outerTopY, -corner * outerRadius],
      [corner * outerRadius, -outerRadius],
      [-corner * outerRadius, -outerRadius],
    ];
    const inner: readonly Vec2[] = [
      [-innerRadius, -corner * innerRadius],
      [-innerRadius, corner * innerRadius],
      [-corner * innerRadius, innerRadius],
      [corner * innerRadius, innerRadius],
      [innerRadius, corner * innerRadius],
      [innerRadius, slitHalfWidth],
      [innerRadius, -slitHalfWidth],
      [innerRadius, -corner * innerRadius],
      [corner * innerRadius, -innerRadius],
      [-corner * innerRadius, -innerRadius],
    ];
    const shellFacets: Solid[] = [];
    for (let index = 0; index < outer.length; index++) {
      if (index === 5) {
        continue;
      }
      const next = (index + 1) % outer.length;
      shellFacets.push({
        id: `shell-${shellFacets.length + 1}`,
        kind: 'extruded-polygon',
        profile: [outer[index]!, inner[index]!, inner[next]!, outer[next]!],
        axis: 'x',
        z: [0, PUMP_FOREND_LENGTH],
        display: { bevel: false, outline: false, mergeGroup: 'pump-forend-shell' },
      });
    }
    return {
      family: 'forend',
      solids: shellFacets,
      ports: [{ id: 'rear', mount: 'forend', gender: 'male', pos: [0, 0, 0], normal: NEG_X, up: Y, required: true }],
      // The forend is pulled back along the tube to cycle the action.
      keepOuts: [
        {
          ...keepOut(
            'slide-travel',
            [-BOLT_TRAVEL.pump.length, -1 - PUMP_FOREND_WALL, -1 - PUMP_FOREND_WALL],
            [0, 0, 1 + PUMP_FOREND_WALL],
            'rear',
          ),
          allowFamilies: ['bolt-carrier'],
        },
      ],
      axes: [],
      motion: {
        kind: 'linear',
        axis: NEG_X,
        start: [0, 0, 0],
        end: [0, 0, 0],
        sourceKeepOut: { port: 'rear', id: 'forend-travel' },
      },
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
    if (part.kind === 'revolved') {
      throw new Error('Integrated pistol grips cannot rotate revolved solids in the XY plane.');
    }
    if (part.kind === 'extruded-polygon' && part.axis && part.axis !== 'z') {
      throw new Error(`Integrated pistol grips cannot rotate ${part.axis}-axis extrusions in the XY plane.`);
    }
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
          mount: 'rail-top',
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
          {
            ...solid(
              'floorplate',
              [-depth / 2, resolvedInsertion - len, -width / 2 - 0.25],
              [depth / 2 + 0.25, resolvedInsertion - len + 0.25, width / 2 + 0.25],
            ),
            material: 'steel-blued',
            slot: 'accent',
          },
        ]
      : [];
    return {
      family: 'magazine',
      solids: [...geometry.collision, ...floorplate],
      displaySolids: [
        ...geometry.display.map((displaySolid) =>
          displaySolid.id.startsWith('curve-display-')
            ? { ...displaySolid, display: { bevel: false, outline: false } }
            : displaySolid,
        ),
        ...floorplate,
      ],
      ports: [
        gunPort({
          id: 'top',
          mount: 'magazine',
          gender: 'male',
          pos: [0, 0, 0],
          normal: Y,
          up: X,
          required: true,
          seat: curveProfile?.seat ?? 'well',
        }),
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
 * tapered: constant-width side profile, with a narrow wrist and taller butt.
 * tapered-sawed: the same front and grip, cut off just behind the grip.
 */
export const M4_STOCK_GEOMETRY = {
  bufferTubeAcrossFlats: 2.5,
  frontDepth: 3,
  rearDepth: 7.5,
  depthDifference: 4.5,
} as const;

const m4StockSolids = (len: number): Solid[] => {
  const frontX = -M4_STOCK_GEOMETRY.frontDepth;
  const rearBottom = -6;
  const top = 1.5;
  const frontBottom = -1.5;
  const frontHalfWidth = 1.5;
  const rearHalfWidth = 2;
  const taperLength = len - M4_STOCK_GEOMETRY.frontDepth;
  const bottomSlope = (frontBottom - rearBottom) / taperLength;
  const bottomIntercept = frontBottom - bottomSlope * frontX;
  const sideSlope = (frontHalfWidth - rearHalfWidth) / taperLength;
  const sideIntercept = frontHalfWidth - sideSlope * frontX;
  const body: Solid = {
    id: 'm4-stock-body',
    kind: 'extruded-polygon',
    profile: [
      [rearBottom, -rearHalfWidth],
      [top, -rearHalfWidth],
      [top, rearHalfWidth],
      [rearBottom, rearHalfWidth],
    ],
    axis: 'x',
    z: [-len, frontX],
    clip: [
      { normal: [bottomSlope, -1, 0], offset: -bottomIntercept },
      { normal: [-sideSlope, 0, 1], offset: sideIntercept },
      { normal: [-sideSlope, 0, -1], offset: sideIntercept },
    ],
    display: { bevel: false },
  };
  const buttplate: Solid = {
    id: 'buttplate',
    kind: 'extruded-polygon',
    profile: [
      [-6.25, -2.25],
      [1.75, -2.25],
      [1.75, 2.25],
      [-6.25, 2.25],
    ],
    axis: 'x',
    z: [-len - 1, -len],
  };
  return [
    octagonalPrism('buffer-tube', M4_STOCK_GEOMETRY.bufferTubeAcrossFlats / 2, [-len, 0]),
    body,
    buttplate,
    solid('latch-rib', [-6, -2.75, -0.25], [-3, -1.25, 0.25]),
  ];
};

export const stock: PartFamily = {
  name: 'stock',
  params: {
    length: size,
    style: choice('straight', 'sporting', 'dropped', 'ak-dropped', 'm4', 'tapered', 'tapered-sawed', 'thumbhole'),
  },
  build(params): PartDef {
    const len = { S: 10, M: 16, L: 22 }[cls(params, 'length')];
    const cheekDatum = { kind: 'cheek', origin: [-10, 2.5, 0] as Vec3, dir: X };
    const port: PortDef = {
      id: 'front',
      mount: 'stock',
      gender: 'male',
      pos: [0, params.style === 'ak-dropped' ? -2 : 0, 0],
      normal: X,
      up: Y,
      required: true,
    };
    if (params.style === 'm4') {
      return {
        family: 'stock',
        solids: m4StockSolids(len),
        ports: [port],
        keepOuts: [],
        axes: [cheekDatum],
      };
    }
    if (params.style === 'thumbhole') {
      const combTop = -1.5;
      const sideZ: readonly [number, number] = [-THUMBHOLE_HALF_WIDTH, THUMBHOLE_HALF_WIDTH];
      const gripFront = 4.25;
      const gripRear = 0.75;
      const buttFront = -0.72 * len;
      const openingRear = gripRear - 4;
      const openingBottom = -7.48;
      const bottomBarBottom = -9.24;
      const postAndButtBottom = -12.5475;
      const gripTop = -4;
      const rect = ({
        id,
        x: [x0, x1],
        y: [y0, y1],
      }: {
        id: string;
        x: readonly [number, number];
        y: readonly [number, number];
      }) =>
        extrudedPolygon(
          id,
          [
            [x0, y0],
            [x1, y0],
            [x1, y1],
            [x0, y1],
          ],
          sideZ,
        );
      return {
        family: 'stock',
        solids: [
          rect({ id: 'thumbhole-top', x: [buttFront, 0], y: [gripTop, combTop] }),
          rect({ id: 'thumbhole-rear-post', x: [buttFront, openingRear], y: [openingBottom, gripTop] }),
          rect({ id: 'grip', x: [gripRear, gripFront], y: [postAndButtBottom, gripTop] }),
          rect({ id: 'thumbhole-bottom', x: [buttFront, gripRear], y: [bottomBarBottom, openingBottom] }),
          rect({ id: 'butt', x: [-len, buttFront], y: [postAndButtBottom, combTop] }),
        ],
        ports: [port],
        keepOuts: [],
        axes: [cheekDatum],
        tags: [FIRING_GRIP],
      };
    }
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
        axes: [cheekDatum],
        tags: [FIRING_GRIP],
      };
    }
    if (params.style === 'tapered' || params.style === 'tapered-sawed') {
      const stockDrop = 1.5;
      const sideZ: readonly [number, number] = [-1.5, 1.5];
      const combStartY = 1.5 - stockDrop;
      const combTangent = Math.tan((8 * Math.PI) / 180);
      const bellyTangent = Math.tan((13 * Math.PI) / 180);
      const padThickness = 0.06 * len;
      const buttHeight = 0.34 * len;
      const buttRake = 0.25;
      const padRearBottomX = -len;
      const padFrontBottomX = padRearBottomX + padThickness;
      const padRearTopX = padRearBottomX + buttRake;
      const padFrontTopX = padRearTopX + padThickness;
      const combY = (x: number) => combStartY + combTangent * x;
      const heelY = combY(padFrontTopX);
      const toeY = heelY - buttHeight;
      const wristX = -2.5;
      const wristTopY = combY(wristX);
      const wristBottomY = wristTopY - 0.18 * len;
      const gripX = -0.28 * len;
      const gripY = combY(gripX) - 0.32 * len;
      const bellyRearX = -0.45 * len;
      const bellyRearY = toeY + bellyTangent * (bellyRearX - padFrontBottomX);

      const foreStock = extrudedPolygon(
        'fore-stock',
        [
          [wristX, wristBottomY],
          [0, -2 - stockDrop],
          [0, combStartY],
          [wristX, wristTopY],
        ],
        sideZ,
      );
      const gripSolid = extrudedPolygon(
        'grip',
        [
          [gripX, gripY],
          [wristX, wristBottomY],
          [wristX, wristTopY],
          [gripX, combY(gripX)],
        ],
        sideZ,
      );

      if (params.style === 'tapered-sawed') {
        const cutBehindGrip = 0.5;
        const cutX = gripX - cutBehindGrip;
        const lowerTangent = (bellyRearY - gripY) / (bellyRearX - gripX);
        const cutBottomY = gripY + lowerTangent * (cutX - gripX);
        return {
          family: 'stock',
          solids: [
            foreStock,
            gripSolid,
            extrudedPolygon(
              'cut-stub',
              [
                [cutX, cutBottomY],
                [gripX, gripY],
                [gripX, combY(gripX)],
                [cutX, combY(cutX)],
              ],
              sideZ,
            ),
          ],
          ports: [port],
          keepOuts: [],
          axes: [cheekDatum],
          tags: [FIRING_GRIP],
        };
      }

      const heelRise = 0.05 * buttHeight;
      const raisedHeelY = heelY + heelRise;
      return {
        family: 'stock',
        solids: [
          foreStock,
          gripSolid,
          extrudedPolygon(
            'grip-back',
            [
              [bellyRearX, bellyRearY],
              [gripX, gripY],
              [gripX, combY(gripX)],
              [bellyRearX, combY(bellyRearX)],
            ],
            sideZ,
          ),
          extrudedPolygon(
            'belly',
            [
              [padFrontBottomX, toeY],
              [bellyRearX, bellyRearY],
              [bellyRearX, combY(bellyRearX)],
              [padFrontTopX, raisedHeelY],
            ],
            sideZ,
          ),
          {
            ...extrudedPolygon(
              'butt-pad',
              [
                [padRearBottomX, toeY],
                [padFrontBottomX, toeY],
                [padFrontTopX, raisedHeelY],
                [padRearTopX, raisedHeelY],
              ],
              sideZ,
            ),
            material: 'rubber-black',
            slot: 'accent',
          },
        ],
        ports: [port],
        keepOuts: [],
        axes: [cheekDatum],
        tags: [FIRING_GRIP],
      };
    }
    if (params.style === 'dropped' || params.style === 'ak-dropped') {
      return {
        family: 'stock',
        solids: [
          solid('comb', [-len, -3, -1.5], [-6, -1.5, 1.5]),
          solid('wrist', [-6, -4, -1.5], [0, DROPPED_STOCK_WRIST_TOP_Y, 1.5]),
          solid('butt', [-len - 1, -8, -1.75], [-len, 0, 1.75]),
        ],
        ports: [port],
        keepOuts: [],
        axes: [cheekDatum],
      };
    }
    return {
      family: 'stock',
      solids: [solid('comb', [-len, -1, -1.5], [0, 2.5, 1.5]), solid('butt', [-len - 1, -8, -1.75], [-len, 3, 1.75])],
      ports: [port],
      keepOuts: [],
      axes: [cheekDatum],
    };
  },
};

export const sight: PartFamily = {
  name: 'sight',
  params: {
    type: { values: OPTIC_TYPE_IDS, default: 'mini-reflex' },
    mountSection: {
      values: ['standard', 'ar', 'pump', 'ak'],
      default: 'standard',
      from: [{ port: 'base', param: 'section' }],
    },
    mountFeed: {
      values: ['box', 'top', 'tube', 'cylinder'],
      default: 'box',
      from: [{ port: 'base', param: 'feed' }],
    },
  },
  build(params): PartDef {
    const optic = getOptic(params.type, params.mountSection);
    // Separate prism feet reach the round ends without putting a bridge across a top-loading mouth.
    const solids =
      params.mountFeed === 'top' && optic.id === 'fixed-prism-4x'
        ? optic.solids
            .filter(({ id }) => id !== 'mount-bridge')
            .map((component) =>
              component.kind === 'box' && component.id.endsWith('foot')
                ? {
                    ...component,
                    box: {
                      center: [
                        component.box.center[0],
                        component.box.center[1] + 0.25,
                        component.box.center[2],
                      ] as const,
                      half: [component.box.half[0], component.box.half[1] + 0.25, component.box.half[2]] as const,
                    },
                  }
                : component,
            )
        : optic.solids;
    return {
      family: 'sight',
      solids,
      ports: [
        { id: 'base', mount: optic.mount.kind, gender: 'male', pos: [0, 0, 0], normal: NEG_Y, up: X, required: true },
      ],
      keepOuts: optic.keepOuts,
      axes: [{ kind: 'sight', origin: [0, optic.opticalAxisY, 0], dir: X }],
    };
  },
};

export const FAMILIES: Readonly<Record<string, PartFamily>> = {
  receiver,
  'ak-receiver': akReceiver,
  'bolt-carrier': boltCarrier,
  'bolt-handle-arm': boltHandleArm,
  'bolt-handle-knob': boltHandleKnob,
  'smg-handle': smgSlidingHandle,
  lower,
  frame: pistolFrame,
  slide: pistolSlide,
  barrel,
  'front-sight': frontSight,
  'rail-front-sight': railFrontSight,
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
  ...revolverFamilySet,
  ...ANTI_MATERIEL_FAMILIES,
};
