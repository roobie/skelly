import {
  boolean,
  check,
  finite,
  type InferOutput,
  literal,
  minValue,
  nonEmpty,
  number,
  pipe,
  record,
  strictObject,
  string,
  variant,
} from 'valibot';

const Positive = pipe(number(), finite(), minValue(Number.MIN_VALUE));
export const ActorLodPolicySchema = pipe(
  strictObject({
    enabled: boolean(),
    enterFarM: Positive,
    returnNearM: Positive,
    families: record(
      pipe(string(), nonEmpty()),
      variant('eligible', [
        strictObject({ eligible: literal(true), edgeLengthM: Positive }),
        strictObject({ eligible: literal(false), reason: pipe(string(), nonEmpty()) }),
      ]),
    ),
  }),
  check((policy) => policy.returnNearM < policy.enterFarM, 'return-near distance must be less than enter-far distance'),
);
export type ActorLodPolicy = InferOutput<typeof ActorLodPolicySchema>;

export const selectActorFar = (
  previous: boolean | undefined,
  distanceM: number,
  policy: ActorLodPolicy,
  forceNear: boolean,
): boolean =>
  policy.enabled && !forceNear && (previous === true ? distanceM >= policy.returnNearM : distanceM > policy.enterFarM);
