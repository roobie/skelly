import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { evaluateJsonnetFile, JSONNET_VERSION, jsonnetDependencies, REPOSITORY_ROOT, runProcess } from './index.mjs';

const BIOME_EXECUTABLE = resolve(REPOSITORY_ROOT, 'node_modules/@biomejs/biome/bin/biome');
const OUTPUT_MANIFEST = resolve(REPOSITORY_ROOT, 'tools/jsonnet/outputs.json');
const CACHE_DIRECTORY = resolve(REPOSITORY_ROOT, 'node_modules/.cache/skelly-jsonnet');
const BIOME_CONFIG = resolve(REPOSITORY_ROOT, 'biome.jsonc');
// Files outside a source's import closure that still shape its output: this compile pipeline, the pinned compiler,
// and the formatter's version and its only configuration (see `formatArguments`).
const PIPELINE_FILES = [
  'tools/jsonnet/compile.mjs',
  'tools/jsonnet/index.mjs',
  'tools/jsonnet/runtime.json',
  'node_modules/@biomejs/biome/package.json',
  'biome.jsonc',
];
// Asset submodule Jsonnet imports by the submodule's own root. Content reaches such imports only in branches it never
// evaluates, so the compile does not need them, but the static closure listing fails on them unless it can open them.
const DEPENDENCY_FALLBACK_PATHS = ['packages/skelly-assets'];
const SOURCE_ROOTS = [
  'packages/deadvox/maps',
  'packages/deadvox/mods',
  'packages/mods',
  'packages/deadvox/src/config',
  'packages/deadvox/src/feasibility',
  'packages/deadvox/test/fixtures/mods',
  'packages/deadvox/test/fixtures/content',
  'packages/deadvox/test/fixtures/packs',
  'site',
];

function jsonnetFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return jsonnetFiles(path);
      }
      if (entry.isFile() && entry.name.endsWith('.jsonnet')) {
        return [path];
      }
      return [];
    })
    .sort();
}

function outputPath(source) {
  const targetBase = source.slice(0, -'.jsonnet'.length);
  return targetBase.endsWith('.tmj') ? targetBase : `${targetBase}.json`;
}

function createManifest(sources) {
  return {
    files: sources.map((source) => ({
      source: relative(REPOSITORY_ROOT, source),
      output: relative(REPOSITORY_ROOT, outputPath(source)),
    })),
  };
}

