import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { declaredFileReader, readBundledPacks } from '../../tools/readBundledPacks.ts';
import {
  actorFigureFileIssues,
  assetFileIssues,
  buildRegistry,
  CONTENT_SECTION_KEYS,
  CONTENT_SECTIONS,
  type ContentIssue,
  type ContentSource,
  checkStartReachability,
  cursorFileIssues,
  MANIFEST_PATH,
  modelFileIssues,
  modelPresentationAssetIssues,
  type Registry,
  requiredContentIssues,
  soundFileIssues,
  validateManifest,
} from '../engine/content.ts';
import { bundledModCatalogueIssues } from '../engine/modCatalogue.ts';
import { admitPacks, type PackInput, packStartIssues } from '../engine/packs.ts';
import { EXTERNAL_ASSET_ROOT } from '../product/externalRoot.ts';
import { controlIssues } from './controlIssues.ts';

const CATALOGUE = 'src/config/bundled-mods.json';

const presentationAssetIssues = (
  registry: Registry,
  packFile: (contentFile: string, file: string) => string,
): ContentIssue[] =>
  [...registry.models.values()].flatMap((model) => {
    const origin = registry.modelOrigins.get(model.id)!;
    const file = packFile(origin.source, model.file);
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

/** Each figure row's body and clips, read in Node from the files its pack declares; the browser never reads them. */
const figureFileIssues = (registry: Registry, read: (contentFile: string, file: string) => Buffer): ContentIssue[] =>
  [...registry.actorFigures.values()].flatMap(({ id, body, clips }) => {
    const origin = registry.contentOrigins.get(`actorFigures:${id}`)!;
    let found: { path: string; message: string }[];
    try {
      const parse = (file: string): unknown => JSON.parse(read(origin.source, file).toString('utf8'));
      found = actorFigureFileIssues(registry, id, parse(body), parse(clips));
    } catch (error) {
      found = [
        { path: '', message: `cannot read figure files: ${error instanceof Error ? error.message : String(error)}` },
      ];
    }
    return found.map(({ path, message }) => ({ source: origin.source, path: origin.path + path, message }));
  });

const playableStartIssues = (registry: Registry, write: (line: string) => void): ContentIssue[] =>
  [...registry.starts.values()].flatMap((start) => {
    const reachable = checkStartReachability(registry, start);
    write(
      `Start "${start.id}": component closure ${reachable.components.size} item types (${reachable.found.size} found)`,
    );
    write(`Content count: ${reachable.count} reachable / ${reachable.defined} defined eligible types`);
    write(`Defined but unreachable: ${reachable.unreachable.join(', ') || 'none'}`);
    return reachable.issues.map((issue) => {
      const origin = registry.contentOrigins.get(`recipes:${issue.recipe}`)!;
      return {
        source: origin.source,
        path: origin.path + issue.path,
        message: `Start "${start.id}": ${issue.message}`,
      };
    });
  });

/** Runs the CLI rules and returns the exit code, so semantic tests avoid process startup. */
export const validate = (
  args: readonly string[],
  write: (line: string) => void = console.log,
  root = process.cwd(),
): number => {
  const fragments = [...args];
  const stackIndex = fragments.indexOf('--stack');
  const stack = stackIndex < 0 ? 'skelly.deadvox' : fragments.splice(stackIndex, 2)[1];
  if (!stack || stack.startsWith('--')) {
    write('FAIL  --stack requires a pack id');
    return 1;
  }
  let admitted: ReturnType<typeof admitPacks>;
  let packs: PackInput[];
  try {
    packs = readBundledPacks(root, stack);
    admitted = admitPacks(packs.map((pack) => ({ ...pack, source: join('src/game', pack.source) })));
  } catch (error) {
    write(`FAIL  bundled packs: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const base = admitted.sources.map(({ source }) => source);
  const isManifest = (f: string) => basename(f) === 'manifest.json';
  const files = [...base, ...fragments.filter((f) => !isManifest(f))];
  const manifests = [
    ...admitted.packs.flatMap((pack) =>
      pack.manifest.files.some(({ path }) => path === MANIFEST_PATH) ? [join(pack.source, MANIFEST_PATH)] : [],
    ),
    ...fragments.filter(isManifest),
  ];

  /** A pack's external namespace, as validate's pack roots are relative to `src/game`. */
  const namespace = (id: string): string => resolve(root, 'src/game', EXTERNAL_ASSET_ROOT, id);
  const listed = (from: string, packRoot: string): string[] =>
    existsSync(from)
      ? readdirSync(from, { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => relative(packRoot, join(entry.parentPath, entry.name)).split('\\').join('/'))
      : [];
  /** Local assets and declared external assets; unused installed release files are not part of the product. */
  const assetFiles = (pack: string): string[] => {
    const owner = admitted.packs.find(({ source }) => resolve(root, source) === resolve(root, pack));
    const external =
      owner?.manifest.files
        .filter(({ path }) => path.startsWith('assets/') && existsSync(join(namespace(owner.manifest.id), path)))
        .map(({ path }) => path) ?? [];
    return [...new Set([...listed(resolve(root, pack, 'assets'), resolve(root, pack)), ...external])];
  };
  /** A file named from content, under its pack's root or, failing that, the same path in its external namespace. */
  const packFile = (contentFile: string, file: string): string => {
    const local = resolve(root, dirname(contentFile), file);
    if (existsSync(local)) {
      return local;
    }
    for (const pack of admitted.packs) {
      const within = relative(resolve(root, pack.source), local);
      if (!(within.startsWith('..') || isAbsolute(within))) {
        return join(namespace(pack.manifest.id), within);
      }
    }
    return local;
  };

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
  issues.unshift(...admitted.issues, ...packStartIssues(admitted.packs, registry));
  issues.push(...playableStartIssues(registry, write));
  issues.push(...requiredContentIssues(registry), ...controlIssues(registry, origins, new Set(base)));
  const catalogue = read(CATALOGUE);
  if (catalogue !== undefined) {
    issues.push(...bundledModCatalogueIssues(catalogue).map((message) => ({ source: CATALOGUE, path: '', message })));
  }
  issues.push(...presentationAssetIssues(registry, packFile));
  issues.push(...figureFileIssues(registry, declaredFileReader(root, admitted.packs, packs)));
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
    ...cursorFileIssues(registry, (contentFile, file) => existsSync(resolve(root, dirname(contentFile), file))),
  );
  issues.push(...modelFileIssues(registry, (contentFile, file) => existsSync(packFile(contentFile, file))));
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
