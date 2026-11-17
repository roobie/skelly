import { CastRuleError, type CastRuleEvent, castRuleContext } from './castRules.ts';
import type { ContentIssue, Registry } from './content.ts';
import { type CheckedRuleExpression, compileRuleExpression } from './ruleExpressions.ts';
import type { AbilityDef } from './schema/abilities.ts';

const compiledCosts = new WeakMap<Registry, ReadonlyMap<string, CheckedRuleExpression>>();

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const costOrigin = (registry: Registry, id: string): { source: string; path: string } | undefined => {
  const origin = registry.contentOrigins.get(`abilities:${id}`);
  return origin && { source: origin.source, path: `${origin.path}.cost.amount` };
};

/** Compilation is required even for stamped bundles: a stamp does not supply executable programs. */
export const abilityIssues = (registry: Registry): ContentIssue[] => {
  const issues: ContentIssue[] = [];
  const programs = new Map<string, CheckedRuleExpression>();
  for (const ability of registry.abilities.values()) {
    try {
      programs.set(ability.id, compileRuleExpression(ability.cost.amount, 'double'));
    } catch (error) {
      issues.push({ ...costOrigin(registry, ability.id)!, message: errorMessage(error) });
    }
  }
  compiledCosts.set(registry, programs);
  return issues;
};

/**
 * What one cast of the event's ability costs from its pool. Pure, so a press can show it as advice and the commit
 * can charge it; a cost content cannot pay sensibly is a content error, not a free cast.
 */
export const resolveAbilityCost = (registry: Registry, event: CastRuleEvent): number => {
  const origin = costOrigin(registry, event.abilityId);
  const program = compiledCosts.get(registry)?.get(event.abilityId);
  if (!(origin && program)) {
    throw new Error(`no admitted ability "${event.abilityId}"`);
  }
  const fail = (message: string): never => {
    throw new CastRuleError({ ...origin, message });
  };
  let cost: number;
  try {
    cost = Number(program.evaluate(castRuleContext(event)));
  } catch (error) {
    return fail(errorMessage(error));
  }
  return Number.isFinite(cost) && cost >= 0 ? cost : fail('ability cost must be a finite amount of 0 or more');
};

/** Practice the next ability level needs; none is reachable past the ability's own cap. */
export const practiceForNextAbilityLevel = (ability: AbilityDef, level: number): number =>
  level >= ability.progression.maximumLevel ? Number.POSITIVE_INFINITY : ability.progression.practicePerLevel;
