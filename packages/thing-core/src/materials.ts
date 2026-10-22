import {
  finite,
  type InferOutput,
  maxValue,
  minValue,
  nonEmpty,
  number,
  optional,
  parse,
  pipe,
  record,
  strictObject,
  string,
  tuple,
} from 'valibot';
import content from './materials.json' with { type: 'json' };

const Fraction = pipe(number(), finite(), minValue(0), maxValue(1));
export const MaterialSchema = strictObject({
  colour: tuple([Fraction, Fraction, Fraction]),
  /** `opacity` below 1 is see-through, such as glazing; omitted is opaque. */
  finish: strictObject({ metallic: Fraction, roughness: Fraction, opacity: optional(Fraction) }),
});

export const MATERIALS = parse(record(string(), MaterialSchema), content);
export type MaterialDef = InferOutput<typeof MaterialSchema>;
export const MaterialReferenceSchema = strictObject({
  materialId: pipe(string(), nonEmpty()),
  colourMultiplier: tuple([Fraction, Fraction, Fraction]),
});
