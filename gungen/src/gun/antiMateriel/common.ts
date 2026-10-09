// Shared helpers for the anti-materiel families (muzzle brake, barrel shroud, bipod, carry handle, recoil
// stock, monopod). They import only from core: parts.ts registers these families, so importing parts.ts
// from here would make a cycle. Numbers are in u and sit on the 0.25u grid unless a comment says otherwise.

import { SIZE_CLASSES, type SizeClass } from '@skelly/engine/core/conventions.ts';
import { boxFromMinMax } from '@skelly/engine/core/geometry.ts';
import type { Vec3 } from '@skelly/engine/core/math.ts';
import type { BoxSolid, ParamSpec, Solid, SolidDisplayHints, SolidFinish, Vec2 } from '@skelly/engine/core/schema.ts';

export const X: Vec3 = [1, 0, 0];
export const NEG_X: Vec3 = [-1, 0, 0];
export const Y: Vec3 = [0, 1, 0];
export const NEG_Y: Vec3 = [0, -1, 0];
export const Z: Vec3 = [0, 0, 1];
export const NEG_Z: Vec3 = [0, 0, -1];

export const sizeParam: ParamSpec = { values: SIZE_CLASSES, default: 'M' };
export const choice = (...values: string[]): ParamSpec => ({ values, default: values[0]! });
export const cls = (params: Readonly<Record<string, string>>, name: string): SizeClass => params[name] as SizeClass;

export const box = (
  id: string,
  min: Vec3,
  max: Vec3,
  extra: SolidFinish & { readonly display?: SolidDisplayHints } = {},
): BoxSolid => ({
  id,
  kind: 'box',
  box: boxFromMinMax(min, max),
  ...extra,
});

/** Regular octagon (flat-to-flat half-width `flatRadius`) extruded along X; the barrel's own section. */
export const octagonPrism = (id: string, flatRadius: number, along: readonly [number, number]): Solid => {
  const corner = flatRadius * (Math.SQRT2 - 1);
  const profile: readonly Vec2[] = [
    [flatRadius, corner],
    [corner, flatRadius],
    [-corner, flatRadius],
    [-flatRadius, corner],
    [-flatRadius, -corner],
    [-corner, -flatRadius],
    [corner, -flatRadius],
    [flatRadius, -corner],
  ];
  return { id, kind: 'extruded-polygon', profile, axis: 'x', z: along };
};

/** Solid black rubber, shared by recoil pads and the dark perforation panels. */
export const RUBBER: SolidFinish = { material: 'rubber-black', slot: 'accent' };
