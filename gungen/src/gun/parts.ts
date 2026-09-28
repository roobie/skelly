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
const extrudedPolygon = (id: string, profile: readonly Vec2[], z: readonly [number, number]): Solid => ({
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

// Things that run along the barrel and fix to it (handguards, tube
// magazines) come in lengths paired with barrel length classes: a barrel's
// clamp and lug sit where a part of the same length class ends.
const FORE_LENGTH: Record<SizeClass, number> = { S: 16, M: 24, L: 32 };

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
const AK_MAGAZINE_SEGMENTS: Record<SizeClass, { top: number; middle: number; bottom: number; bendDegrees: number }> = {
  S: { top: 1.5, middle: 1, bottom: 3.5, bendDegrees: 12 },
  M: { top: 2.5, middle: 2, bottom: 5.5, bendDegrees: 13 },
  L: { top: 4, middle: 3, bottom: 9, bendDegrees: 14 },
};
const AK_MAGAZINE_ROCK_IN_SWEEP = 4;
const snapAkGrid = (value: number): number => Math.round(value / GRID) * GRID;
const snapAkPoint = ([x, y]: Vec2): Vec2 => [snapAkGrid(x), snapAkGrid(y)];
const MAGAZINE_INSERTION = MAGAZINE_WELL_HEIGHT - MAGAZINE_WELL_CLEARANCE;
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
const PISTOL_TRIGGER_GUARD_CENTER_X = -2;
const PISTOL_TRIGGER_GUARD_X_SCALE = 2;
const PISTOL_TRIGGER_GUARD_Z_SCALE = 0.5;
const triggerGuardX = (x: number): number =>
  PISTOL_TRIGGER_GUARD_CENTER_X + (x - PISTOL_TRIGGER_GUARD_CENTER_X) * PISTOL_TRIGGER_GUARD_X_SCALE;
const triggerGuardZ = (z: number): number => z * PISTOL_TRIGGER_GUARD_Z_SCALE;
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

    const solids =
      params.action === 'revolver'
        ? [
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
          ]
        : [solid('body', [-16, -2.5, -2], [0, 2.5, 2])];
    return {
      family: 'receiver',
      solids,
      ports,
      keepOuts,
      axes: [{ kind: 'bore', origin: [-16, 0, 0], dir: X }],
    };
  },
};

