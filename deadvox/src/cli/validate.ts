// Validate content JSON from the command line (for base content and mods):
//   npm run validate                      the base pack and its asset manifest
//   npm run validate -- mods/foo/*.json   specific files, applied in order after the base pack;
//                                         a file named manifest.json is checked as an asset manifest

import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import process from 'node:process';
import { validateManifest } from '../core/assets.ts';
import { buildRegistry, type ContentSource } from '../core/content.ts';

const BASE = 'src/content/base';
const base = readdirSync(BASE)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => join(BASE, f));
const args = process.argv.slice(2);
const isManifest = (f: string) => basename(f) === 'manifest.json';
const files = [...base, ...args.filter((f) => !isManifest(f))];
const manifests = [join(BASE, 'assets/manifest.json'), ...args.filter(isManifest)];

let broken = 0;
const read = (source: string): unknown => {
  try {
    return JSON.parse(readFileSync(source, 'utf8')) as unknown;
  } catch (e) {
    console.log(`FAIL  ${source}: ${e instanceof Error ? e.message : String(e)}`);
    broken += 1;
    return undefined;
  }
};
const sources: ContentSource[] = [];
for (const source of files) {
  const data = read(source);
  if (data !== undefined) {
    sources.push({ source, data });
  }
}
const { registry, issues } = buildRegistry(sources);
let assets = 0;
for (const source of manifests) {
  const data = read(source);
  if (data !== undefined) {
    const checked = validateManifest(source, data);
    assets += checked.manifest.sources.length;
    issues.push(...checked.issues);
  }
}

for (const issue of issues) {
  console.log(`FAIL  ${issue.source} ${issue.path}: ${issue.message}`);
}
const counts = [
  `${registry.blocks.length - 1} blocks`,
  `${registry.items.size} items`,
  `${registry.furniture.size} furniture`,
  `${registry.loot.size} loot tables`,
  `${registry.templates.size} templates`,
  `${registry.zombies.size} zombie types`,
  `${assets} asset sources`,
];
console.log(`${files.length} file(s): ${counts.join(', ')}; ${issues.length + broken} issue(s)`);
process.exitCode = issues.length + broken > 0 ? 1 : 0;
