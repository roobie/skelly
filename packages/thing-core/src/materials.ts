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
const Colour = tuple([Fraction, Fraction, Fraction]);
export const MaterialSchema = strictObject({
  colour: Colour,
  finish: strictObject({
    metallic: Fraction,
    roughness: Fraction,
    /** Below 1 is see-through, such as glazing; omitted is opaque. */
    opacity: optional(Fraction),
    /** A tint the surface reflects at grazing angles, such as a coated lens; omitted reflects untinted. */
    sheen: optional(strictObject({ colour: Colour, roughness: Fraction })),
  }),
});

export const MATERIALS = parse(record(string(), MaterialSchema), content);
export type MaterialDef = InferOutput<typeof MaterialSchema>;
export const MaterialReferenceSchema = strictObject({
  materialId: pipe(string(), nonEmpty()),
  colourMultiplier: tuple([Fraction, Fraction, Fraction]),
});