/** AK-style stamped receiver with a removable dust cover, gas-tube and rear-sight interfaces. */
export const akReceiver: PartFamily = {
  name: 'receiver',
  params: { action: choice('bolt'), feed: choice('box'), bore: size },
  build(params): PartDef {
    const bore = cls(params, 'bore');
    const base = receiver.build({ action: 'bolt', feed: 'box', bore, chargingHandle: 'side', rail: 'none' });
    return {
      ...base,
      solids: [
        solid('receiver-body', [-16, -2.5, -2], [0, 2.5, 2]),
        solid('dust-cover', [-13, 2.5, -1.75], [-1, 3, 1.75]),
      ],
      ports: [
        ...base.ports,
        { id: 'gas-tube', mount: 'gas-tube', gender: 'female', pos: [0, 2.5, 0], normal: X, up: Y, required: true },
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
  params: { layout: choice('conventional', 'bullpup', 'trigger', 'ak') },
  build(params): PartDef {
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
    // The magazine well at x, with the path a magazine takes into it.
    const well = (x: number) => ({
      port: {
        id: 'magazine',
        mount: 'magazine',
        gender: 'female',
        pos: [x, -1.5, 0],
        normal: NEG_Y,
        up: X,
        required: true,
      } satisfies PortDef,
      path: keepOut(
        'magazine-path',
        [x - MAGAZINE_WELL_DEPTH / 2, -40, -MAGAZINE_WELL_WIDTH / 2],
        [x + MAGAZINE_WELL_DEPTH / 2, -1.5 + MAGAZINE_WELL_HEIGHT, MAGAZINE_WELL_WIDTH / 2],
        'magazine',
      ),
    });
    const magazineWellFrame = (minX: number, maxX: number, centerX: number): Solid[] => {
      const x0 = centerX - MAGAZINE_WELL_DEPTH / 2;
      const x1 = centerX + MAGAZINE_WELL_DEPTH / 2;
      const z0 = MAGAZINE_WELL_WIDTH / 2;
      const outerZ = LOWER_HALF_WIDTH;
      const roofY = -1.5 + MAGAZINE_WELL_HEIGHT;
      return [
        solid('frame-rear', [minX, -1.5, -outerZ], [x0, 0, outerZ]),
        solid('frame-front', [x1, -1.5, -outerZ], [maxX, 0, outerZ]),
        solid('well-wall-left', [x0, -1.5, -outerZ], [x1, 0, -z0]),
        solid('well-wall-right', [x0, -1.5, z0], [x1, 0, outerZ]),
        solid('well-roof', [x0, roofY, -z0], [x1, 0, z0]),
      ];
    };
    // Conventional: the rear face meets the trigger-finger volume (it ends at
    // x = −7) without entering it. Bullpup: the front face stays at x = −3.5,
    // behind the grip, which leans back from x = 3.
    const conventionalWell = well(-7 + MAGAZINE_DEPTH / 2);
    const bullpupWell = well(-3.5 - MAGAZINE_DEPTH / 2);
    const trigger = (x: number) => keepOut('trigger-finger', [x, -5.5, -1], [x + 3, -1.5, 1]);

    switch (params.layout) {
      case 'bullpup':
        return {
          family: 'lower',
          solids: [
            ...magazineWellFrame(-16, 9, bullpupWell.port.pos[0]),
            solid('butt', [-18, -7, -1.75], [-16, 5, 1.75]),
          ],
          ports: [top, grip(3), bullpupWell.port],
          keepOuts: [trigger(5), bullpupWell.path],
          axes: [],
        };
      case 'ak':
        return {
          family: 'lower',
          solids: magazineWellFrame(
            -14,
            conventionalWell.port.pos[0] + MAGAZINE_WELL_DEPTH / 2 + MAGAZINE_WELL_CLEARANCE,
            conventionalWell.port.pos[0],
          ),
          ports: [top, grip(-12), conventionalWell.port],
          keepOuts: [
            trigger(-10),
            conventionalWell.path,
            keepOut(
              'magazine-rock-in-sweep',
              [conventionalWell.port.pos[0] - MAGAZINE_WELL_DEPTH / 2, -40, -MAGAZINE_WELL_WIDTH / 2],
              [
                conventionalWell.port.pos[0] + MAGAZINE_WELL_DEPTH / 2 + AK_MAGAZINE_ROCK_IN_SWEEP,
                -3,
                MAGAZINE_WELL_WIDTH / 2,
              ],
              'magazine',
            ),
          ],
          axes: [],
        };
      case 'trigger':
        return {
          family: 'lower',
          solids: [solid('frame', [-16, -1.5, -1.5], [-9, 0, 1.5])],
          ports: [top, grip(-14)],
          keepOuts: [trigger(-12.5)],
          axes: [],
        };
      default:
        return {
          family: 'lower',
          // Extend past the magazine's forward face to leave material around the well.
          solids: magazineWellFrame(
            -14,
            conventionalWell.port.pos[0] + MAGAZINE_WELL_DEPTH / 2 + MAGAZINE_WELL_CLEARANCE,
            conventionalWell.port.pos[0],
          ),
          ports: [top, grip(-12), conventionalWell.port],
          keepOuts: [trigger(-10), conventionalWell.path],
          axes: [],
        };
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
  },
  build(params): PartDef {
    const bore = cls(params, 'bore');
    const len = barrelLength(params);
    const r = PISTOL_BARREL_RADIUS[bore];
    const fore = FORE_LENGTH[cls(params, 'length')];
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

/** The AK gas tube follows a raised axis parallel to the bore between receiver and handguard. */
export const gasTube: PartFamily = {
  name: 'gas-tube',
  params: {},
  build(): PartDef {
    return {
      family: 'gas-tube',
      solids: [solid('tube', [0, -0.25, -0.5], [8, 0.25, 0.5])],
      ports: [
        { id: 'rear', mount: 'gas-tube', gender: 'male', pos: [0, 0, 0], normal: NEG_X, up: Y, required: true },
        { id: 'handguard', mount: 'gas-tube', gender: 'female', pos: [8, 0, 0], normal: X, up: Y, required: true },
      ],
      keepOuts: [],
      axes: [{ kind: 'gas-system', origin: [0, 0, 0], dir: X }],
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
  params: { chambers: choice('six', 'eight'), chamber: choice('aligned', 'misaligned') },
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

/** A tube of four slabs around the barrel, with a rail on top. */
export const handguard: PartFamily = {
  name: 'handguard',
  // When clamped, length follows the barrel so the clamp meets, unless set.
  params: {
    length: { ...size, from: [{ port: 'front', param: 'length' }] },
    inner: size,
    bore: { values: ['none', ...SIZE_CLASSES], default: 'none', from: [{ port: 'front', param: 'bore' }] },
  },
  build(params): PartDef {
    const len = FORE_LENGTH[cls(params, 'length')];
    const inner = { S: 0.75, M: 1.5, L: 2.5 }[cls(params, 'inner')];
    const outer = inner + 0.5;
    const clampRadius = params.bore === 'none' ? undefined : { S: 0.75, M: 1, L: 1.25 }[cls(params, 'bore')];
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
        solid('top', [0, inner, -outer], [len, outer, outer]),
        solid('bottom', [0, -outer, -outer], [len, -inner, outer]),
        solid('left', [0, -inner, -outer], [len, inner, -inner]),
        solid('right', [0, -inner, inner], [len, inner, outer]),
        ...clamp,
      ],
      ports: [
        { id: 'rear', mount: 'handguard', gender: 'male', pos: [0, 0, 0], normal: NEG_X, up: Y, required: true },
        { id: 'front', mount: 'clamp', gender: 'male', pos: [len, 0, 0], normal: X, up: Y },
        { id: 'gas-tube', mount: 'gas-tube', gender: 'male', pos: [8, 2.5, 0], normal: NEG_X, up: Y },
        {
          id: 'rail',
          mount: 'rail',
          gender: 'female',
          pos: [2, outer, 0],
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
  params: { length: { ...size, from: [{ port: 'cap', param: 'length' }] } },
  build(params): PartDef {
    const len = FORE_LENGTH[cls(params, 'length')];
    return {
      family: 'tube-magazine',
      solids: [solid('tube', [0, -1, -1], [len, 1, 1])],
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

const GRIP_ANGLE = 18; // degrees the grip leans back

export const grip: PartFamily = {
  name: 'grip',
  params: { length: size, well: choice('none', 'magazine') },
  build(params): PartDef {
    const len = { S: 8, M: 10, L: 12 }[cls(params, 'length')];
    const a = (GRIP_ANGLE * Math.PI) / 180;
    const magazineWell = params.well === 'magazine';
    const profile = magazineWell
      ? ([
          [-PISTOL_GRIP_HALF_X, -len],
          [PISTOL_GRIP_HALF_X, -len],
          [PISTOL_GRIP_HALF_X, 0],
          [1.25, Math.tan(a) * 1.25],
          [-1.5, -Math.tan(a) * 1.5],
        ] as const)
      : ([
          [-1.5, -len],
          [1.5, -len],
          [1.5, 0],
          [1.25, Math.tan(a) * 1.25],
          [-1.5, -Math.tan(a) * 1.5],
        ] as const);
    const roofY = -len + PISTOL_WELL_HEIGHT;
    const solids: Solid[] = magazineWell
      ? [
          extrudedPolygon(
            'body-upper',
            [
              [-PISTOL_GRIP_HALF_X, roofY],
              [PISTOL_GRIP_HALF_X, roofY],
              [PISTOL_GRIP_HALF_X, 0],
              [1.25, Math.tan(a) * 1.25],
              [-1.5, -Math.tan(a) * 1.5],
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
              [PISTOL_WELL_DEPTH / 2, roofY, PISTOL_WELL_WIDTH / 2],
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

const integratedPistolGrip = (gripLength: string): PartDef => {
  const angle = -(GRIP_ANGLE * Math.PI) / 180;
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
      profile.map(([x, y]) => {
        const [worldX, worldY] = rotateGripPoint([x, y, 0], angle, offset);
        return [snapGrid(worldX), snapGrid(worldY)] as const;
      }),
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
  },
  build(params): PartDef {
    const gripDef = integratedPistolGrip(params.gripLength!);
    const bore = cls(params, 'bore');
    const slideEnd = pistolSlideEnd(params.slideLength!);
    const channelHalfWidth = pistolSlideChannelHalfWidth(bore);
    const slideHalfWidth = pistolSlideHalfWidth(bore);
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
        solid(
          'trigger-guard-top',
          [triggerGuardX(-3), -1.75, triggerGuardZ(-1.25)],
          [triggerGuardX(-1), -1.5, triggerGuardZ(1.25)],
        ),
        solid(
          'trigger-guard-rear',
          [triggerGuardX(-3), -4, triggerGuardZ(-1.25)],
          [triggerGuardX(-2.75), -1.5, triggerGuardZ(1.25)],
        ),
        solid(
          'trigger-guard-front',
          [triggerGuardX(-1.25), -4, triggerGuardZ(-1.25)],
          [triggerGuardX(-1), -1.5, triggerGuardZ(1.25)],
        ),
        solid(
          'trigger-guard-bottom',
          [triggerGuardX(-3), -4, triggerGuardZ(-1.25)],
          [triggerGuardX(-1), -3.75, triggerGuardZ(1.25)],
        ),
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
        keepOut('trigger-finger', [-2.75, -3.75, -1], [-1.25, -1.75, 1]),
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

const akCurvedMagazineSolids = (length: SizeClass, depth: number, width: number, insertion: number): Solid[] => {
  const { top, middle, bottom, bendDegrees } = AK_MAGAZINE_SEGMENTS[length];
  const angle = (bendDegrees * Math.PI) / 180;
  const jointY = insertion - top;
  const bottomCenterX = middle * Math.sin(angle);
  const bottomCenterY = jointY - middle * Math.cos(angle);
  const bottomHalfDepth = snapAkGrid((depth - bottom * Math.sin(angle)) / Math.cos(angle)) / 2;
  const bottomLeft = snapAkPoint([
    bottomCenterX - bottomHalfDepth * Math.cos(angle),
    bottomCenterY - bottomHalfDepth * Math.sin(angle),
  ]);
  const bottomRight = snapAkPoint([
    bottomCenterX + bottomHalfDepth * Math.cos(angle),
    bottomCenterY + bottomHalfDepth * Math.sin(angle),
  ]);
  const endLeft = snapAkPoint([bottomLeft[0] + bottom * Math.sin(angle), bottomLeft[1] - bottom * Math.cos(angle)]);
  const endRight = snapAkPoint([bottomRight[0] + bottom * Math.sin(angle), bottomRight[1] - bottom * Math.cos(angle)]);
  return [
    solid('upper-body', [-depth / 2, jointY, -width / 2], [depth / 2, insertion, width / 2]),
    extrudedPolygon(
      'curve-middle',
      [bottomLeft, bottomRight, [depth / 2, jointY], [-depth / 2, jointY]],
      [-width / 2, width / 2],
    ),
    extrudedPolygon('curve-bottom', [endLeft, endRight, bottomRight, bottomLeft], [-width / 2, width / 2]),
  ];
};

export const magazine: PartFamily = {
  name: 'magazine',
  params: { length: size, profile: choice('standard', 'smg', 'pistol', 'ak-curved') },
  build(params): PartDef {
    const len = { S: 6, M: 10, L: 16 }[cls(params, 'length')];
    const depth =
      params.profile === 'pistol' ? PISTOL_MAGAZINE_DEPTH : MAGAZINE_DEPTH * (params.profile === 'smg' ? 0.6 : 1);
    const width =
      params.profile === 'pistol' ? PISTOL_MAGAZINE_WIDTH : MAGAZINE_WIDTH * (params.profile === 'smg' ? 0.8 : 1);
    const insertion = params.profile === 'pistol' ? PISTOL_MAGAZINE_INSERTION : MAGAZINE_INSERTION;
    const akCurved = params.profile === 'ak-curved';
    return {
      family: 'magazine',
      // The AK's top insert is straight; its trapezoid and tilted base share exact joint faces.
      solids: akCurved
        ? akCurvedMagazineSolids(cls(params, 'length'), depth, width, insertion)
        : [solid('body', [-depth / 2, -len + insertion, -width / 2], [depth / 2, insertion, width / 2])],
      ports: [{ id: 'top', mount: 'magazine', gender: 'male', pos: [0, 0, 0], normal: Y, up: X, required: true }],
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
  'gas-tube': gasTube,
  'ak-rear-sight': akRearSight,
  handguard,
  'tube-magazine': tubeMagazine,
  forend,
  grip,
  magazine,
  stock,
  sight,
};
