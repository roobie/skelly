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

import { SIZE_CLASSES, type SizeClass } from '../core/conventions.ts';
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
const REVOLVER_CYLINDER_RADIUS = 3;
const REVOLVER_CYLINDER_LENGTH = 8;
const REVOLVER_CYLINDER_CENTER_X = -4.25;

// ---- receiver ----

export const receiver: PartFamily = {
  name: 'receiver',
  params: {
    /** auto: charging handle. bolt: bolt travel/handle. pump: forend-driven. slide: pistol slide. revolver: cylinder frame. */
    action: choice('auto', 'bolt', 'pump', 'slide', 'revolver'),
    /** box: magazine through the lower. top: loaded from above. tube: tube magazine. cylinder: revolver. */
    feed: choice('box', 'top', 'tube', 'cylinder'),
    bore: size,
  },
  build(params): PartDef {
    const bore = cls(params, 'bore');
    const ports: PortDef[] = [
      { id: 'barrel', mount: 'barrel', gender: 'female', size: bore, pos: [0, 0, 0], normal: X, up: Y, required: true },
      { id: 'handguard', mount: 'handguard', gender: 'female', pos: [0, 0, 0], normal: X, up: Y },
      {
        id: 'rail',
        mount: 'rail',
        gender: 'female',
        pos: [-14, 2.5, 0],
        normal: Y,
        up: X,
        slots: { count: 7, pitch: 2 },
      },
      { id: 'lower', mount: 'lower', gender: 'female', pos: [0, -2.5, 0], normal: NEG_Y, up: X, required: true },
      { id: 'stock', mount: 'stock', gender: 'female', pos: [-16, 0, 0], normal: NEG_X, up: Y },
    ];
    const keepOuts: KeepOut[] = params.action === 'revolver' ? [] : [keepOut('ejection', [-9, -1, 2], [-5, 2, 10])];

    switch (params.action) {
      case 'auto':
        keepOuts.push(keepOut('charging-handle', [-12, 0, -4], [-4, 2, -2]));
        break;
      case 'slide':
        keepOuts.push(keepOut('slide-travel', [-24, 2.5, -1.5], [-8, 4.5, 1.5]));
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
  params: { layout: choice('conventional', 'bullpup', 'trigger', 'pistol') },
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
      case 'trigger':
        return {
          family: 'lower',
          solids: [solid('frame', [-16, -1.5, -1.5], [-9, 0, 1.5])],
          ports: [top, grip(-14)],
          keepOuts: [trigger(-12.5)],
          axes: [],
        };
      case 'pistol':
        return {
          family: 'lower',
          solids: [
            solid('frame', [-16, -1.5, -1.5], [0, 0, 1.5]),
            solid('trigger-guard-top', [-5, -1.75, -1.25], [-1, -1.5, 1.25]),
            solid('trigger-guard-rear', [-5, -3.5, -1.25], [-4.75, -1.5, 1.25]),
            solid('trigger-guard-front', [-1.25, -3.5, -1.25], [-1, -1.5, 1.25]),
            solid('trigger-guard-bottom', [-5, -3.5, -1.25], [-1, -3.25, 1.25]),
          ],
          ports: [top, grip(-8)],
          keepOuts: [],
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
    const len =
      params.profile === 'pistol'
        ? 8
        : params.profile === 'revolver'
          ? { S: 12, M: 16, L: 20 }[cls(params, 'length')]
          : { S: 26, M: 36, L: 46 }[cls(params, 'length')];
    const r = { S: 0.75, M: 1, L: 1.25 }[bore];
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
        ...(params.profile === 'revolver'
          ? [{ id: 'cylinder', mount: 'cylinder', gender: 'female' as const, size: bore, pos: [REVOLVER_CYLINDER_CENTER_X, 0, 0] as Vec3, normal: NEG_X, up: Y }]
          : []),
        { id: 'clamp', mount: 'clamp', gender: 'female', pos: [fore, 0, 0], normal: NEG_X, up: Y },
        { id: 'lug', mount: 'lug', gender: 'female', pos: [fore, -TUBE_DROP, 0], normal: NEG_X, up: Y },
      ],
      keepOuts: [keepOut('muzzle', [len, -1.5, -1.5], [len + 30, 1.5, 1.5])],
      axes: [{ kind: 'bore', origin: [0, 0, 0], dir: X }],
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
        { id: 'barrel', mount: 'cylinder', gender: 'male', pos: [0, REVOLVER_CYLINDER_RADIUS, 0], normal: [0, 0, 1], up: Y, required: true },
      ],
      keepOuts: [],
      axes: [
        {
          kind: 'bore',
          origin: [REVOLVER_CYLINDER_RADIUS * Math.cos(chamberAngle), REVOLVER_CYLINDER_RADIUS * Math.sin(chamberAngle), 0],
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
  params: { length: { ...size, from: [{ port: 'front', param: 'length' }] }, inner: size },
  build(params): PartDef {
    const len = FORE_LENGTH[cls(params, 'length')];
    const inner = { S: 0.75, M: 1.5, L: 2.5 }[cls(params, 'inner')];
    const outer = inner + 0.5;
    return {
      family: 'handguard',
      solids: [
        solid('top', [0, inner, -outer], [len, outer, outer]),
        solid('bottom', [0, -outer, -outer], [len, -inner, outer]),
        solid('left', [0, -inner, -outer], [len, inner, -inner]),
        solid('right', [0, -inner, inner], [len, inner, outer]),
      ],
      ports: [
        { id: 'rear', mount: 'handguard', gender: 'male', pos: [0, 0, 0], normal: NEG_X, up: Y, required: true },
        { id: 'front', mount: 'clamp', gender: 'male', pos: [len, 0, 0], normal: X, up: Y },
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
      ? [
          [-PISTOL_GRIP_HALF_X, -len],
          [PISTOL_GRIP_HALF_X, -len],
          [PISTOL_GRIP_HALF_X, 0],
          [1.25, Math.tan(a) * 1.25],
          [-1.5, -Math.tan(a) * 1.5],
        ] as const
      : [
          [-1.5, -len],
          [1.5, -len],
          [1.5, 0],
          [1.25, Math.tan(a) * 1.25],
          [-1.5, -Math.tan(a) * 1.5],
        ] as const;
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
          solid('well-wall-left', [-PISTOL_GRIP_HALF_X, -len, -PISTOL_GRIP_HALF_Z], [-PISTOL_WELL_DEPTH / 2, roofY, PISTOL_GRIP_HALF_Z]),
          solid('well-wall-right', [PISTOL_WELL_DEPTH / 2, -len, -PISTOL_GRIP_HALF_Z], [PISTOL_GRIP_HALF_X, roofY, PISTOL_GRIP_HALF_Z]),
          solid('well-wall-near', [-PISTOL_WELL_DEPTH / 2, -len, -PISTOL_GRIP_HALF_Z], [PISTOL_WELL_DEPTH / 2, roofY, -PISTOL_WELL_WIDTH / 2]),
          solid('well-wall-far', [-PISTOL_WELL_DEPTH / 2, -len, PISTOL_WELL_WIDTH / 2], [PISTOL_WELL_DEPTH / 2, roofY, PISTOL_GRIP_HALF_Z]),
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
      ports.push({ id: 'magazine', mount: 'magazine', gender: 'female', pos: [0, -len, 0], normal: NEG_Y, up: X, required: true });
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

export const magazine: PartFamily = {
  name: 'magazine',
  params: { length: size, profile: choice('standard', 'smg', 'pistol') },
  build(params): PartDef {
    const len = { S: 6, M: 10, L: 16 }[cls(params, 'length')];
    const depth =
      params.profile === 'pistol' ? PISTOL_MAGAZINE_DEPTH : MAGAZINE_DEPTH * (params.profile === 'smg' ? 0.6 : 1);
    const width =
      params.profile === 'pistol' ? PISTOL_MAGAZINE_WIDTH : MAGAZINE_WIDTH * (params.profile === 'smg' ? 0.8 : 1);
    const insertion = params.profile === 'pistol' ? PISTOL_MAGAZINE_INSERTION : MAGAZINE_INSERTION;
    return {
      family: 'magazine',
      // The lower or pistol grip owns the corresponding magazine well and insertion path.
      solids: [
        solid(
          'body',
          [-depth / 2, -len + insertion, -width / 2],
          [depth / 2, insertion, width / 2],
        ),
      ],
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
  params: { length: size, style: choice('straight', 'sporting') },
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
  lower,
  barrel,
  cylinder,
  handguard,
  'tube-magazine': tubeMagazine,
  forend,
  grip,
  magazine,
  stock,
  sight,
};