function manifestText(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function checkManifest(expectedText) {
  if (!existsSync(OUTPUT_MANIFEST) || readFileSync(OUTPUT_MANIFEST, 'utf8') !== expectedText) {
    throw new Error('Jsonnet source/output manifest is stale; run npm run content:compile');
  }
}

let formatDirectory;

/**
 * An empty working directory for the formatter. Run from the checkout, Biome would also apply nested configuration
 * and ignore files it discovers beside the output, which no cache key names and which a new file can change.
 */
function formatWorkingDirectory() {
  if (formatDirectory === undefined) {
    formatDirectory = mkdtempSync(join(tmpdir(), 'skelly-jsonnet-format-'));
    process.once('exit', () => rmSync(formatDirectory, { recursive: true, force: true }));
  }
  return formatDirectory;
}

/**
 * Formats with the root configuration alone: an explicit config path, no VCS ignore lookup, and an empty working
 * directory, so only `PIPELINE_FILES` shape the result. The repository-relative path keeps path overrides matching.
 */
function formatArguments(target) {
  const formatPath = target.endsWith('.tmj') ? `${target}.json` : target;
  return [
    BIOME_EXECUTABLE,
    'format',
    '--vcs-enabled=false',
    `--config-path=${BIOME_CONFIG}`,
    `--stdin-file-path=${relative(REPOSITORY_ROOT, formatPath)}`,
  ];
}

export function formatJson(source, target) {
  return execFileSync(process.execPath, formatArguments(target), {
    cwd: formatWorkingDirectory(),
    encoding: 'utf8',
    input: source,
    maxBuffer: Number.POSITIVE_INFINITY,
  });
}

function formatJsonAsync(source, target) {
  return runProcess(process.execPath, formatArguments(target), { cwd: formatWorkingDirectory(), input: source });
}

async function buildOutput(source, target, repositoryRoot) {
  return formatJsonAsync(await evaluateJsonnetFile(source, repositoryRoot), target);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function writeAtomically(target, text) {
  const temporary = `${target}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, text, { flag: 'wx' });
    renameSync(temporary, target);
  } finally {
    rmSync(temporary, { force: true });
  }
}

/** Runs `task` over `items` with at most one compiler pipeline per core, then reports every failure in source order. */
async function forEachInParallel(items, task) {
  const results = new Array(items.length);
  const failures = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        // biome-ignore lint/performance/noAwaitInLoops: each worker runs one compiler pipeline at a time.
        results[index] = await task(items[index]);
      } catch (error) {
        failures[index] = error;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(availableParallelism(), items.length) }, worker));
  const errors = failures.filter(Boolean);
  if (errors.length > 0) {
    throw new Error(errors.map((error) => (error instanceof Error ? error.message : String(error))).join('\n'), {
      cause: errors[0],
    });
  }
  return results;
}

function createCacheContext(repositoryRoot, cacheDirectory) {
  const fileHashes = new Map();
  const hashFile = (path) => {
    if (!fileHashes.has(path)) {
      fileHashes.set(path, sha256(readFileSync(path)));
    }
    return fileHashes.get(path);
  };
  const pipeline = sha256(
    JSON.stringify([JSONNET_VERSION, PIPELINE_FILES.map((path) => [path, hashFile(resolve(REPOSITORY_ROOT, path))])]),
  );
  // biome-ignore lint/style/noProcessEnv: an inherited search path ranks below every fallback path, so the listing could resolve an import differently.
  const enabled = !process.env.JSONNET_PATH;
  const fallbackPaths = DEPENDENCY_FALLBACK_PATHS.map((path) => resolve(repositoryRoot, path)).filter(existsSync);
  mkdirSync(cacheDirectory, { recursive: true });
  return { repositoryRoot, cacheDirectory, hashFile, pipeline, fallbackPaths, enabled };
}

/**
 * The cache key of one output: the pipeline, the source and output paths, and the path and bytes of the source and
 * of every file in its import closure as the pinned compiler resolves it on this run. Null when the closure is
 * unknown, so the source is always compiled.
 */
async function cacheKey({ source, output }, context) {
  const { repositoryRoot, hashFile, pipeline, fallbackPaths, enabled } = context;
  if (!enabled) {
    return null;
  }
  const absoluteSource = resolve(repositoryRoot, source);
  const dependencies = await jsonnetDependencies(source, repositoryRoot, fallbackPaths);
  if (dependencies === null) {
    return null;
  }
  try {
    const closure = [absoluteSource, ...dependencies].map((path) => [relative(repositoryRoot, path), hashFile(path)]);
    return sha256(JSON.stringify([pipeline, source, output, closure]));
  } catch {
    return null;
  }
}

function cacheEntryPath(output, context) {
  return join(context.cacheDirectory, `${sha256(output)}.json`);
}

function cachedOutputIsCurrent(entryPath, key, target) {
  if (!(existsSync(entryPath) && existsSync(target))) {
    return false;
  }
  try {
    const entry = JSON.parse(readFileSync(entryPath, 'utf8'));
    return entry.key === key && entry.output === sha256(readFileSync(target));
  } catch {
    return false;
  }
}

/**
 * Writes each output whose cache key or on-disk bytes differ from its last compile and leaves the rest untouched.
 * The key is computed before compiling, so a file edited during the compile only makes the next run recompile.
 */
export function compileOutputs(files, { repositoryRoot = REPOSITORY_ROOT, cacheDirectory = CACHE_DIRECTORY } = {}) {
  const context = createCacheContext(repositoryRoot, cacheDirectory);
  return forEachInParallel(files, async (file) => {
    const target = resolve(repositoryRoot, file.output);
    const key = await cacheKey(file, context);
    const entryPath = cacheEntryPath(file.output, context);
    if (key !== null && cachedOutputIsCurrent(entryPath, key, target)) {
      return { target, reused: true };
    }
    const compiled = await buildOutput(file.source, target, repositoryRoot);
    writeAtomically(target, compiled);
    if (key !== null) {
      writeAtomically(entryPath, JSON.stringify({ key, output: sha256(compiled) }));
    }
    return { target, reused: false };
  });
}

function checkOutputs(files) {
  return forEachInParallel(files, async ({ source, output }) => {
    const target = resolve(REPOSITORY_ROOT, output);
    const compiled = await buildOutput(source, target, REPOSITORY_ROOT);
    if (!existsSync(target) || readFileSync(target, 'utf8') !== compiled) {
      throw new Error(`Generated output is stale for ${source}; run npm run content:compile`);
    }
    return { target, reused: false };
  });
}

function removeOrphanedOutputs(currentFiles) {
  if (!existsSync(OUTPUT_MANIFEST)) {
    return;
  }
  const previous = JSON.parse(readFileSync(OUTPUT_MANIFEST, 'utf8'));
  const currentOutputs = new Set(currentFiles.map(({ output }) => output));
  for (const { output } of previous.files ?? []) {
    if (!currentOutputs.has(output)) {
      const orphan = resolve(REPOSITORY_ROOT, output);
      if (existsSync(orphan)) {
        unlinkSync(orphan);
      }
    }
  }
}

export function selectWithin(files, within) {
  const inside = files.filter(({ source }) => within.some((directory) => source.startsWith(`${directory}/`)));
  if (inside.length === 0) {
    throw new Error(`No Jsonnet sources under ${within.join(', ')}`);
  }
  return inside;
}

/**
 * The check never reads the cache: it recompiles every source, so CI compares outputs against a cold compile.
 * @param {{ check?: boolean, within?: string[] }} [options]
 */
export async function compileJsonnetSources({ check = false, within } = {}) {
  const sources = SOURCE_ROOTS.flatMap((root) => jsonnetFiles(resolve(REPOSITORY_ROOT, root))).sort();
  const manifest = createManifest(sources);
  if (within) {
    if (check) {
      throw new Error('A partial Jsonnet compile cannot be checked; the manifest covers the full source set');
    }
    return compileOutputs(selectWithin(manifest.files, within));
  }
  if (check) {
    checkManifest(manifestText(manifest));
    return checkOutputs(manifest.files);
  }
  const outputs = await compileOutputs(manifest.files);
  removeOrphanedOutputs(manifest.files);
  writeAtomically(OUTPUT_MANIFEST, manifestText(manifest));
  return outputs;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const check = process.argv.slice(2).includes('--check');
    const outputs = await compileJsonnetSources({ check });
    const reused = outputs.filter((output) => output.reused).length;
    process.stdout.write(
      check
        ? `Checked ${outputs.length} Jsonnet source(s).\n`
        : `Compiled ${outputs.length} Jsonnet source(s), ${reused} unchanged since the last compile.\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
