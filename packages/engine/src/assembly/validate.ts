import type { Issue } from '../foundation/issue.ts';
import { resolve } from './resolve.ts';
import { CORE_RULES } from './rules.ts';
import type { Assembly, Domain, Resolved, Rule } from './schema.ts';

export interface Report {
  readonly resolved: Resolved;
  readonly issues: readonly Issue[];
  readonly ok: boolean;
}

/** Every rule `validate` runs for a domain. */
export const validationRules = (domain: Domain): readonly Rule[] => [...CORE_RULES, ...(domain.rules ?? [])];

/** Runs `check` (by default the rule's own) and reports a crash as an issue of that rule. */
export const checkRule = (rule: Rule, resolved: Resolved, check: Rule['check'] = rule.check): Issue[] => {
  try {
    return check(resolved);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return [{ rule: rule.id, message: `Rule crashed: ${message}`, parts: [] }];
  }
};

export const validate = (assembly: Assembly, domain: Domain): Report => {
  const resolved = resolve(assembly, domain);
  const issues = [...resolved.issues, ...validationRules(domain).flatMap((rule) => checkRule(rule, resolved))];
  return { resolved, issues, ok: issues.length === 0 };
};
