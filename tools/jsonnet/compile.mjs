import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { sha256, slotCache } from './cache.mjs';
import { compileJsonnetFile, REPOSITORY_ROOT } from './index.mjs';

const BIOME_EXECUTABLE = resolve(REPOSITORY_ROOT, 'node_modules/@biomejs/biome/bin/biome');
const OUTPUT_MANIFEST = resolve(REPOSITORY_ROOT, 'tools/jsonnet/outputs.json');
const SOURCE_ROOTS = [
  'packages/thing-core/src',
  'packages/thing-authoring-tool',
  'packages/deadvox/maps',
  'packages/deadvox/src/content/base',
  'packages/deadvox/src/config',
  'packages/deadvox/test/fixtures/mods',
  'packages/deadvox/test/fixtures/content',
  'packages/deadvox/test/fixtures/packs',
  'packages/gun-authoring-tool/src/gun',
  'packages/gun-authoring-tool/cartridges',
  'packages/gun-authoring-tool/designs',
  'packages/gun-authoring-tool/exports',
  'packages/gun-authoring-tool/references',
  'packages/mobgen/src/mob',
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

// Formatting is a pure function of the text, the path's rules and the formatter, so it shares the compile cache.
const formattedCache = slotCache(resolve(REPOSITORY_ROOT, 'node_modules/.cache/jsonnet/formatted'));
const FORMATTER_KEY = sha256(
  [resolve(REPOSITORY_ROOT, 'node_modules/@biomejs/biome/package.json'), resolve(REPOSITORY_ROOT, 'biome.jsonc')]
    .map((path) => (existsSync(path) ? readFileSync(path, 'utf8') : 'missing'))
    .join('\0'),
);

export function formatJson(source, target) {
  const formatPath = target.endsWith('.tmj') ? `${target}.json` : target;
  const key = `${FORMATTER_KEY}:${sha256(source)}`;
  const hit = formattedCache.get(formatPath, key);
  if (hit !== undefined) {
    return hit;
  }
  const output = formatWithBiome(source, formatPath);
  formattedCache.set(formatPath, key, output);
  return output;
}

function formatWithBiome(source, formatPath) {
  return execFileSync(
    process.execPath,
    [BIOME_EXECUTABLE, 'format', `--stdin-file-path=${relative(REPOSITORY_ROOT, formatPath)}`],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      input: source,
      maxBuffer: Number.POSITIVE_INFINITY,
    },
  );
}

function checkOutputs(files) {
  const outputs = [];
  for (const { source, output } of files) {
    const target = resolve(REPOSITORY_ROOT, output);
    const compiled = formatJson(compileJsonnetFile(source), target);
    if (!existsSync(target) || readFileSync(target, 'utf8') !== compiled) {
      throw new Error(`Generated output is stale for ${source}; run npm run content:compile`);
    }
    outputs.push(target);
  }
  return outputs;
}

function compileOutputs(files, { outDir = REPOSITORY_ROOT, overlay } = {}) {
  return files.map(({ source, output }) => {
    const target = resolve(outDir, output);
    mkdirSync(dirname(target), { recursive: true });
    // Format as the tracked file would be, so the output matches it and the formatter's ignore list does not apply.
    const formatted = formatJson(
      compileJsonnetFile(source, REPOSITORY_ROOT, { overlay }),
      resolve(REPOSITORY_ROOT, output),
    );
    writeFileSync(target, formatted);
    return target;
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

// `outDir` mirrors the repository layout under another root, so a partial compile can leave tracked outputs alone;
// `overlay` is the library folder that compileJsonnetFile searches first.
export function compileJsonnetSources({ check = false, within, outDir, overlay } = {}) {
  const sources = SOURCE_ROOTS.flatMap((root) => jsonnetFiles(resolve(REPOSITORY_ROOT, root))).sort();
  const manifest = createManifest(sources);
  if (within) {
    if (check) {
      throw new Error('A partial Jsonnet compile cannot be checked; the manifest covers the full source set');
    }
    if (overlay && !outDir) {
      throw new Error('An overlaid Jsonnet compile must write outside the repository outputs');
    }
    return compileOutputs(selectWithin(manifest.files, within), { outDir, overlay });
  }
  if (outDir || overlay) {
    throw new Error('Only a partial Jsonnet compile can write outside the repository outputs');
  }
  if (check) {
    checkManifest(manifestText(manifest));
    return checkOutputs(manifest.files);
  }
  const outputs = compileOutputs(manifest.files);
  removeOrphanedOutputs(manifest.files);
  writeFileSync(OUTPUT_MANIFEST, manifestText(manifest));
  return outputs;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const check = process.argv.slice(2).includes('--check');
    const outputs = compileJsonnetSources({ check });
    process.stdout.write(`${check ? 'Checked' : 'Compiled'} ${outputs.length} Jsonnet source(s).\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
