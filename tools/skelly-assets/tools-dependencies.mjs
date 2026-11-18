// Installs the skelly-assets tools' own locked dependencies, which no root workspace install reaches.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '../..');
const TOOLS = 'packages/skelly-assets/tools';
/**
 * The lockfile digest the last successful install used. It lives inside `node_modules`, which `npm ci` clears first,
 * so a removed or half-written install never carries a stamp that matches.
 */
const STAMP = 'node_modules/.skelly-setup-lock.sha256';

function ensureToolsDependencies(root = REPOSITORY_ROOT) {
  const tools = join(root, TOOLS);
  const lockfile = join(tools, 'package-lock.json');
  if (!existsSync(lockfile)) {
    throw new Error(`${TOOLS}/package-lock.json is missing: run git submodule update --init packages/skelly-assets`);
  }
  const digest = createHash('sha256').update(readFileSync(lockfile)).digest('hex');
  const stamp = join(tools, STAMP);
  if (existsSync(stamp) && readFileSync(stamp, 'utf8') === digest) {
    process.stdout.write(`${TOOLS} dependencies match its lockfile; skipped npm ci.\n`);
    return;
  }
  try {
    execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: tools, stdio: 'inherit' });
  } catch (error) {
    throw new Error(`npm ci in ${TOOLS} failed; its output is above. Rerun npm run assets:tools-setup once fixed.`, {
      cause: error,
    });
  }
  writeFileSync(stamp, digest);
  process.stdout.write(`Installed ${TOOLS} dependencies.\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    ensureToolsDependencies();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
