import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
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
  wieldMotionFileIssues,
} from '@skelly/engine/content';
import { bundledModCatalogueIssues } from '@skelly/engine/modCatalogue';
import { admitPacks, type PackInput, packStartIssues } from '@skelly/engine/packs';
import { declaredFileReader, type PackSelection, readPackSelections } from '../../tools/readBundledPacks.ts';
import { EXTERNAL_ASSET_ROOT } from '../product/externalRoot.ts';
import { PRODUCT_ENTRY_PACK } from '../product/packSelection.ts';
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

type DeclaredFileRead = (contentFile: string, file: string) => Buffer;

/** A row's issues with the files it names, read in Node from the files its pack declares. */
const rowFileIssues =
  (registry: Registry, read: DeclaredFileRead) =>
  (
    key: string,
    what: string,
    issuesOf: (parse: (file: string) => unknown) => readonly { path: string; message: string }[],
  ): ContentIssue[] => {
    const origin = registry.contentOrigins.get(key)!;
    let found: readonly { path: string; message: string }[];
    try {
      found = issuesOf((file) => JSON.parse(read(origin.source, file).toString('utf8')));
    } catch (error) {
      found = [{ path: '', message: `cannot read ${what}: ${error instanceof Error ? error.message : String(error)}` }];
    }
    return found.map(({ path, message }) => ({ source: origin.source, path: origin.path + path, message }));
  };

/** Each figure row's body and clips; the browser never reads them. */
const figureFileIssues = (registry: Registry, read: DeclaredFileRead): ContentIssue[] =>
  [...registry.actorFigures.values()].flatMap(({ id, body, clips }) =>
    rowFileIssues(registry, read)(`actorFigures:${id}`, 'figure files', (parse) =>
      actorFigureFileIssues(registry, id, parse(body), parse(clips)),
    ),
  );

/** Each wield motions row's rig and clips. */
const wieldFileIssues = (registry: Registry, read: DeclaredFileRead): ContentIssue[] =>
  [...registry.wieldMotions.values()].flatMap(({ id, rig, clips }) =>
    rowFileIssues(registry, read)(`wieldMotions:${id}`, 'wield motion files', (parse) =>
      wieldMotionFileIssues(parse(rig), parse(clips)),
    ),
  );

/** Each start is diagnosed against the recipes its own pack's dependency closure offers, not the whole stack. */
const startRecipeScope = (
  registry: Registry,
  packs: readonly { source: string; manifest: { id: string; dependencies: readonly string[] } }[],
) => {
  const packOfContent = (source: string | undefined): string | undefined =>
    packs.find(({ source: root }) => source === root || source?.startsWith(`${root}/`))?.manifest.id;
  const closures = new Map<string, ReadonlySet<string>>();
  const closureOf = (id: string): ReadonlySet<string> => {
    const cached = closures.get(id);
    if (cached) {
      return cached;
    }
    const closure = new Set<string>([id]);
    for (const dependency of packs.find((pack) => pack.manifest.id === id)?.manifest.dependencies ?? []) {
      for (const reachable of closureOf(dependency)) {
        closure.add(reachable);
      }
    }
    closures.set(id, closure);
    return closure;
  };
  return (start: { id: string }): ReadonlySet<string> | undefined => {
    const owner = packOfContent(registry.contentOrigins.get(`starts:${start.id}`)?.source);
    if (!owner) {
      // A start outside every pack is diagnosed against every recipe, as a directly supplied fragment is.
      return undefined;
    }
    const closure = closureOf(owner);
    return new Set(
      [...registry.recipes.keys()].filter((id) => {
        const pack = packOfContent(registry.contentOrigins.get(`recipes:${id}`)?.source);
        return pack === undefined || closure.has(pack);
      }),
    );
  };
};

const playableStartIssues = (
  registry: Registry,
  packs: readonly { source: string; manifest: { id: string; dependencies: readonly string[] } }[],
  write: (line: string) => void,
  described: ReadonlySet<string>,
): ContentIssue[] => {
  const recipeScope = startRecipeScope(registry, packs);
  const compiled = new Map();
  return [...registry.starts.values()].flatMap((start) => {
    const recipes = recipeScope(start);
    const reachable = checkStartReachability(
      registry,
      start,
      recipes === undefined ? { compiled } : { recipes, compiled },
    );
    if (!described.has(start.id)) {
      write(
        `Start "${start.id}": component closure ${reachable.components.size} item types (${reachable.found.size} found)`,
      );
      write(`Content count: ${reachable.count} reachable / ${reachable.defined} defined eligible types`);
      write(`Defined but unreachable: ${reachable.unreachable.join(', ') || 'none'}`);
    }
    return reachable.issues.map((issue) => {
      const origin = registry.contentOrigins.get(`recipes:${issue.recipe}`)!;
      return {
        source: origin.source,
        path: origin.path + issue.path,
        message: `Start "${start.id}": ${issue.message}`,
      };
    });
  });
};

