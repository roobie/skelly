import { finite, type InferOutput, maxValue, minValue, number, pipe, strictObject } from 'valibot';

export const OpticApertureSchema = strictObject({
  aspectRatio: pipe(number(), finite(), minValue(0.1), maxValue(10)),
  exponent: pipe(number(), finite(), minValue(2), maxValue(16)),
});
export type OpticAperture = InferOutput<typeof OpticApertureSchema>;

/** Superellipse norm: the same profile controls the lens clip and its surrounding rim. */
export const opticApertureDistance = (x: number, y: number, aperture: OpticAperture): number =>
  (Math.abs(x / aperture.aspectRatio) ** aperture.exponent + Math.abs(y) ** aperture.exponent) **
  (1 / aperture.exponent);
