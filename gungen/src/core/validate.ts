import type { Issue } from './issue.ts';
import { type Resolved, resolve } from './resolve.ts';
import { RULES } from './rules.ts';
import type { Assembly, Domain } from './schema.ts';

export interface Report {
  readonly resolved: Resolved;
  readonly issues: readonly Issue[];
  readonly ok: boolean;
}

export const validate = (assembly: Assembly, domain: Domain): Report => {
  const resolved = resolve(assembly, domain);
  const issues = [...resolved.issues, ...RULES.flatMap((rule) => rule.check(resolved))];
  return { resolved, issues, ok: issues.length === 0 };
};
