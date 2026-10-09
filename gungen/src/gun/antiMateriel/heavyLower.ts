import { boxFromMinMax } from '@skelly/engine/core/geometry.ts';
import type { KeepOut, PartDef, PartFamily, PortDef, Solid } from '@skelly/engine/core/schema.ts';
import { box, NEG_Y, X, Y } from './common.ts';
import { HEAVY_MAGAZINE_DEPTH, HEAVY_MAGAZINE_INSERTION, HEAVY_MAGAZINE_WIDTH } from './heavyMagazine.ts';

/**
 * The lower for the .50 rifle: the conventional layout (magazine ahead of the trigger and pistol grip) with a
 * magazine well sized for `heavy-magazine` instead of the shared lower's 6u x 3u rifle well. It plays the `lower`
 * role. Its frame is the shared conventional lower's, moved back: the well's front face stays where it is
 * (1.25u behind the receiver's front face, so the barrel shroud and bipod clear it as before), the well grows
 * rearward, and the trigger, guard and grip keep their distances from the well's rear face.
 *
 * The trigger guard and the grip fit repeat the shared lower's numbers (parts.ts: LOWER_TRIGGER_GUARD,
 * GRIP_MOUNT_PROFILE, GRIP_BANDS.leanDegrees); this file cannot import parts.ts, which imports it.
 * test/antiMateriel.test.ts pins the copies against the originals.
 */
const WELL_CLEARANCE = 0.25;
const WELL_HEIGHT = HEAVY_MAGAZINE_INSERTION + WELL_CLEARANCE;
const WELL_DEPTH = HEAVY_MAGAZINE_DEPTH + 2 * WELL_CLEARANCE;
const WELL_HALF_WIDTH = HEAVY_MAGAZINE_WIDTH / 2 + WELL_CLEARANCE;
const OUTER_HALF_WIDTH = WELL_HALF_WIDTH + WELL_CLEARANCE;
const FRONT_PANEL = 0.25;
const PORT_Y = -1.5;

const HEAVY_WELL_FRONT_X = -1.25;
export const HEAVY_WELL_CENTER_X = HEAVY_WELL_FRONT_X - WELL_DEPTH / 2;
const WELL_REAR_X = HEAVY_WELL_FRONT_X - WELL_DEPTH;

/** The trigger finger sits 3.5u behind the well, and the grip 2.25u behind the trigger, as in the shared lower. */
const TRIGGER_X = WELL_REAR_X - 3.5;
const HEAVY_GRIP_X = TRIGGER_X - 2.25;

export const HEAVY_TRIGGER_GUARD = { innerXClearance: 0.5, sideWall: 0.5, verticalWall: 0.25, zRatio: 0.625 } as const;
const HEAVY_GRIP_LEAN_DEGREES = 18;
const GRIP_LEAN = (HEAVY_GRIP_LEAN_DEGREES * Math.PI) / 180;
/** The grip's upper mount outline (grip-local x, y): the front vertex first, then the two rear ones. */
export const HEAVY_GRIP_MOUNT_PROFILE = [
  [1.5, 0],
  [1.25, Math.tan(GRIP_LEAN) * 1.25],
  [-1.5, -Math.tan(GRIP_LEAN) * 1.5],
] as const;

/** World-x of the grip's front vertex, which the guard's rear wall must touch. */
const gripContactX = (): number => HEAVY_GRIP_X + HEAVY_GRIP_MOUNT_PROFILE[0][0] * Math.cos(GRIP_LEAN);
/** The rearmost x of the grip's mount face, rounded down to the grid: where the frame must reach. */
const gripRearX = (): number => {
  const rear = Math.min(
    ...HEAVY_GRIP_MOUNT_PROFILE.slice(1).map(
      ([x, y]) => HEAVY_GRIP_X + x * Math.cos(GRIP_LEAN) + y * Math.sin(GRIP_LEAN),
    ),
  );
  return Math.floor(rear / 0.25) * 0.25;
};
/** Rearmost x of the lower's frame; the receiver ends a little behind it. */
export const HEAVY_LOWER_REAR_X = Math.min(WELL_REAR_X, gripRearX());

