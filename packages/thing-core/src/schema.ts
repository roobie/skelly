import {
  array,
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
const dotOf = (a: readonly number[], b: readonly number[]) => a.reduce((sum, value, axis) => sum + value * b[axis]!, 0);
const UnitVectorSchema = pipe(
  ModelPointSchema,
  check((point) => Math.abs(Math.hypot(...point) - 1) <= 1e-6, 'must be a unit vector'),
);
const Id = pipe(string(), regex(/^[a-z0-9_]+$/, 'must be lowercase letters, digits and _'));

export const ModelBoxSchema = pipe(
  strictObject({ min: ModelPointSchema, max: ModelPointSchema }),
  check(({ min, max }) => min.every((value, axis) => value <= max[axis]!), 'box min must not exceed max'),
);

export const ModelPartSchema = strictObject({
  massKg: pipe(number(), finite(), minValue(0)),
  centreOfMass: ModelPointSchema,
  node: optional(pipe(string(), nonEmpty())),
  collision: optional(pipe(array(ModelBoxSchema), nonEmpty('baked collision needs a box'))),
});

export const NeutralModelSchema = strictObject({
  id: Id,
  file: pipe(string(), regex(/^assets\/models\/[a-z0-9_-]+\.glb$/, 'expected "assets/models/<name>.glb"')),
  parts: optional(
    pipe(
      record(pipe(string(), nonEmpty()), ModelPartSchema),
      check((parts) => Object.keys(parts).length > 0, 'assembly needs physical parts'),
    ),
  ),
  emissiveMaterial: optional(pipe(string(), nonEmpty('must not be empty'))),
  grip: optional(strictObject({ at: ModelPointSchema, turn: optional(ModelPointSchema) })),
  hold: optional(picklist(['forward', 'upright'])),
  /** How the model rests on the ground: upright stands it on its −x end, the axis an upright hold raises. */
  rest: optional(picklist(['lying', 'upright'])),
  roll: optional(pipe(number(), finite(), minValue(-180), maxValue(180))),
  anchors: optional(record(Id, ModelPointSchema)),
  /**
   * The screen of an item that shows something: its centre, the way it faces, the way its top points,
   * and its width across and height along that top in metres.
   */
  display: optional(
    pipe(
      strictObject({
        at: ModelPointSchema,
        normal: UnitVectorSchema,
        up: UnitVectorSchema,
        size: tuple([pipe(number(), finite(), minValue(0)), pipe(number(), finite(), minValue(0))]),
      }),
      check(({ normal, up }) => Math.abs(dotOf(normal, up)) <= 1e-6, 'display up must be across its normal'),
    ),
  ),
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
export type ModelParts = NonNullable<NeutralModel['parts']>;
export type ModelBox = DeepReadonly<InferOutput<typeof ModelBoxSchema>>;
