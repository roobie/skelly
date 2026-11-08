import { resolve } from 'node:path';
import type { PackInput } from '../src/core/packAdmission.ts';
import { packFileBytes, readAvailablePacks } from '../tools/readBundledPacks.ts';

const PACKAGE_ROOT = resolve(import.meta.dirname, '..');
let available: PackInput[] | undefined;

/** Every shipped pack, read once per test file. */
export const shippedPacks = (): PackInput[] => {
  available ??= readAvailablePacks(PACKAGE_ROOT);
  return available;
};

/** The bytes of one file a pack declares, wherever the pack reader resolves it. */
export const packFile = (pack: PackInput, path: string): Buffer<ArrayBuffer> => packFileBytes(PACKAGE_ROOT, pack, path);

/** The bytes of a pack file a row names, for a test holding the row but not the pack that declares it. */
export const modFileBytes = (file: string): Buffer<ArrayBuffer> => {
  const owners = shippedPacks().filter(({ manifest }) => manifest.files.some(({ path }) => path === file));
  if (owners.length !== 1) {
    throw new Error(`${owners.length} packs declare ${file}`);
  }
  return packFile(owners[0]!, file);
};
