// Validate content JSON from the command line (for base content and mods):
//   npm run validate                      the base pack and its asset manifest
//   npm run validate -- mods/foo/*.json   specific files, applied in order after the base pack;
//                                         a file named manifest.json is checked as an asset manifest
// A content file's pack is its folder, so a model's file is found next to it. A
// manifest's pack is the folder above its assets directory, and every file in there must
// come from a listed source.

import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readBundledPacks } from '../../tools/readBundledPacks.ts';
import { assetFileIssues, MANIFEST_PATH, modelFileIssues, soundFileIssues, validateManifest } from '../core/assets.ts';
import { bundledModCatalogueIssues } from '../core/bundledModCatalogue.ts';
import {
  buildRegistry,
  type ContentIssue,
  type ContentSource,
  type Registry,
  requiredContentIssues,
} from '../core/content.ts';
import { modelPresentationAssetIssues } from '../core/itemPresentation.ts';
import { admitPacks } from '../core/packAdmission.ts';
import { checkReachability } from '../core/reachability.ts';
import { CONTENT_SECTION_KEYS, CONTENT_SECTIONS } from '../core/schema.ts';
import { controlIssues } from './controlIssues.ts';

const BASE = 'src/content/base';
const CATALOGUE = 'src/config/bundled-mods.json';

const presentationAssetIssues = (registry: Registry, root: string): ContentIssue[] =>
  [...registry.models.values()].flatMap((model) => {
    const origin = registry.modelOrigins.get(model.id)!;
    const file = resolve(root, dirname(origin.source), model.file);
    if (!existsSync(file)) {
      return [];
    }
    let messages: string[];
    try {
      const bytes = readFileSync(file);
      const asset = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
      messages = modelPresentationAssetIssues(model, asset);
    } catch (error) {
      messages = [`cannot read model presentation: ${error instanceof Error ? error.message : String(error)}`];
    }
    return messages.map((message) => ({
      source: origin.source,
      path: origin.path,
      message,
    }));
  });

/** Runs the CLI rules and returns the exit code, so semantic tests avoid process startup. */
export const validate = (
  args: readonly string[],
  write: (line: string) => void = console.log,
  root = process.cwd(),
): number => {
  let admitted: ReturnType<typeof admitPacks>;
  try {
    admitted = admitPacks(readBundledPacks(root).map((pack) => ({ ...pack, source: join('src/game', pack.source) })));
  } catch (error) {
    write(`FAIL  bundled packs: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const base = admitted.sources.map(({ source }) => source);
  const isManifest = (f: string) => basename(f) === 'manifest.json';
  const files = [...base, ...args.filter((f) => !isManifest(f))];
  const manifests = [join(BASE, MANIFEST_PATH), ...args.filter(isManifest)];

  /** Every file under a pack's assets directory, as paths within the pack. */
  const assetFiles = (pack: string): string[] =>
    readdirSync(resolve(root, pack, 'assets'), { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(resolve(root, pack), join(entry.parentPath, entry.name)).split('\\').join('/'));

  let broken = 0;
  const read = (source: string): unknown => {
    try {
      return JSON.parse(readFileSync(resolve(root, source), 'utf8')) as unknown;
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
  issues.unshift(...admitted.issues);
  const reachable = checkReachability(registry);
  for (const issue of reachable.issues) {
    const origin = origins.get(`recipes:${issue.recipe}`)!;
    issues.push({ source: origin.source, path: origin.path + issue.path, message: issue.message });
  }
  write(`Component closure: ${reachable.components.size} item types (${reachable.found.size} found)`);
  write(`Reachable components: ${[...reachable.components].sort().join(', ')}`);
  write(`Content count: ${reachable.count} reachable / ${reachable.defined} defined eligible types`);
  write(`Defined but unreachable: ${reachable.unreachable.join(', ') || 'none'}`);
  issues.push(...requiredContentIssues(registry), ...controlIssues(registry, origins, new Set(base)));
  const catalogue = read(CATALOGUE);
  if (catalogue !== undefined) {
    issues.push(...bundledModCatalogueIssues(catalogue).map((message) => ({ source: CATALOGUE, path: '', message })));
  }
  issues.push(...presentationAssetIssues(registry, root));
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
  issues.push(
    ...modelFileIssues(registry, (contentFile, file) => existsSync(resolve(root, dirname(contentFile), file))),
  );
  issues.push(
    ...soundFileIssues(registry, (contentFile, file) => existsSync(resolve(root, dirname(contentFile), file))),
  );

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
