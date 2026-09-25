// Generate an assembly from a template:
//   npm run generate -- --template pump-shotgun --seed 42
//   npm run generate -- --template rifle --seed 7 --valid      retry until valid
//   npm run generate -- --template rifle --seed 7 --out a.json
// Prints the assembly JSON (or writes it with --out) and a summary on stderr.

import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { generate, generateValid } from '../core/generate.ts';
import type { Assembly } from '../core/schema.ts';
import { validate } from '../core/validate.ts';
import { gunDomain } from '../gun/domain.ts';
import { TEMPLATES } from '../gun/templates.ts';

const { values } = parseArgs({
  options: {
    template: { type: 'string' },
    seed: { type: 'string', default: '0' },
    valid: { type: 'boolean', default: false },
    out: { type: 'string' },
  },
});

const names = TEMPLATES.map((t) => t.name).join(', ');
const template = TEMPLATES.find((t) => t.name === values.template);
if (!template) {
  console.error(`--template must be one of: ${names}`);
  process.exit(2);
}
const seed = Number(values.seed);
if (!Number.isInteger(seed)) {
  console.error('--seed must be an integer');
  process.exit(2);
}

let assembly: Assembly;
if (values.valid) {
  const found = generateValid(template, gunDomain, seed);
  if (!found) {
    console.error(`No valid ${template.name} in 100 seeds from ${seed}.`);
    process.exit(1);
  }
  ({ assembly } = found);
  console.error(`seed ${found.seed} (after ${found.attempts} attempt${found.attempts === 1 ? '' : 's'}): PASS`);
} else {
  assembly = generate(template, gunDomain, seed);
  const report = validate(assembly, gunDomain);
  console.error(`seed ${seed}: ${report.ok ? 'PASS' : 'FAIL'}`);
  for (const issue of report.issues) {
    console.error(`  [${issue.rule}] ${issue.message}`);
  }
}

const json = `${JSON.stringify(assembly, null, 2)}\n`;
if (values.out) {
  writeFileSync(values.out, json);
} else {
  process.stdout.write(json);
}