interface SelectionReport {
  /** One `FAIL` line per issue. */
  readonly failures: readonly string[];
  readonly starts: ReadonlySet<string>;
  readonly summary: string;
}

interface SelectionCheck {
  readonly packs: readonly PackInput[];
  /** Content files named on the command line, checked beside the packs. */
  readonly fragments: readonly string[];
  readonly write: (line: string) => void;
  /** Starts whose reports an earlier check wrote. */
  readonly described: ReadonlySet<string>;
}

/** Every CLI rule over one pack selection and the named fragments. */
const checkSelection = (root: string, { packs, fragments, write, described }: SelectionCheck): SelectionReport => {
  const admitted = admitPacks(packs.map((pack) => ({ ...pack, source: join('src/product', pack.source) })));
  const base = admitted.sources.map(({ source }) => source);
  const isManifest = (f: string) => basename(f) === 'manifest.json';
  const files = [...base, ...fragments.filter((f) => !isManifest(f))];
  const manifests = [
    ...admitted.packs.flatMap((pack) =>
      pack.manifest.files.some(({ path }) => path === MANIFEST_PATH) ? [join(pack.source, MANIFEST_PATH)] : [],
    ),
    ...fragments.filter(isManifest),
  ];

  /** A pack's external namespace, as validate's pack roots are relative to `src/product`, where the product globs them. */
  const namespace = (id: string): string => resolve(root, 'src/product', EXTERNAL_ASSET_ROOT, id);
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
        .filter(({ path, kind }) => kind === 'asset' && existsSync(join(namespace(owner.manifest.id), path)))
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

  const unreadable: string[] = [];
  const read = (source: string): unknown => {
    try {
      return JSON.parse(readFileSync(resolve(root, source), 'utf8')) as unknown;
    } catch (e) {
      unreadable.push(`FAIL  ${source}: ${e instanceof Error ? e.message : String(e)}`);
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
  issues.push(...playableStartIssues(registry, admitted.packs, write, described));
  issues.push(...requiredContentIssues(registry), ...controlIssues(registry, origins, new Set(base)));
  const catalogue = read(CATALOGUE);
  if (catalogue !== undefined) {
    issues.push(...bundledModCatalogueIssues(catalogue).map((message) => ({ source: CATALOGUE, path: '', message })));
  }
  issues.push(...presentationAssetIssues(registry, packFile));
  const declared = declaredFileReader(root, admitted.packs, packs);
  issues.push(...figureFileIssues(registry, declared), ...wieldFileIssues(registry, declared));
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
  issues.push(...soundFileIssues(registry, (contentFile, file) => existsSync(packFile(contentFile, file))));

  const counts = CONTENT_SECTION_KEYS.map((section) => {
    const count = section === 'blocks' ? registry.blocks.length - 1 : registry[section].size;
    return `${count} ${CONTENT_SECTIONS[section].label}`;
  });
  counts.push(`${assets} asset sources`);
  return {
    failures: [...unreadable, ...issues.map(({ source, path, message }) => `FAIL  ${source} ${path}: ${message}`)],
    starts: new Set(registry.starts.keys()),
    summary: `${files.length} file(s): ${counts.join(', ')}`,
  };
};

/** Removes every `flag <value>` from the arguments and returns the values, with '' for a missing value. */
const takeFlags = (args: string[], flag: string): string[] => {
  const values: string[] = [];
  for (let index = args.indexOf(flag); index >= 0; index = args.indexOf(flag)) {
    const [, value] = args.splice(index, 2);
    values.push(value && !value.startsWith('--') ? value : '');
  }
  return values;
};

/**
 * Runs the CLI rules and returns the exit code, so semantic tests avoid process startup. Without `--opt-in` it checks
 * the stack's defaults. Each `--opt-in` pack is checked on top of the defaults, as the game loads it, and reports only
 * what it adds to the defaults' issues, including issues its placements raise in default content, such as the brief
 * fit of a building it places in a style nothing else does.
 */
export const validate = (
  args: readonly string[],
  write: (line: string) => void = console.log,
  root = process.cwd(),
): number => {
  const fragments = [...args];
  const [stack = PRODUCT_ENTRY_PACK] = takeFlags(fragments, '--stack');
  const only = takeFlags(fragments, '--opt-in');
  if (stack === '' || only.includes('')) {
    write(`FAIL  ${stack === '' ? '--stack' : '--opt-in'} requires a pack id`);
    return 1;
  }
  let selections: PackSelection[];
  try {
    selections = readPackSelections(root, stack);
  } catch (error) {
    write(`FAIL  bundled packs: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const [defaults, ...optIns] = selections;
  const unknown = only.filter((id) => !optIns.some(({ optIn }) => optIn === id));
  if (unknown.length > 0) {
    write(`FAIL  bundled packs: no opt-in pack ${unknown.map((id) => `"${id}"`).join(', ')}`);
    return 1;
  }
  const base = checkSelection(root, {
    packs: defaults!.packs,
    fragments,
    write: only.length === 0 ? write : () => undefined,
    described: new Set(),
  });
  if (only.length === 0) {
    for (const line of base.failures) {
      write(line);
    }
    write(`${base.summary}; ${base.failures.length} issue(s)`);
    return base.failures.length > 0 ? 1 : 0;
  }
  const chosen = optIns.filter(({ optIn }) => only.includes(optIn!));
  return checkOptIns(root, chosen, base, { fragments, write }) > 0 ? 1 : 0;
};

/** Checks each opt-in selection, writes the issues it adds to the defaults' and returns how many it added in all. */
const checkOptIns = (
  root: string,
  optIns: readonly PackSelection[],
  defaults: SelectionReport,
  { fragments, write }: Pick<SelectionCheck, 'fragments' | 'write'>,
): number => {
  if (defaults.failures.length > 0) {
    write(
      `Note: the defaults have ${defaults.failures.length} issue(s) of their own; validate without --opt-in lists them`,
    );
  }
  const known = new Set(defaults.failures);
  let added = 0;
  for (const { optIn, packs } of optIns) {
    const report = checkSelection(root, { packs, fragments, write, described: defaults.starts });
    const own = report.failures.filter((line) => !known.has(line));
    for (const line of own) {
      write(line);
    }
    write(`Opt-in ${optIn}: ${own.length} issue(s) beyond the defaults'`);
    added += own.length;
  }
  return added;
};

/** Each shard process holds a whole registry, so the shard count bounds the run's memory as well as its time. */
const MAX_OPT_IN_SHARDS = 4;

const runShard = (args: readonly string[]): Promise<{ status: number; output: string }> =>
  new Promise((done) => {
    const child = spawn(process.execPath, [...process.execArgv, fileURLToPath(import.meta.url), ...args], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const chunks: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('close', (code) => done({ status: code ?? 1, output: Buffer.concat(chunks).toString('utf8') }));
  });

/**
 * The command line checks the defaults and then, unless `--opt-in` narrows it, every opt-in, so no selection a link can
 * load goes unchecked. Opt-ins are checked in parallel shard processes, as each costs about a whole default run.
 */
const validateEverySelection = async (args: readonly string[]): Promise<number> => {
  const flags = [...args];
  const [stack = PRODUCT_ENTRY_PACK] = takeFlags(flags, '--stack');
  if (args.includes('--opt-in') || stack === '') {
    return validate(args);
  }
  let ids: string[];
  try {
    ids = readPackSelections(process.cwd(), stack).flatMap(({ optIn }) => (optIn === undefined ? [] : [optIn]));
  } catch {
    // The defaults' run reports why the packs cannot be read.
    return validate(args);
  }
  if (ids.length === 0) {
    return validate(args);
  }
  const count = Math.min(availableParallelism(), MAX_OPT_IN_SHARDS, ids.length);
  const size = Math.ceil(ids.length / count);
  const shards = await Promise.all(
    Array.from({ length: count }, (_, shard) =>
      runShard([...args, ...ids.slice(shard * size, (shard + 1) * size).flatMap((id) => ['--opt-in', id])]),
    ),
  );
  const status = validate(args);
  for (const { output } of shards) {
    process.stdout.write(output);
  }
  return Math.max(status, ...shards.map(({ status: shard }) => shard));
};

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await validateEverySelection(process.argv.slice(2));
}
