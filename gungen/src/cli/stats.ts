// Generator metrics (PROJECT.md §9), per template over a range of seeds:
//   npm run stats                 1000 seeds per template
//   npm run stats -- --seeds 200

import { parseArgs } from 'node:util';
import { generate } from '../core/generate.ts';
import { validate } from '../core/validate.ts';
import { gunDomain } from '../gun/domain.ts';
import { TEMPLATES } from '../gun/templates.ts';

const { values } = parseArgs({ options: { seeds: { type: 'string', default: '1000' } } });
const n = Number(values.seeds);

const pct = (x: number) => `${((100 * x) / n).toFixed(1)}%`.padStart(6);
console.log(`${n} seeds per template (seeds 0..${n - 1})\n`);
console.log('template         valid  distinct  distinct valid  most common failures');
for (const t of TEMPLATES) {
  let valid = 0;
  const distinct = new Set<string>();
  const distinctValid = new Set<string>();
  const failures = new Map<string, number>();
  for (let seed = 0; seed < n; seed++) {
    const a = generate(t, gunDomain, seed);
    const key = JSON.stringify({ parts: a.parts, connections: a.connections });
    distinct.add(key);
    const report = validate(a, gunDomain);
    if (report.ok) {
      valid += 1;
      distinctValid.add(key);
    }
    // Name the volume for keep-out failures: "keep-out (sightline)".
    const kinds = report.issues.map((i) => {
      const ko = i.keepOut && report.resolved.defs.get(i.keepOut.part)?.keepOuts.find((k) => k.id === i.keepOut!.id);
      return ko ? `${i.rule} (${ko.kind})` : i.rule;
    });
    for (const kind of new Set(kinds)) {
      failures.set(kind, (failures.get(kind) ?? 0) + 1);
    }
  }
  const top = [...failures]
    .sort((a, b) => b[1] - a[1])
    .map(([rule, c]) => `${rule} ${pct(c).trim()}`)
    .join(', ');
  console.log(
    `${t.name.padEnd(15)} ${pct(valid)}  ${String(distinct.size).padStart(8)}  ${String(distinctValid.size).padStart(14)}  ${top || '-'}`,
  );
}