const triggerFinger = (): KeepOut => ({
  id: 'trigger-finger',
  kind: 'trigger-finger',
  box: boxFromMinMax([TRIGGER_X, -4.5, -1], [TRIGGER_X + 2, -1.75, 1]),
});

/** Four boxes around the trigger finger, in the shape `trigger-guard` (gun/rules.ts) measures. */
const triggerGuardSolids = (finger: KeepOut): Solid[] => {
  const { center, half } = finger.box;
  const { innerXClearance, sideWall, verticalWall, zRatio } = HEAVY_TRIGGER_GUARD;
  const [minX, maxX] = [center[0] - half[0], center[0] + half[0]];
  const [minY, maxY] = [center[1] - half[1], center[1] + half[1]];
  const innerRearX = minX - innerXClearance;
  const innerFrontX = maxX + innerXClearance;
  const outerFrontX = innerFrontX + sideWall;
  const lowerY = minY - verticalWall;
  const upperY = maxY + verticalWall;
  const outerRearX = gripContactX();
  const zHalf = half[2] * zRatio;
  return [
    box('trigger-guard-top', [outerRearX, maxY, -zHalf], [outerFrontX, upperY, zHalf]),
    box('trigger-guard-rear', [outerRearX, lowerY, -zHalf], [innerRearX, upperY, zHalf]),
    box('trigger-guard-front', [innerFrontX, lowerY, -zHalf], [outerFrontX, upperY, zHalf]),
    box('trigger-guard-bottom', [outerRearX, lowerY, -zHalf], [outerFrontX, minY, zHalf]),
  ];
};

export const heavyLower: PartFamily = {
  name: 'heavy-lower',
  params: {},
  build(): PartDef {
    const finger = triggerFinger();
    const ports: PortDef[] = [
      { id: 'top', mount: 'lower', gender: 'male', pos: [0, 0, 0], normal: Y, up: X, required: true },
      { id: 'grip', mount: 'grip', gender: 'female', pos: [HEAVY_GRIP_X, PORT_Y, 0], normal: NEG_Y, up: X },
      {
        id: 'magazine',
        mount: 'magazine',
        gender: 'female',
        pos: [HEAVY_WELL_CENTER_X, PORT_Y, 0],
        normal: NEG_Y,
        up: X,
        required: true,
      },
    ];
    const roofY = PORT_Y + WELL_HEIGHT;
    const solids: Solid[] = [
      box('frame-rear', [HEAVY_LOWER_REAR_X, PORT_Y, -OUTER_HALF_WIDTH], [WELL_REAR_X, 0, OUTER_HALF_WIDTH]),
      box(
        'frame-front',
        [HEAVY_WELL_FRONT_X, PORT_Y, -OUTER_HALF_WIDTH],
        [HEAVY_WELL_FRONT_X + FRONT_PANEL, 0, OUTER_HALF_WIDTH],
      ),
      box('well-wall-left', [WELL_REAR_X, PORT_Y, -OUTER_HALF_WIDTH], [HEAVY_WELL_FRONT_X, 0, -WELL_HALF_WIDTH]),
      box('well-wall-right', [WELL_REAR_X, PORT_Y, WELL_HALF_WIDTH], [HEAVY_WELL_FRONT_X, 0, OUTER_HALF_WIDTH]),
      box('well-roof', [WELL_REAR_X, roofY, -WELL_HALF_WIDTH], [HEAVY_WELL_FRONT_X, 0, WELL_HALF_WIDTH]),
      ...triggerGuardSolids(finger),
    ];
    // The magazine slides down out of the well; nothing but the magazine may stand in its path.
    const magazinePath: KeepOut = {
      id: 'magazine-path',
      kind: 'magazine-path',
      box: boxFromMinMax([WELL_REAR_X, -40, -WELL_HALF_WIDTH], [HEAVY_WELL_FRONT_X, roofY, WELL_HALF_WIDTH]),
      allowPort: 'magazine',
    };
    return { family: 'lower', solids, ports, keepOuts: [finger, magazinePath], axes: [] };
  },
};
