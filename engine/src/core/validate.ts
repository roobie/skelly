import type { Issue } from './issue.ts';
import { type Resolved, resolve } from './resolve.ts';
import { CORE_RULES } from './rules.ts';
import type { Assembly, Domain } from './schema.ts';

export interface Report {
  readonly resolved: Resolved;
  readonly issues: readonly Issue[];
  readonly ok: boolean;
}

export const validate = (assembly: Assembly, domain: Domain): Report => {
  const resolved = resolve(assembly, domain);
  const rules = [...CORE_RULES, ...(domain.rules ?? [])];
  const issues = [
    ...resolved.issues,
    ...rules.flatMap((rule) => {
      try {
        return rule.check(resolved);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return [{ rule: rule.id, message: `Rule crashed: ${message}`, parts: [] }];
      }
    }),
  ];
  return { resolved, issues, ok: issues.length === 0 };
};
