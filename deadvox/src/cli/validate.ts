// Validate content JSON from the command line (for base content and mods):
//   npm run validate                      the base pack
//   npm run validate -- mods/foo/*.json   specific files, applied in order after the base pack

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { buildRegistry, type ContentSource } from '../core/content.ts';

const BASE = 'src/content/base';
const base = readdirSync(BASE)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => join(BASE, f));
const files = [...base, ...process.argv.slice(2)];

let broken = 0;
const sources: ContentSource[] = [];
for (const source of files) {
  try {
    sources.push({ source, data: JSON.parse(readFileSync(source, 'utf8')) as unknown });
  } catch (e) {
    console.log(`FAIL  ${source}: ${e instanceof Error ? e.message : String(e)}`);
    broken += 1;
  }
}
const { registry, issues } = buildRegistry(sources);

for (const issue of issues) {
  console.log(`FAIL  ${issue.source} ${issue.path}: ${issue.message}`);
}
console.log(
  `${files.length} file(s): ${registry.blocks.length - 1} blocks, ${registry.items.size} items, ${issues.length + broken} issue(s)`,
);
process.exitCode = issues.length + broken > 0 ? 1 : 0;
