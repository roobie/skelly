import {
  finite,
  type InferOutput,
  maxValue,
  minValue,
  nonEmpty,
  number,
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
  finish: strictObject({ metallic: Fraction, roughness: Fraction }),
  densityKgPerM3: pipe(number(), finite(), minValue(Number.MIN_VALUE)),
  source: string(),
});

export const MATERIALS = parse(record(string(), MaterialSchema), content);
export type MaterialDef = InferOutput<typeof MaterialSchema>;
export const MaterialReferenceSchema = strictObject({
  materialId: pipe(string(), nonEmpty()),
  colourMultiplier: tuple([Fraction, Fraction, Fraction]),
});
