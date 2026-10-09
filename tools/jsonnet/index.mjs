import { execFileSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MODULE_ROOT = fileURLToPath(new URL('./', import.meta.url));

export function compileJsonnetFile(sourcePath, repositoryRoot = REPOSITORY_ROOT) {
  const absoluteSource = resolve(repositoryRoot, sourcePath);
  try {
    return execFileSync('go', ['run', '.', repositoryRoot, absoluteSource], {
      cwd: MODULE_ROOT,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    const detail = error instanceof Error && 'stderr' in error ? String(error.stderr).trim() : String(error);
    throw new Error(`Jsonnet compilation failed for ${relative(repositoryRoot, absoluteSource)}: ${detail}`, {
      cause: error,
    });
  }
}
