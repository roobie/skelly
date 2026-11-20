// biome-ignore-all lint/correctness/noNodejsModules: build-time validation runs in Node.
import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { type BundleStamp, type PackInput, packContentHash } from '@skelly/engine/packs';
import { admittedSelections } from './readBundledPacks.ts';

const VALIDATE_CLI = fileURLToPath(new URL('../src/cli/validate.ts', import.meta.url));

/**
 * `validate` is the one owner of what a validated selection is, so a stamp certifies only what its command line passes,
 * and a run that both validates and builds checks every selection once.
 */
const validateStack = (packageRoot: string, entryPack: string): Promise<void> =>
  new Promise((done, fail) => {
    const child = spawn(process.execPath, [VALIDATE_CLI, '--stack', entryPack], {
      cwd: packageRoot,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('error', fail);
    child.on('close', (code) =>
      code === 0 ? done() : fail(new Error('Bundle validation failed; validate reports why above')),
    );
  });

/** Stamps every pack of the stack's selections once `validate` passes the stack on disk under `packageRoot`. */
export async function stampPacks(
  packageRoot: string,
  inputs: readonly PackInput[],
  proofHash: string,
  entryPack: string,
): Promise<Record<string, BundleStamp>> {
  const selections = admittedSelections(inputs, entryPack);
  await validateStack(packageRoot, entryPack);
  return Object.fromEntries(
    await Promise.all(
      [...new Set(selections.flat())].map(async (pack) => [
        pack.manifest.id,
        { sourceHash: await packContentHash(pack), proofHash },
      ]),
    ),
  );
}
