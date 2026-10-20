import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import type { DeadvoxModelEntry } from '../gun/exportGlb.ts';

export const modelEntryJson = (entry: DeadvoxModelEntry): string => {
  const root = resolve(import.meta.dirname, '../../..');
  return execFileSync(
    process.execPath,
    [resolve(root, 'node_modules/@biomejs/biome/bin/biome'), 'format', `--stdin-file-path=${entry.id}.model.json`],
    { cwd: root, encoding: 'utf8', input: JSON.stringify(entry), maxBuffer: Number.POSITIVE_INFINITY },
  );
};
