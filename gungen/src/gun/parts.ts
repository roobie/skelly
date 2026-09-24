// Milestone 1 part library: enough parametric families for one rifle-like
// archetype. Shapes are boxes only. All numbers are in u (see conventions.ts)
// and set proportions, not real-world dimensions (PROJECT.md, non-goals).
//
// Mount types:
//   barrel     receiver front ↔ barrel rear (sized by bore)
//   handguard  receiver front ↔ handguard rear
//   clamp      barrel ↔ handguard front (optional: handguards may float free)
//   rail       receiver top rail (slotted) ↔ sight
//   grip       receiver bottom ↔ grip
//   magazine   receiver bottom ↔ magazine (sized by bore)
//   stock      receiver rear ↔ stock
// Receivers carry the female side; attached parts carry the male side.

import { SIZE_CLASSES, type SizeClass } from '../core/conventions.ts';
import { boxFromMinMax } from '../core/geometry.ts';
import type { Vec3 } from '../core/math.ts';
import type { PartDef, PartFamily, ParamSpec } from '../core/schema.ts';

const size: ParamSpec = { values: SIZE_CLASSES, default: 'M' };
const cls = (params: Readonly<Record<string, string>>, name: string): SizeClass =>
  params[name] as SizeClass;

const X: Vec3 = [1, 0, 0];
const NEG_X: Vec3 = [-1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const NEG_Y: Vec3 = [0, -1, 0];

const solid = (id: string, min: Vec3, max: Vec3) => ({ id, box: boxFromMinMax(min, max) });

// Barrel and handguard lengths are paired: a barrel's clamp sits where a
// handguard of the same length class ends.
const HANDGUARD_LENGTH: Record<SizeClass, number> = { S: 16, M: 24, L: 32 };

export const receiver: PartFamily = {
  name: 'receiver',
  params: { bore: size },
  build(params): PartDef {
    const bore = cls(params, 'bore');
    return {
      family: 'receiver',
      solids: [solid('body', [-16, -2.5, -2], [0, 2.5, 2])],
      ports: [
        { id: 'barrel', mount: 'barrel', gender: 'female', size: bore, pos: [0, 0, 0], normal: X, up: Y, required: true },
        { id: 'handguard', mount: 'handguard', gender: 'female', pos: [0, 0, 0], normal: X, up: Y },
        { id: 'rail', mount: 'rail', gender: 'female', pos: [-14, 2.5, 0], normal: Y, up: X, slots: { count: 7, pitch: 2 } },
        { id: 'magazine', mount: 'magazine', gender: 'female', size: bore, pos: [-5, -2.5, 0], normal: NEG_Y, up: X, required: true },
        { id: 'grip', mount: 'grip', gender: 'female', pos: [-12, -2.5, 0], normal: NEG_Y, up: X, required: true },
        { id: 'stock', mount: 'stock', gender: 'female', pos: [-16, 0, 0], normal: NEG_X, up: Y },
      ],
      keepOuts: [
        { id: 'ejection', kind: 'ejection', box: boxFromMinMax([-9, -1, 2], [-5, 2, 10]) },
        { id: 'trigger', kind: 'trigger-finger', box: boxFromMinMax([-10, -6, -1], [-7, -2.5, 1]) },
        { id: 'magazine-path', kind: 'magazine-path', box: boxFromMinMax([-6.5, -40, -1], [-3.5, -2.5, 1]), allowPort: 'magazine' },
        { id: 'charging-handle', kind: 'charging-handle', box: boxFromMinMax([-12, 0, -4], [-4, 2, -2]) },
      ],
      axes: [{ kind: 'bore', origin: [-16, 0, 0], dir: X }],
    };
  },
};

export const barrel: PartFamily = {
  name: 'barrel',
  params: { bore: size, length: size },
  build(params): PartDef {
    const bore = cls(params, 'bore');
    const len = { S: 26, M: 36, L: 46 }[cls(params, 'length')];
    const r = { S: 0.75, M: 1, L: 1.25 }[bore];
    const clamp = HANDGUARD_LENGTH[cls(params, 'length')];
    return {
      family: 'barrel',
      solids: [solid('tube', [0, -r, -r], [len, r, r])],
      ports: [
        { id: 'rear', mount: 'barrel', gender: 'male', size: bore, pos: [0, 0, 0], normal: NEG_X, up: Y, required: true },
        { id: 'clamp', mount: 'clamp', gender: 'female', pos: [clamp, 0, 0], normal: NEG_X, up: Y },
      ],
      keepOuts: [
        { id: 'muzzle', kind: 'muzzle', box: boxFromMinMax([len, -1.5, -1.5], [len + 30, 1.5, 1.5]) },
      ],
      axes: [{ kind: 'bore', origin: [0, 0, 0], dir: X }],
    };
  },
};

/** A tube of four slabs around the barrel. */
export const handguard: PartFamily = {
  name: 'handguard',
  params: { length: size, inner: size },
  build(params): PartDef {
    const len = HANDGUARD_LENGTH[cls(params, 'length')];
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
      ],
      keepOuts: [],
      axes: [],
    };
  },
};

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
    };
  },
};

export const magazine: PartFamily = {
  name: 'magazine',
  params: { bore: size, length: size },
  build(params): PartDef {
    const len = { S: 6, M: 10, L: 16 }[cls(params, 'length')];
    return {
      family: 'magazine',
      solids: [solid('body', [-1.5, -len, -1], [1.5, 0, 1])],
      ports: [
        { id: 'top', mount: 'magazine', gender: 'male', size: cls(params, 'bore'), pos: [0, 0, 0], normal: Y, up: X, required: true },
      ],
      keepOuts: [],
      axes: [],
    };
  },
};

export const stock: PartFamily = {
  name: 'stock',
  params: { length: size },
  build(params): PartDef {
    const len = { S: 10, M: 16, L: 22 }[cls(params, 'length')];
    return {
      family: 'stock',
      solids: [
        solid('comb', [-len, -1, -1.5], [0, 2.5, 1.5]),
        solid('butt', [-len - 1, -8, -1.75], [-len, 3, 1.75]),
      ],
      ports: [
        { id: 'front', mount: 'stock', gender: 'male', pos: [0, 0, 0], normal: X, up: Y, required: true },
      ],
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
      ports: [
        { id: 'base', mount: 'rail', gender: 'male', pos: [0, 0, 0], normal: NEG_Y, up: X, required: true },
      ],
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
  barrel,
  handguard,
  grip,
  magazine,
  stock,
  sight,
};
