import { finite, maxValue, minValue, number, parse, pipe, record, strictObject, string, tuple } from 'valibot';
import content from './materials.json' with { type: 'json' };

const Fraction = pipe(number(), finite(), minValue(0), maxValue(1));
export const MaterialSchema = strictObject({
  colour: tuple([Fraction, Fraction, Fraction]),
  finish: strictObject({ metallic: Fraction, roughness: Fraction }),
  densityKgPerM3: pipe(number(), finite(), minValue(Number.MIN_VALUE)),
  source: string(),
});

export const MATERIALS = parse(record(string(), MaterialSchema), content);
export const materialColours = Object.fromEntries(
  Object.entries(MATERIALS).map(([id, material]) => [id, material.colour]),
);
