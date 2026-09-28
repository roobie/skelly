// Generate a genome from a template:
//   npm run generate -- --template shambler --seed 7
//   npm run generate -- --template shambler --seed 7 --valid      retry until valid
//   npm run generate -- --template brute --seed 3 --voxel 0.04 --out brute-3.json
// Prints the genome JSON (or writes it with --out) and a summary + issues on stderr.

import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { generate, generateValid, realize } from '../core/generate.ts';
import type { Genome } from '../core/template.ts';
import { TEMPLATES } from '../mob/templates.ts';

const { values } = parseArgs({
  options: {
    template: { type: 'string' },
    seed: { type: 'string', default: '0' },
    valid: { type: 'boolean', default: false },
    voxel: { type: 'string' },
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
const voxelSize = values.voxel === undefined ? undefined : Number(values.voxel);

let genome: Genome;
if (values.valid) {
  const found = generateValid(template, seed);
  if (!found) {
    console.error(`No valid ${template.name} in 100 seeds from ${seed}.`);
    process.exit(1);
  }
  ({ genome } = found);
  console.error(`seed ${found.seed} (after ${found.attempts} attempt${found.attempts === 1 ? '' : 's'}): PASS`);
} else {
  genome = generate(template, seed, voxelSize === undefined ? undefined : { voxelSize });
  const { report } = realize(genome);
  console.error(`seed ${seed}: ${report.ok ? 'PASS' : 'FAIL'}`);
  for (const issue of report.issues) {
    console.error(`  [${issue.rule}] ${issue.message}`);
  }
  console.error(
    `stats: ${report.stats.voxels} voxels, ${report.stats.triangles} triangles, head+jaw ${
      (report.stats.perBoneVoxels.head ?? 0) + (report.stats.perBoneVoxels.jaw ?? 0)
    }`,
  );
}

const json = `${JSON.stringify(genome, null, 2)}\n`;
if (values.out) {
  writeFileSync(values.out, json);
} else {
  process.stdout.write(json);
}
