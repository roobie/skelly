import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import process from 'node:process';

// One slot per source keeps a single result each, so the cache stays the size of one build however many
// edits it sees; a full catalogue output is tens of megabytes.
// biome-ignore lint/style/noProcessEnv: a developer switch for the untracked build cache, not game configuration.
const { SKELLY_JSONNET_CACHE } = process.env;
const DISABLED = SKELLY_JSONNET_CACHE === 'off';

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export function slotCache(directory) {
  const file = (slot) => resolve(directory, `${sha256(slot)}.txt`);
  return {
    get(slot, key) {
      if (DISABLED) {
        return;
      }
      const path = file(slot);
      if (!existsSync(path)) {
        return;
      }
      const text = readFileSync(path, 'utf8');
      const newline = text.indexOf('\n');
      return text.slice(0, newline) === key ? text.slice(newline + 1) : undefined;
    },
    set(slot, key, value) {
      if (DISABLED) {
        return;
      }
      mkdirSync(directory, { recursive: true });
      const path = file(slot);
      // Parallel test workers share the cache, so a reader sees a whole entry or none.
      const temporary = `${path}.${process.pid}.tmp`;
      writeFileSync(temporary, `${key}\n${value}`);
      renameSync(temporary, path);
    },
  };
}

// Jsonnet imports are string literals, so scanning the text finds every file a compile can read. A commented-out
// import only widens the key.
const JSONNET = /\.(?:jsonnet|libsonnet)$/;
const IMPORT = /\bimport(?:str|bin)?\s*@?(['"])((?:\\.|(?!\1).)*)\1/g;

// The files a source reads, each resolved as go-jsonnet does: beside the importer, then the library paths from
// the first given. Each resolved path is in the key, so a file created ahead of it in that order changes the key.
export function importClosureKey(source, libraries) {
  const parts = [];
  const seen = new Set();
  const visit = (path) => {
    if (seen.has(path)) {
      return;
    }
    seen.add(path);
    const text = readFileSync(path);
    parts.push(`${path}\0${sha256(text)}`);
    if (!JSONNET.test(path)) {
      return;
    }
    for (const match of text.toString('utf8').matchAll(IMPORT)) {
      const [, , target] = match;
      const candidates = isAbsolute(target)
        ? [target]
        : [resolve(dirname(path), target), ...libraries.map((library) => resolve(library, target))];
      const found = candidates.find((candidate) => existsSync(candidate));
      if (found) {
        visit(found);
      }
    }
  };
  visit(source);
  return sha256(parts.join('\n'));
}
