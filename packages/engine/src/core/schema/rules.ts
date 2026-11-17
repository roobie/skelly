import { array, type InferOutput, literal, maxLength, minLength, optional, pipe, strictObject, string } from 'valibot';
import type { RuleScalarType } from '../ruleExpressions.ts';
import { Id } from './primitives.ts';

// Engine safety ceilings bound the work requested by a single cast, independently of content tuning.
export const CAST_RULE_LIMITS = { effects: 16, projectiles: 256, expressionWork: 65_536 } as const;
export const VOLLEY_ARGUMENTS = {
  count: { type: 'int', min: 1, max: CAST_RULE_LIMITS.projectiles },
  intervalSimSeconds: { type: 'double', min: 0, max: Number.MAX_VALUE },
  speedMetresPerSimSecond: { type: 'double', min: Number.MIN_VALUE, max: Number.MAX_VALUE },
  rangeMetres: { type: 'double', min: Number.MIN_VALUE, max: Number.MAX_VALUE },
  damage: { type: 'double', min: 0, max: Number.MAX_VALUE },
} as const satisfies Record<string, { type: RuleScalarType; min: number; max: number }>;

type ArgumentSchemas = { [K in keyof typeof VOLLEY_ARGUMENTS]: ReturnType<typeof string> };
const argumentSchemas = Object.fromEntries(
  Object.keys(VOLLEY_ARGUMENTS).map((key) => [key, string()]),
) as ArgumentSchemas;

export const RuleSchema = strictObject({
  id: Id,
  trigger: strictObject({ event: literal('cast') }),
  condition: optional(string()),
  effects: pipe(
    array(
      strictObject({
        verb: literal('projectileVolley'),
        ...argumentSchemas,
        damageKind: Id,
      }),
    ),
    minLength(1),
    maxLength(CAST_RULE_LIMITS.effects),
  ),
});
export type RuleDef = InferOutput<typeof RuleSchema>;
export type VolleyArgument = keyof typeof VOLLEY_ARGUMENTS;
