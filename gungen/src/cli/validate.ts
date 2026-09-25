// Validate assembly files from the command line:
//   npm run validate                    all fixtures
//   npm run validate -- a.json b.json   specific files

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import type { Assembly } from '../core/schema.ts';
import { validate } from '../core/validate.ts';
import { gunDomain } from '../gun/domain.ts';

const args = process.argv.slice(2);
const files =
  args.length > 0
    ? args
    : readdirSync('fixtures')
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => join('fixtures', f));

const expectationNote = (expected: string[] | undefined, matches: boolean): string => {
  if (expected === undefined) {
    return '';
  }
  return matches ? '  (as expected)' : `  (expected: ${expected.join(', ') || 'pass'})`;
};

let unexpected = 0;
for (const file of files) {
  const assembly = JSON.parse(readFileSync(file, 'utf8')) as Assembly;
  const report = validate(assembly, gunDomain);
  const failed = [...new Set(report.issues.map((i) => i.rule))].sort();
  const expected = assembly.expect ? [...assembly.expect].sort() : undefined;
  const matches = expected === undefined || expected.join() === failed.join();
  if (!matches) {
    unexpected += 1;
  }
  const status = report.ok ? 'PASS' : 'FAIL';
  const note = expectationNote(expected, matches);
  console.log(`${status}  ${assembly.name}${note}`);
  for (const issue of report.issues) {
    console.log(`      [${issue.rule}] ${issue.message}`);
  }
}
process.exitCode = unexpected > 0 ? 1 : 0;
