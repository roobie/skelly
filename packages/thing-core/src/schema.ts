import {
  check,
  finite,
  type InferOutput,
  maxValue,
  minValue,
  nonEmpty,
  number,
  type ObjectEntries,
  optional,
  picklist,
  pipe,
  record,
  regex,
  strictObject,
  string,
  tuple,
} from 'valibot';

export const ModelPointSchema = tuple([pipe(number(), finite()), pipe(number(), finite()), pipe(number(), finite())]);
const Id = pipe(string(), regex(/^[a-z0-9_]+$/, 'must be lowercase letters, digits and _'));

export const ModelPartSchema = strictObject({
  massKg: pipe(number(), finite(), minValue(0)),
  centreOfMass: ModelPointSchema,
  node: optional(pipe(string(), nonEmpty())),
});

export const NeutralModelSchema = strictObject({
  id: Id,
  file: pipe(string(), regex(/^assets\/models\/[a-z0-9_-]+\.glb$/, 'expected "assets/models/<name>.glb"')),
  parts: pipe(
    record(pipe(string(), nonEmpty()), ModelPartSchema),
    check((parts) => Object.keys(parts).length > 0, 'model needs physical parts'),
  ),
  emissiveMaterial: optional(pipe(string(), nonEmpty('must not be empty'))),
  grip: optional(strictObject({ at: ModelPointSchema, turn: optional(ModelPointSchema) })),
  hold: optional(picklist(['forward', 'upright'])),
  roll: optional(pipe(number(), finite(), minValue(-180), maxValue(180))),
  anchors: optional(record(Id, ModelPointSchema)),
});

export const modelSchema = <const Packs extends ObjectEntries>(packs: Packs) => {
  for (const key of Object.keys(packs)) {
    if (Object.hasOwn(NeutralModelSchema.entries, key)) {
      throw new Error(`Pack block ${key} would replace a neutral model field`);
    }
  }
  return strictObject({ ...NeutralModelSchema.entries, ...packs });
};

type DeepReadonly<T> = T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T;
export type NeutralModel = DeepReadonly<InferOutput<typeof NeutralModelSchema>>;
export type ModelParts = NeutralModel['parts'];
