// Validate content JSON from the command line (for base content and mods):
//   npm run validate                      the base pack and its asset manifest
//   npm run validate -- mods/foo/*.json   specific files, applied in order after the base pack;
//                                         a file named manifest.json is checked as an asset manifest
// A content file's pack is its folder, so a model's file is found next to it. A
// manifest's pack is the folder above its `assets/`, and every file in there must
// come from a listed source.

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { assetFileIssues, MANIFEST_PATH, modelFileIssues, soundFileIssues, validateManifest } from '../core/assets.ts';
import { buildRegistry, type ContentSource, requiredSoundIssues } from '../core/content.ts';
import { checkReachability } from '../core/reachability.ts';
import { CONTENT_SECTION_KEYS, CONTENT_SECTIONS } from '../core/schema.ts';

const BASE = 'src/content/base';

/** Runs the CLI rules and returns the exit code, so semantic tests avoid process startup. */
export const validate = (args: readonly string[], write: (line: string) => void = console.log): number => {
  const base = readdirSync(BASE)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => join(BASE, f));
  const isManifest = (f: string) => basename(f) === 'manifest.json';
  const files = [...base, ...args.filter((f) => !isManifest(f))];
  const manifests = [join(BASE, MANIFEST_PATH), ...args.filter(isManifest)];

  /** Every file under a pack's `assets/`, as paths within the pack. */
  const assetFiles = (pack: string): string[] =>
    readdirSync(join(pack, 'assets'), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(pack, join(entry.parentPath, entry.name)).split('\\').join('/'));

  let broken = 0;
  const read = (source: string): unknown => {
    try {
      return JSON.parse(readFileSync(source, 'utf8')) as unknown;
    } catch (e) {
      write(`FAIL  ${source}: ${e instanceof Error ? e.message : String(e)}`);
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
  const { registry, issues, origins } = buildRegistry(sources);
  const reachable = checkReachability(registry);
  for (const issue of reachable.issues) {
    const origin = origins.get(`recipes:${issue.recipe}`)!;
    issues.push({ source: origin.source, path: origin.path + issue.path, message: issue.message });
  }
  write(`Component closure: ${reachable.components.size} item types (${reachable.found.size} found)`);
  write(`Reachable components: ${[...reachable.components].sort().join(', ')}`);
  write(`Content count: ${reachable.count} reachable / ${reachable.defined} defined eligible types`);
  write(`Defined but unreachable: ${reachable.unreachable.join(', ') || 'none'}`);
  issues.push(...requiredSoundIssues(registry, join(BASE, 'sounds.json')));
  let assets = 0;
  for (const source of manifests) {
    const data = read(source);
    if (data !== undefined) {
      const checked = validateManifest(source, data);
      assets += checked.manifest.sources.length;
      issues.push(
        ...checked.issues,
        ...assetFileIssues(source, checked.manifest, assetFiles(dirname(dirname(source)))),
      );
    }
  }
  issues.push(...modelFileIssues(registry, (contentFile, file) => existsSync(join(dirname(contentFile), file))));
  issues.push(...soundFileIssues(registry, (contentFile, file) => existsSync(join(dirname(contentFile), file))));

  for (const issue of issues) {
    write(`FAIL  ${issue.source} ${issue.path}: ${issue.message}`);
  }
  const counts = CONTENT_SECTION_KEYS.map((section) => {
    const count = section === 'blocks' ? registry.blocks.length - 1 : registry[section].size;
    return `${count} ${CONTENT_SECTIONS[section].label}`;
  });
  counts.push(`${assets} asset sources`);
  write(`${files.length} file(s): ${counts.join(', ')}; ${issues.length + broken} issue(s)`);
  return issues.length + broken > 0 ? 1 : 0;
};

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = validate(process.argv.slice(2));
}
