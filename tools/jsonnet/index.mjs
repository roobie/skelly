import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TOOLS_DIR = fileURLToPath(new URL('./', import.meta.url));
const RUNTIME_PIN = JSON.parse(readFileSync(resolve(TOOLS_DIR, 'runtime.json'), 'utf8'));
export const JSONNET_VERSION = RUNTIME_PIN.version;
const EXECUTABLE_SUFFIX = process.platform === 'win32' ? '.exe' : '';
const SETUP_SCRIPT = resolve(TOOLS_DIR, 'setup.mjs');
const MISSING_BINARY = 'jsonnet binary missing: run npm run setup';

function pinnedExecutable(name) {
  const executable = resolve(TOOLS_DIR, 'bin', JSONNET_VERSION, `${name}${EXECUTABLE_SUFFIX}`);
  if (!existsSync(executable)) {
    try {
      execFileSync(process.execPath, [SETUP_SCRIPT], { cwd: REPOSITORY_ROOT, stdio: 'inherit' });
    } catch (error) {
      throw new Error(MISSING_BINARY, { cause: error });
    }
  }
  if (!existsSync(executable)) {
    throw new Error(MISSING_BINARY);
  }
  return executable;
}

function compileFailure(error, repositoryRoot, absoluteSource) {
  if (error instanceof Error && error.message === MISSING_BINARY) {
    return error;
  }
  const detail = error instanceof Error && 'stderr' in error ? String(error.stderr).trim() : String(error);
  return new Error(`Jsonnet compilation failed for ${relative(repositoryRoot, absoluteSource)}: ${detail}`, {
    cause: error,
  });
}

export function compileJsonnetFile(sourcePath, repositoryRoot = REPOSITORY_ROOT) {
  const absoluteSource = resolve(repositoryRoot, sourcePath);
  try {
    return execFileSync(pinnedExecutable('jsonnet'), ['-J', repositoryRoot, absoluteSource], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    throw compileFailure(error, repositoryRoot, absoluteSource);
  }
}

/**
 * Runs `executable` without blocking, so a caller can keep several compiler processes busy at once.
 * @param {string} executable
 * @param {string[]} args
 * @param {{ cwd?: string, input?: string }} [options]
 * @returns {Promise<string>}
 */
export function runProcess(executable, args, { cwd = process.cwd(), input = '' } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { cwd, stdio: 'pipe' });
    /** @type {Buffer[]} */
    const stdout = [];
    /** @type {Buffer[]} */
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      const output = Buffer.concat(stdout).toString('utf8');
      if (code === 0) {
        resolvePromise(output);
        return;
      }
      reject(
        Object.assign(new Error(`${executable} exited with ${code}`), {
          stderr: Buffer.concat(stderr).toString('utf8'),
        }),
      );
    });
    // A child that exits before reading all its input breaks the pipe; its exit code reports the failure.
    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
  });
}

export async function evaluateJsonnetFile(sourcePath, repositoryRoot = REPOSITORY_ROOT) {
  const absoluteSource = resolve(repositoryRoot, sourcePath);
  try {
    return await runProcess(pinnedExecutable('jsonnet'), ['-J', repositoryRoot, absoluteSource], {
      cwd: repositoryRoot,
    });
  } catch (error) {
    throw compileFailure(error, repositoryRoot, absoluteSource);
  }
}

/**
 * Every file the source imports, directly or transitively, by `import`, `importstr` or `importbin`, as absolute
 * paths resolved with the compile's search path. `fallbackPaths` are searched only after it, so they add files for
 * imports the compile cannot open without changing any import it resolves. Null when the closure cannot be resolved.
 */
export async function jsonnetDependencies(sourcePath, repositoryRoot = REPOSITORY_ROOT, fallbackPaths = []) {
  const absoluteSource = resolve(repositoryRoot, sourcePath);
  const executable = pinnedExecutable('jsonnet-deps');
  // The right-most search path wins, so the compile's own path goes last.
  const searchPaths = [...fallbackPaths, repositoryRoot].flatMap((path) => ['-J', path]);
  try {
    const listing = await runProcess(executable, [...searchPaths, '--', absoluteSource], { cwd: repositoryRoot });
    return listing.split('\n').filter((line) => line.length > 0);
  } catch {
    return null;
  }
}
