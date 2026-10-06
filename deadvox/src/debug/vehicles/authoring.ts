/** Helpers for authoring a vehicle's part types and fittings in vehicle voxels. */
import { type Fitting, type PartLayer, type PartNoise, type PartType, VOXELS_PER_CELL } from './model.ts';
import { type Axis, opsMinimum, type ShapeOp, translateOp, type Vec3i } from './voxels.ts';

export type Point = readonly [number, number];
export type Circle = readonly [u: number, v: number, radius: number, inner?: number];
interface Look {
  readonly mat: string;
  readonly paint?: true;
  readonly sectors?: { readonly count: number; readonly duty: number };
}

export const box = (from: Vec3i, to: Vec3i, mat: string): ShapeOp => ({ op: 'box', from, to, mat });
export const paintBox = (from: Vec3i, to: Vec3i, mat: string): ShapeOp => ({
  op: 'box',
  from,
  to,
  mat,
  paint: true,
});
export const prism = (axis: Axis, profile: readonly Point[], [from, to]: Point, mat: string): ShapeOp => ({
  op: 'prism',
  axis,
  profile,
  from,
  to,
  mat,
});
export const disc = (axis: Axis, [u, v, radius, inner]: Circle, [from, to]: Point, look: string | Look): ShapeOp => ({
  op: 'cylinder',
  axis,
  center: [u, v],
  radius,
  from,
  to,
  ...(inner === undefined ? {} : { inner }),
  ...(typeof look === 'string' ? { mat: look } : look),
});

export interface PartMeta {
  readonly id: string;
  readonly label: string;
  readonly layer: PartLayer;
  readonly massKg: number;
  readonly panel?: Axis;
  /** In vehicle voxels, like the shape. */
  readonly pivot?: Vec3i;
  readonly noise?: PartNoise;
}
export const meta = (id: string, label: string, layer: PartLayer, massKg: number): PartMeta => ({
  id,
  label,
  layer,
  massKg,
});

export interface Authored {
  readonly type: PartType;
  readonly at: Vec3i;
}

/** A part drawn in vehicle voxels; its type holds the shape relative to the lattice cell it starts in. */
export const authored = ({ pivot, ...rest }: PartMeta, shape: readonly ShapeOp[]): Authored => {
  const [x, y, z] = opsMinimum(shape).map((v) => Math.floor(v / VOXELS_PER_CELL) * VOXELS_PER_CELL) as [
    number,
    number,
    number,
  ];
  const at: Vec3i = [x, y, z];
  const type: PartType = {
    ...rest,
    shape: shape.map((op) => translateOp(op, at)),
    ...(pivot ? { pivot: [pivot[0] - x, pivot[1] - y, pivot[2] - z] as const } : {}),
  };
  return { type, at };
};

/** A part drawn in its own frame, placed by each fitting. */
export const local = (type: PartType): Authored => ({ type, at: [0, 0, 0] });

type PlaceExtra = Pick<Fitting, 'motion' | 'optional'> & { readonly at?: Vec3i };

export const place = (id: string, part: Authored, supportedBy: readonly string[], extra: PlaceExtra = {}): Fitting => {
  const { at, ...rest } = extra;
  return { id, type: part.type.id, at: at ?? part.at, supportedBy, ...rest };
};

const NEAR_SUFFIX = /-near$/;

/** A near-side fitting and its mirrored far-side twin; `-near` in support ids becomes `-far` for the twin. */
export const pair = (id: string, part: Authored, supportedBy: readonly string[], extra: PlaceExtra = {}): Fitting[] => {
  const near = place(`${id}-near`, part, supportedBy, extra);
  return [
    near,
    { ...near, id: `${id}-far`, mirror: true, supportedBy: supportedBy.map((s) => s.replace(NEAR_SUFFIX, '-far')) },
  ];
};

/** The part types a vehicle's fittings use, keyed by id. */
export const partsOf = (parts: readonly Authored[]): Readonly<Record<string, PartType>> =>
  Object.fromEntries(parts.map(({ type }) => [type.id, type]));
