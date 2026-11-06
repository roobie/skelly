// How a template's param choices read the parts already chosen. The generator
// and the design loader both read them here, so an unset param is its family
// default to both, and a design the generator could make never loads as stale.

import type { Domain, PartInstance } from './schema.ts';
import type { ConditionalChoice, ParamChoice, ParamCondition, ParamReference } from './template.ts';

export const isParamReference = (choice: ParamChoice): choice is ParamReference =>
  typeof choice === 'object' && !Array.isArray(choice) && 'fromSlot' in choice;

export const isConditionalChoice = (choice: ParamChoice): choice is ConditionalChoice =>
  typeof choice === 'object' && !Array.isArray(choice) && 'when' in choice;

/** A chosen part's param, or its family default when the part leaves it unset. */
export const chosenParam = (
  parts: Readonly<Record<string, PartInstance>>,
  domain: Domain,
  part: string,
  param: string,
): string | undefined => {
  const instance = parts[part];
  const family = instance && domain.families[instance.family];
  return instance?.params?.[param] ?? family?.params[param]?.default;
};

export const conditionMatches = (
  condition: ParamCondition,
  parts: Readonly<Record<string, PartInstance>>,
  domain: Domain,
): boolean => chosenParam(parts, domain, condition.part, condition.param) === condition.equals;
