// Part library: parametric families built from boxes. All numbers are in u
// (see conventions.ts) and set proportions, not real-world dimensions
// (PROJECT.md, non-goals).
//
// The receiver is only the action body: it carries the bore line and its
// action's keep-out volumes. Layout (where the grip and magazine go) lives in
// the lower that hangs under it, so layouts are data: pick a lower.
//
// Mount types (receivers and lowers carry the female side):
//   barrel     receiver front ↔ barrel rear (sized by bore)
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
import type { KeepOut, ParamSpec, PartDef, PartFamily, PortDef, Solid } from '../core/schema.ts';

const size: ParamSpec = { values: SIZE_CLASSES, default: 'M' };
const choice = (...values: string[]): ParamSpec => ({ values, default: values[0]! });
const cls = (params: Readonly<Record<string, string>>, name: string): SizeClass =>
  params[name] as SizeClass;

const X: Vec3 = [1, 0, 0];
const NEG_X: Vec3 = [-1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const NEG_Y: Vec3 = [0, -1, 0];

const solid = (id: string, min: Vec3, max: Vec3): Solid => ({ id, box: boxFromMinMax(min, max) });
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

// ---- receiver ----

export const receiver: PartFamily = {
  name: 'receiver',
  params: {
    /** auto: charging handle. bolt: bolt handle and bolt travel. pump: forend-driven. */
    action: choice('auto', 'bolt', 'pump'),
    /** box: magazine through the lower. top: loaded from above. tube: tube magazine. */
    feed: choice('box', 'top', 'tube'),
    bore: size,
  },
  build(params): PartDef {
    const bore = cls(params, 'bore');
    const ports: PortDef[] = [
      { id: 'barrel', mount: 'barrel', gender: 'female', size: bore, pos: [0, 0, 0], normal: X, up: Y, required: true },
      { id: 'handguard', mount: 'handguard', gender: 'female', pos: [0, 0, 0], normal: X, up: Y },
      { id: 'rail', mount: 'rail', gender: 'female', pos: [-14, 2.5, 0], normal: Y, up: X, slots: { count: 7, pitch: 2 } },
      { id: 'lower', mount: 'lower', gender: 'female', pos: [0, -2.5, 0], normal: NEG_Y, up: X, required: true },
      { id: 'stock', mount: 'stock', gender: 'female', pos: [-16, 0, 0], normal: NEG_X, up: Y },
    ];
    const keepOuts: KeepOut[] = [keepOut('ejection', [-9, -1, 2], [-5, 2, 10])];

    switch (params.action) {
      case 'auto':
        keepOuts.push(keepOut('charging-handle', [-12, 0, -4], [-4, 2, -2]));
        break;
      case 'bolt':
        // The bolt slides out of the back of the receiver; its handle lifts
        // and travels back along the right side.
        keepOuts.push(
          keepOut('bolt-travel', [-26, -1.5, -1.5], [-16, 1.5, 1.5]),
          keepOut('bolt-handle', [-24, -1, 2], [-12, 3, 6]),
        );
        break;
    }

    switch (params.feed) {
      case 'top':
        keepOuts.push(keepOut('loading-port', [-9, 2.5, -1.5], [-4, 9, 1.5]));
        break;
      case 'tube':
        ports.push({ id: 'tube', mount: 'tube', gender: 'female', pos: [0, -TUBE_DROP, 0], normal: X, up: Y, required: true });
        keepOuts.push(keepOut('loading-port', [-7, -6, -1.5], [-2, -2.5, 1.5]));
        break;
    }

    return {
      family: 'receiver',
      solids: [solid('body', [-16, -2.5, -2], [0, 2.5, 2])],
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
 *   trigger       trigger only, for tube-fed or top-loaded designs
 */
export const lower: PartFamily = {
  name: 'lower',
  params: { layout: choice('conventional', 'bullpup', 'trigger') },
  build(params): PartDef {
    const top: PortDef = { id: 'top', mount: 'lower', gender: 'male', pos: [0, 0, 0], normal: Y, up: X, required: true };
    const grip = (x: number): PortDef => ({ id: 'grip', mount: 'grip', gender: 'female', pos: [x, -1.5, 0], normal: NEG_Y, up: X });
    const magazine: PortDef = { id: 'magazine', mount: 'magazine', gender: 'female', pos: [-5, -1.5, 0], normal: NEG_Y, up: X, required: true };
    const magazinePath = keepOut('magazine-path', [-6.5, -40, -1], [-3.5, -1.5, 1], 'magazine');
    const trigger = (x: number) => keepOut('trigger-finger', [x, -5.5, -1], [x + 3, -1.5, 1]);

    switch (params.layout) {
      case 'bullpup':
        return {
          family: 'lower',
          solids: [
            solid('frame', [-16, -1.5, -1.5], [9, 0, 1.5]),
            solid('butt', [-18, -7, -1.75], [-16, 5, 1.75]),
          ],
          ports: [top, grip(3), magazine],
          keepOuts: [trigger(5), magazinePath],
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
          solids: [solid('frame', [-14, -1.5, -1.5], [-2, 0, 1.5])],
          ports: [top, grip(-12), magazine],
          keepOuts: [trigger(-10), magazinePath],
          axes: [],
        };
    }
  },
};

// ---- along the barrel ----

export const barrel: PartFamily = {
  name: 'barrel',
  // Bore follows the receiver it's mounted in, unless set.
  params: { bore: { ...size, from: [{ port: 'rear', param: 'bore' }] }, length: size },
  build(params): PartDef {
    const bore = cls(params, 'bore');
    const len = { S: 26, M: 36, L: 46 }[cls(params, 'length')];
    const r = { S: 0.75, M: 1, L: 1.25 }[bore];
    const fore = FORE_LENGTH[cls(params, 'length')];
    return {
      family: 'barrel',
      solids: [solid('tube', [0, -r, -r], [len, r, r])],
      ports: [
        { id: 'rear', mount: 'barrel', gender: 'male', size: bore, pos: [0, 0, 0], normal: NEG_X, up: Y, required: true },
        { id: 'clamp', mount: 'clamp', gender: 'female', pos: [fore, 0, 0], normal: NEG_X, up: Y },
        { id: 'lug', mount: 'lug', gender: 'female', pos: [fore, -TUBE_DROP, 0], normal: NEG_X, up: Y },
      ],
      keepOuts: [keepOut('muzzle', [len, -1.5, -1.5], [len + 30, 1.5, 1.5])],
      axes: [{ kind: 'bore', origin: [0, 0, 0], dir: X }],
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
        { id: 'rail', mount: 'rail', gender: 'female', pos: [2, outer, 0], normal: Y, up: X, slots: { count: (len - 4) / 2 + 1, pitch: 2 } },
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
  params: { length: size },
  build(params): PartDef {
    const len = { S: 8, M: 10, L: 12 }[cls(params, 'length')];
    const a = (GRIP_ANGLE * Math.PI) / 180;
    return {
      family: 'grip',
      // Authored upright; the tilted port makes it lean back once mounted.
      solids: [solid('body', [-1.5, -len, -1.25], [1.5, 0, 1.25])],
      ports: [
        {
          id: 'top',
          mount: 'grip',
          gender: 'male',
          pos: [0, 0, 0],
          normal: [-Math.sin(a), Math.cos(a), 0],
          up: [Math.cos(a), Math.sin(a), 0],
          required: true,
        },
      ],
      keepOuts: [],
      axes: [],
      tags: [FIRING_GRIP],
    };
  },
};

export const magazine: PartFamily = {
  name: 'magazine',
  params: { length: size },
  build(params): PartDef {
    const len = { S: 6, M: 10, L: 16 }[cls(params, 'length')];
    return {
      family: 'magazine',
      solids: [solid('body', [-1.5, -len, -1], [1.5, 0, 1])],
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
    const port: PortDef = { id: 'front', mount: 'stock', gender: 'male', pos: [0, 0, 0], normal: X, up: Y, required: true };
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
      solids: [
        solid('comb', [-len, -1, -1.5], [0, 2.5, 1.5]),
        solid('butt', [-len - 1, -8, -1.75], [-len, 3, 1.75]),
      ],
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
      keepOuts: [
        { id: 'sightline', kind: 'sightline', box: boxFromMinMax([2, 0.25, -0.75], [42, 1.75, 0.75]) },
      ],
      axes: [{ kind: 'sight', origin: [0, 1, 0], dir: X }],
    };
  },
};

export const FAMILIES: Readonly<Record<string, PartFamily>> = {
  receiver,
  lower,
  barrel,
  handguard,
  'tube-magazine': tubeMagazine,
  forend,
  grip,
  magazine,
  stock,
  sight,
};
