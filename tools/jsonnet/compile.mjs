import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { compileJsonnetFile, REPOSITORY_ROOT } from './index.mjs';

const BIOME_EXECUTABLE = resolve(REPOSITORY_ROOT, 'node_modules/@biomejs/biome/bin/biome');
const OUTPUT_MANIFEST = resolve(REPOSITORY_ROOT, 'tools/jsonnet/outputs.json');
const SOURCE_ROOTS = ['deadvox/maps', 'deadvox/src/content/base', 'gungen/cartridges', 'gungen/designs', 'site'];

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

function formatJson(source, target) {
  const formatPath = target.endsWith('.tmj') ? `${target}.json` : target;
  return execFileSync(
    process.execPath,
    [BIOME_EXECUTABLE, 'format', `--stdin-file-path=${relative(REPOSITORY_ROOT, formatPath)}`],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      input: source,
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

function compileOutputs(files) {
  return files.map(({ source, output }) => {
    const target = resolve(REPOSITORY_ROOT, output);
    writeFileSync(target, formatJson(compileJsonnetFile(source), target));
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

export function compileJsonnetSources({ check = false } = {}) {
  const sources = SOURCE_ROOTS.flatMap((root) => jsonnetFiles(resolve(REPOSITORY_ROOT, root))).sort();
  const manifest = createManifest(sources);
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
