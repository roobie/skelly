import {
  array,
  check,
  finite,
  type InferOutput,
  literal,
  maxLength,
  maxValue,
  minLength,
  minValue,
  number,
  picklist,
  pipe,
  strictObject,
  tuple,
  variant,
} from 'valibot';

export const MAX_RETICLE_PRIMITIVES = 64;
const Scalar = pipe(number(), finite());
const Positive = pipe(Scalar, minValue(0.0001), maxValue(1));
const Point = tuple([Scalar, Scalar]);
const Channel = pipe(Scalar, minValue(0), maxValue(1));
const Color = tuple([Channel, Channel, Channel]);
const inside = (point: readonly number[], margin: number): boolean => Math.hypot(...point) + margin <= 1;
const Primitive = variant('kind', [
  pipe(
    strictObject({ kind: literal('dot'), center: Point, radius: Positive, color: Color }),
    check((p) => inside(p.center, p.radius), 'dot must fit inside lens'),
  ),
  pipe(
    strictObject({ kind: literal('ring'), center: Point, radius: Positive, width: Positive, color: Color }),
    check((p) => inside(p.center, p.radius + p.width / 2), 'ring must fit inside lens'),
  ),
  pipe(
    strictObject({ kind: literal('line'), from: Point, to: Point, width: Positive, color: Color }),
    check(
      (p) =>
        inside(p.from, p.width / 2) &&
        inside(p.to, p.width / 2) &&
        Math.hypot(p.to[0] - p.from[0], p.to[1] - p.from[1]) > 0,
      'line must be nonzero and fit inside lens',
    ),
  ),
]);

export const ReticleSchema = strictObject({
  focalPlane: picklist(['first', 'second']),
  referenceMagnification: pipe(Scalar, minValue(1)),
  primitives: pipe(array(Primitive), minLength(1), maxLength(MAX_RETICLE_PRIMITIVES)),
});
export type Reticle = InferOutput<typeof ReticleSchema>;
export const reticleScale = (reticle: Reticle, magnification: number): number =>
  reticle.focalPlane === 'first' ? magnification / reticle.referenceMagnification : 1;
