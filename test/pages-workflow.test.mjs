import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DISPATCH_CONDITION = /github\.event_name\s*==\s*['"]workflow_dispatch['"]/;
const DISPATCH_REFS = /&&|github\.ref/;
const FREEZE_ENABLED = /vars\.PAGES_FREEZE\s*!=\s*['"]true['"]/;
const MAIN_REF = /\bmain\b/;
const REF_GUARD = /github\.ref|refs\/heads/;
const EXPRESSION_START = /^\s*\$\{\{\s*/;
const EXPRESSION_END = /\s*\}\}\s*$/;
const DISJUNCTION = /\s*\|\|\s*/;
const OUTER_PARENS = /^\(+|\)+$/g;
const pages = parse(readFileSync(join(ROOT, '.github/workflows/pages.yml'), 'utf8'));

const disjuncts = (condition) =>
  condition
    .replace(EXPRESSION_START, '')
    .replace(EXPRESSION_END, '')
    .split(DISJUNCTION)
    .map((part) => part.replace(OUTER_PARENS, '').trim());

test('Pages freeze gate lets workflow dispatch deploy from a hotfix ref', () => {
  assert.ok(Object.hasOwn(pages.on, 'workflow_dispatch'), 'the Pages workflow supports manual dispatch');

  for (const name of ['build', 'deploy']) {
    const job = pages.jobs[name];
    assert.doesNotMatch(String(job.if), REF_GUARD, `${name} gate does not restrict the ref`);
    for (const [index, step] of job.steps.entries()) {
      assert.doesNotMatch(String(step.if ?? ''), REF_GUARD, `${name} step ${index} does not restrict the ref`);
    }
    const clauses = disjuncts(job.if);
    const freeze = clauses.find((clause) => clause.includes('vars.PAGES_FREEZE'));
    assert.ok(freeze, `${name} checks the freeze variable`);
    assert.match(freeze, FREEZE_ENABLED, `${name} skips when the freeze is true`);
    const dispatch = clauses.find((clause) => DISPATCH_CONDITION.test(clause));
    assert.ok(dispatch, `${name} exempts workflow dispatch from the freeze gate`);
    assert.doesNotMatch(dispatch, DISPATCH_REFS, `${name} does not condition dispatch on the ref`);
  }

  const checkout = pages.jobs.build.steps.find((step) => step.uses?.startsWith('actions/checkout@'));
  assert.ok(checkout, 'the build checks out its source');
  assert.doesNotMatch(String(checkout.with?.ref ?? ''), MAIN_REF, 'checkout does not pin the build to main');
});
