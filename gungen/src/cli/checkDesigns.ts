import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { checkDesignFiles } from './designCheck.ts';

const directory = process.argv[2] ?? 'designs';
try {
  const files = readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => join(directory, file));
  const result = checkDesignFiles(files);
  for (const line of result.lines) {
    console.log(line);
  }
  process.exitCode = result.exitCode;
} catch (error) {
  console.error(`FAIL ${directory}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
