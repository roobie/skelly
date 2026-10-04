// biome-ignore-all lint/correctness/noNodejsModules: this shared temp allocator is only used by native Node test processes.
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const PID_PREFIX = /^([1-9]\d*)-/;

export const ownerIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM and unknown errors are not permission to delete another run's data.
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
};

/** Allocate a PID-owned temp directory after reclaiming only provably dead directory owners. */
export const makeOwnedTempDirectory = (parent: string, preserve?: (path: string) => boolean): string => {
  mkdirSync(parent, { recursive: true });
  for (const entry of readdirSync(parent, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const owner = PID_PREFIX.exec(entry.name);
    if (!owner) {
      continue;
    }
    const pid = Number(owner[1]);
    if (!Number.isSafeInteger(pid) || ownerIsAlive(pid)) {
      continue;
    }
    const path = join(parent, entry.name);
    let preserveDirectory = false;
    try {
      preserveDirectory = preserve?.(path) ?? false;
    } catch {
      // Incomplete ownership evidence must never authorize deletion.
      preserveDirectory = true;
    }
    if (!preserveDirectory) {
      rmSync(path, { recursive: true, force: true });
    }
  }
  return mkdtempSync(join(parent, `${process.pid}-`));
};
